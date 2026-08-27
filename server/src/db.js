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
  tier TEXT NOT NULL DEFAULT 'starter',
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
`);

// Migrations for columns added after the initial CREATE TABLE (existing
// deployed databases already have a users table without these). SQLite
// (3.35+, bundled with node:sqlite) supports IF NOT EXISTS on ADD COLUMN;
// the try/catch is defense-in-depth for older builds.
for (const stmt of [
  "ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN locked_at TEXT",
  "ALTER TABLE users ADD COLUMN temp_password_expires_at TEXT",
]) {
  try {
    db.exec(stmt);
  } catch (err) {
    if (!/duplicate column/i.test(err.message)) throw err;
  }
}

module.exports = db;
