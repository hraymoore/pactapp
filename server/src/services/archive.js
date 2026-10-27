const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("../db");
const { sniffFileType } = require("./file-sniff");
const { malwareScanConfigured, scanBuffer } = require("./malware-scan-provider");
const { archiveEncryptionConfigured, encryptBuffer, decryptBuffer } = require("./archive-encryption");
const { extractText } = require("./document-text-extractor");

const STORAGE_DIR = process.env.PACT_ARCHIVE_DIR || path.join(__dirname, "..", "..", "data", "archive");
fs.mkdirSync(STORAGE_DIR, { recursive: true });

// Suggested storage limits by tier, from the spec — Enterprise is
// "unlimited (fair-use)," which this treats as Infinity rather than
// inventing a fair-use enforcement mechanism that doesn't exist yet.
const TIER_LIMITS = { free: 0, starter: 25, everyday: 250, pro: 2500, business: Infinity };

const MAX_FILE_BYTES = Number(process.env.ARCHIVE_MAX_FILE_MB || 25) * 1024 * 1024;
const MAX_BULK_FILES = 20;
const SOFT_DELETE_RETENTION_DAYS = 30;

function getUsageSummary(userId, tier) {
  const { count } = db
    .prepare("SELECT COUNT(*) as count FROM archive_items WHERE owner_user_id = ? AND deleted_at IS NULL")
    .get(userId);
  const limit = TIER_LIMITS[tier] ?? 0;
  return { count, limit: Number.isFinite(limit) ? limit : null };
}

