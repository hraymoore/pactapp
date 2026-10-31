// Per-category notification preferences (spec Phase 6). Deliberately
// NOT where security alerts or legal/transactional notices live — those
// call sendMail directly from wherever they happen and never pass
// through this module, so there is no code path by which a preference
// could ever suppress one (spec's own accept criterion: "required
// notices still send when all optional toggles are off").
const db = require("../db");

const DEFAULT_PREFERENCES = {
  contractActivity: { email: true, sms: false },
  paymentEvents: { email: true, sms: false },
  reminders: { email: true, sms: false },
  productUpdates: { email: false },
  quietHours: { enabled: false, start: "21:00", end: "08:00" },
  digest: { enabled: false },
};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Merges whatever was actually stored over the defaults, field by field —
// so a user's prefs saved before a new category existed just gets that
// category's default rather than needing its own backfill migration.
function getPreferences(user) {
  const defaults = clone(DEFAULT_PREFERENCES);
  if (!user || !user.notification_preferences) return defaults;
  let stored;
  try {
    stored = JSON.parse(user.notification_preferences);
  } catch (err) {
    return defaults;
  }
  const merged = defaults;
  for (const key of Object.keys(defaults)) {
    if (stored[key] && typeof stored[key] === "object") {
      Object.assign(merged[key], stored[key]);
    }
  }
  return merged;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// Only copies over fields that are actually present and well-formed —
// an unrecognized or malformed field is silently ignored rather than
// rejecting the whole request, since this is a preferences form, not a
// security boundary. Starts from the user's CURRENT preferences, not a
// bare default clone — a partial PUT (e.g. just flipping `digest.
// enabled`) must not silently reset every other category back to its
// default.
function normalizeInput(input, current) {
  const prefs = current ? clone(current) : clone(DEFAULT_PREFERENCES);
  const src = input || {};
  for (const key of ["contractActivity", "paymentEvents", "reminders"]) {
    if (src[key] && typeof src[key].email === "boolean") prefs[key].email = src[key].email;
    if (src[key] && typeof src[key].sms === "boolean") prefs[key].sms = src[key].sms;
  }
  if (src.productUpdates && typeof src.productUpdates.email === "boolean") {
    prefs.productUpdates.email = src.productUpdates.email;
  }
  if (src.quietHours) {
    if (typeof src.quietHours.enabled === "boolean") prefs.quietHours.enabled = src.quietHours.enabled;
    if (typeof src.quietHours.start === "string" && HHMM.test(src.quietHours.start)) prefs.quietHours.start = src.quietHours.start;
    if (typeof src.quietHours.end === "string" && HHMM.test(src.quietHours.end)) prefs.quietHours.end = src.quietHours.end;
  }
  if (src.digest && typeof src.digest.enabled === "boolean") prefs.digest.enabled = src.digest.enabled;
  return prefs;
}

function savePreferences(userId, input) {
  const row = db.prepare("SELECT notification_preferences FROM users WHERE id = ?").get(userId);
  const current = getPreferences(row || {});
  const normalized = normalizeInput(input, current);
  db.prepare("UPDATE users SET notification_preferences = ? WHERE id = ?").run(JSON.stringify(normalized), userId);
  return normalized;
}

// UTC-based on purpose — nothing in this schema stores a reliable UTC
// offset for a user (Phase 2's `timezone` field is a display preference,
// e.g. for formatting dates, not wired to anything that converts a
// clock time into it), so treating the stored start/end as UTC and
// documenting that is more honest than quietly comparing against the
// wrong clock.
function isQuietHours(prefs, now = new Date()) {
  if (!prefs.quietHours.enabled) return false;
  const [startH, startM] = prefs.quietHours.start.split(":").map(Number);
  const [endH, endM] = prefs.quietHours.end.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  return nowMinutes >= startMinutes || nowMinutes < endMinutes; // wraps past midnight
}

module.exports = { DEFAULT_PREFERENCES, getPreferences, savePreferences, isQuietHours };
