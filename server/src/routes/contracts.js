const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { renderContractPdf } = require("../services/pdf");
const { sendMail } = require("../services/mailer");
const { applySignature, logAudit } = require("../services/signing");
const { contentHash, createContractFromTemplate } = require("../services/contract-factory");
const { upload, UPLOAD_DIR } = require("../services/uploads");
const fs = require("fs");
const path = require("path");

router.use(express.json());
router.use(requireAuth);

const TIER_ORDER = ["starter", "everyday", "pro", "business"];

// multer's fileFilter/size-limit errors go to Express's error-handling
// chain via next(err) — wrap so they come back as JSON, not a default
// HTML error page.
function handleUpload(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}

// Resolves how req.user relates to a contract: 'owner', 'edit' (a named
// signing party, or an explicit edit share), 'view' (an explicit view-only
// share), or null (no access at all). Being a share recipient is distinct
// from being a signing party — sharing grants visibility/collaboration,
// not the ability to sign (see routes/:id/sign below).
function resolveAccess(contract, user) {
  if (contract.owner_id === user.id) return "owner";
  const isParty = !!db
    .prepare("SELECT id FROM contract_parties WHERE contract_id = ? AND email = ?")
    .get(contract.id, user.email);
  if (isParty) return "edit";
  const share = db
    .prepare("SELECT permission FROM contract_shares WHERE contract_id = ? AND shared_with_user_id = ?")
    .get(contract.id, user.id);
  return share ? share.permission : null;
}

function loadAuthorizedContract(req, res, { requireEdit = false } = {}) {
  const contract = db.prepare("SELECT * FROM contracts WHERE id = ?").get(req.params.id);
  if (!contract) {
    res.status(404).json({ error: "Contract not found." });
    return null;
  }
  const access = resolveAccess(contract, req.user);
  if (!access) {
    res.status(403).json({ error: "You do not have access to this contract." });
    return null;
  }
  if (requireEdit && access === "view") {
    res.status(403).json({ error: "You have view-only access to this contract." });
    return null;
  }
  contract.myAccess = access;
  return contract;
}

// IMPORTANT: literal routes must be declared before the "/:id" param route.

router.get("/audit", (req, res) => {
  const rows = db
    .prepare(
      `SELECT a.*, c.name as contract_name FROM audit_log a
       JOIN contracts c ON c.id = a.contract_id
       WHERE c.owner_id = @uid
          OR c.id IN (SELECT contract_id FROM contract_parties WHERE email = @email)
       ORDER BY a.created_at DESC
       LIMIT 50`
    )
    .all({ uid: req.user.id, email: req.user.email });
  res.json({ audit: rows });
});