function logArchiveAudit(archiveItemId, user, action, detail, ip) {
  db.prepare(
    `INSERT INTO archive_audit_log (archive_item_id, user_id, actor_name, actor_email, ip_address, action, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(archiveItemId, (user && user.id) || null, (user && user.name) || null, (user && user.email) || null, ip || null, action, detail || null);
}

function syncFts(item) {
  db.prepare("DELETE FROM archive_fts WHERE archive_item_id = ?").run(item.id);
  db.prepare(
    `INSERT INTO archive_fts (archive_item_id, title, category, governing_state, counterparty_names, tags, notes, extracted_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(item.id, item.title, item.category || "", item.governing_state || "", item.counterparty_names || "", item.tags || "", item.notes || "", item.extracted_text || "");
}

// 'owner' can do anything including delete; 'admin'/'edit'/'view' come
// from an explicit per-item share (archive_shares) — there is no
// organization-wide visibility for archive items the way there is for
// native contracts, since these are private uploads by default.
function resolveArchiveAccess(item, user) {
  if (item.owner_user_id === user.id) return "owner";
  const share = db.prepare("SELECT permission FROM archive_shares WHERE archive_item_id = ? AND shared_with_user_id = ?").get(item.id, user.id);
  return share ? share.permission : null;
}

function loadAuthorizedArchiveItem(req, res, { requireEdit = false, requireOwner = false } = {}) {
  const item = db.prepare("SELECT * FROM archive_items WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
  if (!item) {
    res.status(404).json({ error: "Archive item not found." });
    return null;
  }
  const access = resolveArchiveAccess(item, req.user);
  if (!access) {
    res.status(403).json({ error: "You do not have access to this archive item." });
    return null;
  }
  if (requireOwner && access !== "owner") {
    res.status(403).json({ error: "Only the uploader can do that." });
    return null;
  }
  if (requireEdit && !["owner", "edit", "admin"].includes(access)) {
    res.status(403).json({ error: "You have view-only access to this archive item." });
    return null;
  }
  item.myAccess = access;
  return item;
}

function validateMetadata(fields) {
  const { isValidStateCode } = require("../us-states");
  if (fields.governingState && !isValidStateCode(fields.governingState)) {
    const err = new Error("Governing state must be a valid two-letter US state code.");
    err.status = 400;
    throw err;
  }
  for (const dateField of ["effectiveDate", "expirationDate"]) {
    if (fields[dateField] && !/^\d{4}-\d{2}-\d{2}$/.test(fields[dateField])) {
      const err = new Error(`${dateField} must be in YYYY-MM-DD format.`);
      err.status = 400;
      throw err;
    }
  }
  if (fields.totalValueCents != null && (!Number.isInteger(fields.totalValueCents) || fields.totalValueCents < 0)) {
    const err = new Error("Total value must be a non-negative whole number of cents.");
    err.status = 400;
    throw err;
  }
}

// The full upload pipeline for one file: sniff -> malware scan -> encrypt
// -> extract text -> store row + FTS + audit log. Throws (never silently
// skips a step) if malware scanning or encryption isn't configured, if
// the sniffed type isn't on the allow-list, if the scan finds a threat,
// or if metadata fails validation — the caller (routes/archive.js) is
// expected to catch per-file and report partial bulk-upload results
// rather than letting one bad file abort the whole batch.
async function uploadArchiveItem({ ownerUser, buffer, originalFilename, metadata, aiSuggestedFieldNames, actingUser, ip }) {
  if (!malwareScanConfigured()) {
    const err = new Error("Malware scanning is not connected yet — archive uploads are disabled until it is configured.");
    err.status = 501;
    throw err;
  }
  if (!archiveEncryptionConfigured()) {
    const err = new Error("Archive encryption is not configured yet — archive uploads are disabled until it is.");
    err.status = 501;
    throw err;
  }
  if (buffer.length > MAX_FILE_BYTES) {
    const err = new Error(`"${originalFilename}" exceeds the ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB file size limit.`);
    err.status = 400;
    throw err;
  }

  const sniffed = sniffFileType(buffer);
  if (!sniffed) {
    const err = new Error(`"${originalFilename}" is not a supported file type (PDF, DOCX, PNG, JPG, or TIFF only).`);
    err.status = 400;
    throw err;
  }

  const scan = await scanBuffer(buffer, originalFilename);
  if (!scan.clean) {
    const err = new Error(`"${originalFilename}" was flagged by malware scanning (${scan.threats.join(", ")}) and was not stored.`);
    err.status = 422;
    err.quarantined = true;
    throw err;
  }

  if (!metadata.title || !metadata.title.trim()) {
    const err = new Error("A title is required.");
    err.status = 400;
    throw err;
  }
  validateMetadata(metadata);

  const sha256Hash = crypto.createHash("sha256").update(buffer).digest("hex");
  const { text: extractedText, note: extractionNote } = await extractText(buffer, sniffed.type);
  const { ciphertext, iv, authTag } = encryptBuffer(buffer);
  const storageFilename = `${crypto.randomBytes(20).toString("hex")}.enc`;
  fs.writeFileSync(path.join(STORAGE_DIR, storageFilename), ciphertext);

  const info = db
    .prepare(
      `INSERT INTO archive_items
        (owner_user_id, title, category, governing_state, counterparty_names, effective_date, expiration_date,
         auto_renews, total_value_cents, tags, notes, ai_suggested_fields, original_filename, mime_type, size_bytes,
         storage_path, encryption_iv, encryption_auth_tag, sha256_hash, uploaded_at, extracted_text, extraction_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)`
    )
    .run(
      ownerUser.id,
      metadata.title.trim(),
      metadata.category || null,
      metadata.governingState || null,
      JSON.stringify(metadata.counterpartyNames || []),
      metadata.effectiveDate || null,
      metadata.expirationDate || null,
      metadata.autoRenews ? 1 : 0,
      metadata.totalValueCents != null ? metadata.totalValueCents : null,
      JSON.stringify(metadata.tags || []),
      metadata.notes || null,
      JSON.stringify(aiSuggestedFieldNames || []),
      originalFilename,
      sniffed.type,
      buffer.length,
      storageFilename,
      iv,
      authTag,
      sha256Hash,
      extractedText || null,
      extractionNote || null
    );

  const item = db.prepare("SELECT * FROM archive_items WHERE id = ?").get(info.lastInsertRowid);
  syncFts(item);
  logArchiveAudit(item.id, actingUser, "uploaded", `Uploaded "${originalFilename}" as "${item.title}".`, ip);
  return item;
}

function updateArchiveMetadata(item, actingUser, fields, ip) {
  validateMetadata(fields);
  const next = {
    title: fields.title !== undefined ? fields.title.trim() : item.title,
    category: fields.category !== undefined ? fields.category : item.category,
    governingState: fields.governingState !== undefined ? fields.governingState : item.governing_state,
    counterpartyNames: fields.counterpartyNames !== undefined ? fields.counterpartyNames : JSON.parse(item.counterparty_names || "[]"),
    effectiveDate: fields.effectiveDate !== undefined ? fields.effectiveDate : item.effective_date,
    expirationDate: fields.expirationDate !== undefined ? fields.expirationDate : item.expiration_date,
    autoRenews: fields.autoRenews !== undefined ? !!fields.autoRenews : !!item.auto_renews,
    totalValueCents: fields.totalValueCents !== undefined ? fields.totalValueCents : item.total_value_cents,
    tags: fields.tags !== undefined ? fields.tags : JSON.parse(item.tags || "[]"),
    notes: fields.notes !== undefined ? fields.notes : item.notes,
  };
  if (!next.title) {
    const err = new Error("Title cannot be empty.");
    err.status = 400;
    throw err;
  }

  // A changed expiration date invalidates any previous reminder, same as
  // native contracts (routes/contracts.js PUT /:id).
  const reminderSentAt = next.expirationDate !== item.expiration_date ? null : item.expiration_reminder_sent_at;

  db.prepare(
    `UPDATE archive_items SET title = ?, category = ?, governing_state = ?, counterparty_names = ?, effective_date = ?,
       expiration_date = ?, auto_renews = ?, total_value_cents = ?, tags = ?, notes = ?,
       expiration_reminder_sent_at = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    next.title,
    next.category || null,
    next.governingState || null,
    JSON.stringify(next.counterpartyNames || []),
    next.effectiveDate || null,
    next.expirationDate || null,
    next.autoRenews ? 1 : 0,
    next.totalValueCents != null ? next.totalValueCents : null,
    JSON.stringify(next.tags || []),
    next.notes || null,
    reminderSentAt,
    item.id
  );

  const updated = db.prepare("SELECT * FROM archive_items WHERE id = ?").get(item.id);
  syncFts(updated);
  logArchiveAudit(item.id, actingUser, "edited", `Metadata edited by ${actingUser.name}.`, ip);
  return updated;
}

// Search + filter across the caller's own + shared-with-them archive
// items. A blank query just applies the structured filters; a non-blank
// query additionally intersects with an FTS5 match over metadata + OCR'd
// text.
function listArchiveItems(user, filters = {}) {
  const ownedOrShared = `
    (owner_user_id = @uid OR id IN (SELECT archive_item_id FROM archive_shares WHERE shared_with_user_id = @uid))
    AND deleted_at IS NULL`;
  const clauses = [ownedOrShared];
  const params = { uid: user.id };

  if (filters.category && filters.category !== "All") {
    clauses.push("category = @category");
    params.category = filters.category;
  }
  if (filters.state && filters.state !== "All") {
    clauses.push("governing_state = @state");
    params.state = filters.state;
  }
  if (filters.counterparty) {
    clauses.push("counterparty_names LIKE @counterparty");
    params.counterparty = `%${filters.counterparty}%`;
  }
  if (filters.dateFrom) {
    clauses.push("effective_date >= @dateFrom");
    params.dateFrom = filters.dateFrom;
  }
  if (filters.dateTo) {
    clauses.push("effective_date <= @dateTo");
    params.dateTo = filters.dateTo;
  }
  if (filters.expiringSoon) {
    clauses.push("expiration_date IS NOT NULL AND date(expiration_date) <= date('now', '+30 days')");
  }

  let idFilterSql = "";
  if (filters.query && filters.query.trim()) {
    const matchIds = db
      .prepare("SELECT archive_item_id FROM archive_fts WHERE archive_fts MATCH ?")
      .all(filters.query.trim().replace(/"/g, '""'))
      .map((r) => r.archive_item_id);
    if (matchIds.length === 0) return [];
    idFilterSql = ` AND id IN (${matchIds.join(",")})`;
  }

  const rows = db
    .prepare(`SELECT * FROM archive_items WHERE ${clauses.join(" AND ")}${idFilterSql} ORDER BY updated_at DESC`)
    .all(params);
  return rows.map((r) => ({ ...r, myAccess: resolveArchiveAccess(r, user) }));
}

function softDeleteArchiveItem(item, actingUser, ip) {
  db.prepare("UPDATE archive_items SET deleted_at = datetime('now') WHERE id = ?").run(item.id);
  logArchiveAudit(item.id, actingUser, "deleted", `Moved to trash by ${actingUser.name} — permanently purged after ${SOFT_DELETE_RETENTION_DAYS} days unless restored.`, ip);
}

function restoreArchiveItem(itemId, actingUser, ip) {
  const item = db.prepare("SELECT * FROM archive_items WHERE id = ? AND deleted_at IS NOT NULL AND purged_at IS NULL").get(itemId);
  if (!item) {
    const err = new Error("This archive item can't be restored (not found, already purged, or not deleted).");
    err.status = 404;
    throw err;
  }
  if (item.owner_user_id !== actingUser.id) {
    const err = new Error("Only the uploader can restore this.");
    err.status = 403;
    throw err;
  }
  db.prepare("UPDATE archive_items SET deleted_at = NULL WHERE id = ?").run(itemId);
  logArchiveAudit(itemId, actingUser, "restored", `Restored from trash by ${actingUser.name}.`, ip);
  return db.prepare("SELECT * FROM archive_items WHERE id = ?").get(itemId);
}

function listTrashedItems(user) {
  return db
    .prepare("SELECT * FROM archive_items WHERE owner_user_id = ? AND deleted_at IS NOT NULL AND purged_at IS NULL ORDER BY deleted_at DESC")
    .all(user.id);
}

// The scheduled job's real logic (see scripts/send-archive-purge.js) —
// permanently removes the encrypted file and extracted text for anything
// soft-deleted more than SOFT_DELETE_RETENTION_DAYS ago. The database row
// itself is kept (purged_at set) rather than deleted outright, so the
// audit trail of what existed and when it was purged survives even
// though the content doesn't.
function purgeExpiredSoftDeletes() {
  const rows = db
    .prepare(
      `SELECT * FROM archive_items WHERE deleted_at IS NOT NULL AND purged_at IS NULL
       AND datetime(deleted_at) <= datetime('now', '-' || ? || ' days')`
    )
    .all(SOFT_DELETE_RETENTION_DAYS);

  for (const item of rows) {
    try {
      fs.unlinkSync(path.join(STORAGE_DIR, item.storage_path));
    } catch (err) {
      // Already gone — proceed with marking it purged either way.
    }
    db.prepare("DELETE FROM archive_fts WHERE archive_item_id = ?").run(item.id);
    db.prepare(
      "UPDATE archive_items SET purged_at = datetime('now'), extracted_text = NULL, storage_path = '' WHERE id = ?"
    ).run(item.id);
    logArchiveAudit(item.id, null, "purged", `Permanently purged ${SOFT_DELETE_RETENTION_DAYS} days after deletion.`, null);
  }
  return { purged: rows.length };
}

function shareArchiveItem(item, actingUser, { email, permission, shareType }, ip) {
  const type = shareType === "counterparty" ? "counterparty" : "teammate";
  const effectivePermission = type === "counterparty" ? "view" : permission;
  if (!["view", "edit", "admin"].includes(effectivePermission)) {
    const err = new Error("Permission must be 'view', 'edit', or 'admin'.");
    err.status = 400;
    throw err;
  }
  const target = db.prepare("SELECT * FROM users WHERE email = ? AND account_status = 'active'").get(String(email).trim().toLowerCase());
  if (!target) {
    const err = new Error("No active Pact account found for that email.");
    err.status = 404;
    throw err;
  }
  if (target.id === item.owner_user_id) {
    const err = new Error("The uploader already has full access.");
    err.status = 400;
    throw err;
  }

  db.prepare(
    `INSERT INTO archive_shares (archive_item_id, shared_by_user_id, shared_with_user_id, permission, share_type)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(archive_item_id, shared_with_user_id) DO UPDATE SET permission = excluded.permission, share_type = excluded.share_type`
  ).run(item.id, actingUser.id, target.id, effectivePermission, type);

  logArchiveAudit(item.id, actingUser, "shared", `Shared with ${target.name} <${target.email}> (${effectivePermission}, ${type}).`, ip);
}

function revokeArchiveShare(itemId, shareId, actingUser, ip) {
  db.prepare("DELETE FROM archive_shares WHERE id = ? AND archive_item_id = ?").run(shareId, itemId);
  logArchiveAudit(itemId, actingUser, "unshared", `Revoked a shared collaborator's access.`, ip);
}

function getDecryptedFileBuffer(item) {
  const ciphertext = fs.readFileSync(path.join(STORAGE_DIR, item.storage_path));
  return decryptBuffer(ciphertext, item.encryption_iv, item.encryption_auth_tag);
}

module.exports = {
  TIER_LIMITS,
  MAX_BULK_FILES,
  MAX_FILE_BYTES,
  getUsageSummary,
  resolveArchiveAccess,
  loadAuthorizedArchiveItem,
  uploadArchiveItem,
  updateArchiveMetadata,
  listArchiveItems,
  softDeleteArchiveItem,
  restoreArchiveItem,
  listTrashedItems,
  purgeExpiredSoftDeletes,
  shareArchiveItem,
  revokeArchiveShare,
  getDecryptedFileBuffer,
  logArchiveAudit,
};
