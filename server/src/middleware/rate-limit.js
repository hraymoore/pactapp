const rateLimit = require("express-rate-limit");

// A thin wrapper so every limiter in this app returns the same JSON shape
// as everything else (an `error` string) instead of express-rate-limit's
// default plain-text body, and so the window/max tuning lives in one
// place per endpoint type rather than copy-pasted at each call site.
function makeLimiter({ windowMinutes, max, message }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // index.js sets "trust proxy" only in production (Render sits in
    // front of this service there) — rate limiting by IP is meaningless
    // behind an untrusted proxy, which express-rate-limit itself refuses
    // to do by default; this keeps that same posture rather than
    // silently keying on a spoofable X-Forwarded-For.
    handler: (req, res) => res.status(429).json({ error: message }),
  });
}

// Credential-guessing endpoints — login already has its own per-account
// lockout (failed_login_attempts/locked_at), and reauth shares it (see
// routes/auth.js), but neither is IP-scoped: this adds that second,
// independent layer so a password sprayed across many accounts from one
// IP, or guessed by someone holding a stolen session cookie, gets slowed
// down even while every individual account is still under its lockout
// threshold.
const authAttemptLimiter = makeLimiter({
  windowMinutes: 15,
  max: 20,
  message: "Too many attempts from this network. Wait a few minutes and try again.",
});

module.exports = { makeLimiter, authAttemptLimiter };
