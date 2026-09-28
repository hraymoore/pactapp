// This is what's actually scheduled on Render, not send-expiration-
// reminders.js directly — see that file's bottom comment for why a
// separate Render Cron Job can't touch the real database itself. This
// script has no dependencies (just the Node 22 built-in fetch) since it
// does nothing but trigger the real logic running inside the web service.
const baseUrl = process.env.PACT_BASE_URL || "https://pactapp.onrender.com";
const secret = process.env.INTERNAL_JOB_SECRET;

if (!secret) {
  console.error("[pact] INTERNAL_JOB_SECRET is not set on this cron job — cannot authenticate to the web service.");
  process.exit(1);
}

fetch(`${baseUrl}/api/internal/run-expiration-reminders`, {
  method: "POST",
  headers: { "X-Internal-Secret": secret },
})
  .then(async (r) => {
    const body = await r.text();
    console.log(`[pact] run-expiration-reminders responded ${r.status}: ${body}`);
    if (!r.ok) process.exit(1);
  })
  .catch((err) => {
    console.error("[pact] Failed to reach run-expiration-reminders:", err.message);
    process.exit(1);
  });
