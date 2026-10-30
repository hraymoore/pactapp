const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = process.env.PACT_DB_PATH || path.join(__dirname, "..", "data", "pact.sqlite");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  genre TEXT NOT NULL,
  min_tier TEXT NOT NULL,
  description TEXT NOT NULL,
  body TEXT NOT NULL,
  keywords TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  genre TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  template_id INTEGER,
  content_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  locked_at TEXT
);

CREATE TABLE IF NOT EXISTS contract_parties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  sign_token TEXT UNIQUE,
  signed_at TEXT,
  signature_name TEXT,
  signature_ip TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  actor_name TEXT,
  actor_email TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS identity_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  external_session_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  verified_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One-time, non-subscription purchases: $3.99 for a blank, download-only
-- copy of a template; $7.99 for a blank copy you can edit in Pact's editor
-- (which creates a normal row in contracts, linked back here via
-- contract_id, once the purchase is fulfilled).
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  template_id INTEGER NOT NULL REFERENCES templates(id),
  purchase_type TEXT NOT NULL CHECK (purchase_type IN ('download', 'edit')),
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  stripe_session_id TEXT UNIQUE,
  contract_id INTEGER REFERENCES contracts(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Files uploaded to a contract: either the original document a contract
-- was created from (an "upload" instead of picking a template), or a
-- supporting file (a scan, exhibit, reference doc) added afterward by any
-- authorized party. storage_path points into server/data/uploads/, named
-- by a random id, never the original filename, to avoid path traversal
-- and collisions.
CREATE TABLE IF NOT EXISTS contract_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  uploaded_by_user_id INTEGER NOT NULL REFERENCES users(id),
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  is_original_source INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sharing a specific contract with another existing Pact profile, separate
-- from being a signing party (contract_parties) or the owner. 'view' can
-- read and download; 'edit' can also change the draft body (subject to the
-- same signed-lock/audit rules as everyone else). Only the owner can
-- create/revoke shares, send for signature, or manage parties.
CREATE TABLE IF NOT EXISTS contract_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  shared_by_user_id INTEGER NOT NULL REFERENCES users(id),
  shared_with_user_id INTEGER NOT NULL REFERENCES users(id),
  permission TEXT NOT NULL CHECK (permission IN ('view', 'edit')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (contract_id, shared_with_user_id)
);

-- Every AI draft/analyze/chat call, successful or blocked, with the acting
-- user and (when scoped to one) the contract — the durable, user-indexed
-- record the guardrails require independent of any single contract's own
-- audit_log. contract_id is nullable because a freeform draft ("draft me
-- a lawn care agreement") has no contract yet when the call happens.
CREATE TABLE IF NOT EXISTS ai_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  contract_id INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('draft', 'analyze', 'chat')),
  blocked INTEGER NOT NULL DEFAULT 0,
  input_summary TEXT NOT NULL,
  output_summary TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A business account: a shared contract pool + member roster, distinct
-- from the one-contract-at-a-time sharing above. ein is self-reported and
-- format-validated only (no free third-party EIN/KYB verification exists
-- today — see identity-provider.js's Stripe-Identity precedent for how a
-- real vendor would slot in later) so it's clearly labeled as such in the
-- UI, never presented as verified.
CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  ein TEXT,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 'owner' (created it / billing, can do anything, cannot be removed unless
-- ownership transfers first), 'admin' (manage members, edit any org
-- contract), 'member' (view every org contract in the shared directory,
-- edit only the ones they personally created — same as being that
-- contract's owner_id).
CREATE TABLE IF NOT EXISTS organization_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (organization_id, user_id)
);

-- A snapshot of contracts.body taken immediately before every save
-- (pre-signature edit or post-signature amendment alike), so a redline/
-- diff view has something real to compare the current text against —
-- audit_log records THAT something changed, this records WHAT it was.
CREATE TABLE IF NOT EXISTS contract_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  saved_by_name TEXT,
  saved_by_email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A request to have a licensed attorney review one contract. Pact doesn't
-- run a two-sided attorney marketplace yet (no attorney accounts, no
-- state-licensing match, no automated assignment) — this is the request
-- side only; status is moved along manually until that's built for real.
CREATE TABLE IF NOT EXISTS attorney_review_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  requested_by_user_id INTEGER NOT NULL REFERENCES users(id),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'completed', 'canceled')),
  amount_cents INTEGER NOT NULL,
  stripe_session_id TEXT UNIQUE,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Append-only clickwrap evidence trail — never UPDATE or DELETE a row here
