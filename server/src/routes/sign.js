const express = require("express");
const router = express.Router();
const db = require("../db");
const { applySignature, logView } = require("../services/signing");

router.use(express.json());

// Public — a signer follows an emailed/shared link and does not need a Pact
// login to review and execute the contract, matching how e-signature tools
// like DocuSign/Adobe Acrobat Sign let an outside counterparty sign.
router.get("/:token", (req, res) => {
  const party = db.prepare("SELECT * FROM contract_parties WHERE sign_token = ?").get(req.params.token);
  if (!party) return res.status(404).json({ error: "This signing link is invalid or has expired." });

  const contract = db.prepare("SELECT * FROM contracts WHERE id = ?").get(party.contract_id);
  const owner = db
    .prepare("SELECT name, email FROM contract_parties WHERE contract_id = ? AND role = 'owner'")
    .get(contract.id);

  // A business-account sender's EIN is self-reported and never
  // independently verified (see services/organizations.js) — an outside
  // signer following a public link has no other way to see that caveat
  // before they sign, so it travels with the contract itself rather than
  // living only in the Privacy Policy.
  const ownerUser = db.prepare("SELECT account_type FROM users WHERE id = ?").get(contract.owner_id);
  const ownerIsBusiness = !!(ownerUser && ownerUser.account_type === "business");

  logView(contract.id, { name: party.name, email: party.email });

  res.json({
    contract: { id: contract.id, name: contract.name, body: contract.body, status: contract.status },
    party: { name: party.name, email: party.email, signed_at: party.signed_at },
    owner,
    ownerIsBusiness,
  });
});

router.post("/:token", (req, res) => {
  const { typedSignature, consent } = req.body || {};
  if (!consent) return res.status(400).json({ error: "You must consent to signing electronically." });
  if (!typedSignature || !typedSignature.trim()) {
    return res.status(400).json({ error: "Type your full legal name to sign." });
  }

  const party = db.prepare("SELECT * FROM contract_parties WHERE sign_token = ?").get(req.params.token);
  if (!party) return res.status(404).json({ error: "This signing link is invalid or has expired." });
  if (party.signed_at) return res.status(409).json({ error: "This party has already signed." });

  const forwardedFor = req.headers["x-forwarded-for"];
  const ip = (forwardedFor ? forwardedFor.split(",")[0].trim() : null) || req.socket.remoteAddress || "unknown";

  try {
    const { allSigned } = applySignature({ partyId: party.id, typedSignature, ip });
    res.json({ ok: true, allSigned });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
