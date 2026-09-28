// Standalone script — not part of the web server — for a scheduled job
// (Render Cron Job, a plain crontab, etc.) to run daily. An annual pass
// (routes/billing.js POST /checkout-annual) is a one-time payment, not a
// Stripe subscription, so nothing renews it automatically: this script is
// what reminds someone before it lapses and downgrades the account to
// Free once it does. Uses the same fail-open mailer as everything else —
// with no SMTP configured this just logs what it WOULD have sent.
require("dotenv").config();
const db = require("../src/db");
const { sendMail, mailerConfigured } = require("../src/services/mailer");

const REMINDER_WINDOW_DAYS = 14;
const TIER_LABEL = { pro: "Professional", business: "Enterprise" };

function sendReminders() {
  const rows = db
    .prepare(
      `SELECT id, name, email, tier, tier_expires_at FROM users
       WHERE tier_expires_at IS NOT NULL
         AND annual_pass_reminder_sent_at IS NULL
         AND date(tier_expires_at) <= date('now', '+' || ? || ' days')
         AND date(tier_expires_at) > date('now')`
    )
    .all(REMINDER_WINDOW_DAYS);

  for (const u of rows) {
    const label = TIER_LABEL[u.tier] || u.tier;
    const text =
      `Your Pact ${label} annual pass expires on ${u.tier_expires_at}.\n\n` +
      "It's a one-time payment, not a subscription, so it won't renew on its own — " +
      "renew from Settings before it lapses to keep your access, or it will automatically " +
      "revert to the Free tier on the expiration date.\n\n" +
      `Renew: ${process.env.PUBLIC_URL || "https://www.pactappstore.com"}/pricing.html`;

    sendMail({ to: u.email, subject: `Pact: your ${label} annual pass expires ${u.tier_expires_at}`, text });
    if (!mailerConfigured()) {
      console.log(`[pact] (SMTP not configured) Would remind ${u.email} — ${label} annual pass expires ${u.tier_expires_at}.`);
    } else {
      console.log(`[pact] Annual pass reminder sent to ${u.email} — expires ${u.tier_expires_at}.`);
    }
    db.prepare("UPDATE users SET annual_pass_reminder_sent_at = datetime('now') WHERE id = ?").run(u.id);
  }

  if (rows.length === 0) console.log("[pact] No annual passes due for a renewal reminder.");
}

function downgradeExpired() {
  const rows = db
    .prepare(
      `SELECT id, name, email, tier, tier_expires_at FROM users
       WHERE tier_expires_at IS NOT NULL AND datetime(tier_expires_at) <= datetime('now')`
    )
    .all();

  for (const u of rows) {
    const label = TIER_LABEL[u.tier] || u.tier;
    db.prepare(
      "UPDATE users SET tier = 'free', tier_expires_at = NULL, annual_pass_reminder_sent_at = NULL WHERE id = ?"
    ).run(u.id);

    const text =
      `Your Pact ${label} annual pass expired on ${u.tier_expires_at} and your account has moved to the Free tier.\n\n` +
      "Nothing you created was affected — your contracts, profile, and history are all exactly as they were. " +
      "Upgrade again anytime from Settings to restore full access.\n\n" +
      `Renew: ${process.env.PUBLIC_URL || "https://www.pactappstore.com"}/pricing.html`;
    sendMail({ to: u.email, subject: "Pact: your annual pass expired — you're now on the Free tier", text });
    if (!mailerConfigured()) {
      console.log(`[pact] (SMTP not configured) Would notify ${u.email} — ${label} annual pass expired, downgraded to Free.`);
    } else {
      console.log(`[pact] Annual pass expired for ${u.email} — downgraded to Free, notified.`);
    }
  }

  if (rows.length === 0) console.log("[pact] No expired annual passes to downgrade.");
}

sendReminders();
downgradeExpired();
