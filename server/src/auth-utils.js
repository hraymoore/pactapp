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

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, getSecret(), { expiresIn: "30d" });
}

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
  generateTempPassword,
  signMfaChallengeToken,
  verifyMfaChallengeToken,
};
