const express = require("express");
const router = express.Router();
const db = require("../db");
const { hashPassword, verifyPassword, signToken, generateTempPassword } = require("../auth-utils");
const { mailerConfigured, sendMail } = require("../services/mailer");
const { requireAuth } = require("../middleware/auth");
const { isValidEinFormat, normalizeEin } = require("../services/organizations");
const { recordAcceptance, clientIp } = require("../services/terms");
const { cancelSubscriptionImmediately } = require("../services/billing-provider");

router.use(express.json());

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

const MAX_LOGIN_ATTEMPTS = 7;
const TEMP_PASSWORD_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MIN_SIGNUP_AGE_YEARS = 18;

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    tier: row.tier,
    accountType: row.account_type,
    legalFirstName: row.legal_first_name,
    legalLastName: row.legal_last_name,
    dateOfBirth: row.date_of_birth,
    created_at: row.created_at,
    passwordIsTemporary: !!row.temp_password_expires_at,
  };
}

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
  res.cookie("pact_token", signToken(user), COOKIE_OPTS);
  res.status(201).json({ user: publicUser(user) });
});

router.post("/login", (req, res) => {
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
  const user = publicUser(refreshed);
  res.cookie("pact_token", signToken(user), COOKIE_OPTS);
  res.json({ user });
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
  res.cookie("pact_token", signToken(user), COOKIE_OPTS);
  res.json({ user });
});

router.post("/forgot-password", (req, res) => {
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

router.post("/change-password", requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password are required." });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters." });
  }
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!row || !verifyPassword(currentPassword, row.password_hash)) {
    return res.status(401).json({ error: "Current password is incorrect." });
  }
  db.prepare(
    "UPDATE users SET password_hash = ?, temp_password_expires_at = NULL, failed_login_attempts = 0, locked_at = NULL WHERE id = ?"
  ).run(hashPassword(newPassword), row.id);
  const refreshed = db.prepare("SELECT * FROM users WHERE id = ?").get(row.id);
  const user = publicUser(refreshed);
  res.cookie("pact_token", signToken(user), COOKIE_OPTS);
  res.json({ user });
});

// Soft delete only. This is purely an UPDATE — account_status/closed_at/
// closed_by — never a DELETE. Every contract this user is a party to,
// their name/info as it appears on those contracts, the full audit trail
// (views/edits/signatures) tied to their user id, and their
// terms_acceptances history all stay completely untouched: nothing here
// is nulled out, anonymized, or cascade-deleted. Any real data purge is a
// separate, later, scheduled retention job that reads closed_at — closing
// an account never triggers one directly.
router.post("/close", requireAuth, async (req, res) => {
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
  res.clearCookie("pact_token");
  res.json({ ok: true, note: billingNote });
});

router.post("/logout", (req, res) => {
  res.clearCookie("pact_token");
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  if (!req.user) return res.status(401).json({ user: null });
  res.json({ user: req.user });
});

module.exports = router;
