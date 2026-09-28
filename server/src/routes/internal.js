const express = require("express");
const router = express.Router();

router.use(express.json());

// Guards both endpoints below with a shared secret rather than a normal
// user session — these are triggered by an external Render Cron Job
// (scripts/ping-*-reminders.js), which has no Pact login of its own, only
// this header. INTERNAL_JOB_SECRET must be set to the same value here and
// on each cron job's environment; unset, both routes fail closed.
function requireInternalSecret(req, res, next) {
  const expected = process.env.INTERNAL_JOB_SECRET;
  if (!expected) return res.status(501).json({ error: "INTERNAL_JOB_SECRET is not configured." });
  if (req.headers["x-internal-secret"] !== expected) {
    return res.status(403).json({ error: "Invalid or missing internal secret." });
  }
  next();
}

// Runs the same reminder logic as `npm run reminders`/`npm run annual-
// pass-reminders`, but in-process inside the always-running web service —
// which is what actually has access to the production database. See the
// note at the bottom of each script for why this indirection exists.
router.post("/run-expiration-reminders", requireInternalSecret, (req, res) => {
  const { run } = require("../../scripts/send-expiration-reminders");
  res.json({ ok: true, ...run() });
});

router.post("/run-annual-pass-reminders", requireInternalSecret, (req, res) => {
  const { run } = require("../../scripts/send-annual-pass-reminders");
  res.json({ ok: true, ...run() });
});

module.exports = router;
