const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const db = require("../db");
const {
  hashPassword,
  verifyPassword,
  signToken,
  generateTempPassword,
  signMfaChallengeToken,
  verifyMfaChallengeToken,
  signMfaSmsFallbackToken,
  verifyMfaSmsFallbackToken,
  verifyMfaRecoveryCancelToken,
  COOKIE_OPTS,
  signEmailVerifyToken,
  verifyEmailVerifyToken,
  signEmailCancelToken,
  verifyEmailCancelToken,
  signRecoveryEmailVerifyToken,
  verifyRecoveryEmailVerifyToken,
  generateNumericCode,
} = require("../auth-utils");
const { mailerConfigured, sendMail } = require("../services/mailer");
const { publicUser } = require("../services/public-user");
const { requireAuth } = require("../middleware/auth");
const { requireRecentAuth } = require("../middleware/reauth");
const { isValidEinFormat, normalizeEin } = require("../services/organizations");
const { recordAcceptance, clientIp } = require("../services/terms");
const { cancelSubscriptionImmediately } = require("../services/billing-provider");
const { verifyMfaCode } = require("../services/mfa");
const {
  createSession,
  markReauth,
  hasRecentReauth,
  revokeAllSessions,
  revokeSession,
  revokeOtherSessions,
  listActiveSessions,
} = require("../services/sessions");
const { logAccountAudit, listAccountAudit } = require("../services/account-audit");
const { authAttemptLimiter, mfaVerifyLimiter, passwordRecheckLimiter } = require("../middleware/rate-limit");
const { checkPasswordBreached } = require("../services/password-breach");
const { describeUserAgent } = require("../services/user-agent");
const { smsConfigured, sendSms } = require("../services/sms");
const {
  startRecovery: startMfaRecovery,
  refreshRecoveryStatus: refreshMfaRecoveryStatus,
  cancelRecovery: cancelMfaRecovery,
  getOpenRequest: getOpenMfaRecoveryRequest,
} = require("../services/mfa-recovery");

router.use(express.json());

// A fresh login/signup/reactivation always gets its own new session row —
// never reuses one from a prior cookie, even if somehow still present, so
// each distinct "I signed in" event is independently listable/revocable
// in Settings → Security (Phase 3).
function startSession(req, user) {
  const sessionId = createSession({
    userId: user.id,
    ip: clientIp(req),
    userAgent: req.headers["user-agent"],
  });
  return signToken(user, sessionId);
}

const MAX_LOGIN_ATTEMPTS = 7;
const TEMP_PASSWORD_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MIN_SIGNUP_AGE_YEARS = 18;

// Contracts require legal capacity to enter into — a basic age floor here
// is a real product concern for a platform whose entire purpose is signing
// legally binding documents, not just a compliance formality.
function isOldEnough(dateOfBirth) {
  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) return false;
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - MIN_SIGNUP_AGE_YEARS);
  return dob.getTime() <= cutoff.getTime();
}

router.post("/signup", (req, res) => {
  const { email, password, accountType, termsAccepted } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }
  // Enforceable clickwrap: the checkbox is unchecked by default and the
  // submit button stays disabled until it's checked (see signup.html), but
  // the server never trusts client-side disabling alone — a request without
  // it is rejected outright, same as any other required field.
  if (termsAccepted !== true) {
    return res.status(400).json({ error: "You must agree to the Terms of Service and Privacy Policy to create a profile." });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail);
  if (existing) {
    return res.status(409).json({ error: "An account with that email already exists. Try logging in instead." });
  }

  const isBusiness = accountType === "business";
  let displayName, legalFirstName, legalLastName, dateOfBirth;
  let businessName, businessAddress, businessEmail, pointOfContact, ein;

  if (isBusiness) {
    ({ businessName, businessAddress, businessEmail, pointOfContact, ein } = req.body || {});
    if (!businessName || !businessName.trim()) return res.status(400).json({ error: "Business name is required." });
    if (!businessAddress || !businessAddress.trim()) return res.status(400).json({ error: "Business address is required." });
    if (!businessEmail || !businessEmail.trim()) return res.status(400).json({ error: "Business email is required." });
    if (!pointOfContact || !pointOfContact.trim()) return res.status(400).json({ error: "A point of contact name is required." });
    if (!ein || !isValidEinFormat(ein)) return res.status(400).json({ error: "A valid EIN is required (format: 12-3456789)." });
    displayName = businessName.trim();
  } else {
    ({ legalFirstName, legalLastName, dateOfBirth, displayName } = req.body || {});
    if (!legalFirstName || !legalFirstName.trim()) return res.status(400).json({ error: "Legal first name is required." });
    if (!legalLastName || !legalLastName.trim()) return res.status(400).json({ error: "Legal last name is required." });
    if (!dateOfBirth || !isOldEnough(dateOfBirth)) {
      return res.status(400).json({ error: `You must be at least ${MIN_SIGNUP_AGE_YEARS} to create a Pact profile and enter into contracts.` });
    }
    if (!displayName || !displayName.trim()) return res.status(400).json({ error: "A name to be called (shown to others you do business with) is required." });
  }

  // Every profile starts on the real $0 Free tier (browse/preview templates,
  // view and sign whatever's shared with you — no editor, no AI, can't send
  // a contract yourself). Every tier above Free costs money and only gets
  // applied once POST /api/billing/checkout actually collects payment (or,
  // in local/pre-Stripe "direct mode", is applied directly the same way any
  // other tier change already is) — signup itself is always free.
  const info = db
    .prepare(
      `INSERT INTO users
         (name, email, password_hash, tier, account_type, legal_first_name, legal_last_name, date_of_birth)
       VALUES (?, ?, ?, 'free', ?, ?, ?, ?)`
    )
    .run(
      displayName.trim(),
      normalizedEmail,
      hashPassword(password),
      isBusiness ? "business" : "personal",
      isBusiness ? null : legalFirstName.trim(),
      isBusiness ? null : legalLastName.trim(),
      isBusiness ? null : dateOfBirth
    );
  const userId = info.lastInsertRowid;

  if (isBusiness) {
    const orgInfo = db
      .prepare("INSERT INTO organizations (name, ein, owner_user_id, address, contact_email, point_of_contact) VALUES (?, ?, ?, ?, ?, ?)")
      .run(businessName.trim(), normalizeEin(ein), userId, businessAddress.trim(), businessEmail.trim().toLowerCase(), pointOfContact.trim());
    db.prepare("INSERT INTO organization_members (organization_id, user_id, role) VALUES (?, ?, 'owner')").run(
      orgInfo.lastInsertRowid,
      userId
    );
  }

  recordAcceptance({ userId, ipAddress: clientIp(req), acceptanceMethod: "checkbox_signup" });

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  res.cookie("pact_token", startSession(req, user), COOKIE_OPTS);
  res.status(201).json({ user: publicUser(user) });
});

