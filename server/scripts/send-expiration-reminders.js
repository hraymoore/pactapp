// Not a standalone script when run in production — see the note at the
// bottom of this file for why. For a scheduled job to run daily. Finds
// contracts AND archive items expiring within 7 days that haven't been
// reminded about yet, emails the owner, and marks them so it only fires
// once per expiration date (routes/contracts.js / routes/archive.js
// clear the mark if the date changes) — "the same reminder system" the
// archive spec calls for, rather than a second parallel one. Uses the
// same fail-open mailer as everything else: with no SMTP configured this
// just logs what it WOULD have sent.
const db = require("../src/db");
const { sendMail, mailerConfigured } = require("../src/services/mailer");
const { logAudit } = require("../src/services/signing");
const { logArchiveAudit } = require("../src/services/archive");

const REMINDER_WINDOW_DAYS = 7;

function remindContracts() {
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

  for (const c of rows) {
    const renewNote = c.auto_renews
      ? "It's marked as auto-renewing — confirm that's still what you want before it does."
      : "It is not marked as auto-renewing, so it will simply lapse unless you act.";
    const text =
      `"${c.name}" is set to expire on ${c.expires_at}.\n\n${renewNote}\n\n` +
      `Open it in Pact to review, renew, or let it lapse: ${process.env.PUBLIC_URL || "https://www.pactappstore.com"}/dashboard.html?contract=${c.id}`;

    sendMail({ to: c.owner_email, subject: `Pact: "${c.name}" expires ${c.expires_at}`, text });
    if (!mailerConfigured()) {
      console.log(`[pact] (SMTP not configured) Would remind ${c.owner_email} about contract #${c.id} "${c.name}", expires ${c.expires_at}.`);
    } else {
      console.log(`[pact] Reminder sent to ${c.owner_email} for contract #${c.id} "${c.name}".`);
    }

    db.prepare("UPDATE contracts SET expiration_reminder_sent_at = datetime('now') WHERE id = ?").run(c.id);
    logAudit(c.id, null, "expiration_reminder_sent", `Reminder sent to ${c.owner_email} — expires ${c.expires_at}.`);
  }
  return rows.length;
}

function remindArchiveItems() {
  const rows = db
    .prepare(
      `SELECT a.*, u.name as owner_name, u.email as owner_email FROM archive_items a
       JOIN users u ON u.id = a.owner_user_id
       WHERE a.deleted_at IS NULL
         AND a.expiration_date IS NOT NULL
         AND a.expiration_reminder_sent_at IS NULL
         AND date(a.expiration_date) <= date('now', '+' || ? || ' days')
       ORDER BY a.expiration_date ASC`
    )
    .all(REMINDER_WINDOW_DAYS);

  for (const a of rows) {
    const renewNote = a.auto_renews
      ? "It's marked as auto-renewing — confirm that's still what you want before it does."
      : "It is not marked as auto-renewing, so it will simply lapse unless you act.";
    const text =
      `Your archived upload "${a.title}" is set to expire on ${a.expiration_date}.\n\n${renewNote}\n\n` +
      `Open it in Pact to review: ${process.env.PUBLIC_URL || "https://www.pactappstore.com"}/dashboard.html?archive=${a.id}`;

    sendMail({ to: a.owner_email, subject: `Pact: archived item "${a.title}" expires ${a.expiration_date}`, text });
    if (!mailerConfigured()) {
      console.log(`[pact] (SMTP not configured) Would remind ${a.owner_email} about archive item #${a.id} "${a.title}", expires ${a.expiration_date}.`);
    } else {
      console.log(`[pact] Reminder sent to ${a.owner_email} for archive item #${a.id} "${a.title}".`);
    }

    db.prepare("UPDATE archive_items SET expiration_reminder_sent_at = datetime('now') WHERE id = ?").run(a.id);
    logArchiveAudit(a.id, null, "expiration_reminder_sent", `Reminder sent to ${a.owner_email} — expires ${a.expiration_date}.`, null);
  }
  return rows.length;
}

function run() {
  const contractsReminded = remindContracts();
  const archiveItemsReminded = remindArchiveItems();
  if (contractsReminded === 0 && archiveItemsReminded === 0) {
    console.log("[pact] No contracts or archive items due for an expiration reminder.");
  }
  return { reminded: contractsReminded, archiveReminded: archiveItemsReminded };
}

module.exports = { run };

// Render Cron Jobs run as their own separate service with no access to
// the web service's persistent disk (and therefore no access to the real
// production database) — running this file directly there would silently
// operate on an empty, throwaway database. In production this is invoked
// in-process, with real DB access, via POST /api/internal/run-expiration-
// reminders (routes/internal.js) — see scripts/ping-expiration-reminders.js,
// which is what's actually scheduled on Render. Running this file directly
// (`npm run reminders`) still works for local development, where the DB
// really is on disk right next to it.
if (require.main === module) {
  require("dotenv").config();
  run();
}
