const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { signArchiveDownloadToken, verifyArchiveDownloadToken } = require("../auth-utils");
const { extractArchiveMetadataWithAI, aiConfigured } = require("../services/ai-provider");
const archive = require("../services/archive");

const TMP_DIR = process.env.PACT_ARCHIVE_TMP_DIR || path.join(__dirname, "..", "..", "data", "archive-tmp");
fs.mkdirSync(TMP_DIR, { recursive: true });

// Files land on disk in a temp dir first (not held in memory) so a bulk
// 20-file upload near the size cap can't spike the process's RAM; each
// temp file is read into a buffer for scanning/encryption and then
// deleted (see the route below), regardless of success or failure.
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TMP_DIR),
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString("hex")),
  }),
  limits: { fileSize: archive.MAX_FILE_BYTES, files: archive.MAX_BULK_FILES },
});

router.use(express.json());
router.use(requireAuth);

const TIER_ORDER = ["free", "starter", "everyday", "pro", "business"];

router.get("/usage", (req, res) => {
  res.json(archive.getUsageSummary(req.user.id, req.user.tier));
});

router.get("/", (req, res) => {
  const { query, category, state, counterparty, dateFrom, dateTo, expiringSoon } = req.query;
  const items = archive.listArchiveItems(req.user, {
    query,
    category,
    state,
    counterparty,
    dateFrom,
    dateTo,
    expiringSoon: expiringSoon === "true",
  });
  res.json({
    items: items.map((i) => ({
      ...i,
      counterparty_names: JSON.parse(i.counterparty_names || "[]"),
      tags: JSON.parse(i.tags || "[]"),
      ai_suggested_fields: JSON.parse(i.ai_suggested_fields || "[]"),
    })),
  });
});

router.get("/trash", (req, res) => {
  res.json({ items: archive.listTrashedItems(req.user) });
});

function handleBulkUpload(req, res, next) {
  upload.array("files", archive.MAX_BULK_FILES)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}

router.post("/upload", handleBulkUpload, async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No files uploaded." });
  }

  const { count, limit } = archive.getUsageSummary(req.user.id, req.user.tier);
  if (limit !== null && count + req.files.length > limit) {
    req.files.forEach((f) => fs.unlink(f.path, () => {}));
    return res.status(403).json({
      error: `This would exceed your ${req.user.tier} tier's archive limit of ${limit} files (currently using ${count}). Upgrade your tier or delete older items first.`,
    });
  }

  // Shared fields apply to every file in this batch; title defaults to
  // the original filename and is expected to be refined per item
  // afterward — a full per-file metadata form inside one bulk-upload
  // request isn't implemented, matching how uploading a native contract
  // from a file also just takes the file first and is edited after.
  let sharedMetadata = {};
  try {
    sharedMetadata = req.body.metadata ? JSON.parse(req.body.metadata) : {};
  } catch (err) {
    req.files.forEach((f) => fs.unlink(f.path, () => {}));
    return res.status(400).json({ error: "Invalid metadata JSON." });
  }

  const forwardedFor = req.headers["x-forwarded-for"];
  const ip = (forwardedFor ? forwardedFor.split(",")[0].trim() : null) || req.socket.remoteAddress || "unknown";

  const results = [];
  for (const file of req.files) {
    try {
      const buffer = fs.readFileSync(file.path);
      const item = await archive.uploadArchiveItem({
        ownerUser: req.user,
        buffer,
        originalFilename: file.originalname,
        metadata: { ...sharedMetadata, title: sharedMetadata.title || file.originalname },
        actingUser: req.user,
        ip,
      });
      results.push({ filename: file.originalname, ok: true, item });
    } catch (err) {
      results.push({ filename: file.originalname, ok: false, error: err.message, quarantined: !!err.quarantined });
    } finally {
      fs.unlink(file.path, () => {});
    }
  }

  const anyOk = results.some((r) => r.ok);
  res.status(anyOk ? 201 : 422).json({ results });
});

router.get("/:id", (req, res) => {
  const item = archive.loadAuthorizedArchiveItem(req, res);
  if (!item) return;
  res.json({
    item: {
      ...item,
      counterparty_names: JSON.parse(item.counterparty_names || "[]"),
      tags: JSON.parse(item.tags || "[]"),
      ai_suggested_fields: JSON.parse(item.ai_suggested_fields || "[]"),
    },
  });
});