router.post("/login", authAttemptLimiter, (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase());
  if (!row) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  if (row.account_status === "closed") {
    return res.status(403).json({ error: "This account has been closed.", accountClosed: true });
  }

  if (row.locked_at) {
    return res.status(423).json({
      error: "This account is locked after too many failed login attempts. Request a temporary password to unlock it.",
    });
  }

  if (!verifyPassword(password, row.password_hash)) {
    const attempts = (row.failed_login_attempts || 0) + 1;
    logAccountAudit({ userId: row.id, action: "login", result: "failure", detail: "Incorrect password", ip: clientIp(req), userAgent: req.headers["user-agent"] });
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      db.prepare("UPDATE users SET failed_login_attempts = ?, locked_at = datetime('now') WHERE id = ?").run(attempts, row.id);
      return res.status(423).json({
        error: "This account is now locked after too many failed login attempts. Request a temporary password to unlock it.",
      });
    }
    db.prepare("UPDATE users SET failed_login_attempts = ? WHERE id = ?").run(attempts, row.id);
    const remaining = MAX_LOGIN_ATTEMPTS - attempts;
    return res.status(401).json({
      error: `Invalid email or password. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before this account is locked.`,
    });
  }

  if (row.temp_password_expires_at && new Date(row.temp_password_expires_at + "Z").getTime() < Date.now()) {
    return res.status(401).json({ error: "That temporary password has expired. Request a new one." });
  }

  db.prepare("UPDATE users SET failed_login_attempts = 0, locked_at = NULL WHERE id = ?").run(row.id);
  const refreshed = db.prepare("SELECT * FROM users WHERE id = ?").get(row.id);

  // Password is correct, but that's only step one for an MFA-enrolled
  // account — issue a short-lived challenge token instead of the real
  // session cookie, and make the client complete the code step below
  // before it gets one. Not logged as a login yet — the sign-in isn't
  // complete until /mfa/verify-login below actually succeeds.
  if (refreshed.mfa_enabled) {
    return res.json({ mfaRequired: true, challengeToken: signMfaChallengeToken(refreshed) });
  }

  const user = publicUser(refreshed);
  res.cookie("pact_token", startSession(req, user), COOKIE_OPTS);
  logAccountAudit({ userId: row.id, action: "login", result: "success", ip: clientIp(req), userAgent: req.headers["user-agent"] });
  res.json({ user });
});

// Step two of an MFA login: the challenge token proves the password was
// already verified moments ago; a matching TOTP (or one-time backup) code
// proves the second factor. Only then does the real session cookie get
// issued.
// Phase 8 fix: the password step (/login above) is already behind
// authAttemptLimiter; this second-factor step (TOTP or backup code) was
// not, so an attacker already past the password could guess codes here
// with no IP-based throttling at all.
router.post("/mfa/verify-login", mfaVerifyLimiter, (req, res) => {
  const { challengeToken, smsChallengeToken, code } = req.body || {};
  const ip = clientIp(req);
  const userAgent = req.headers["user-agent"];

  // SMS-fallback branch: a completely separate short-lived token (see
  // /mfa/sms-fallback/request below) carrying the texted code's hash, so
  // this never touches a TOTP secret or backup codes at all.
  if (smsChallengeToken) {
    const smsPayload = verifyMfaSmsFallbackToken(smsChallengeToken);
    if (!smsPayload || !code) {
      return res.status(401).json({ error: "That code expired. Request a new one." });
    }
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(smsPayload.sub);
    if (!row || row.account_status !== "active" || !row.mfa_enabled) {
      return res.status(401).json({ error: "That login attempt is no longer valid. Log in again." });
    }
    const candidateHash = crypto.createHash("sha256").update(String(code).trim()).digest("hex");
    const expected = Buffer.from(smsPayload.codeHash, "hex");
    const candidate = Buffer.from(candidateHash, "hex");
    const matches = expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
    if (!matches) {
      logAccountAudit({ userId: row.id, action: "login", result: "failure", detail: "Incorrect SMS fallback code", ip, userAgent });
      return res.status(401).json({ error: "Invalid verification code." });
    }
    cancelMfaRecoveryOnSuccessfulMfa(row.id, "Signed in with SMS fallback");
    const user = publicUser(row);
    res.cookie("pact_token", startSession(req, user), COOKIE_OPTS);
    logAccountAudit({ userId: row.id, action: "login", result: "success", detail: "SMS fallback", ip, userAgent });
    return res.json({ user });
  }

  if (!challengeToken || !code) {
    return res.status(400).json({ error: "A verification code is required." });
  }
  const payload = verifyMfaChallengeToken(challengeToken);
  if (!payload) {
    return res.status(401).json({ error: "That login attempt expired. Log in again." });
  }
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub);
  if (!row || row.account_status !== "active" || !row.mfa_enabled) {
    return res.status(401).json({ error: "That login attempt is no longer valid. Log in again." });
  }
  const result = verifyMfaCode(row, code);
  if (!result.ok) {
    logAccountAudit({ userId: row.id, action: "login", result: "failure", detail: "Incorrect MFA code", ip, userAgent });
    return res.status(401).json({ error: "Invalid verification code." });
  }
  cancelMfaRecoveryOnSuccessfulMfa(row.id, "Signed in normally with MFA");
  const user = publicUser(row);
  res.cookie("pact_token", startSession(req, user), COOKIE_OPTS);
  logAccountAudit({ userId: row.id, action: "login", result: "success", detail: "MFA", ip, userAgent });
  res.json({ user });
});

