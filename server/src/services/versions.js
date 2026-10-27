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
  // created_at DESC alone isn't a safe sort: SQLite's datetime('now') only
  // has second-level resolution, so several saves within the same second
  // (easy to hit in a quick edit-save-edit-save flow, not just in tests)
  // would otherwise come back in an undefined order. id DESC breaks that
  // tie using true insertion order.
  return db
    .prepare("SELECT id, saved_by_name, saved_by_email, created_at FROM contract_versions WHERE contract_id = ? ORDER BY created_at DESC, id DESC")
    .all(contractId);
}

// Resolves one side of a comparison — either a specific saved version, or
// the special key "current" for the contract's live body. The live body
// has no "saved by" of its own to show (contracts.body carries no
// last-editor column), so it's labeled by timestamp only, same as the
// single-column redline this generalizes did before it.
function resolveComparable(contract, key) {
  if (key === "current") {
    return { key: "current", label: "Current", savedByName: null, savedByEmail: null, at: contract.updated_at, body: contract.body };
  }
  const version = db.prepare("SELECT * FROM contract_versions WHERE id = ? AND contract_id = ?").get(key, contract.id);
  if (!version) return null;
  return { key: version.id, label: "Earlier version", savedByName: version.saved_by_name, savedByEmail: version.saved_by_email, at: version.created_at, body: version.body };
}

// A line-level redline: { added, removed, unchanged } segments in reading
// order, the same shape `git diff` or a Word "Compare Documents" view
// produces — additions and removals, not just a moved-around structure.
function diffVersions(oldBody, newBody) {
  return diffLines(oldBody, newBody).map((part) => ({
    value: part.value,
    added: !!part.added,
    removed: !!part.removed,
  }));
}

module.exports = { snapshotVersion, listVersions, resolveComparable, diffVersions };
