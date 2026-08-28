const { diffLines } = require("diff");
const db = require("../db");

// Called right before contracts.body is overwritten (routes/contracts.js
// PUT /:id) so there's always a real snapshot of what the text looked
// like a moment ago — the redline view compares against these, not just
// the "something changed" line already in audit_log.
function snapshotVersion(contractId, body, actor) {
  db.prepare(
    "INSERT INTO contract_versions (contract_id, body, saved_by_name, saved_by_email) VALUES (?, ?, ?, ?)"
  ).run(contractId, body, (actor && actor.name) || null, (actor && actor.email) || null);
}

function listVersions(contractId) {
  return db
    .prepare("SELECT id, saved_by_name, saved_by_email, created_at FROM contract_versions WHERE contract_id = ? ORDER BY created_at DESC")
    .all(contractId);
}

// A line-level redline: { added, removed, unchanged } segments in reading
// order, the same shape `git diff` or a Word "Compare Documents" view
// produces — additions and removals, not just a moved-around structure.
function diffAgainstCurrent(oldBody, currentBody) {
  return diffLines(oldBody, currentBody).map((part) => ({
    value: part.value,
    added: !!part.added,
    removed: !!part.removed,
  }));
}

module.exports = { snapshotVersion, listVersions, diffAgainstCurrent };
