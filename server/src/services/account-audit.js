const db = require("../db");

// Account-level security log (see db.js's account_audit_log comment for
// why this is a separate table from the contract-scoped audit_log).
// result is always recorded, win or lose — per spec 1.3, "every attempt"
// of a sensitive action belongs in the trail, not just the successful
// ones, since a string of failures is itself the signal worth keeping.
function logAccountAudit({ userId, action, result, detail, ip, userAgent }) {
  db.prepare(
    "INSERT INTO account_audit_log (user_id, action, result, detail, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(userId, action, result, detail || null, ip || null, userAgent || null);
}

function listAccountAudit(userId, limit = 100) {
  return db
    .prepare("SELECT * FROM account_audit_log WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?")
    .all(userId, limit);
}

module.exports = { logAccountAudit, listAccountAudit };
