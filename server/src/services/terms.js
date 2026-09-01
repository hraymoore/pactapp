const db = require("../db");

// Bump this whenever website/terms.html's substantive text changes, and
// update that page's "Last Updated" date to match — this string is the
// single source of truth both the signup clickwrap and the re-acceptance
// gate compare against. Keep the human-readable date in it so a support
// request ("what did this user actually agree to on version X") can be
// answered by eye without cross-referencing a changelog.
const CURRENT_TERMS_VERSION = "tos_v0.1_2026-09-01";

function recordAcceptance({ userId, ipAddress, acceptanceMethod }) {
  db.prepare(
    "INSERT INTO terms_acceptances (user_id, terms_version, ip_address, acceptance_method) VALUES (?, ?, ?, ?)"
  ).run(userId, CURRENT_TERMS_VERSION, ipAddress || null, acceptanceMethod || "checkbox_signup");
}

function latestAcceptance(userId) {
  return db
    .prepare("SELECT * FROM terms_acceptances WHERE user_id = ? ORDER BY accepted_at DESC, id DESC LIMIT 1")
    .get(userId);
}

function needsAcceptance(userId) {
  const latest = latestAcceptance(userId);
  return !latest || latest.terms_version !== CURRENT_TERMS_VERSION;
}

// Same x-forwarded-for-first pattern used for e-signature IP capture in
// routes/sign.js — behind Render's reverse proxy, req.socket.remoteAddress
// is the proxy's own address, not the visitor's.
function clientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  return (forwardedFor ? forwardedFor.split(",")[0].trim() : null) || req.socket.remoteAddress || "unknown";
}

module.exports = { CURRENT_TERMS_VERSION, recordAcceptance, latestAcceptance, needsAcceptance, clientIp };