router.put("/:id", (req, res) => {
  const item = archive.loadAuthorizedArchiveItem(req, res, { requireEdit: true });
  if (!item) return;
  const forwardedFor = req.headers["x-forwarded-for"];
  const ip = (forwardedFor ? forwardedFor.split(",")[0].trim() : null) || req.socket.remoteAddress || "unknown";
  try {
    const updated = archive.updateArchiveMetadata(item, req.user, req.body || {}, ip);
    res.json({ item: updated });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Proposes values only — never saved until the user confirms via PUT
// /:id. Gated to Pro/Business, matching the AI drafting/analysis gate
// elsewhere (middleware/auth.js's requireTier via routes/ai.js).
router.post("/:id/ai-suggest", async (req, res) => {
  if (!TIER_ORDER.slice(TIER_ORDER.indexOf("pro")).includes(req.user.tier)) {
    return res.status(403).json({ error: "Auto-fill with Pact AI requires the Professional or Enterprise tier." });
  }
  const item = archive.loadAuthorizedArchiveItem(req, res, { requireEdit: true });
  if (!item) return;
  if (!aiConfigured()) return res.status(501).json({ error: "Pact AI is not connected yet." });
  if (!item.extracted_text || !item.extracted_text.trim()) {
    return res.status(409).json({ error: "No extracted text is available for this document to analyze." });
  }
  try {
    const suggestion = await extractArchiveMetadataWithAI(item.extracted_text);
    res.json({ suggestion });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post("/:id/delete", (req, res) => {
  const item = archive.loadAuthorizedArchiveItem(req, res, { requireOwner: true });
  if (!item) return;
  const forwardedFor = req.headers["x-forwarded-for"];
  const ip = (forwardedFor ? forwardedFor.split(",")[0].trim() : null) || req.socket.remoteAddress || "unknown";
  archive.softDeleteArchiveItem(item, req.user, ip);
  res.json({ ok: true });
});

router.post("/:id/restore", (req, res) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  const ip = (forwardedFor ? forwardedFor.split(",")[0].trim() : null) || req.socket.remoteAddress || "unknown";
  try {
    const item = archive.restoreArchiveItem(Number(req.params.id), req.user, ip);
    res.json({ item });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Short-lived signed download — the token is bound to this exact archive
// item and the user it was issued to, and expires in 5 minutes. The
// browser still needs its normal session cookie to reach /file below too
// (belt-and-suspenders: "authenticated, short-lived signed URLs").
router.get("/:id/download-token", (req, res) => {
  const item = archive.loadAuthorizedArchiveItem(req, res);
  if (!item) return;
  const token = signArchiveDownloadToken(item.id, req.user.id);
  res.json({ token, expiresInSeconds: 300 });
});

router.get("/:id/file", (req, res) => {
  const item = archive.loadAuthorizedArchiveItem(req, res);
  if (!item) return;
  const payload = verifyArchiveDownloadToken(req.query.token);
  if (!payload || payload.archiveItemId !== item.id || payload.sub !== req.user.id) {
    return res.status(403).json({ error: "This download link is invalid or has expired — request a new one." });
  }
  const forwardedFor = req.headers["x-forwarded-for"];
  const ip = (forwardedFor ? forwardedFor.split(",")[0].trim() : null) || req.socket.remoteAddress || "unknown";
  try {
    const buffer = archive.getDecryptedFileBuffer(item);
    archive.logArchiveAudit(item.id, req.user, "downloaded", `Downloaded by ${req.user.name}.`, ip);
    res.setHeader("Content-Type", item.mime_type);
    res.setHeader("Content-Disposition", `attachment; filename="${item.original_filename.replace(/[^\w.\-]+/g, "_")}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: "Failed to decrypt this file." });
  }
});

router.get("/:id/shares", (req, res) => {
  const item = archive.loadAuthorizedArchiveItem(req, res, { requireOwner: true });
  if (!item) return;
  const rows = db
    .prepare(
      `SELECT s.id, s.permission, s.share_type, s.created_at, u.name, u.email
       FROM archive_shares s JOIN users u ON u.id = s.shared_with_user_id
       WHERE s.archive_item_id = ? ORDER BY s.created_at DESC`
    )
    .all(item.id);
  res.json({ shares: rows });
});

router.post("/:id/share", (req, res) => {
  const item = archive.loadAuthorizedArchiveItem(req, res, { requireOwner: true });
  if (!item) return;
  const forwardedFor = req.headers["x-forwarded-for"];
  const ip = (forwardedFor ? forwardedFor.split(",")[0].trim() : null) || req.socket.remoteAddress || "unknown";
  try {
    archive.shareArchiveItem(item, req.user, req.body || {}, ip);
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete("/:id/share/:shareId", (req, res) => {
  const item = archive.loadAuthorizedArchiveItem(req, res, { requireOwner: true });
  if (!item) return;
  const forwardedFor = req.headers["x-forwarded-for"];
  const ip = (forwardedFor ? forwardedFor.split(",")[0].trim() : null) || req.socket.remoteAddress || "unknown";
  archive.revokeArchiveShare(item.id, req.params.shareId, req.user, ip);
  res.json({ ok: true });
});

router.get("/:id/audit", (req, res) => {
  const item = archive.loadAuthorizedArchiveItem(req, res);
  if (!item) return;
  if (!["owner", "admin"].includes(item.myAccess)) {
    return res.status(403).json({ error: "Only the uploader or an admin collaborator can view this item's audit log." });
  }
  const rows = db.prepare("SELECT * FROM archive_audit_log WHERE archive_item_id = ? ORDER BY created_at DESC").all(item.id);
  res.json({ audit: rows });
});

module.exports = router;
