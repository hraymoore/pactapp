// What's actually scheduled on Render — see send-archive-purge.js and
// ping-expiration-reminders.js's comments for why. No dependencies beyond
// Node 22's built-in fetch.
const baseUrl = process.env.PACT_BASE_URL || "https://pactapp.onrender.com";
const secret = process.env.INTERNAL_JOB_SECRET;

if (!secret) {
  console.error("[pact] INTERNAL_JOB_SECRET is not set on this cron job — cannot authenticate to the web service.");
  process.exit(1);
}

fetch(`${baseUrl}/api/internal/run-archive-purge`, {
  method: "POST",
  headers: { "X-Internal-Secret": secret },
})
  .then(async (r) => {
    const body = await r.text();
    console.log(`[pact] run-archive-purge responded ${r.status}: ${body}`);
    if (!r.ok) process.exit(1);
  })
  .catch((err) => {
    console.error("[pact] Failed to reach run-archive-purge:", err.message);
    process.exit(1);
  });