-- (no code path does). One row per acceptance event, not per user, so a
-- user who re-accepts after a Terms update keeps every prior acceptance on
-- file. terms_version must match services/terms.js's CURRENT_TERMS_VERSION
-- exactly for the acceptance to satisfy the current gate.
CREATE TABLE IF NOT EXISTS terms_acceptances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  terms_version TEXT NOT NULL,
  accepted_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip_address TEXT,
  acceptance_method TEXT NOT NULL DEFAULT 'checkbox_signup'
);

-- "Who viewed it" for the contract audit trail, alongside audit_log's
-- "who edited/signed it" — one row per (contract, viewer email), updated
-- in place on repeat views rather than one row per page load, since the
-- useful fact is "has X seen this and when," not a full clickstream.
CREATE TABLE IF NOT EXISTS contract_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  viewer_name TEXT,
  viewer_email TEXT NOT NULL,
  first_viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
  view_count INTEGER NOT NULL DEFAULT 1,
  UNIQUE (contract_id, viewer_email)
);

-- Append-only, same evidentiary pattern as terms_acceptances — the E-SIGN
-- Act disclosure/consent is a one-time gate per registered Pact user (any
-- row at all satisfies it, not a version match like Terms), required
-- before they send OR sign a contract in-app for the first time. Scoped to
-- registered users only: an outside counterparty signing via the public
-- token link (routes/sign.js) has no user_id and isn't gated here — that
-- flow already carries its own per-signature "I consent to sign
-- electronically" checkbox, which is adequate consent for that one
-- transaction without an ongoing Pact account relationship to attach a
-- record to.
CREATE TABLE IF NOT EXISTS esign_consent_acceptances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  consent_version TEXT NOT NULL,
  accepted_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip_address TEXT
);

-- Payment terms agreed by both parties as part of a contract's signed
-- text (see services/payments.js renderPaymentTermsBlock, which writes
-- these into contracts.body so they're part of what gets signed). One row
-- per contract — milestone structures (multiple scheduled payments) are
-- Phase 2 and would need a child table, not a change to this one.
-- payee/payer are resolved to a contract_parties row, not directly to a
-- users row: a counterparty's contract_parties entry has no user_id (see
-- contracts.js resolveAccess, which matches by email instead) until they
-- actually have a Pact account, so the real user is looked up by email at
-- the moment it's needed (requesting or paying), never cached here.
CREATE TABLE IF NOT EXISTS contract_payment_terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL UNIQUE REFERENCES contracts(id) ON DELETE CASCADE,
  total_amount_cents INTEGER NOT NULL CHECK (total_amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  structure TEXT NOT NULL DEFAULT 'single' CHECK (structure IN ('single', 'deposit_plus_balance')),
  deposit_amount_cents INTEGER,
  due_date TEXT,
  close_on_full_payment INTEGER NOT NULL DEFAULT 0,
  payee_party_id INTEGER NOT NULL REFERENCES contract_parties(id),
  payer_party_id INTEGER NOT NULL REFERENCES contract_parties(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Append-only payment ledger — never UPDATE or DELETE a row here (no code
-- path does). A reversal (refund, lost dispute) is a new row, not an edit
-- to the original 'payment_succeeded' row, so the full history stays
-- visible. stripe_event_id is UNIQUE so a retried webhook delivery can't
-- double-record the same event (see routes/billing.js's webhook handler,
-- which treats a UNIQUE-constraint error here as an already-processed
-- no-op). source distinguishes a Stripe-verified event from the mutual
-- "paid outside Pact" confirmation flow, which never touches Stripe at all.
CREATE TABLE IF NOT EXISTS payment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  stripe_event_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  payer_user_id INTEGER REFERENCES users(id),
  payee_user_id INTEGER REFERENCES users(id),
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  raw_status TEXT,
  source TEXT NOT NULL DEFAULT 'stripe' CHECK (source IN ('stripe', 'off_platform_confirmed')),
  created_by_user_id INTEGER REFERENCES users(id),
  created_by_ip TEXT
);

-- One PDF per successful payment (full or partial) — never deleted or
-- regenerated even if a later refund/dispute affects that same payment;
-- the contract view shows a banner pointing at payment history instead of
-- touching the original certificate. data_hash is a SHA-256 of the
-- certificate's data fields (not the PDF bytes) so a later alteration of
-- those fields can be detected independent of the file itself.
CREATE TABLE IF NOT EXISTS payment_certificates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  payment_event_id INTEGER NOT NULL REFERENCES payment_events(id) ON DELETE CASCADE,
  pdf_file_ref TEXT NOT NULL,
  data_hash TEXT NOT NULL,
  issued_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- "Paid outside Pact" (cash/check/other) — a proposal only takes effect
-- once the OTHER party confirms, so one party alone can never mark a
-- contract paid. One open proposal per contract at a time; confirming it
-- writes a payment_events row (source = 'off_platform_confirmed') and
-- clears this row's relevance (left in place as a historical record
-- rather than deleted).
CREATE TABLE IF NOT EXISTS off_platform_payment_confirmations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  proposed_by_user_id INTEGER NOT NULL REFERENCES users(id),
  proposed_at TEXT NOT NULL DEFAULT (datetime('now')),
  amount_cents INTEGER NOT NULL,
  note TEXT,
  confirmed_by_user_id INTEGER REFERENCES users(id),
  confirmed_at TEXT
);

