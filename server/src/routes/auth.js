const express = require("express");
const router = express.Router();
const db = require("../db");
const { hashPassword, verifyPassword, signToken, generateTempPassword } = require("../auth-utils");
const { mailerConfigured, sendMail } = require("../services/mailer");
const { requireAuth } = require("../middleware/auth");

router.use(express.json());

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

const VALID_TIERS = ["starter", "everyday", "pro", "business"];

const MAX_LOGIN_ATTEMPTS = 7;
const TEMP_PASSWORD_TTL_MS = 30 * 60 * 1000; // 30 minutes

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    tier: row.tier,
    created_at: row.created_at,
    passwordIsTemporary: !!row.temp_password_expires_at,
  };
}

router.post("/signup", (req, res) => {
  const { name, email, password, tier } = req.body || {};
  if (!name || !name.trim() || !email || !password) {
    return res.status(400).json({ error: "Name, email and password are required." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail);
  if (existing) {
    return res.status(409).json({ error: "An account with that email already exists. Try logging in instead." });
  }
  const chosenTier = VALID_TIERS.includes(tier) ? tier : "starter";
  const info = db
    .prepare("INSERT INTO users (name, email, password_hash, tier) VALUES (?, ?, ?, ?)")
    .run(name.trim(), normalizedEmail, hashPassword(password), chosenTier);
  const user = db
    .prepare("SELECT id, name, email, tier, created_at FROM users WHERE id = ?")
    .get(info.lastInsertRowid);
  res.cookie("pact_token", signToken(user), COOKIE_OPTS);
  res.status(201).json({ user });
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

router.post("/logout", (req, res) => {
  res.clearCookie("pact_token");
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  if (!req.user) return res.status(401).json({ user: null });
  res.json({ user: req.user });
});

module.exports = router;