// Proof you still have your authenticator/backup codes is proof a
// pending lost-access recovery wasn't legitimate (or is no longer
// needed) — cancel it automatically rather than making the owner also
// remember to go click the cancel link.
function cancelMfaRecoveryOnSuccessfulMfa(userId, reason) {
  const open = getOpenMfaRecoveryRequest(userId);
  if (open) cancelMfaRecovery(open, reason);
}

// SMS is a fallback second factor only (spec Phase 5) — it's reachable
// only from an already-password-verified MFA challenge, and only for an
// account with a verified phone number; it can't be used to start a
// login on its own.
router.post("/mfa/sms-fallback/request", authAttemptLimiter, (req, res) => {
  const { challengeToken } = req.body || {};
  const payload = challengeToken && verifyMfaChallengeToken(challengeToken);
  if (!payload) return res.status(401).json({ error: "That login attempt expired. Log in again." });
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub);
  if (!row || row.account_status !== "active" || !row.mfa_enabled) {
    return res.status(401).json({ error: "That login attempt is no longer valid. Log in again." });
  }
  if (!row.phone || !row.phone_verified_at) {
    return res.status(400).json({ error: "No verified phone number on this account." });
  }
  const code = generateNumericCode();
  const codeHash = crypto.createHash("sha256").update(code).digest("hex");
  sendSms({ to: row.phone, body: `Your Pact sign-in code is ${code}. It expires in 10 minutes.` });
  logAccountAudit({ userId: row.id, action: "mfa_sms_fallback_sent", result: "success", ip: clientIp(req), userAgent: req.headers["user-agent"] });
  const smsChallengeToken = signMfaSmsFallbackToken(row.id, codeHash);
  if (!smsConfigured()) {
    return res.json({ ok: true, smsChallengeToken, devNote: "SMS is not configured on this server, so here is the code directly: ", code });
  }
  res.json({ ok: true, smsChallengeToken });
});

