const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { renderContractPdf } = require("../services/pdf");
const { sendMail } = require("../services/mailer");
const { applySignature } = require("../services/signing");

router.use(express.json());
router.use(requireAuth);

const TIER_ORDER = ["starter", "everyday", "pro", "business"];

function contentHash(body) {
  return crypto.createHash("sha256").update(body, "utf8").digest("hex");
}

function logAudit(contractId, actor, action, detail) {
  db.prepare(
    "INSERT INTO audit_log (contract_id, actor_name, actor_email, action, detail) VALUES (?, ?, ?, ?, ?)"
  ).run(contractId, (actor && actor.name) || null, (actor && actor.email) || null, action, detail || null);
}

function loadAuthorizedContract(req, res) {
  const contract = db.prepare("SELECT * FROM contracts WHERE id = ?").get(req.params.id);
  if (!contract) {
    res.status(404).json({ error: "Contract not found." });
    return null;
  }
  const isOwner = contract.owner_id === req.user.id;
  const isParty = !!db
    .prepare("SELECT id FROM contract_parties WHERE contract_id = ? AND email = ?")
    .get(contract.id, req.user.email);
  if (!isOwner && !isParty) {
    res.status(403).json({ error: "You do not have access to this contract." });
    return null;
  }
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
       ORDER BY updated_at DESC`
    )
    .all({ uid: req.user.id, email: req.user.email });
  const withParties = rows.map((c) => ({
    ...c,
    parties: db
      .prepare("SELECT id, name, email, role, signed_at FROM contract_parties WHERE contract_id = ?")
      .all(c.id),
  }));
  res.json({ contracts: withParties });
});

router.post("/", (req, res) => {
  const { name, templateId, counterpartyName, counterpartyEmail, genre } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Contract name is required." });

  let body = "[Start drafting your contract here.]";
  let tplGenre = genre || null;

  if (templateId) {
    const tpl = db.prepare("SELECT * FROM templates WHERE id = ?").get(templateId);
    if (!tpl) return res.status(404).json({ error: "Template not found." });
    if (TIER_ORDER.indexOf(req.user.tier) < TIER_ORDER.indexOf(tpl.min_tier)) {
      return res.status(403).json({
        error: `This template requires the ${tpl.min_tier} tier or higher.`,
        requiredTier: tpl.min_tier,
      });
    }
    body = tpl.body;
    tplGenre = tpl.genre;
  }

  const info = db
    .prepare(
      "INSERT INTO contracts (owner_id, name, genre, body, status, template_id, content_hash) VALUES (?, ?, ?, ?, 'draft', ?, ?)"
    )
    .run(req.user.id, name.trim(), tplGenre, body, templateId || null, contentHash(body));
  const contractId = info.lastInsertRowid;

  db.prepare(
    "INSERT INTO contract_parties (contract_id, user_id, name, email, role, signed_at) VALUES (?, ?, ?, ?, 'owner', NULL)"
  ).run(contractId, req.user.id, req.user.name, req.user.email);

  if (counterpartyName && counterpartyEmail) {
    const token = crypto.randomBytes(24).toString("hex");
    db.prepare(
      "INSERT INTO contract_parties (contract_id, name, email, role, sign_token) VALUES (?, ?, ?, 'counterparty', ?)"
    ).run(contractId, counterpartyName.trim(), counterpartyEmail.trim().toLowerCase(), token);
  }

  logAudit(contractId, req.user, "created", `Contract "${name.trim()}" created${templateId ? " from a template" : ""}.`);
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
  const contract = loadAuthorizedContract(req, res);
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

module.exports = router;