router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT * FROM contracts
       WHERE owner_id = @uid
          OR id IN (SELECT contract_id FROM contract_parties WHERE email = @email)
          OR id IN (SELECT contract_id FROM contract_shares WHERE shared_with_user_id = @uid)
       ORDER BY updated_at DESC`
    )
    .all({ uid: req.user.id, email: req.user.email });
  const withParties = rows.map((c) => ({
    ...c,
    parties: db
      .prepare("SELECT id, name, email, role, signed_at FROM contract_parties WHERE contract_id = ?")
      .all(c.id),
    myPermission: resolveAccess(c, req.user),
  }));
  res.json({ contracts: withParties });
});

router.post("/", (req, res) => {
  const { name, templateId, counterpartyName, counterpartyEmail } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Contract name is required." });

  let template = null;
  if (templateId) {
    template = db.prepare("SELECT * FROM templates WHERE id = ?").get(templateId);
    if (!template) return res.status(404).json({ error: "Template not found." });
    if (TIER_ORDER.indexOf(req.user.tier) < TIER_ORDER.indexOf(template.min_tier)) {
      return res.status(403).json({
        error: `This template requires the ${template.min_tier} tier or higher (or a one-time purchase — see Templates).`,
        requiredTier: template.min_tier,
      });
    }
  }

  const contractId = createContractFromTemplate({
    ownerId: req.user.id,
    ownerName: req.user.name,
    ownerEmail: req.user.email,
    name: name.trim(),
    template,
  });

  if (counterpartyName && counterpartyEmail) {
    const token = crypto.randomBytes(24).toString("hex");
    db.prepare(
      "INSERT INTO contract_parties (contract_id, name, email, role, sign_token) VALUES (?, ?, ?, 'counterparty', ?)"
    ).run(contractId, counterpartyName.trim(), counterpartyEmail.trim().toLowerCase(), token);
  }

  const contract = db.prepare("SELECT * FROM contracts WHERE id = ?").get(contractId);
  res.status(201).json({ contract });
});

// Create a contract from an uploaded document instead of a template. The
// file itself is stored as the contract's "original source" attachment;
// plain-text uploads also seed the editable body, other file types get a
// placeholder body pointing at the attachment (PDFs/Word docs aren't
// parsed into editable text — that's a real project, not a quick add).
router.post("/upload", handleUpload, (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });
  const name = (req.body.name || req.file.originalname).trim() || "Untitled Contract";
  const genre = (req.body.genre || "Other").trim() || "Other";

  let body = `[Original file attached: ${req.file.originalname}. Download it from the Attachments panel. This text box is your editable working draft — write or paste the contract terms here.]`;
  if (req.file.mimetype === "text/plain") {
    try {
      body = fs.readFileSync(req.file.path, "utf8") || body;
    } catch (err) {
      console.error("[pact] Failed to read uploaded text file:", err);
    }
  }

  const info = db
    .prepare(
      "INSERT INTO contracts (owner_id, name, genre, body, status, template_id, content_hash) VALUES (?, ?, ?, ?, 'draft', NULL, ?)"
    )
    .run(req.user.id, name, genre, body, contentHash(body));
  const contractId = info.lastInsertRowid;

  db.prepare(
    "INSERT INTO contract_parties (contract_id, user_id, name, email, role, signed_at) VALUES (?, ?, ?, ?, 'owner', NULL)"
  ).run(contractId, req.user.id, req.user.name, req.user.email);

  db.prepare(
    `INSERT INTO contract_attachments
       (contract_id, uploaded_by_user_id, original_filename, mime_type, size_bytes, storage_path, is_original_source)
     VALUES (?, ?, ?, ?, ?, ?, 1)`
  ).run(contractId, req.user.id, req.file.originalname, req.file.mimetype, req.file.size, req.file.filename);

  logAudit(contractId, req.user, "created", `Contract created from an uploaded file: "${req.file.originalname}".`);

  const contract = db.prepare("SELECT * FROM contracts WHERE id = ?").get(contractId);
  res.status(201).json({ contract });
});

router.get("/:id", (req, res) => {
  const contract = loadAuthorizedContract(req, res);
  if (!contract) return;
  const parties = db
    .prepare("SELECT id, name, email, role, signed_at FROM contract_parties WHERE contract_id = ?")
    .all(contract.id);
  const audit = db
    .prepare("SELECT * FROM audit_log WHERE contract_id = ? ORDER BY created_at DESC")
    .all(contract.id);
  res.json({ contract, parties, audit });
});

router.put("/:id", (req, res) => {
  const contract = loadAuthorizedContract(req, res, { requireEdit: true });
  if (!contract) return;
  const { body, name } = req.body || {};
  if (typeof body !== "string" || !body.trim()) {
    return res.status(400).json({ error: "Contract body cannot be empty." });
  }

  const wasLocked = contract.status === "signed";
  db.prepare(
    "UPDATE contracts SET body = ?, name = COALESCE(?, name), content_hash = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(body, name || null, contentHash(body), contract.id);

  if (wasLocked) {
    logAudit(contract.id, req.user, "amended", `Post-signature amendment made by ${req.user.name}.`);
  } else {
    logAudit(contract.id, req.user, "edited", `Draft edited by ${req.user.name}.`);
  }

  const updated = db.prepare("SELECT * FROM contracts WHERE id = ?").get(contract.id);
  res.json({ contract: updated, amended: wasLocked });
});

router.post("/:id/send", (req, res) => {
  const contract = loadAuthorizedContract(req, res);
  if (!contract) return;
  if (contract.owner_id !== req.user.id) {
    return res.status(403).json({ error: "Only the contract owner can send it for signature." });
  }

  const { counterpartyName, counterpartyEmail } = req.body || {};
  let counterparty = db
    .prepare("SELECT * FROM contract_parties WHERE contract_id = ? AND role = 'counterparty'")
    .get(contract.id);

  if (!counterparty) {
    if (!counterpartyName || !counterpartyEmail) {
      return res.status(400).json({ error: "Counterparty name and email are required to send this contract." });
    }
    const token = crypto.randomBytes(24).toString("hex");
    db.prepare(
      "INSERT INTO contract_parties (contract_id, name, email, role, sign_token) VALUES (?, ?, ?, 'counterparty', ?)"
    ).run(contract.id, counterpartyName.trim(), counterpartyEmail.trim().toLowerCase(), token);
    counterparty = db
      .prepare("SELECT * FROM contract_parties WHERE contract_id = ? AND role = 'counterparty'")
      .get(contract.id);
  }

  db.prepare("UPDATE contracts SET status = 'pending', updated_at = datetime('now') WHERE id = ?").run(contract.id);
  logAudit(contract.id, req.user, "sent", `Sent to ${counterparty.name} <${counterparty.email}> for signature.`);

  const signUrl = `${req.protocol}://${req.get("host")}/sign.html?token=${counterparty.sign_token}`;
  const mailResult = sendMail({
    to: counterparty.email,
    subject: `You've been sent a contract to sign: ${contract.name}`,
    text: `${req.user.name} sent you "${contract.name}" on Pact to review and sign.\n\nOpen it here: ${signUrl}`,
  });

  res.json({ ok: true, signUrl, emailSent: mailResult.sent, emailNote: mailResult.note });
});

