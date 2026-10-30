// See send-mfa-recovery-completions.js's bottom comment for why this
// indirection exists. This is what's actually scheduled on Render —
// recommended every 15-30 minutes, not daily like the other reminder
// jobs (see that file's top comment for why).
const baseUrl = process.env.PACT_BASE_URL || "https://pactapp.onrender.com";
const secret = process.env.INTERNAL_JOB_SECRET;

if (!secret) {
  console.error("[pact] INTERNAL_JOB_SECRET is not set on this cron job — cannot authenticate to the web service.");
  process.exit(1);
}

fetch(`${baseUrl}/api/internal/run-mfa-recovery-completions`, {
  method: "POST",
  headers: { "X-Internal-Secret": secret },
})
  .then(async (r) => {
    const body = await r.text();
    console.log(`[pact] run-mfa-recovery-completions responded ${r.status}: ${body}`);
    if (!r.ok) process.exit(1);
  })
  .catch((err) => {
    console.error("[pact] Failed to reach run-mfa-recovery-completions:", err.message);
    process.exit(1);
  });
