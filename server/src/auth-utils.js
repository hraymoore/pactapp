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
};
