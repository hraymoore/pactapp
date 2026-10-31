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

// Phase 8: the MFA second-factor step and the two inline password
// re-checks below (mfa/disable, auth/close) each had NO rate limiting at
// all. They needed their OWN counters, not a reuse of authAttemptLimiter
// — sharing that single instance would make every MFA-enabled login cycle
// (a /login call AND a /mfa/verify-login call) cost two units of the one
// budget meant for password-spraying across many accounts, so a handful
// of ordinary repeated logins from one IP (a shared office network, a
// flaky connection retried a few times) could lock out that whole IP's
// /login too. Same tuning, independently counted.
const mfaVerifyLimiter = makeLimiter({
  windowMinutes: 15,
  max: 20,
  message: "Too many attempts from this network. Wait a few minutes and try again.",
});

const passwordRecheckLimiter = makeLimiter({
  windowMinutes: 15,
  max: 20,
  message: "Too many attempts from this network. Wait a few minutes and try again.",
});

module.exports = { makeLimiter, authAttemptLimiter, mfaVerifyLimiter, passwordRecheckLimiter };