// The "lost MFA entirely, no backup codes" path — see services/mfa-
// recovery.js for the full awaiting_verification -> awaiting_delay ->
// completed lifecycle. Reachable from the same MFA login challenge as
// the code step above, since that's the only proof-of-password this
// unauthenticated moment has.
router.post("/mfa/lost-access/start", authAttemptLimiter, async (req, res) => {
  const { challengeToken } = req.body || {};
  const payload = challengeToken && verifyMfaChallengeToken(challengeToken);
  if (!payload) return res.status(401).json({ error: "That login attempt expired. Log in again." });
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub);
  if (!row || row.account_status !== "active" || !row.mfa_enabled) {
    return res.status(401).json({ error: "That login attempt is no longer valid. Log in again." });
  }
  try {
    const { request, alreadyOpen, devNote } = await startMfaRecovery({ user: row, req });
    res.json({ ok: true, status: request.status, eligibleAt: request.eligible_at, alreadyOpen: !!alreadyOpen, devNote });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/mfa/lost-access/status", async (req, res) => {
  const { challengeToken } = req.body || {};
  const payload = challengeToken && verifyMfaChallengeToken(challengeToken);
  if (!payload) return res.status(401).json({ error: "That login attempt expired. Log in again." });
  const open = getOpenMfaRecoveryRequest(payload.sub);
  if (!open) return res.status(404).json({ error: "No account recovery request found." });
  try {
    const refreshed = await refreshMfaRecoveryStatus(open);
    res.json({ status: refreshed.status, eligibleAt: refreshed.eligible_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/mfa/lost-access/cancel", (req, res) => {
  const { token } = req.body || {};
  const payload = token && verifyMfaRecoveryCancelToken(token);
  if (!payload) return res.status(400).json({ error: "This cancel link is invalid or has expired." });
  const request = db.prepare("SELECT * FROM mfa_recovery_requests WHERE id = ?").get(payload.requestId);
  if (!request || !cancelMfaRecovery(request, "Cancelled via the notice's cancel link")) {
    return res.status(400).json({ error: "There's no recovery request that can still be cancelled." });
  }
  res.json({ ok: true });
});

// Credential-verified reactivation for a closed account — not a full
// login, since login is intentionally blocked while closed (see the
// account_status check above). Reuses the same email+password check
// rather than an email link/token: cheap to build now, and password
// verification is already the trust boundary this app uses everywhere
// else for "prove you're really the account holder" (see /close, /change-
// password). Only reverses closure — never touches any other data, since
// nothing was ever deleted or anonymized in the first place.
router.post("/reactivate", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase());
  if (!row || !verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  if (row.account_status !== "closed") {
    return res.status(400).json({ error: "This account is not closed." });
  }
  db.prepare("UPDATE users SET account_status = 'active', closed_at = NULL, closed_by = NULL WHERE id = ?").run(row.id);
  const refreshed = db.prepare("SELECT * FROM users WHERE id = ?").get(row.id);
  const user = publicUser(refreshed);
  res.cookie("pact_token", startSession(req, user), COOKIE_OPTS);
  res.json({ user });
});

router.post("/forgot-password", authAttemptLimiter, (req, res) => {
  const { email } = req.body || {};
  if (!email || !email.trim()) {
    return res.status(400).json({ error: "Email is required." });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail);

  const genericResult = {
    ok: true,
    message: "If an account exists for that email, a temporary password has been sent to it.",
  };

  if (!row) {
    return res.json(genericResult);
  }

  const tempPassword = generateTempPassword();
  const expiresAt = new Date(Date.now() + TEMP_PASSWORD_TTL_MS).toISOString().slice(0, 19).replace("T", " ");
  db.prepare(
    "UPDATE users SET password_hash = ?, temp_password_expires_at = ?, failed_login_attempts = 0, locked_at = NULL WHERE id = ?"
  ).run(hashPassword(tempPassword), expiresAt, row.id);

  const mailResult = sendMail({
    to: row.email,
    subject: "Your temporary Pact password",
    text:
      `Your temporary Pact password is: ${tempPassword}\n\n` +
      "It expires in 30 minutes and can only be used to log in once you set a new password from Settings. " +
      "If you didn't request this, you can ignore this email — your old password still works until someone uses this one.",
  });

  if (!mailerConfigured()) {
    // Dev fallback so this is testable without SMTP configured — mirrors
    // the signing-link fallback in services/mailer.js.
    return res.json({
      ...genericResult,
      devNote: "Email is not configured on this server, so here is the temporary password directly: ",
      tempPassword,
      expiresInMinutes: 30,
    });
  }

  res.json(genericResult);
  void mailResult;
});

const NEW_PASSWORD_MIN_LENGTH = 12;

router.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const ip = clientIp(req);
  const userAgent = req.headers["user-agent"];
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password are required." });
  }
  if (newPassword.length < NEW_PASSWORD_MIN_LENGTH) {
    return res.status(400).json({ error: `New password must be at least ${NEW_PASSWORD_MIN_LENGTH} characters.` });
  }
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!row || !verifyPassword(currentPassword, row.password_hash)) {
    logAccountAudit({ userId: req.user.id, action: "password_changed", result: "failure", detail: "Incorrect current password", ip, userAgent });
    return res.status(401).json({ error: "Current password is incorrect." });
  }

  // Advisory, not a hard gate on HIBP being reachable (see services/
  // password-breach.js) — `checked: false` (API unreachable) never blocks
  // the change; only a confirmed match does.
  const { checked, breached } = await checkPasswordBreached(newPassword);
  if (checked && breached) {
    logAccountAudit({ userId: row.id, action: "password_changed", result: "failure", detail: "Password found in a known breach", ip, userAgent });
    return res.status(400).json({
      error: "That password has appeared in a known data breach — choose a different one.",
      breached: true,
    });
  }

  db.prepare(
    "UPDATE users SET password_hash = ?, temp_password_expires_at = NULL, failed_login_attempts = 0, locked_at = NULL WHERE id = ?"
  ).run(hashPassword(newPassword), row.id);

  // The current session's JWT was never tied to the password hash, so it
  // stays valid as-is — no reason to mint a new session or reissue the
  // cookie here, only to invalidate every OTHER one someone might be
  // signed in from.
  revokeOtherSessions(row.id, req.sessionId);
  logAccountAudit({ userId: row.id, action: "password_changed", result: "success", ip, userAgent });

  // TODO(Phase 4): also send to the recovery email once that field exists.
  sendMail({
    to: row.email,
    subject: "Your Pact password was changed",
    text:
      "Your Pact account password was just changed. Every other signed-in device has been signed out; " +
      "this one stays signed in since it's the one that made the change.\n\n" +
      `Time: ${new Date().toISOString()}\nIP address: ${ip}\n\n` +
      "If you didn't make this change, reset your password immediately from the login page and contact support.",
  });

  const refreshed = db.prepare("SELECT * FROM users WHERE id = ?").get(row.id);
  res.json({ user: publicUser(refreshed) });
});

// "device, browser, approximate location from IP" (spec 1.2) — location
// is the one piece deliberately left out: it needs a geolocation provider
// (a MaxMind-style DB or a paid/rate-limited API), which isn't configured
// anywhere in this app yet, same as malware scanning or identity
// verification before their own provider was wired up. The raw IP is
// shown instead rather than silently guessing at a city.
router.get("/sessions", requireAuth, (req, res) => {
  const sessions = listActiveSessions(req.user.id).map((s) => ({
    id: s.id,
    isCurrent: s.id === req.sessionId,
    device: describeUserAgent(s.user_agent),
    ipAddress: s.ip_address,
    createdAt: s.created_at,
    lastActiveAt: s.last_active_at,
  }));
  res.json({ sessions });
});

// Revoking a session is sensitive enough to gate on its own — a stolen
// session cookie could otherwise be used to silently kick the real owner
// out of every OTHER device, extending the window an attacker has
// exclusive access for.
router.post("/sessions/:id/revoke", requireAuth, requireRecentAuth, (req, res) => {
  const revoked = revokeSession(req.params.id, req.user.id);
  if (!revoked) return res.status(404).json({ error: "Session not found." });
  logAccountAudit({
    userId: req.user.id,
    action: "session_revoked",
    result: "success",
    detail: req.params.id === req.sessionId ? "Current session" : "Another session",
    ip: clientIp(req),
    userAgent: req.headers["user-agent"],
  });
  res.json({ ok: true });
});

// "Sign out everywhere [else]" — keeps the session making this request
// alive, matching how a password change behaves (see above): the point
// is cutting off every OTHER device, not logging yourself out of the one
// you're actively using to do it.
router.post("/sessions/revoke-others", requireAuth, requireRecentAuth, (req, res) => {
  revokeOtherSessions(req.user.id, req.sessionId);
  logAccountAudit({ userId: req.user.id, action: "sessions_revoked_all_others", result: "success", ip: clientIp(req), userAgent: req.headers["user-agent"] });
  res.json({ ok: true });
});

