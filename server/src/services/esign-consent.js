const db = require("../db");

// Bump whenever website/esignature-disclosure.html's substantive text
// changes. Unlike terms.js's CURRENT_TERMS_VERSION, this does NOT gate a
// re-acceptance flow — hasConsented() below accepts any prior row
// regardless of version, matching the spec: a one-time gate per user, not
// a per-version one. The version is still recorded on each row purely for
// the audit record of what a given consent actually covered.
const CURRENT_ESIGN_CONSENT_VERSION = "esign_v1.0_2026-09-01";

function recordConsent({ userId, ipAddress }) {
  db.prepare(
    "INSERT INTO esign_consent_acceptances (user_id, consent_version, ip_address) VALUES (?, ?, ?)"
  ).run(userId, CURRENT_ESIGN_CONSENT_VERSION, ipAddress || null);
}

function hasConsented(userId) {
  return !!db.prepare("SELECT id FROM esign_consent_acceptances WHERE user_id = ? LIMIT 1").get(userId);
}

module.exports = { CURRENT_ESIGN_CONSENT_VERSION, recordConsent, hasConsented };