-- An uploaded copy of a contract signed before Pact or outside it
-- entirely — deliberately NOT a row in contracts: it has no parties,
-- signatures, audit-trail-of-execution, or Pact certificate, and must
-- never be presented as if it did (see services/archive.js's persistent
-- "Uploaded Archive Copy" badge, enforced everywhere an archive item is
-- rendered). storage_path points into server/data/archive/, named by a
-- random id; the file on disk is AES-256-GCM ciphertext (encryption_iv/
-- encryption_auth_tag below are what decrypts it) — this is genuinely new
-- relative to contract_attachments, which stores files unencrypted on
-- disk today; it does not retrofit encryption onto that existing feature.
-- sha256_hash is computed over the ORIGINAL plaintext bytes at upload
-- time and never recomputed — it proves the file hasn't changed since
-- upload, not that the underlying contract is genuine or enforceable.
CREATE TABLE IF NOT EXISTS archive_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  category TEXT,
  governing_state TEXT,
  counterparty_names TEXT,
  effective_date TEXT,
  expiration_date TEXT,
  auto_renews INTEGER NOT NULL DEFAULT 0,
  total_value_cents INTEGER,
  tags TEXT,
  notes TEXT,
  ai_suggested_fields TEXT,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  encryption_auth_tag TEXT NOT NULL,
  sha256_hash TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  extracted_text TEXT,
  extraction_note TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'quarantined')),
  expiration_reminder_sent_at TEXT,
  deleted_at TEXT,
  purged_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Full-text search over archive metadata + OCR'd/extracted document text.
-- Kept in sync by application code (services/archive.js), not SQL
-- triggers, matching how the rest of this schema favors plain, traceable
-- statements over implicit database logic. archive_item_id is UNINDEXED
-- (just a lookup key, never matched against).
CREATE VIRTUAL TABLE IF NOT EXISTS archive_fts USING fts5(
  archive_item_id UNINDEXED,
  title, category, governing_state, counterparty_names, tags, notes, extracted_text
);

