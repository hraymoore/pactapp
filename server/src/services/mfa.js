const crypto = require("crypto");
const { authenticator } = require("otplib");
const QRCode = require("qrcode");
const bcrypt = require("bcryptjs");
const db = require("../db");

const ISSUER = "Pact";
const BACKUP_CODE_COUNT = 10;
// Unambiguous alphabet, same rationale as generateTempPassword in
// auth-utils.js — these get read off a printed/saved list by hand.
const BACKUP_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateSecret() {
  return authenticator.generateSecret();
}

function otpauthUrl(email, secret) {
  return authenticator.keyuri(email, ISSUER, secret);
}

async function qrCodeDataUrl(otpauth) {
  return QRCode.toDataURL(otpauth);
}

function verifyTotp(token, secret) {
  if (!token || !secret) return false;
  try {
    return authenticator.check(String(token).replace(/\s+/g, ""), secret);
  } catch (err) {
    return false;
  }
}

function generateBackupCodes() {
  const codes = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const bytes = crypto.randomBytes(10);
    let code = "";
    for (let j = 0; j < 10; j++) code += BACKUP_CODE_ALPHABET[bytes[j] % BACKUP_CODE_ALPHABET.length];
    codes.push(`${code.slice(0, 5)}-${code.slice(5)}`);
  }
  return codes;
}

function hashBackupCodes(codes) {
  return codes.map((c) => bcrypt.hashSync(c, 10));
}

// Consumes one backup code if it matches — the array shrinks by one on
// success, so each code works exactly once. Returns the updated (still
// hashed) array on success, or null if the code didn't match anything.
function consumeBackupCode(hashedCodes, candidate) {
  const normalized = String(candidate || "").trim().toUpperCase();
  const idx = hashedCodes.findIndex((hash) => bcrypt.compareSync(normalized, hash));
  if (idx === -1) return null;
  return [...hashedCodes.slice(0, idx), ...hashedCodes.slice(idx + 1)];
}

function getBackupCodes(user) {
  if (!user.mfa_backup_codes) return [];
  try {
    return JSON.parse(user.mfa_backup_codes);
  } catch (err) {
    return [];
  }
}

// Tries the TOTP code first, then falls back to a backup code — either one
// satisfies the login challenge. Returns { ok, remainingBackupCodes } where
// remainingBackupCodes is only set (and only needs persisting) when a
// backup code was the one consumed.
function verifyMfaCode(user, code) {
  if (verifyTotp(code, user.mfa_secret)) {
    return { ok: true };
  }
  const remaining = consumeBackupCode(getBackupCodes(user), code);
  if (remaining) {
    db.prepare("UPDATE users SET mfa_backup_codes = ? WHERE id = ?").run(JSON.stringify(remaining), user.id);
    return { ok: true, remainingBackupCodes: remaining.length };
  }
  return { ok: false };
}

module.exports = {
  generateSecret,
  otpauthUrl,
  qrCodeDataUrl,
  verifyTotp,
  generateBackupCodes,
  hashBackupCodes,
  verifyMfaCode,
  getBackupCodes,
};
