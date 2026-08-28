// Standalone script — not part of the web server — for a scheduled job
// (Render Cron Job, a plain crontab, GitHub Actions on a schedule, etc.)
// to run daily. Finds contracts expiring within 7 days that haven't been
// reminded about yet, emails the owner, and marks them so it only fires
// once per expiration date (routes/contracts.js clears the mark if the
// date changes). Uses the same fail-open mailer as everything else: with
// no SMTP configured this just logs what it WOULD have sent.
require("dotenv").config();
const db = require("../src/db");
const { sendMail, mailerConfigured } = require("../src/services/mailer");
const { logAudit } = require("../src/services/signing");

const REMINDER_WINDOW_DAYS = 7;

function run() {
  const rows = db
    .prepare(
      `SELECT c.*, u.name as owner_name, u.email as owner_email FROM contracts c
       JOIN users u ON u.id = c.owner_id
       WHERE c.expires_at IS NOT NULL
         AND c.expiration_reminder_sent_at IS NULL
         AND date(c.expires_at) <= date('now', '+' || ? || ' days')
       ORDER BY c.expires_at ASC`
    )
    .all(REMINDER_WINDOW_DAYS);

  if (rows.length === 0) {
    console.log("[pact] No contracts due for an expiration reminder.");
    return;
  }

  for (const c of rows) {
    const renewNote = c.auto_renews
      ? "It's marked as auto-renewing — confirm that's still what you want before it does."
      : "It is not marked as auto-renewing, so it will simply lapse unless you act.";
    const text =
      `"${c.name}" is set to expire on ${c.expires_at}.\n\n${renewNote}\n\n` +
      `Open it in Pact to review, renew, or let it lapse: ${process.env.PUBLIC_URL || "https://www.pactappstore.com"}/dashboard.html?contract=${c.id}`;

    const result = sendMail({ to: c.owner_email, subject: `Pact: "${c.name}" expires ${c.expires_at}`, text });
    if (!mailerConfigured()) {
      console.log(`[pact] (SMTP not configured) Would remind ${c.owner_email} about contract #${c.id} "${c.name}", expires ${c.expires_at}.`);
    } else {
      console.log(`[pact] Reminder sent to ${c.owner_email} for contract #${c.id} "${c.name}".`);
    }

    db.prepare("UPDATE contracts SET expiration_reminder_sent_at = datetime('now') WHERE id = ?").run(c.id);
    logAudit(c.id, null, "expiration_reminder_sent", `Reminder sent to ${c.owner_email} — expires ${c.expires_at}.`);
  }
}

run();
