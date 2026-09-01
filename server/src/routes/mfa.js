const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { verifyPassword } = require("../auth-utils");
const {
  generateSecret,
  otpauthUrl,
  qrCodeDataUrl,
  verifyTotp,
  generateBackupCodes,
  hashBackupCodes,
} = require("../services/mfa");

router.use(express.json());

router.get("/status", requireAuth, (req, res) => {
  const row = db.prepare("SELECT mfa_enabled, mfa_enabled_at FROM users WHERE id = ?").get(req.user.id);
  res.json({ enabled: !!row.mfa_enabled, enabledAt: row.mfa_enabled_at });
});

// Step 1 of enrollment: generate a secret and hand back a QR code. The
// secret is written to the row immediately so /enroll/verify can check
// against it, but mfa_enabled stays 0 — an abandoned enrollment (closed tab,
// never scanned) leaves the account exactly as unprotected as before.
router.post("/enroll/start", requireAuth, async (req, res) => {
  const secret = generateSecret();
  db.prepare("UPDATE users SET mfa_secret = ?, mfa_enabled = 0, mfa_enabled_at = NULL WHERE id = ?").run(secret, req.user.id);
  const otpauth = otpauthUrl(req.user.email, secret);
  const qrCode = await qrCodeDataUrl(otpauth);
  res.json({ secret, qrCode });
});

// Step 2: prove the authenticator app actually has the secret by echoing
// back one valid code. Only now does mfa_enabled flip on, and backup codes
// are minted — shown to the user exactly once, in this response.
router.post("/enroll/verify", requireAuth, (req, res) => {
  const { code } = req.body || {};
  const row = db.prepare("SELECT mfa_secret FROM users WHERE id = ?").get(req.user.id);
  if (!row.mfa_secret) {
    return res.status(400).json({ error: "Start enrollment first." });
  }
  if (!verifyTotp(code, row.mfa_secret)) {
    return res.status(400).json({ error: "That code didn't match. Check your authenticator app and try again." });
  }
  const backupCodes = generateBackupCodes();
  db.prepare(
    "UPDATE users SET mfa_enabled = 1, mfa_enabled_at = datetime('now'), mfa_backup_codes = ? WHERE id = ?"
  ).run(JSON.stringify(hashBackupCodes(backupCodes)), req.user.id);
  res.json({ ok: true, backupCodes });
});

// Disabling requires the account password, same trust boundary as
// close-account and change-password — MFA is a security control, so
// turning it off can't be a bare unauthenticated-session click.
router.post("/disable", requireAuth, (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: "Enter your password to confirm." });
  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(req.user.id);
  if (!verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: "Password is incorrect." });
  }
  db.prepare(
    "UPDATE users SET mfa_enabled = 0, mfa_secret = NULL, mfa_enabled_at = NULL, mfa_backup_codes = NULL WHERE id = ?"
  ).run(req.user.id);
  res.json({ ok: true });
});

module.exports = router;