-- Same evidentiary purpose as audit_log, but scoped to archive_item_id
-- instead of contract_id, and explicitly carrying user_id + ip_address —
-- the spec for archive uploads calls for logging "user ID, timestamp, and
-- IP" on every action, stricter than audit_log's name/email-only shape.
CREATE TABLE IF NOT EXISTS archive_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  archive_item_id INTEGER NOT NULL REFERENCES archive_items(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  actor_name TEXT,
  actor_email TEXT,
  ip_address TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 'teammate' shares can be view/edit/admin (matching the Business
-- Directory's organization_members role vocabulary conceptually, but
-- scoped per-item rather than per-organization); 'counterparty' shares
-- are forced to 'view' server-side regardless of what's requested (see
-- services/archive.js shareArchiveItem) — a counterparty gets read-only
-- access to a copy of their own contract, never edit rights over someone
-- else's archive.
CREATE TABLE IF NOT EXISTS archive_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  archive_item_id INTEGER NOT NULL REFERENCES archive_items(id) ON DELETE CASCADE,
  shared_by_user_id INTEGER NOT NULL REFERENCES users(id),
  shared_with_user_id INTEGER NOT NULL REFERENCES users(id),
  permission TEXT NOT NULL CHECK (permission IN ('view', 'edit', 'admin')),
  share_type TEXT NOT NULL DEFAULT 'teammate' CHECK (share_type IN ('teammate', 'counterparty')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (archive_item_id, shared_with_user_id)
);

