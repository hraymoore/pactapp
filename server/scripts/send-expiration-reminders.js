// Not a standalone script when run in production — see the note at the
// bottom of this file for why. For a scheduled job to run daily. The
// real logic — sending a reminder at each of 90/60/30/7 days before a
// contract's or archive item's expiration/renewal date, exactly once per
// threshold crossed — lives in services/renewals.js's runReminderSweep,
// which this just calls.
const { runReminderSweep } = require("../src/services/renewals");

function run() {
  const { sent } = runReminderSweep();
  if (sent === 0) console.log("[pact] No contracts or archive items due for a renewal reminder.");
  return { sent };
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
