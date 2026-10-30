// Scheduled job to run frequently (every 15-30 minutes is plenty, since
// this only acts once a 48-hour delay has already elapsed — unlike the
// daily reminder jobs, lateness here directly extends how long an
// account stays in a state it's already eligible to leave). The real
// logic lives in services/mfa-recovery.js's completeMfaRecoveries.
const { completeMfaRecoveries } = require("../src/services/mfa-recovery");

function run() {
  const { completed } = completeMfaRecoveries();
  if (completed === 0) console.log("[pact] No account recovery requests are due to complete.");
  return { completed };
}

module.exports = { run };

// See the matching comment in send-expiration-reminders.js — this file
// is only safe to run directly in local development (`npm run mfa-
// recovery-completions-local`); in production this is invoked in-process
// via POST /api/internal/run-mfa-recovery-completions (routes/
// internal.js), triggered by scripts/ping-mfa-recovery-completions.js on
// a Render Cron Job.
if (require.main === module) {
  require("dotenv").config();
  run();
}
