// Scheduled job (same indirection as send-expiration-reminders.js — see
// its bottom comment): permanently removes the encrypted file + extracted
// text for any archive upload soft-deleted more than 30 days ago. Run
// in-process via POST /api/internal/run-archive-purge, not directly on a
// Render Cron Job (no access to the real database there).
const { purgeExpiredSoftDeletes } = require("../src/services/archive");

function run() {
  const { purged } = purgeExpiredSoftDeletes();
  console.log(purged > 0 ? `[pact] Purged ${purged} archive item(s) past their 30-day trash retention.` : "[pact] No archive items due for purge.");
  return { purged };
}

module.exports = { run };

if (require.main === module) {
  require("dotenv").config();
  run();
}
