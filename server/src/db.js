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