// Authenticated in-app signing — for the contract owner, or a counterparty
// who also happens to be a logged-in Pact user. Outside counterparties
// without an account use the public token link instead (see routes/sign.js).
router.post("/:id/sign", (req, res) => {
  const contract = loadAuthorizedContract(req, res);
  if (!contract) return;
  const { typedSignature, consent } = req.body || {};
  if (!consent) return res.status(400).json({ error: "You must consent to signing electronically." });
  if (!typedSignature || !typedSignature.trim()) {
    return res.status(400).json({ error: "Type your full legal name to sign." });
  }

  const party = db
    .prepare("SELECT * FROM contract_parties WHERE contract_id = ? AND email = ?")
    .get(contract.id, req.user.email);
  if (!party) return res.status(403).json({ error: "You are not a party to this contract." });

  const forwardedFor = req.headers["x-forwarded-for"];
  const ip = (forwardedFor ? forwardedFor.split(",")[0].trim() : null) || req.socket.remoteAddress || "unknown";

  try {
    const { allSigned } = applySignature({ partyId: party.id, typedSignature, ip });
    if (!allSigned) {
      db.prepare("UPDATE contracts SET status = 'pending', updated_at = datetime('now') WHERE id = ?").run(contract.id);
    }
    const updated = db.prepare("SELECT * FROM contracts WHERE id = ?").get(contract.id);
    res.json({ contract: updated, allSigned });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get("/:id/download", (req, res) => {
  const contract = loadAuthorizedContract(req, res);
  if (!contract) return;
  const parties = db.prepare("SELECT * FROM contract_parties WHERE contract_id = ?").all(contract.id);
  const audit = db
    .prepare("SELECT * FROM audit_log WHERE contract_id = ? ORDER BY created_at ASC")
    .all(contract.id);

  logAudit(contract.id, req.user, "downloaded", `Downloaded as PDF by ${req.user.name}.`);

  renderContractPdf({ contract, parties, audit })
    .then((pdfBytes) => {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${contract.name.replace(/[^a-z0-9]+/gi, "_")}.pdf"`
      );
      res.send(Buffer.from(pdfBytes));
    })
    .catch((err) => {
      console.error("[pact] PDF generation failed:", err);
      res.status(500).json({ error: "Failed to generate PDF." });
    });
});

// Attachments — supporting files added to an existing contract (a scan,
// an exhibit, a reference doc), separate from the "original source" file
// an uploaded (rather than templated) contract already carries.
router.get("/:id/attachments", (req, res) => {
  const contract = loadAuthorizedContract(req, res);
  if (!contract) return;
  const rows = db
    .prepare(
      `SELECT ca.*, u.name as uploader_name FROM contract_attachments ca
       JOIN users u ON u.id = ca.uploaded_by_user_id
       WHERE ca.contract_id = ? ORDER BY ca.created_at DESC`
    )
    .all(contract.id);
  res.json({ attachments: rows });
});

router.post("/:id/attachments", handleUpload, (req, res) => {
  const contract = loadAuthorizedContract(req, res, { requireEdit: true });
  if (!contract) return;
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });

  db.prepare(
    `INSERT INTO contract_attachments
       (contract_id, uploaded_by_user_id, original_filename, mime_type, size_bytes, storage_path, is_original_source)
     VALUES (?, ?, ?, ?, ?, ?, 0)`
  ).run(contract.id, req.user.id, req.file.originalname, req.file.mimetype, req.file.size, req.file.filename);

  logAudit(contract.id, req.user, "attachment_added", `${req.user.name} uploaded "${req.file.originalname}".`);
  res.status(201).json({ ok: true });
});

