const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

let warned = false;
function getSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (!warned) {
    console.warn(
      "[pact] JWT_SECRET is not set — using an insecure development secret. " +
      "Set JWT_SECRET in server/.env before deploying this anywhere real."
    );
    warned = true;
  }
  return "pact-dev-only-insecure-secret";
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

// sessionId ties this JWT to a row in the sessions table (services/
// sessions.js) — the JWT itself is still what proves "this request has a
// valid signature," but the session row is what can actually be listed or
// revoked. A token without a resolvable, unrevoked session is treated as
// logged out by attachUser, same as an expired or tampered one.
function signToken(user, sessionId) {
  return jwt.sign({ sub: user.id, email: user.email, sid: sessionId }, getSecret(), { expiresIn: "30d" });
}

// Shared across routes/auth.js (where sessions are created) and
// middleware/auth.js (which silently re-issues a token for a pre-session
// legacy cookie) so the cookie's actual attributes can't drift between
// the two places that set it.
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

function verifyToken(token) {
  try {
    return jwt.verify(token, getSecret());
  } catch (err) {
    return null;
  }
}

// A separate, short-lived, purpose-tagged JWT for the gap between "password
// verified" and "TOTP code verified" during MFA login. It carries no more
// authority than proving that gap — attachUser only ever looks at tokens
// without a purpose claim, so a challenge token can't be replayed as a real
// session token even if it leaked.
const MFA_CHALLENGE_PURPOSE = "mfa_challenge";
function signMfaChallengeToken(user) {
  return jwt.sign({ sub: user.id, purpose: MFA_CHALLENGE_PURPOSE }, getSecret(), { expiresIn: "5m" });
}

function verifyMfaChallengeToken(token) {
  try {
    const payload = jwt.verify(token, getSecret());
    return payload.purpose === MFA_CHALLENGE_PURPOSE ? payload : null;
  } catch (err) {
    return null;
  }
}

// Short-lived, purpose-tagged JWT for an archive file download — "serve
// only through authenticated, short-lived signed URLs" per the archive
// spec. Carries the archive item id and the user id it was issued to, so
// the download route can't be handed to a different, unauthorized user
// even if the URL leaked within its 5-minute window.
const ARCHIVE_DOWNLOAD_PURPOSE = "archive_download";
function signArchiveDownloadToken(archiveItemId, userId) {
  return jwt.sign({ sub: userId, archiveItemId, purpose: ARCHIVE_DOWNLOAD_PURPOSE }, getSecret(), { expiresIn: "5m" });
}

function verifyArchiveDownloadToken(token) {
  try {
    const payload = jwt.verify(token, getSecret());
    return payload.purpose === ARCHIVE_DOWNLOAD_PURPOSE ? payload : null;
  } catch (err) {
    return null;
  }
}

// Short-lived, purpose-tagged JWT proving ownership of the NEW address in
// a primary-email change (spec Phase 4). Carries the target email itself
// so routes/auth.js can detect a stale link (the user started a different
// change since) by comparing it against the live pending_email column
// rather than trusting the token alone.
const EMAIL_VERIFY_PURPOSE = "email_verify";
function signEmailVerifyToken(userId, newEmail) {
  return jwt.sign({ sub: userId, newEmail, purpose: EMAIL_VERIFY_PURPOSE }, getSecret(), { expiresIn: "24h" });
}
function verifyEmailVerifyToken(token) {
  try {
    const payload = jwt.verify(token, getSecret());
    return payload.purpose === EMAIL_VERIFY_PURPOSE ? payload : null;
  } catch (err) {
    return null;
  }
}

// The "cancel and lock" link sent to the OLD address (and recovery email)
// when a primary-email change is requested. Deliberately long-lived — the
// cancel window it guards doesn't start until the change is CONFIRMED,
// which can happen days after this token is issued, and spec Phase 4
// requires the link to stay valid for a further 7 days after that. The
// token only proves "whoever has this link was the account", not which
// specific change to cancel is still live — that's checked against the
// account's own email_change_* columns at cancel time.
const EMAIL_CANCEL_PURPOSE = "email_change_cancel";
function signEmailCancelToken(userId) {
  return jwt.sign({ sub: userId, purpose: EMAIL_CANCEL_PURPOSE }, getSecret(), { expiresIn: "9d" });
}
function verifyEmailCancelToken(token) {
  try {
    const payload = jwt.verify(token, getSecret());
    return payload.purpose === EMAIL_CANCEL_PURPOSE ? payload : null;
  } catch (err) {
    return null;
  }
}

const RECOVERY_EMAIL_VERIFY_PURPOSE = "recovery_email_verify";
function signRecoveryEmailVerifyToken(userId, email) {
  return jwt.sign({ sub: userId, email, purpose: RECOVERY_EMAIL_VERIFY_PURPOSE }, getSecret(), { expiresIn: "24h" });
}
function verifyRecoveryEmailVerifyToken(token) {
  try {
    const payload = jwt.verify(token, getSecret());
    return payload.purpose === RECOVERY_EMAIL_VERIFY_PURPOSE ? payload : null;
  } catch (err) {
    return null;
  }
}

// A 6-digit SMS code — plain decimal, unlike the temp-password alphabet,
// since it has to be typed back in on a phone keypad.
function generateNumericCode(length = 6) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += bytes[i] % 10;
  }
  return out;
}

// Unambiguous alphabet (no 0/O/1/I/l) so a temp password read out of an
// email doesn't get mistyped.
const TEMP_PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
function generateTempPassword(length = 12) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TEMP_PASSWORD_ALPHABET[bytes[i] % TEMP_PASSWORD_ALPHABET.length];
  }
  return out;
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  COOKIE_OPTS,
  generateTempPassword,
  signMfaChallengeToken,
  verifyMfaChallengeToken,
  signArchiveDownloadToken,
  verifyArchiveDownloadToken,
  signEmailVerifyToken,
  verifyEmailVerifyToken,
  signEmailCancelToken,
  verifyEmailCancelToken,
  signRecoveryEmailVerifyToken,
  verifyRecoveryEmailVerifyToken,
  generateNumericCode,
};
