// The "lost MFA entirely, no backup codes" path (spec Phase 5). Never an
// instant bypass: the account stays MFA-protected through a Stripe
// Identity re-verification AND a 48-hour delay afterward, with notices to
// every contact method the account has so the real owner — if this
// wasn't them — has a real window to object via the cancel link in those
// notices.
const db = require("../db");
const { identityConfigured, createVerificationSession, retrieveVerificationSession } = require("./identity-provider");
const { sendMail } = require("./mailer");
const { sendSms } = require("./sms");
const { logAccountAudit } = require("./account-audit");
const { signMfaRecoveryCancelToken } = require("../auth-utils");
const { clientIp } = require("./terms");

const RECOVERY_DELAY_MS = 48 * 60 * 60 * 1000;

function notifyAllContacts(row, { subject, text }) {
  sendMail({ to: row.email, subject, text });
  if (row.recovery_email && row.recovery_email_verified_at) {
    sendMail({ to: row.recovery_email, subject, text });
  }
  if (row.phone && row.phone_verified_at) {
    // SMS bodies stay short on purpose — carriers truncate/charge per
    // segment, and the full explanation is in the email anyway.
    sendSms({ to: row.phone, body: `Pact: ${subject}. Check your email for details.` });
  }
}

function getOpenRequest(userId) {
  return db
    .prepare(
      "SELECT * FROM mfa_recovery_requests WHERE user_id = ? AND status IN ('awaiting_verification', 'awaiting_delay') ORDER BY id DESC LIMIT 1"
    )
    .get(userId);
}