// Read-only activity log (spec 1.2: "last 90 days of logins, password
// changes, email/phone changes, MFA changes, failed attempts"). Backed
// entirely by account_audit_log, which every sensitive route above (and
// routes/profile.js, routes/mfa.js) already writes to — this route adds
// no new write path, only a read.
router.get("/security-log", requireAuth, (req, res) => {
  const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - NINETY_DAYS_MS;
  const entries = listAccountAudit(req.user.id, 500)
    .filter((e) => new Date(e.created_at + "Z").getTime() >= cutoff)
    .map((e) => ({
      action: e.action,
      result: e.result,
      detail: e.detail,
      ipAddress: e.ip_address,
      device: describeUserAgent(e.user_agent),
      createdAt: e.created_at,
    }));
  res.json({ entries });
});

// ---- Phase 4: email, phone, recovery email ----

// Phase 8: tightened alongside routes/contacts.js's identical regex to
// exclude HTML-special characters, defense-in-depth against the same
// class of stored-content risk even though primary/recovery email are
// currently only ever rendered via textContent, never innerHTML.
const EMAIL_FORMAT = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
const EMAIL_CHANGE_CANCEL_WINDOW_DAYS = 7;
const PHONE_CODE_TTL_MS = 10 * 60 * 1000;
const PHONE_FORMAT = /^\+[1-9]\d{6,14}$/; // E.164
const PHONE_CODE_RATE_LIMIT = 5;
const PHONE_CODE_RATE_WINDOW_HOURS = 1;
const TCPA_CONSENT_VERSION = "2026-01-v1";
const TCPA_CONSENT_TEXT =
  "By adding your number you agree to receive security and account texts from Pact. " +
  "Message and data rates may apply. Reply STOP to opt out.";

function baseUrl(req) {
  return process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
}

// "j***@domain.com" — enough for the account owner to recognize the
// target without a shoulder-surfer (or a compromised old inbox) seeing it
// in full.
function maskEmail(email) {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, 1) || "*";
  return `${visible}${"*".repeat(Math.max(local.length - 1, 1))}@${domain}`;
}

function phoneCodeRateCount(column, value) {
  return db
    .prepare(
      `SELECT COUNT(*) as n FROM account_audit_log
       WHERE action = 'phone_verification_sent' AND ${column} = ?
         AND created_at > datetime('now', '-${PHONE_CODE_RATE_WINDOW_HOURS} hours')`
    )
    .get(value).n;
}

// Step 1 of a primary-email change: send a verification link to the NEW
// address (the change doesn't take effect until that's confirmed) and a
// "this is being changed, click to cancel" notice — with a link that
// stays valid for a week after confirmation, not just from now — to the
// OLD address and recovery email, per spec Phase 4.
router.post("/email/change-request", requireAuth, requireRecentAuth, (req, res) => {
  const { newEmail } = req.body || {};
  const ip = clientIp(req);
  const userAgent = req.headers["user-agent"];
  if (!newEmail || !EMAIL_FORMAT.test(newEmail.trim())) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  const normalized = newEmail.trim().toLowerCase();
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (normalized === row.email) {
    return res.status(400).json({ error: "That's already your email address." });
  }
  // Generic on purpose — same response whether the address is taken by
  // another account or just malformed in some way we didn't already
  // catch, so this can't be used to probe which emails have accounts.
  const taken = db.prepare("SELECT id FROM users WHERE email = ?").get(normalized);
  if (taken) {
    logAccountAudit({ userId: row.id, action: "email_change_requested", result: "failure", detail: "Requested email cannot be used", ip, userAgent });
    return res.status(400).json({ error: "That email can't be used for your account. Try a different one." });
  }

  db.prepare(
    `UPDATE users SET pending_email = ?, email_change_requested_at = datetime('now'),
       email_change_old_email = ?, email_change_confirmed_at = NULL, email_change_cancel_expires_at = NULL
     WHERE id = ?`
  ).run(normalized, row.email, row.id);

  const verifyUrl = `${baseUrl(req)}/email-action.html?action=verify-email&token=${signEmailVerifyToken(row.id, normalized)}`;
  sendMail({
    to: normalized,
    subject: "Confirm your new Pact email address",
    text:
      `Click the link below to confirm this is your new Pact email address:\n\n${verifyUrl}\n\n` +
      "This link expires in 24 hours. Nothing changes on your account until you confirm it.",
  });

  const cancelUrl = `${baseUrl(req)}/email-action.html?action=cancel-email-change&token=${signEmailCancelToken(row.id)}`;
  sendMail({
    to: row.email,
    subject: "Your Pact email is being changed",
    text:
      `Your Pact email is being changed to ${maskEmail(normalized)}. If this wasn't you, click here to cancel it ` +
      `and lock your account:\n\n${cancelUrl}\n\nThis cancel link stays valid for ${EMAIL_CHANGE_CANCEL_WINDOW_DAYS} days after the change completes.`,
  });
  if (row.recovery_email && row.recovery_email_verified_at) {
    sendMail({
      to: row.recovery_email,
      subject: "Your Pact email is being changed",
      text:
        `The primary email on a Pact account you're the recovery contact for is being changed to ${maskEmail(normalized)}. ` +
        `If this wasn't authorized, click here to cancel it and lock the account:\n\n${cancelUrl}`,
    });
  }

  logAccountAudit({ userId: row.id, action: "email_change_requested", result: "success", detail: `To ${maskEmail(normalized)}`, ip, userAgent });
  res.json({ ok: true, pendingEmail: normalized });
});

