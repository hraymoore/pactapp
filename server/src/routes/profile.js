const express = require("express");
const router = express.Router();
const multer = require("multer");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { processAndStorePhoto, deletePhotoFiles, fullPath, thumbPath, MAX_UPLOAD_BYTES } = require("../services/profile-photo");
const { logAccountAudit } = require("../services/account-audit");
const { clientIp } = require("../services/terms");
const { publicUser } = require("./auth");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

const DISPLAY_NAME_CHANGE_LIMIT = 5;
const DISPLAY_NAME_CHANGE_WINDOW_DAYS = 30;
const BIO_MAX_LENGTH = 280;
const ALLOWED_DATE_FORMATS = new Set(["MDY", "DMY", "YMD"]);

router.use(express.json());
router.use(requireAuth);

function displayNameChangeCount(userId) {
  return db
    .prepare(
      `SELECT COUNT(*) as n FROM account_audit_log
       WHERE user_id = ? AND action = 'display_name_changed' AND result = 'success'
         AND created_at > datetime('now', '-${DISPLAY_NAME_CHANGE_WINDOW_DAYS} days')`
    )
    .get(userId).n;
}

// Everything here is "optional profile fields" (spec 1.2) except display
// name, which gets its own 2-60 char and 5-per-30-days checks. None of
// this is a "sensitive action" under spec 1.3's definition (that list is
// credentials/contact/payout/export) so there's no requireRecentAuth gate
// here, just the ordinary session.
router.put("/", (req, res) => {
  const { displayName, jobTitle, company, bio, website, timezone, preferredLanguage, dateFormat } = req.body || {};
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);

  if (typeof displayName === "string" && displayName.trim() !== row.name) {
    const trimmed = displayName.trim();
    if (trimmed.length < 2 || trimmed.length > 60) {
      return res.status(400).json({ error: "Display name must be 2–60 characters." });
    }
    if (displayNameChangeCount(row.id) >= DISPLAY_NAME_CHANGE_LIMIT) {
      return res.status(429).json({
        error: `You can change your display name at most ${DISPLAY_NAME_CHANGE_LIMIT} times every ${DISPLAY_NAME_CHANGE_WINDOW_DAYS} days.`,
      });
    }
    db.prepare("UPDATE users SET name = ? WHERE id = ?").run(trimmed, row.id);
    logAccountAudit({
      userId: row.id,
      action: "display_name_changed",
      result: "success",
      detail: `"${row.name}" → "${trimmed}"`,
      ip: clientIp(req),
      userAgent: req.headers["user-agent"],
    });
  }

  if (typeof bio === "string" && bio.length > BIO_MAX_LENGTH) {
    return res.status(400).json({ error: `Bio must be ${BIO_MAX_LENGTH} characters or fewer.` });
  }
  if (dateFormat && !ALLOWED_DATE_FORMATS.has(dateFormat)) {
    return res.status(400).json({ error: "Unknown date format." });
  }

  db.prepare(
    `UPDATE users SET
       job_title = COALESCE(?, job_title),
       company = COALESCE(?, company),
       bio = COALESCE(?, bio),
       website = COALESCE(?, website),
       timezone = COALESCE(?, timezone),
       preferred_language = COALESCE(?, preferred_language),
       date_format = COALESCE(?, date_format)
     WHERE id = ?`
  ).run(
    typeof jobTitle === "string" ? jobTitle.trim() : null,
    typeof company === "string" ? company.trim() : null,
    typeof bio === "string" ? bio : null,
    typeof website === "string" ? website.trim() : null,
    typeof timezone === "string" ? timezone : null,
    typeof preferredLanguage === "string" ? preferredLanguage : null,
    dateFormat !== undefined && dateFormat ? dateFormat : null,
    row.id
  );

  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(row.id);
  res.json({ user: publicUser(updated) });
});

router.post("/photo", (req, res) => {
  upload.single("photo")(req, res, async (err) => {
    if (err) {
      const message = err.code === "LIMIT_FILE_SIZE" ? "Image must be 5MB or smaller." : err.message;
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: "No image uploaded." });

    const { cropX, cropY, cropSize } = req.body || {};
    try {
      const fileRef = await processAndStorePhoto(req.file.buffer, {
        cropX: cropX !== undefined ? Number(cropX) : null,
        cropY: cropY !== undefined ? Number(cropY) : null,
        cropSize: cropSize !== undefined ? Number(cropSize) : null,
      });
      const row = db.prepare("SELECT photo_file_ref FROM users WHERE id = ?").get(req.user.id);
      db.prepare("UPDATE users SET photo_file_ref = ? WHERE id = ?").run(fileRef, req.user.id);
      if (row.photo_file_ref) deletePhotoFiles(row.photo_file_ref);
      res.json({ ok: true, photoFileRef: fileRef });
    } catch (err2) {
      res.status(err2.status || 500).json({ error: err2.message });
    }
  });
});

router.delete("/photo", (req, res) => {
  const row = db.prepare("SELECT photo_file_ref FROM users WHERE id = ?").get(req.user.id);
  if (row.photo_file_ref) {
    deletePhotoFiles(row.photo_file_ref);
    db.prepare("UPDATE users SET photo_file_ref = NULL WHERE id = ?").run(req.user.id);
  }
  res.json({ ok: true });
});

// Any logged-in Pact user can view another's photo this way — matching
// how their name/email are already visible once sharing a contract, with
// no further relationship check layered on here. A fully relationship-
// scoped "who can see my profile" view is the spec's own separate,
// later feature (1.4.6, "Public vs. private profile view"), not this one.
router.get("/photo/:userId/:size", (req, res) => {
  const row = db.prepare("SELECT photo_file_ref FROM users WHERE id = ?").get(req.params.userId);
  if (!row || !row.photo_file_ref) return res.status(404).json({ error: "No photo." });
  const file = req.params.size === "thumb" ? thumbPath(row.photo_file_ref) : fullPath(row.photo_file_ref);
  res.sendFile(file, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "Photo file not found." });
  });
});

router.post("/:userId/report-photo", (req, res) => {
  const { reason } = req.body || {};
  const target = db.prepare("SELECT id FROM users WHERE id = ?").get(req.params.userId);
  if (!target) return res.status(404).json({ error: "User not found." });
  db.prepare("INSERT INTO photo_reports (reported_user_id, reporter_user_id, reason) VALUES (?, ?, ?)").run(
    target.id,
    req.user.id,
    reason || null
  );
  res.json({ ok: true });
});

module.exports = router;
