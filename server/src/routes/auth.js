const express = require("express");
const router = express.Router();
const db = require("../db");
const { hashPassword, verifyPassword, signToken } = require("../auth-utils");

router.use(express.json());

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax",
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

const VALID_TIERS = ["starter", "everyday", "pro", "business"];

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
  if (!row || !verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  const user = { id: row.id, name: row.name, email: row.email, tier: row.tier, created_at: row.created_at };
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
