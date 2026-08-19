const db = require("../db");

function logAudit(contractId, actor, action, detail) {
  db.prepare(
    "INSERT INTO audit_log (contract_id, actor_name, actor_email, action, detail) VALUES (?, ?, ?, ?, ?)"
  ).run(contractId, (actor && actor.name) || null, (actor && actor.email) || null, action, detail || null);
}

// Shared by the public token-based signing route (sign.js, for outside
// counterparties) and the authenticated in-app signing route (contracts.js,
// for the logged-in owner) so "both parties signed → lock + start the
// time-stamped audit trail" only lives in one place.
function applySignature({ partyId, typedSignature, ip }) {
  const party = db.prepare("SELECT * FROM contract_parties WHERE id = ?").get(partyId);
  if (!party) {
    const err = new Error("Party not found.");
    err.status = 404;
    throw err;
  }
  if (party.signed_at) {
    const err = new Error("This party has already signed.");
    err.status = 409;
    throw err;
  }

  db.prepare(
    "UPDATE contract_parties SET signed_at = datetime('now'), signature_name = ?, signature_ip = ? WHERE id = ?"
  ).run(typedSignature.trim(), ip, party.id);

  logAudit(
    party.contract_id,
    { name: party.name, email: party.email },
    "signed",
    `Signed electronically as "${typedSignature.trim()}" from IP ${ip}.`
  );

  const allParties = db.prepare("SELECT * FROM contract_parties WHERE contract_id = ?").all(party.contract_id);
  const allSigned = allParties.length > 1 && allParties.every((p) => p.signed_at);

  if (allSigned) {
    db.prepare("UPDATE contracts SET status = 'signed', locked_at = datetime('now') WHERE id = ?").run(
      party.contract_id
    );
    logAudit(
      party.contract_id,
      null,
      "fully_executed",
      "Contract signed by all parties and locked. Every change from this point on is a time-stamped amendment."
    );
  }

  return { allSigned };
}

module.exports = { applySignature, logAudit };
