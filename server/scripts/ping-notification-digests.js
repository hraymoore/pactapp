// What's actually scheduled on Render — once daily (e.g. same time as
// the expiration-reminders job). See send-notification-digests.js's
// bottom comment for why this indirection exists.
const baseUrl = process.env.PACT_BASE_URL || "https://pactapp.onrender.com";
const secret = process.env.INTERNAL_JOB_SECRET;

if (!secret) {
  console.error("[pact] INTERNAL_JOB_SECRET is not set on this cron job — cannot authenticate to the web service.");
  process.exit(1);
}

fetch(`${baseUrl}/api/internal/run-notification-digests`, {
  method: "POST",
  headers: { "X-Internal-Secret": secret },
})
  .then(async (r) => {
    const body = await r.text();
    console.log(`[pact] run-notification-digests responded ${r.status}: ${body}`);
    if (!r.ok) process.exit(1);
  })
  .catch((err) => {
    console.error("[pact] Failed to reach run-notification-digests:", err.message);
    process.exit(1);
  });
