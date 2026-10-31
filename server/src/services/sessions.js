const crypto = require("crypto");
const db = require("../db");

const REAUTH_WINDOW_MINUTES = 10;
// Avoids a write on every single authenticated request (a dashboard page
// load alone fires a dozen parallel API calls) while still keeping
// last_active_at fresh enough to be a meaningful "last seen" for the
// sessions list in Settings → Security.
const TOUCH_THROTTLE_MINUTES = 1;

function createSession({ userId, ip, userAgent }) {
  const id = crypto.randomBytes(24).toString("hex");
  db.prepare("INSERT INTO sessions (id, user_id, ip_address, user_agent) VALUES (?, ?, ?, ?)").run(
    id,
    userId,
    ip || null,
    userAgent || null
  );
  return id;
}

// Only a live, unrevoked session counts — a revoked row is treated as if
// it were never found, so callers never need to separately check
// revoked_at themselves (same "just don't attach req.user" philosophy as
// attachUser's account_status check).
function getActiveSession(sessionId) {
  if (!sessionId) return null;
  return db.prepare("SELECT * FROM sessions WHERE id = ? AND revoked_at IS NULL").get(sessionId);
}

function touchSession(sessionId) {
  db.prepare(
    `UPDATE sessions SET last_active_at = datetime('now')
     WHERE id = ? AND revoked_at IS NULL
       AND last_active_at < datetime('now', '-${TOUCH_THROTTLE_MINUTES} minutes')`
  ).run(sessionId);
}

function listActiveSessions(userId) {
  return db
    .prepare("SELECT * FROM sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_active_at DESC")
    .all(userId);
}

// Scoped to userId so one user can never revoke another's session by
// guessing/enumerating session ids.
function revokeSession(sessionId, userId) {
  const info = db
    .prepare("UPDATE sessions SET revoked_at = datetime('now') WHERE id = ? AND user_id = ? AND revoked_at IS NULL")
    .run(sessionId, userId);
  return info.changes > 0;
}

// "Sign out everywhere else" — keeps the session making the request alive
// (matches the spec's password-change behavior: invalidate every OTHER
// session, not the one the user is actively using to change it).
function revokeOtherSessions(userId, currentSessionId) {
  db.prepare(
    "UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND id != ? AND revoked_at IS NULL"
  ).run(userId, currentSessionId || "");
}

// Closing an account should kill access everywhere at once, not just the
// browser tab that clicked "Close Account" — unlike revokeOtherSessions,
// this takes no exception.
function revokeAllSessions(userId) {
  db.prepare("UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL").run(userId);
}

function markReauth(sessionId) {
  db.prepare("UPDATE sessions SET reauth_at = datetime('now') WHERE id = ?").run(sessionId);
}

function hasRecentReauth(sessionId) {
  const session = getActiveSession(sessionId);
  if (!session || !session.reauth_at) return false;
  return Date.now() - new Date(session.reauth_at + "Z").getTime() < REAUTH_WINDOW_MINUTES * 60 * 1000;
}

module.exports = {
  REAUTH_WINDOW_MINUTES,
  createSession,
  getActiveSession,
  touchSession,
  listActiveSessions,
  revokeSession,
  revokeOtherSessions,
  revokeAllSessions,
  markReauth,
  hasRecentReauth,
};
