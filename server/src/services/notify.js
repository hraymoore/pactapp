// The gated send path for the three optional notification categories
// this app actually has real triggers for today: contract activity
// (currently just "fully executed," not every view/sent — see routes/
// contracts.js and routes/sign.js), payment events (services/
// payments.js), and reminders (services/renewals.js). Security alerts
// and legal/transactional notices (password/email/phone changes, MFA,
// signing-invitation links, admin notices, etc.) call sendMail/sendSms
// directly and never touch this file — that's what makes them
// physically un-suppressible by a preference, not a check this module
// performs.
const db = require("../db");
const { sendMail } = require("./mailer");
const { sendSms } = require("./sms");
const { getPreferences, isQuietHours } = require("./notification-prefs");

const CATEGORIES = ["contractActivity", "paymentEvents", "reminders"];

// `user` needs at least email, phone, phone_verified_at and
// notification_preferences — a full `users` row, not a contract_parties
// row. Pass null/a party with no account and this silently no-ops;
// callers with a contract_parties row that might not have a linked
// account should resolve to the real user first and fall back to a
// plain sendMail for one that doesn't exist (see payments.js's
// emailBothParties).
function notifyUser({ user, category, subject, text, smsBody }) {
  if (!user || !user.email || !CATEGORIES.includes(category)) return;
  const prefs = getPreferences(user);
  const categoryPrefs = prefs[category];

  if (prefs.digest.enabled) {
    db.prepare("INSERT INTO pending_digest_items (user_id, category, summary) VALUES (?, ?, ?)").run(user.id, category, subject);
    return;
  }

  const quiet = isQuietHours(prefs);
  if (categoryPrefs.email && !quiet) {
    sendMail({ to: user.email, subject, text });
  }
  if (categoryPrefs.sms && smsBody && user.phone && user.phone_verified_at && !quiet) {
    sendSms({ to: user.phone, body: smsBody });
  }
}

module.exports = { notifyUser };