router.post("/email/confirm", (req, res) => {
  const { token } = req.body || {};
  const payload = token && verifyEmailVerifyToken(token);
  if (!payload) return res.status(400).json({ error: "This verification link is invalid or has expired." });
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub);
  // A stale link: either already confirmed, or superseded by a newer
  // change-request for a different address since this one was sent.
  if (!row || row.pending_email !== payload.newEmail) {
    return res.status(400).json({ error: "This verification link is no longer valid — it may already be confirmed, or a newer request has replaced it." });
  }

  // Lock in the link to this account for any contract invitations that
  // were still addressed to the email about to be replaced, before it's
  // gone — see resolvePartyUserId's comment in routes/contracts.js.
  db.prepare("UPDATE contract_parties SET user_id = ? WHERE email = ? AND user_id IS NULL").run(row.id, row.email);

  const cancelExpiresAt = new Date(Date.now() + EMAIL_CHANGE_CANCEL_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
  db.prepare(
    `UPDATE users SET email = ?, pending_email = NULL, email_change_confirmed_at = datetime('now'),
       email_change_cancel_expires_at = ? WHERE id = ?`
  ).run(payload.newEmail, cancelExpiresAt, row.id);

  // The confirming request might be an unauthenticated click from an
  // email client with no Pact session at all — only keep a session alive
  // if it's demonstrably the one that's already signed in as this account.
  const keepSessionId = req.user && req.user.id === row.id ? req.sessionId : null;
  if (keepSessionId) revokeOtherSessions(row.id, keepSessionId);
  else revokeAllSessions(row.id);

  logAccountAudit({ userId: row.id, action: "email_changed", result: "success", detail: `To ${maskEmail(payload.newEmail)}`, ip: clientIp(req), userAgent: req.headers["user-agent"] });
  sendMail({ to: payload.newEmail, subject: "Your Pact email is now active", text: "This address is now your primary Pact email. You're all set." });
  res.json({ ok: true, email: payload.newEmail });
});

router.post("/email/cancel", (req, res) => {
  const { token } = req.body || {};
  const payload = token && verifyEmailCancelToken(token);
  if (!payload) return res.status(400).json({ error: "This cancel link is invalid or has expired." });
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub);
  const cancelExpiresAt = row && row.email_change_cancel_expires_at ? new Date(row.email_change_cancel_expires_at + "Z").getTime() : 0;
  if (!row || !row.email_change_confirmed_at || !row.email_change_old_email || Date.now() > cancelExpiresAt) {
    return res.status(400).json({ error: "There's no recent email change on this account that can still be cancelled." });
  }

  const revertedEmail = row.email_change_old_email;
  db.prepare(
    `UPDATE users SET email = ?, pending_email = NULL, email_change_requested_at = NULL,
       email_change_confirmed_at = NULL, email_change_old_email = NULL, email_change_cancel_expires_at = NULL,
       locked_at = datetime('now')
     WHERE id = ?`
  ).run(revertedEmail, row.id);
  revokeAllSessions(row.id);

  logAccountAudit({ userId: row.id, action: "email_change_cancelled", result: "success", ip: clientIp(req), userAgent: req.headers["user-agent"] });
  sendMail({
    to: revertedEmail,
    subject: "Your Pact email change was cancelled — account locked",
    text:
      "Your Pact email was reverted and your account has been locked for safety. " +
      "Request a temporary password from the login page to regain access.",
  });
  res.json({ ok: true, email: revertedEmail });
});

// Recovery email: must differ from the primary and isn't usable for
// recovery until it's verified (a stale pending_recovery_email that was
// never confirmed just never counts — there's nothing to clean up).
router.post("/recovery-email/request", requireAuth, requireRecentAuth, (req, res) => {
  const { email } = req.body || {};
  const ip = clientIp(req);
  const userAgent = req.headers["user-agent"];
  if (!email || !EMAIL_FORMAT.test(email.trim())) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  const normalized = email.trim().toLowerCase();
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (normalized === row.email) {
    return res.status(400).json({ error: "Your recovery email must be different from your primary email." });
  }

  db.prepare("UPDATE users SET pending_recovery_email = ? WHERE id = ?").run(normalized, row.id);
  const verifyUrl = `${baseUrl(req)}/email-action.html?action=verify-recovery-email&token=${signRecoveryEmailVerifyToken(row.id, normalized)}`;
  sendMail({
    to: normalized,
    subject: "Confirm your Pact recovery email",
    text: `Click the link below to confirm this as the recovery email for your Pact account:\n\n${verifyUrl}\n\nThis link expires in 24 hours.`,
  });
  logAccountAudit({ userId: row.id, action: "recovery_email_requested", result: "success", detail: `To ${maskEmail(normalized)}`, ip, userAgent });
  res.json({ ok: true, pendingRecoveryEmail: normalized });
});

router.post("/recovery-email/confirm", (req, res) => {
  const { token } = req.body || {};
  const payload = token && verifyRecoveryEmailVerifyToken(token);
  if (!payload) return res.status(400).json({ error: "This verification link is invalid or has expired." });
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub);
  if (!row || row.pending_recovery_email !== payload.email) {
    return res.status(400).json({ error: "This verification link is no longer valid." });
  }
  const oldRecoveryEmail = row.recovery_email;
  db.prepare(
    "UPDATE users SET recovery_email = ?, recovery_email_verified_at = datetime('now'), pending_recovery_email = NULL WHERE id = ?"
  ).run(payload.email, row.id);
  logAccountAudit({ userId: row.id, action: "recovery_email_changed", result: "success", detail: `To ${maskEmail(payload.email)}`, ip: clientIp(req), userAgent: req.headers["user-agent"] });
  sendMail({ to: row.email, subject: "Your Pact recovery email was set", text: `Your recovery email is now ${maskEmail(payload.email)}.` });
  if (oldRecoveryEmail) {
    sendMail({ to: oldRecoveryEmail, subject: "This is no longer your Pact recovery email", text: "A different recovery email was just verified on this Pact account. If that wasn't you, sign in and check your account's security activity." });
  }
  res.json({ ok: true, recoveryEmail: payload.email });
});

