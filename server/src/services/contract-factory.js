const crypto = require("crypto");
const db = require("../db");
const { logAudit } = require("./signing");
const { stateName } = require("../us-states");

function contentHash(body) {
  return crypto.createHash("sha256").update(body, "utf8").digest("hex");
}

// A generic ('ALL'-state) template's governing-law clause carries a
// [STATE] placeholder — see buildBody() in seed-templates.js. Deep,
// state-specific templates already name their state directly and don't
// need this. Auto-inserting it here means the user never has to remember
// to fill it in themselves.
function applyGoverningLaw(body, stateCode) {
  if (!stateCode) return body;
  return body.replace(/\[STATE\]/g, stateName(stateCode));
}

// Shared by normal contract creation (routes/contracts.js) and one-time
// purchase fulfillment (services/purchases.js) so both produce an
// identical contract + owner-party + audit-log shape. Tier/payment
// authorization is the caller's job — this just creates the row.
function createContractFromTemplate({ ownerId, ownerName, ownerEmail, name, template, state, sourceNote }) {
  let body = template ? template.body : "[Start drafting your contract here.]";
  const genre = template ? template.genre : null;
  const aiRestricted = template ? template.ai_restricted : 0;
  body = applyGoverningLaw(body, state);

  const info = db
    .prepare(
      "INSERT INTO contracts (owner_id, name, genre, body, status, template_id, content_hash, state, ai_restricted) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)"
    )
    .run(ownerId, name, genre, body, template ? template.id : null, contentHash(body), state || null, aiRestricted ? 1 : 0);
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

module.exports = { contentHash, createContractFromTemplate, applyGoverningLaw };
