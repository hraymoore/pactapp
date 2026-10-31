// The daily-digest sweep (spec Phase 6) — turns each digest-enabled
// user's queued pending_digest_items rows into one summary email, then
// clears them. Run on a schedule via POST /api/internal/run-
// notification-digests (see scripts/send-notification-digests.js), the
// same pattern as the reminder/archive-purge/MFA-recovery jobs.
const db = require("../db");
const { sendMail } = require("./mailer");

const CATEGORY_LABEL = {
  contractActivity: "Contract activity",
  paymentEvents: "Payment events",
  reminders: "Reminders & renewals",
};

function sendDigests() {
  const userIds = db.prepare("SELECT DISTINCT user_id FROM pending_digest_items").all().map((r) => r.user_id);
  let usersNotified = 0;
  let itemsCleared = 0;
  for (const userId of userIds) {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    const items = db.prepare("SELECT * FROM pending_digest_items WHERE user_id = ? ORDER BY created_at ASC").all(userId);
    if (!user || items.length === 0) continue;

    const lines = items.map((item) => `- [${CATEGORY_LABEL[item.category] || item.category}] ${item.summary}`);
    sendMail({
      to: user.email,
      subject: `Your Pact daily summary (${items.length} update${items.length === 1 ? "" : "s"})`,
      text: `Here's what happened on your Pact account today:\n\n${lines.join("\n")}\n\nTurn off the daily digest in Settings → Notifications to get these as they happen instead.`,
    });
    db.prepare("DELETE FROM pending_digest_items WHERE user_id = ?").run(userId);
    usersNotified++;
    itemsCleared += items.length;
  }
  return { usersNotified, itemsCleared };
}

module.exports = { sendDigests };