router.post("/recovery-email/remove", requireAuth, requireRecentAuth, (req, res) => {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!row.recovery_email) return res.status(400).json({ error: "No recovery email is set." });
  const removed = row.recovery_email;
  db.prepare("UPDATE users SET recovery_email = NULL, recovery_email_verified_at = NULL, pending_recovery_email = NULL WHERE id = ?").run(row.id);
  logAccountAudit({ userId: row.id, action: "recovery_email_removed", result: "success", ip: clientIp(req), userAgent: req.headers["user-agent"] });
  sendMail({ to: row.email, subject: "Your Pact recovery email was removed", text: `${maskEmail(removed)} is no longer the recovery email on your Pact account.` });
  res.json({ ok: true });
});

// Phone: Pact generates and hashes its own code (never stored/logged in
// the clear) and sends it over plain SMS — see services/sms.js for why
// this doesn't need a Twilio Verify-specific integration.
router.post("/phone/request", requireAuth, requireRecentAuth, (req, res) => {
  const { phone, consent } = req.body || {};
  const ip = clientIp(req);
  const userAgent = req.headers["user-agent"];
  if (!phone || !PHONE_FORMAT.test(phone.trim())) {
    return res.status(400).json({ error: "Enter a phone number in international format, e.g. +15551234567." });
  }
  if (consent !== true) {
    return res.status(400).json({ error: "You must agree to receive account texts to add a phone number." });
  }
  const normalized = phone.trim();
  if (phoneCodeRateCount("user_id", req.user.id) >= PHONE_CODE_RATE_LIMIT || phoneCodeRateCount("ip_address", ip) >= PHONE_CODE_RATE_LIMIT) {
    return res.status(429).json({ error: "Too many verification codes requested. Wait a while and try again." });
  }

  const code = generateNumericCode();
  const expiresAt = new Date(Date.now() + PHONE_CODE_TTL_MS).toISOString().slice(0, 19).replace("T", " ");
  db.prepare(
    `UPDATE users SET pending_phone = ?, pending_phone_code_hash = ?, pending_phone_code_expires_at = ?,
       phone_consent_at = datetime('now'), phone_consent_ip = ?, phone_consent_version = ?
     WHERE id = ?`
  ).run(normalized, hashPassword(code), expiresAt, ip, TCPA_CONSENT_VERSION, req.user.id);

  const smsResult = sendSms({ to: normalized, body: `Your Pact verification code is ${code}. It expires in 10 minutes.` });
  logAccountAudit({ userId: req.user.id, action: "phone_verification_sent", result: "success", ip, userAgent });

  if (!smsConfigured()) {
    return res.json({ ok: true, devNote: "SMS is not configured on this server, so here is the code directly: ", code });
  }
  res.json({ ok: true, sent: smsResult.sent });
});

router.post("/phone/verify", requireAuth, authAttemptLimiter, (req, res) => {
  const { code } = req.body || {};
  const ip = clientIp(req);
  const userAgent = req.headers["user-agent"];
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!row.pending_phone || !row.pending_phone_code_hash) {
    return res.status(400).json({ error: "Request a verification code first." });
  }
  if (new Date(row.pending_phone_code_expires_at + "Z").getTime() < Date.now()) {
    return res.status(400).json({ error: "That code has expired. Request a new one." });
  }
  if (!code || !verifyPassword(code, row.pending_phone_code_hash)) {
    logAccountAudit({ userId: row.id, action: "phone_verified", result: "failure", detail: "Incorrect code", ip, userAgent });
    return res.status(400).json({ error: "That code didn't match." });
  }

  db.prepare(
    "UPDATE users SET phone = ?, phone_verified_at = datetime('now'), pending_phone = NULL, pending_phone_code_hash = NULL, pending_phone_code_expires_at = NULL WHERE id = ?"
  ).run(row.pending_phone, row.id);
  logAccountAudit({ userId: row.id, action: "phone_verified", result: "success", ip, userAgent });
  sendMail({ to: row.email, subject: "A phone number was added to your Pact account", text: "A phone number was just verified and added to your Pact account for security alerts and MFA fallback." });
  res.json({ ok: true, phone: row.pending_phone });
});

router.post("/phone/remove", requireAuth, requireRecentAuth, (req, res) => {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!row.phone) return res.status(400).json({ error: "No phone number is set." });
  db.prepare(
    "UPDATE users SET phone = NULL, phone_verified_at = NULL, pending_phone = NULL, pending_phone_code_hash = NULL, pending_phone_code_expires_at = NULL WHERE id = ?"
  ).run(row.id);
  logAccountAudit({ userId: row.id, action: "phone_removed", result: "success", ip: clientIp(req), userAgent: req.headers["user-agent"] });
  sendMail({ to: row.email, subject: "Your phone number was removed from Pact", text: "The phone number on your Pact account was removed." });
  res.json({ ok: true });
});