// Starts a new recovery, or just returns the existing one if the account
// already has an open request — this is reachable every time someone
// fails the MFA step at login, so it has to be idempotent rather than
// stacking up duplicate Stripe sessions and duplicate notice emails.
async function startRecovery({ user: row, req }) {
  const existing = getOpenRequest(row.id);
  if (existing) return { request: existing, alreadyOpen: true };

  let identityVerificationId = null;
  let status = "awaiting_verification";
  let verifiedAt = null;
  let eligibleAt = null;
  let devNote = null;

  if (identityConfigured()) {
    const session = await createVerificationSession({ user: { id: row.id }, req, type: "document" });
    identityVerificationId = db
      .prepare("INSERT INTO identity_verifications (user_id, provider, external_session_id, status) VALUES (?, 'stripe_identity', ?, 'pending')")
      .run(row.id, session.id).lastInsertRowid;
  } else {
    // Dev fallback, same spirit as the other integrations in this app
    // that fail visibly rather than dead-ending local testing — identity
    // verification is simulated as already passed, so the 48-hour delay
    // (the part that's actually testable without Stripe) can be tested.
    status = "awaiting_delay";
    verifiedAt = new Date().toISOString().slice(0, 19).replace("T", " ");
    eligibleAt = new Date(Date.now() + RECOVERY_DELAY_MS).toISOString().slice(0, 19).replace("T", " ");
    devNote = "Identity verification is not configured on this server, so it's simulated as already passed — the 48-hour delay still applies.";
  }

  const requestId = db
    .prepare(
      "INSERT INTO mfa_recovery_requests (user_id, identity_verification_id, status, verified_at, eligible_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(row.id, identityVerificationId, status, verifiedAt, eligibleAt).lastInsertRowid;

  const cancelUrl = (origin) => `${origin}/email-action.html?action=cancel-mfa-recovery&token=${signMfaRecoveryCancelToken(requestId)}`;
  const origin = req ? `${req.protocol}://${req.get("host")}` : (process.env.PUBLIC_URL || "https://www.pactappstore.com");
  notifyAllContacts(row, {
    subject: "Account recovery requested — two-factor authentication",
    text:
      "Someone just started account recovery on your Pact account because the two-factor code step failed at login " +
      "(no authenticator code, no backup code). This requires identity re-verification and a 48-hour waiting period before " +
      `two-factor authentication is removed — it is never instant.\n\nIf this wasn't you, cancel it immediately:\n${cancelUrl(origin)}\n\n` +
      "If it was you, finish identity verification if you haven't already, then wait out the 48-hour period.",
  });

  logAccountAudit({ userId: row.id, action: "mfa_recovery_requested", result: "success", ip: req ? clientIp(req) : null, userAgent: req ? req.headers["user-agent"] : null });
  const request = db.prepare("SELECT * FROM mfa_recovery_requests WHERE id = ?").get(requestId);
  return { request, alreadyOpen: false, devNote };
}

// Polled by the frontend while the user is stuck on the login screen
// (no session yet) — advances awaiting_verification -> awaiting_delay
// once Stripe confirms the identity check passed, starting the 48-hour
// clock and sending the "the clock has started" notice.
async function refreshRecoveryStatus(request) {
  if (request.status !== "awaiting_verification" || !request.identity_verification_id || !identityConfigured()) {
    return request;
  }
  const verification = db.prepare("SELECT * FROM identity_verifications WHERE id = ?").get(request.identity_verification_id);
  if (!verification || !verification.external_session_id) return request;
  const session = await retrieveVerificationSession(verification.external_session_id);
  if (session.status !== "verified") return request;

  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(request.user_id);
  const now = new Date();
  const verifiedAt = now.toISOString().slice(0, 19).replace("T", " ");
  const eligibleAt = new Date(now.getTime() + RECOVERY_DELAY_MS).toISOString().slice(0, 19).replace("T", " ");
  db.prepare("UPDATE identity_verifications SET status = 'verified', updated_at = datetime('now') WHERE id = ?").run(verification.id);
  db.prepare("UPDATE mfa_recovery_requests SET status = 'awaiting_delay', verified_at = ?, eligible_at = ? WHERE id = ?").run(verifiedAt, eligibleAt, request.id);

  notifyAllContacts(row, {
    subject: "Identity verified — 48-hour recovery window has started",
    text:
      "Identity verification for your Pact account recovery just succeeded. Two-factor authentication will be removed " +
      `in 48 hours (at ${eligibleAt} UTC) unless this is cancelled before then. If this wasn't you, cancel it now from the link in the earlier email, ` +
      "or just sign in normally with your authenticator app or a backup code — either one cancels it automatically.",
  });

  return db.prepare("SELECT * FROM mfa_recovery_requests WHERE id = ?").get(request.id);
}

function cancelRecovery(request, reason) {
  if (request.status !== "awaiting_verification" && request.status !== "awaiting_delay") return false;
  db.prepare("UPDATE mfa_recovery_requests SET status = 'cancelled', cancelled_at = datetime('now'), cancel_reason = ? WHERE id = ?").run(reason, request.id);
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(request.user_id);
  logAccountAudit({ userId: request.user_id, action: "mfa_recovery_cancelled", result: "success", detail: reason });
  notifyAllContacts(row, {
    subject: "Account recovery request cancelled",
    text: "The account recovery request on your Pact account was cancelled. Two-factor authentication is still required to sign in.",
  });
  return true;
}

// The actual 48-hour-delay sweep — run on a schedule via POST /api/
// internal/run-mfa-recovery-completions (see scripts/send-mfa-recovery-
// completions.js), the same pattern as the renewal-reminder and archive-
// purge jobs. Finds every request whose delay has elapsed with nothing
// having cancelled it, and only then actually turns MFA off.
function completeMfaRecoveries() {
  const due = db
    .prepare("SELECT * FROM mfa_recovery_requests WHERE status = 'awaiting_delay' AND eligible_at <= datetime('now')")
    .all();
  let completed = 0;
  for (const request of due) {
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(request.user_id);
    if (!row) continue;
    db.prepare("UPDATE users SET mfa_enabled = 0, mfa_secret = NULL, mfa_enabled_at = NULL, mfa_backup_codes = NULL WHERE id = ?").run(row.id);
    db.prepare("UPDATE mfa_recovery_requests SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(request.id);
    logAccountAudit({ userId: row.id, action: "mfa_recovery_completed", result: "success" });
    logAccountAudit({ userId: row.id, action: "mfa_disabled", result: "success", detail: "Lost-access recovery completed" });
    notifyAllContacts(row, {
      subject: "Two-factor authentication removed after account recovery",
      text:
        "The 48-hour account recovery waiting period has ended and two-factor authentication has been removed from your Pact account. " +
        "You can now log in with just your password. We strongly recommend turning two-factor authentication back on from Settings → Security " +
        "once you're back in — and if any of this wasn't you, change your password immediately and contact support.",
    });
    completed++;
  }
  return { completed };
}

module.exports = { startRecovery, refreshRecoveryStatus, cancelRecovery, completeMfaRecoveries, getOpenRequest, RECOVERY_DELAY_MS };