router.get("/:id/attachments/:attachmentId/download", (req, res) => {
  const contract = loadAuthorizedContract(req, res);
  if (!contract) return;
  const attachment = db
    .prepare("SELECT * FROM contract_attachments WHERE id = ? AND contract_id = ?")
    .get(req.params.attachmentId, contract.id);
  if (!attachment) return res.status(404).json({ error: "Attachment not found." });

  const filePath = path.join(UPLOAD_DIR, attachment.storage_path);
  res.download(filePath, attachment.original_filename, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "File no longer available." });
  });
});

// Sharing — grants another existing Pact profile view or edit access to
// this one contract, distinct from being a signing party. Owner-only.
router.get("/:id/shares", (req, res) => {
  const contract = loadAuthorizedContract(req, res);
  if (!contract) return;
  if (contract.owner_id !== req.user.id) {
    return res.status(403).json({ error: "Only the contract owner can view its shares." });
  }
  const rows = db
    .prepare(
      `SELECT cs.id, cs.permission, cs.created_at, u.name, u.email
       FROM contract_shares cs JOIN users u ON u.id = cs.shared_with_user_id
       WHERE cs.contract_id = ?
       ORDER BY cs.created_at DESC`
    )
    .all(contract.id);
  res.json({ shares: rows });
});

router.post("/:id/share", (req, res) => {
  const contract = loadAuthorizedContract(req, res);
  if (!contract) return;
  if (contract.owner_id !== req.user.id) {
    return res.status(403).json({ error: "Only the contract owner can share it." });
  }
  const { email, permission } = req.body || {};
  if (!email || !["view", "edit"].includes(permission)) {
    return res.status(400).json({ error: "A valid email and permission ('view' or 'edit') are required." });
  }
  const target = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase());
  if (!target) {
    return res.status(404).json({ error: "No Pact account found for that email — they'll need to create one first." });
  }
  if (target.id === req.user.id) {
    return res.status(400).json({ error: "You already own this contract." });
  }

  db.prepare(
    `INSERT INTO contract_shares (contract_id, shared_by_user_id, shared_with_user_id, permission)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(contract_id, shared_with_user_id) DO UPDATE SET permission = excluded.permission`
  ).run(contract.id, req.user.id, target.id, permission);

  logAudit(contract.id, req.user, "shared", `Shared with ${target.name} <${target.email}> (${permission} access).`);
  res.status(201).json({ ok: true });
});

router.delete("/:id/share/:shareId", (req, res) => {
  const contract = loadAuthorizedContract(req, res);
  if (!contract) return;
  if (contract.owner_id !== req.user.id) {
    return res.status(403).json({ error: "Only the contract owner can revoke a share." });
  }
  db.prepare("DELETE FROM contract_shares WHERE id = ? AND contract_id = ?").run(req.params.shareId, contract.id);
  logAudit(contract.id, req.user, "unshared", "Revoked a shared collaborator's access.");
  res.json({ ok: true });
});

module.exports = router;
