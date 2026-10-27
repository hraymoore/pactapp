// Encryption-at-rest for archive uploads — AES-256-GCM with a single
// server-held key. This is genuinely new relative to contract_attachments
// (server/data/uploads/), which stores files unencrypted on disk today;
// it does not claim to reuse a mechanism that doesn't already exist for
// native contracts. ARCHIVE_ENCRYPTION_KEY is required, not best-effort —
// unlike AI/billing/identity, "encrypt at rest" is a stated security
// requirement for this specific feature, so there's no sensible
// unconfigured fallback other than refusing to store the file.
const crypto = require("crypto");

function archiveEncryptionConfigured() {
  return !!process.env.ARCHIVE_ENCRYPTION_KEY;
}

function notConfiguredError() {
  const err = new Error(
    "Archive encryption is not configured yet — archive uploads are disabled until it is. " +
      "Add ARCHIVE_ENCRYPTION_KEY to server/.env (32 random bytes, hex-encoded: " +
      'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))").'
  );
  err.status = 501;
  return err;
}

function getKey() {
  if (!archiveEncryptionConfigured()) throw notConfiguredError();
  const key = Buffer.from(process.env.ARCHIVE_ENCRYPTION_KEY, "hex");
  if (key.length !== 32) {
    throw new Error("ARCHIVE_ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex characters) for AES-256-GCM.");
  }
  return key;
}

// Returns { ciphertext, iv, authTag } — iv/authTag are stored as hex
// strings in archive_items and are required (along with the key) to
// decrypt; losing either makes the file permanently unreadable, same as
// losing the key itself.
function encryptBuffer(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, iv: iv.toString("hex"), authTag: cipher.getAuthTag().toString("hex") };
}

function decryptBuffer(ciphertext, ivHex, authTagHex) {
  const key = getKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

module.exports = { archiveEncryptionConfigured, encryptBuffer, decryptBuffer };