// Soft delete only. This is purely an UPDATE — account_status/closed_at/
// closed_by — never a DELETE. Every contract this user is a party to,
// their name/info as it appears on those contracts, the full audit trail
// (views/edits/signatures) tied to their user id, and their
// terms_acceptances history all stay completely untouched: nothing here
// is nulled out, anonymized, or cascade-deleted. Any real data purge is a
// separate, later, scheduled retention job that reads closed_at — closing
// an account never triggers one directly.
// Phase 8 fix: same gap as /mfa/disable — this password check had no
// rate limiting, so a stolen session cookie gave unlimited guesses.
router.post("/close", requireAuth, passwordRecheckLimiter, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: "Enter your password to confirm." });
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!row || !verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: "Password is incorrect." });
  }

  let billingNote = null;
  try {
    const { canceled } = await cancelSubscriptionImmediately(row);
    if (canceled) billingNote = "Your subscription was canceled — no further charges will occur.";
  } catch (err) {
    // Don't let a Stripe hiccup block the account from closing — the
    // account status change is the source of truth for access; billing
    // gets flagged for manual follow-up instead of blocking the user.
    billingNote = "Your account was closed, but canceling your subscription with Stripe failed — contact support to confirm no further charges occur.";
  }

  db.prepare("UPDATE users SET account_status = 'closed', closed_at = datetime('now'), closed_by = 'user' WHERE id = ?").run(row.id);
  revokeAllSessions(row.id);
  logAccountAudit({ userId: row.id, action: "close_account", result: "success", ip: clientIp(req), userAgent: req.headers["user-agent"] });
  res.clearCookie("pact_token");
  res.json({ ok: true, note: billingNote });
});

// Self-serve export of "your own data" — the profile fields you entered,
// your organization if you have one, and every contract where you're
// either the owner or a named signing party (contract_parties). Deliberately
// excludes contracts you can merely view/edit via a per-contract share or a
// Business Directory membership you're not actually a party to — those
// aren't "your" data, they're someone else's contract you were granted
// access to, so a personal data export isn't the right channel to bulk-copy
// them out.
// Whether the current session can skip straight to a sensitive action
// right now, and whether a prompt for one needs to also ask for an MFA
// code — the frontend's ensureRecentAuth() checks this before deciding
// whether to show the reauth modal at all.
router.get("/reauth/status", requireAuth, (req, res) => {
  res.json({ hasRecentAuth: hasRecentReauth(req.sessionId), mfaRequired: req.user.mfaEnabled });
});

// The step-up challenge itself — password, plus a TOTP/backup code if MFA
// is on. A failure here is checked against the same lockout counters as
// /login (it's the identical credential, so an attacker holding a stolen
// session cookie shouldn't get an unlimited, separately-counted guessing
// budget just because they're already "logged in").
router.post("/reauth", requireAuth, authAttemptLimiter, (req, res) => {
  const { password, mfaCode } = req.body || {};
  const ip = clientIp(req);
  const userAgent = req.headers["user-agent"];
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);

  if (row.locked_at) {
    return res.status(423).json({ error: "This account is locked after too many failed login attempts." });
  }
  if (!password || !verifyPassword(password, row.password_hash)) {
    const attempts = (row.failed_login_attempts || 0) + 1;
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      db.prepare("UPDATE users SET failed_login_attempts = ?, locked_at = datetime('now') WHERE id = ?").run(attempts, row.id);
    } else {
      db.prepare("UPDATE users SET failed_login_attempts = ? WHERE id = ?").run(attempts, row.id);
    }
    logAccountAudit({ userId: row.id, action: "reauth", result: "failure", detail: "Incorrect password", ip, userAgent });
    return res.status(401).json({ error: "Incorrect password." });
  }
  if (row.mfa_enabled) {
    const result = mfaCode && verifyMfaCode(row, mfaCode);
    if (!result || !result.ok) {
      logAccountAudit({ userId: row.id, action: "reauth", result: "failure", detail: "Incorrect MFA code", ip, userAgent });
      return res.status(401).json({ error: "Incorrect verification code." });
    }
  }

  db.prepare("UPDATE users SET failed_login_attempts = 0, locked_at = NULL WHERE id = ?").run(row.id);
  markReauth(req.sessionId);
  logAccountAudit({ userId: row.id, action: "reauth", result: "success", ip, userAgent });
  res.json({ ok: true });
});

router.get("/export", requireAuth, requireRecentAuth, (req, res) => {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  const profile = publicUser(row);

  let organization = null;
  const membership = db.prepare("SELECT organization_id FROM organization_members WHERE user_id = ?").get(row.id);
  if (membership) {
    organization = db.prepare("SELECT * FROM organizations WHERE id = ?").get(membership.organization_id);
  }

  const contracts = db
    .prepare(
      `SELECT DISTINCT c.* FROM contracts c
       LEFT JOIN contract_parties p ON p.contract_id = c.id
       WHERE c.owner_id = @userId OR p.user_id = @userId OR p.email = @email
       ORDER BY c.created_at ASC`
    )
    .all({ userId: row.id, email: row.email })
    .map((c) => ({
      id: c.id,
      name: c.name,
      genre: c.genre,
      state: c.state,
      status: c.status,
      body: c.body,
      created_at: c.created_at,
      updated_at: c.updated_at,
      parties: db.prepare("SELECT name, email, role, signed_at FROM contract_parties WHERE contract_id = ?").all(c.id),
    }));

  logAccountAudit({ userId: row.id, action: "export_data", result: "success", ip: clientIp(req), userAgent: req.headers["user-agent"] });
  res.setHeader("Content-Disposition", "attachment; filename=pact-data-export.json");
  res.json({
    exportedAt: new Date().toISOString(),
    profile,
    organization,
    contracts,
  });
});

router.post("/logout", (req, res) => {
  // Revokes the session row, not just the cookie — without this, a copy
  // of the cookie taken before logout (XSS, a shared/borrowed device, a
  // synced browser profile) would keep working for the rest of its
  // 30-day JWT lifetime even after the user believes they've signed out.
  if (req.user && req.sessionId) revokeSession(req.sessionId, req.user.id);
  res.clearCookie("pact_token");
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  if (!req.user) return res.status(401).json({ user: null });
  res.json({ user: req.user });
});

module.exports = router;
// Attached to the router export (not a separate module) so index.js's
// `app.use("/api/auth", require("./routes/auth"))` doesn't change shape —
// routes/profile.js needs the exact same serialization /api/auth/me uses,
// so the PUT /api/profile response matches what a page already expects
// from CURRENT_USER after a fresh login.
module.exports.publicUser = publicUser;
