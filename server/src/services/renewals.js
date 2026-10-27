const db = require("../db");
const { sendMail, mailerConfigured } = require("./mailer");
const { logAudit } = require("./signing");
const { logArchiveAudit } = require("./archive");

// Fires once per threshold crossed, not once per fixed window — a daily
// job checks "is this subject's date within N days and have we not yet
// sent the N-day reminder for it," independently for each N. Over the
// lead-up to one date, that's up to four separate emails (90, 60, 30, 7
// days out), each sent exactly once, tracked in renewal_reminders_sent.
const REMINDER_INTERVALS_DAYS = [90, 60, 30, 7];

function hasReminderBeenSent(subjectType, subjectId, intervalDays) {
  return !!db
    .prepare("SELECT 1 FROM renewal_reminders_sent WHERE subject_type = ? AND subject_id = ? AND interval_days = ?")
    .get(subjectType, subjectId, intervalDays);
}

function markReminderSent(subjectType, subjectId, intervalDays) {
  db.prepare(
    "INSERT OR IGNORE INTO renewal_reminders_sent (subject_type, subject_id, interval_days) VALUES (?, ?, ?)"
  ).run(subjectType, subjectId, intervalDays);
}

// Called whenever a contract's expires_at or an archive item's
// expiration_date changes — the old thresholds applied to the old date,
// so they're cleared to let the same 90/60/30/7-day reminders fire again
// against the new one, exactly like the single-column reminder-sent
// fields this supersedes were already cleared on a date change.
function clearRemindersForSubject(subjectType, subjectId) {
  db.prepare("DELETE FROM renewal_reminders_sent WHERE subject_type = ? AND subject_id = ?").run(subjectType, subjectId);
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const ms = new Date(dateStr + "T00:00:00Z").getTime() - new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  return Math.round(ms / 86400000);
}

// Every contract or archive item the user can see (owner, signing party,
// share recipient) with a renewal/expiration date at all — the "calendar
// of every key date" the in-app Renewals view is built from. Includes
// overdue (negative daysUntil) items, since a lapsed, un-renewed contract
// is exactly the kind of thing this view exists to surface.
function getUpcomingRenewals(user) {
  const contracts = db
    .prepare(
      `SELECT id, name, state, status, expires_at, auto_renews, 'contract' as subject_type, owner_id
       FROM contracts
       WHERE expires_at IS NOT NULL
         AND (owner_id = @uid
              OR id IN (SELECT contract_id FROM contract_parties WHERE email = @email)
              OR id IN (SELECT contract_id FROM contract_shares WHERE shared_with_user_id = @uid))`
    )
    .all({ uid: user.id, email: user.email });

  const archiveItems = db
    .prepare(
      `SELECT id, title as name, governing_state as state, 'active' as status, expiration_date as expires_at, auto_renews, 'archive_item' as subject_type, owner_user_id as owner_id
       FROM archive_items
       WHERE expiration_date IS NOT NULL AND deleted_at IS NULL
         AND (owner_user_id = @uid OR id IN (SELECT archive_item_id FROM archive_shares WHERE shared_with_user_id = @uid))`
    )
    .all({ uid: user.id });

  return [...contracts, ...archiveItems]
    .map((r) => ({ ...r, daysUntil: daysUntil(r.expires_at), isOwner: r.owner_id === user.id }))
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

function emailBodyFor(subjectType, name, expiresAt, autoRenews, intervalDays) {
  const horizon = intervalDays === 7 ? "within a week" : `in about ${intervalDays} days`;
  const renewNote = autoRenews
    ? "It's marked as auto-renewing — confirm that's still what you want before it does."
    : "It is not marked as auto-renewing, so it will simply lapse unless you act.";
  const noun = subjectType === "archive_item" ? "archived upload" : "contract";
  return `Your ${noun} "${name}" is set to expire or renew on ${expiresAt}, ${horizon}.\n\n${renewNote}\n\n` +
    `Open it in Pact to review: ${process.env.PUBLIC_URL || "https://www.pactappstore.com"}/dashboard.html`;
}

// The scheduled job's real logic for both subject types — checks every
// one of the four thresholds independently against every contract/
// archive item that has a date at all, so a date that's already inside
// the 7-day window on this job's very first run after being set still
// gets exactly the reminders whose threshold it's already within (it
// doesn't "miss" the 90/60/30-day ones retroactively — those simply
// never applied once the date was already closer than that).
function runReminderSweep() {
  const subjects = [
    {
      type: "contract",
      rows: db
        .prepare(
          `SELECT c.id, c.name, c.expires_at, c.auto_renews, u.name as owner_name, u.email as owner_email FROM contracts c
           JOIN users u ON u.id = c.owner_id
           WHERE c.expires_at IS NOT NULL`
        )
        .all(),
    },
    {
      type: "archive_item",
      rows: db
        .prepare(
          `SELECT a.id, a.title as name, a.expiration_date as expires_at, a.auto_renews, u.name as owner_name, u.email as owner_email FROM archive_items a
           JOIN users u ON u.id = a.owner_user_id
           WHERE a.expiration_date IS NOT NULL AND a.deleted_at IS NULL`
        )
        .all(),
    },
  ];

  let sent = 0;
  for (const { type, rows } of subjects) {
    for (const row of rows) {
      const remaining = daysUntil(row.expires_at);
      // All thresholds the date is already within AND haven't fired yet.
      // Normally that's at most one (thresholds get crossed on separate
      // days), but the first time a job sees a subject whose date is
      // already close, several can be "already behind us" at once — in
      // that case send only the smallest/most urgent one (the one
      // actually informative right now) but mark every applicable
      // threshold as consumed, so the larger, now-moot ones don't fire
      // redundantly on a later day once this one's been seen.
      const applicable = REMINDER_INTERVALS_DAYS.filter(
        (intervalDays) => remaining <= intervalDays && !hasReminderBeenSent(type, row.id, intervalDays)
      );
      if (applicable.length === 0) continue;
      const intervalDays = Math.min(...applicable);

      sendMail({
        to: row.owner_email,
        subject: `Pact: "${row.name}" ${remaining < 0 ? "has expired" : "expires soon"} (${row.expires_at})`,
        text: emailBodyFor(type, row.name, row.expires_at, row.auto_renews, intervalDays),
      });
      if (!mailerConfigured()) {
        console.log(`[pact] (SMTP not configured) Would send ${intervalDays}-day reminder to ${row.owner_email} for ${type} #${row.id} "${row.name}".`);
      } else {
        console.log(`[pact] Sent ${intervalDays}-day reminder to ${row.owner_email} for ${type} #${row.id} "${row.name}".`);
      }
      applicable.forEach((d) => markReminderSent(type, row.id, d));
      if (type === "contract") {
        logAudit(row.id, null, "renewal_reminder_sent", `${intervalDays}-day reminder sent to ${row.owner_email} — expires ${row.expires_at}.`);
      } else {
        logArchiveAudit(row.id, null, "renewal_reminder_sent", `${intervalDays}-day reminder sent to ${row.owner_email} — expires ${row.expires_at}.`, null);
      }
      sent += 1;
    }
  }
  return { sent };
}

module.exports = {
  REMINDER_INTERVALS_DAYS,
  hasReminderBeenSent,
  markReminderSent,
  clearRemindersForSubject,
  getUpcomingRenewals,
  runReminderSweep,
  daysUntil,
};