-- Idempotency ledger for renewal/expiration reminders, shared by native
-- contracts and archive items (subject_type distinguishes them — there's
-- no FK here on purpose, since it points at one of two different tables).
-- Superseded contracts.expiration_reminder_sent_at / archive_items.
-- expiration_reminder_sent_at (single-timestamp columns from before
-- multiple configurable intervals existed): those columns are left in
-- place but unused by reminder logic going forward, to avoid a disruptive
-- migration for a column that's otherwise harmless to leave alone. One
-- row per (subject, interval) that's actually been sent — see
-- services/renewals.js for why this makes "90/60/30/7 days before"
-- naturally fire once each as the countdown crosses each threshold,
-- and why clearing a subject's rows here (on a date change) lets the
-- same thresholds fire again against the new date.
CREATE TABLE IF NOT EXISTS renewal_reminders_sent (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('contract', 'archive_item')),
  subject_id INTEGER NOT NULL,
  interval_days INTEGER NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (subject_type, subject_id, interval_days)
);
`);

// Migrations for columns added after the initial CREATE TABLE (existing
// deployed databases already have a users table without these). SQLite
// (3.35+, bundled with node:sqlite) supports IF NOT EXISTS on ADD COLUMN;
// the try/catch is defense-in-depth for older builds.
for (const stmt of [
  "ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN locked_at TEXT",
  "ALTER TABLE users ADD COLUMN temp_password_expires_at TEXT",
  "ALTER TABLE templates ADD COLUMN state TEXT NOT NULL DEFAULT 'ALL'",
  "ALTER TABLE templates ADD COLUMN ai_restricted INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE contracts ADD COLUMN state TEXT",
  "ALTER TABLE contracts ADD COLUMN ai_restricted INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN stripe_customer_id TEXT",
  "ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT",
  "ALTER TABLE users ADD COLUMN stripe_subscription_status TEXT",
  "ALTER TABLE contracts ADD COLUMN organization_id INTEGER REFERENCES organizations(id)",
  "ALTER TABLE contracts ADD COLUMN expires_at TEXT",
  "ALTER TABLE contracts ADD COLUMN auto_renews INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE contracts ADD COLUMN expiration_reminder_sent_at TEXT",
  // 'personal' vs 'business' at signup. A personal profile's `name` is a
  // display alias ("name to be called") separate from its legal name; a
  // business profile's `name` is the business name itself, and business
  // signup also provisions an `organizations` row below so it gets the
  // full Business Directory (team invites, shared contract pool) for free
  // instead of a second, disconnected "business profile" concept.
  "ALTER TABLE users ADD COLUMN account_type TEXT NOT NULL DEFAULT 'personal'",
  "ALTER TABLE users ADD COLUMN legal_first_name TEXT",
  "ALTER TABLE users ADD COLUMN legal_last_name TEXT",
  "ALTER TABLE users ADD COLUMN date_of_birth TEXT",
  "ALTER TABLE organizations ADD COLUMN address TEXT",
  "ALTER TABLE organizations ADD COLUMN contact_email TEXT",
  "ALTER TABLE organizations ADD COLUMN point_of_contact TEXT",
  // Soft delete only — closing an account NEVER deletes or nulls a row.
  // Every contract, signature, audit entry and terms_acceptances record
  // tied to a closed user's id stays exactly as it was, so a counterparty
  // still sees the correct name on a contract signed before closure.
  // Actual data deletion, if any is ever built, is a separate scheduled
  // retention job that reads closed_at — never something close-time does.
  "ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active'",
  "ALTER TABLE users ADD COLUMN closed_at TEXT",
  "ALTER TABLE users ADD COLUMN closed_by TEXT",
  // TOTP-based MFA. mfa_secret is written as soon as enrollment starts
  // (services/mfa.js needs it on-hand to check the code the user types
  // back), but mfa_enabled only flips to 1 once that first code is
  // verified — an abandoned enrollment never leaves a half-armed account.
  // mfa_backup_codes is a JSON array of bcrypt hashes, one-time-use,
  // consumed (removed from the array) on use; regenerated wholesale only
  // by turning MFA off and back on.
  "ALTER TABLE users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN mfa_secret TEXT",
  "ALTER TABLE users ADD COLUMN mfa_enabled_at TEXT",
  "ALTER TABLE users ADD COLUMN mfa_backup_codes TEXT",
  // Legacy — both columns backed the one-time "annual pass" (12 months of
  // Professional/Enterprise for a single payment, tracked via an expiry
  // date instead of a Stripe subscription). That purchase path has been
  // removed in favor of monthly-only billing, so these are never written
  // again; left in place rather than dropped since this codebase's
  // migrations are additive-only (see the pattern throughout this array).
  "ALTER TABLE users ADD COLUMN tier_expires_at TEXT",
  "ALTER TABLE users ADD COLUMN annual_pass_reminder_sent_at TEXT",
  // Stripe Connect Express account for a user who wants to RECEIVE a
  // payment through Pact (see services/payments.js). charges_enabled
  // gates "Request Payment"; payouts_enabled just reflects whether Stripe
  // can actually pay them out yet — both are synced from the
  // account.updated webhook, not trusted from the client.
  "ALTER TABLE users ADD COLUMN stripe_connected_account_id TEXT",
  "ALTER TABLE users ADD COLUMN stripe_charges_enabled INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN stripe_payouts_enabled INTEGER NOT NULL DEFAULT 0",
  // Derived from payment_events by services/payments.js's
  // recomputeContractPaymentStatus — never written directly by a route.
  // 'closed'/'reopened_reason' reuse contracts.status itself (see below)
  // rather than adding a parallel "active" status that would conflict
  // with the existing draft/pending/signed lifecycle.
  "ALTER TABLE contracts ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','partially_paid','paid_in_full','refunded','disputed'))",
  "ALTER TABLE contracts ADD COLUMN amount_paid_cents INTEGER NOT NULL DEFAULT 0",
  // Set when close_on_full_payment auto-closes a fully-executed contract
  // (status moves 'signed' -> 'closed'); cleared-by-overwrite if it's
  // later reopened and closed again for a different reason. reopened_
  // reason records why a closed contract's status moved back to 'signed'
  // (currently only ever 'payment_disputed') — both are plain history
  // fields, nothing reads them to drive logic.
  "ALTER TABLE contracts ADD COLUMN closed_reason TEXT",
  "ALTER TABLE contracts ADD COLUMN reopened_reason TEXT",
]) {
  try {
    db.exec(stmt);
  } catch (err) {
    if (!/duplicate column/i.test(err.message)) throw err;
  }
}

// One-time data migration, not a schema change: 'none' was the sentinel
// for "no active plan" before Free became a real tier with real
// capabilities (template preview/download, viewing/signing shared
// contracts). Idempotent — a no-op once no row has tier='none' left.
db.exec("UPDATE users SET tier = 'free' WHERE tier = 'none'");

module.exports = db;
