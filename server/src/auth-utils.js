const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

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

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };
