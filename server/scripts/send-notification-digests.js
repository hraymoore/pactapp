// Scheduled job to run once daily — see send-expiration-reminders.js's
// bottom comment for why this file isn't what's actually scheduled on
// Render. The real logic lives in services/notification-digest.js's
// sendDigests.
const { sendDigests } = require("../src/services/notification-digest");

function run() {
  const { usersNotified, itemsCleared } = sendDigests();
  if (usersNotified === 0) console.log("[pact] No notification digests to send.");
  return { usersNotified, itemsCleared };
}

module.exports = { run };

if (require.main === module) {
  require("dotenv").config();
  run();
}
