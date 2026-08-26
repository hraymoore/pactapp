const crypto = require("crypto");
const db = require("../db");
const { logAudit } = require("./signing");

function contentHash(body) {
  return crypto.createHash("sha256").update(body, "utf8").digest("hex");
}

// Shared by normal contract creation (routes/contracts.js) and one-time
// purchase fulfillment (services/purchases.js) so both produce an
// identical contract + owner-party + audit-log shape. Tier/payment
// authorization is the caller's job — this just creates the row.
function createContractFromTemplate({ ownerId, ownerName, ownerEmail, name, template, sourceNote }) {
  const body = template ? template.body : "[Start drafting your contract here.]";
  const genre = template ? template.genre : null;

  const info = db
    .prepare(
      "INSERT INTO contracts (owner_id, name, genre, body, status, template_id, content_hash) VALUES (?, ?, ?, ?, 'draft', ?, ?)"
    )
    .run(ownerId, name, genre, body, template ? template.id : null, contentHash(body));
  const contractId = info.lastInsertRowid;

  db.prepare(
    "INSERT INTO contract_parties (contract_id, user_id, name, email, role, signed_at) VALUES (?, ?, ?, ?, 'owner', NULL)"
  ).run(contractId, ownerId, ownerName, ownerEmail);

  logAudit(
    contractId,
    { name: ownerName, email: ownerEmail },
    "created",
    sourceNote || `Contract "${name}" created${template ? " from a template" : ""}.`
  );

  return contractId;
}

module.exports = { contentHash, createContractFromTemplate };
