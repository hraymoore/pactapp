const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requireRecentAuth } = require("../middleware/reauth");
const { isValidEinFormat, normalizeEin, getMembership, requireMembership } = require("../services/organizations");
const { logAudit } = require("../services/signing");
const { sendMail } = require("../services/mailer");
const { logAccountAudit } = require("../services/account-audit");
const { clientIp } = require("../services/terms");

router.use(express.json());
router.use(requireAuth);

function orgWithRole(org, userId) {
  const membership = getMembership(org.id, userId);
  return { ...org, myRole: membership ? membership.role : null };
}

// Team-invite and role-management are the two permissions the site audit
// calls out as needing MFA once an admin's account has real money/scale
// behind it (Everyday tier and above) — Free/Starter admins aren't gated,
// since those tiers don't carry a paid team seat structure worth protecting
// this way yet.
const MFA_REQUIRED_TIERS = ["everyday", "pro", "business"];
function requireMfaForOrgAdmin(req, res, next) {
  if (MFA_REQUIRED_TIERS.includes(req.user.tier) && !req.user.mfaEnabled) {
    return res.status(403).json({
      error: "Team invites and role changes require two-factor authentication on your account. Turn it on in Settings first.",
      mfaRequired: true,
    });
  }
  next();
}

// The organizations the current user belongs to, with their role in each —
// almost always one, but nothing stops someone being a member of several.
router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT o.* FROM organizations o
       JOIN organization_members m ON m.organization_id = o.id
       WHERE m.user_id = ?
       ORDER BY o.created_at ASC`
    )
    .all(req.user.id);
  res.json({ organizations: rows.map((o) => orgWithRole(o, req.user.id)) });
});

router.post("/", (req, res) => {
  const { name, ein, address, contactEmail, pointOfContact } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Business name is required." });
  if (ein && !isValidEinFormat(ein)) {
    return res.status(400).json({ error: "EIN should look like 12-3456789." });
  }

  const info = db
    .prepare(
      "INSERT INTO organizations (name, ein, owner_user_id, address, contact_email, point_of_contact) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(
      name.trim(),
      ein ? normalizeEin(ein) : null,
      req.user.id,
      address ? address.trim() : null,
      contactEmail ? contactEmail.trim().toLowerCase() : null,
      pointOfContact ? pointOfContact.trim() : null
    );
  const organizationId = info.lastInsertRowid;

  db.prepare("INSERT INTO organization_members (organization_id, user_id, role) VALUES (?, ?, 'owner')").run(
    organizationId,
    req.user.id
  );

  const org = db.prepare("SELECT * FROM organizations WHERE id = ?").get(organizationId);
  res.status(201).json({ organization: orgWithRole(org, req.user.id) });
});

router.get("/:id", (req, res) => {
  const org = db.prepare("SELECT * FROM organizations WHERE id = ?").get(req.params.id);
  if (!org) return res.status(404).json({ error: "Organization not found." });
  try {
    requireMembership(org.id, req.user.id);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
  const members = db
    .prepare(
      `SELECT m.id, m.role, m.created_at, u.id as user_id, u.name, u.email
       FROM organization_members m JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = ? ORDER BY m.created_at ASC`
    )
    .all(org.id);
  res.json({ organization: orgWithRole(org, req.user.id), members });
});

router.put("/:id", (req, res) => {
  const org = db.prepare("SELECT * FROM organizations WHERE id = ?").get(req.params.id);
  if (!org) return res.status(404).json({ error: "Organization not found." });
  try {
    requireMembership(org.id, req.user.id, ["owner", "admin"]);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
  const { name, ein, address, contactEmail, pointOfContact } = req.body || {};
  if (ein && !isValidEinFormat(ein)) {
    return res.status(400).json({ error: "EIN should look like 12-3456789." });
  }
  db.prepare(
    `UPDATE organizations SET
       name = COALESCE(?, name), ein = COALESCE(?, ein), address = COALESCE(?, address),
       contact_email = COALESCE(?, contact_email), point_of_contact = COALESCE(?, point_of_contact)
     WHERE id = ?`
  ).run(
    name ? name.trim() : null,
    ein ? normalizeEin(ein) : null,
    address ? address.trim() : null,
    contactEmail ? contactEmail.trim().toLowerCase() : null,
    pointOfContact ? pointOfContact.trim() : null,
    org.id
  );
  const updated = db.prepare("SELECT * FROM organizations WHERE id = ?").get(org.id);
  res.json({ organization: orgWithRole(updated, req.user.id) });
});

// The shared contract directory — every contract created under this
// organization, from any member, not just the ones the caller happens to
// own. Any member can see the full directory; edit rights still follow
// resolveAccess() in routes/contracts.js when they open one.
router.get("/:id/contracts", (req, res) => {
  const org = db.prepare("SELECT * FROM organizations WHERE id = ?").get(req.params.id);
  if (!org) return res.status(404).json({ error: "Organization not found." });
  try {
    requireMembership(org.id, req.user.id);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const { status, genre, state } = req.query;
  const clauses = ["c.organization_id = @orgId"];
  const params = { orgId: org.id };
  if (status && status !== "All") {
    clauses.push("c.status = @status");
    params.status = status;
  }
  if (genre && genre !== "All") {
    clauses.push("c.genre = @genre");
    params.genre = genre;
  }
  if (state && state !== "All") {
    clauses.push("c.state = @state");
    params.state = state;
  }

  const rows = db
    .prepare(
      `SELECT c.*, u.name as owner_name FROM contracts c
       JOIN users u ON u.id = c.owner_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY c.updated_at DESC`
    )
    .all(params);
  const withParties = rows.map((c) => ({
    ...c,
    parties: db.prepare("SELECT id, name, email, role, signed_at FROM contract_parties WHERE contract_id = ?").all(c.id),
  }));
  res.json({ contracts: withParties });
});

// Members — invite an existing Pact profile by email, same "must already
// have an account" rule as per-contract sharing. owner/admin only; only an
// owner can grant the admin role (an admin can only add plain members).
router.post("/:id/members", requireMfaForOrgAdmin, (req, res) => {
  const org = db.prepare("SELECT * FROM organizations WHERE id = ?").get(req.params.id);
  if (!org) return res.status(404).json({ error: "Organization not found." });
  let membership;
  try {
    membership = requireMembership(org.id, req.user.id, ["owner", "admin"]);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const { email, role } = req.body || {};
  const chosenRole = ["admin", "member"].includes(role) ? role : "member";
  if (chosenRole === "admin" && membership.role !== "owner") {
    return res.status(403).json({ error: "Only the owner can grant the admin role." });
  }
  if (!email) return res.status(400).json({ error: "Email is required." });

  const target = db.prepare("SELECT * FROM users WHERE email = ? AND account_status = 'active'").get(email.trim().toLowerCase());
  if (!target) {
    return res.status(404).json({ error: "No Pact account found for that email — they'll need to create one first." });
  }
  if (getMembership(org.id, target.id)) {
    return res.status(409).json({ error: `${target.name} is already a member.` });
  }

  db.prepare("INSERT INTO organization_members (organization_id, user_id, role) VALUES (?, ?, ?)").run(
    org.id,
    target.id,
    chosenRole
  );
  res.status(201).json({ ok: true });
});

router.put("/:id/members/:memberId", requireMfaForOrgAdmin, (req, res) => {
  const org = db.prepare("SELECT * FROM organizations WHERE id = ?").get(req.params.id);
  if (!org) return res.status(404).json({ error: "Organization not found." });
  try {
    requireMembership(org.id, req.user.id, ["owner"]);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
  const target = db
    .prepare("SELECT * FROM organization_members WHERE id = ? AND organization_id = ?")
    .get(req.params.memberId, org.id);
  if (!target) return res.status(404).json({ error: "Member not found." });

  const { role } = req.body || {};
  if (!["admin", "member"].includes(role)) {
    // Promoting TO owner never happens here — see POST /:id/transfer-
    // ownership, which requires the recipient's own password+MFA to
    // accept, not just the current owner's say-so (spec 1.4 #4).
    return res.status(400).json({ error: "role must be 'admin' or 'member' — to make someone the owner, use Transfer Ownership instead." });
  }
  if (target.role === "owner") {
    const otherOwners = db
      .prepare("SELECT COUNT(*) as n FROM organization_members WHERE organization_id = ? AND role = 'owner' AND id != ?")
      .get(org.id, target.id).n;
    if (otherOwners === 0) {
      return res.status(400).json({ error: "An organization needs at least one owner — promote someone else first." });
    }
  }
  db.prepare("UPDATE organization_members SET role = ? WHERE id = ?").run(role, target.id);
  res.json({ ok: true });
});

// Phase 8 fix: removing a member is as much "role management" as the
// POST (invite) and PUT (change role) routes above, both of which
// already require MFA on a paid-tier admin's account — this route had
// been left off that gate.
router.delete("/:id/members/:memberId", requireMfaForOrgAdmin, (req, res) => {
  const org = db.prepare("SELECT * FROM organizations WHERE id = ?").get(req.params.id);
  if (!org) return res.status(404).json({ error: "Organization not found." });
  try {
    requireMembership(org.id, req.user.id, ["owner", "admin"]);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
  const target = db
    .prepare("SELECT * FROM organization_members WHERE id = ? AND organization_id = ?")
    .get(req.params.memberId, org.id);
  if (!target) return res.status(404).json({ error: "Member not found." });

  if (target.role === "owner") {
    const otherOwners = db
      .prepare("SELECT COUNT(*) as n FROM organization_members WHERE organization_id = ? AND role = 'owner' AND id != ?")
      .get(org.id, target.id).n;
    if (otherOwners === 0) {
      return res.status(400).json({ error: "Can't remove the only owner — promote someone else first." });
    }
  }

  db.prepare("DELETE FROM organization_members WHERE id = ?").run(target.id);
  res.json({ ok: true });
});

function getOpenTransfer(organizationId) {
  return db
    .prepare("SELECT * FROM org_ownership_transfers WHERE organization_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1")
    .get(organizationId);
}

// "Transfer account ownership (requires password + MFA of both owner
// and recipient)" (spec 1.4 #4) — a two-step handshake, not a
// unilateral role change: requireRecentAuth here proves the current
// owner's password+MFA; the /accept route below separately requires
// the SAME of the recipient, on their own session, before anything
// actually changes. The target must already be a member — this
// transfers ownership of an existing seat, it doesn't invite someone new.
router.post("/:id/transfer-ownership", requireRecentAuth, (req, res) => {
  const org = db.prepare("SELECT * FROM organizations WHERE id = ?").get(req.params.id);
  if (!org) return res.status(404).json({ error: "Organization not found." });
  try {
    requireMembership(org.id, req.user.id, ["owner"]);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
  const { memberId } = req.body || {};
  const target = db.prepare("SELECT * FROM organization_members WHERE id = ? AND organization_id = ?").get(memberId, org.id);
  if (!target) return res.status(404).json({ error: "Member not found." });
  if (target.user_id === req.user.id) return res.status(400).json({ error: "You're already the owner." });

  if (getOpenTransfer(org.id)) {
    return res.status(409).json({ error: "A transfer is already pending for this organization — cancel it first." });
  }
  const targetUser = db.prepare("SELECT * FROM users WHERE id = ?").get(target.user_id);
  db.prepare("INSERT INTO org_ownership_transfers (organization_id, from_user_id, to_user_id) VALUES (?, ?, ?)").run(
    org.id,
    req.user.id,
    target.user_id
  );
  logAccountAudit({ userId: req.user.id, action: "org_ownership_transfer_requested", result: "success", detail: `${org.name} -> ${targetUser.email}`, ip: clientIp(req), userAgent: req.headers["user-agent"] });
  sendMail({
    to: targetUser.email,
    subject: `${req.user.name} wants to transfer ownership of "${org.name}" to you`,
    text: `${req.user.name} wants to make you the owner of "${org.name}" on Pact. Log in and confirm from Settings → Business to accept — you'll need to re-enter your password${targetUser.mfa_enabled ? " and verification code" : ""}.`,
  });
  res.json({ ok: true });
});

router.get("/:id/transfer-ownership", (req, res) => {
  const org = db.prepare("SELECT * FROM organizations WHERE id = ?").get(req.params.id);
  if (!org) return res.status(404).json({ error: "Organization not found." });
  try {
    requireMembership(org.id, req.user.id, ["owner", "admin", "member"]);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
  const transfer = getOpenTransfer(org.id);
  if (!transfer) return res.json({ transfer: null });
  const toUser = db.prepare("SELECT name, email FROM users WHERE id = ?").get(transfer.to_user_id);
  res.json({ transfer: { id: transfer.id, toName: toUser.name, toEmail: toUser.email, requestedAt: transfer.requested_at, isRecipient: transfer.to_user_id === req.user.id } });
});

router.post("/:id/transfer-ownership/accept", requireRecentAuth, (req, res) => {
  const org = db.prepare("SELECT * FROM organizations WHERE id = ?").get(req.params.id);
  if (!org) return res.status(404).json({ error: "Organization not found." });
  const transfer = getOpenTransfer(org.id);
  if (!transfer || transfer.to_user_id !== req.user.id) {
    return res.status(404).json({ error: "No pending ownership transfer to you for this organization." });
  }

  db.prepare("UPDATE organization_members SET role = 'owner' WHERE organization_id = ? AND user_id = ?").run(org.id, transfer.to_user_id);
  db.prepare("UPDATE organization_members SET role = 'admin' WHERE organization_id = ? AND user_id = ?").run(org.id, transfer.from_user_id);
  db.prepare("UPDATE org_ownership_transfers SET status = 'accepted', accepted_at = datetime('now') WHERE id = ?").run(transfer.id);

  const fromUser = db.prepare("SELECT name, email FROM users WHERE id = ?").get(transfer.from_user_id);
  logAccountAudit({ userId: req.user.id, action: "org_ownership_transfer_accepted", result: "success", detail: `${org.name} from ${fromUser.email}`, ip: clientIp(req), userAgent: req.headers["user-agent"] });
  sendMail({ to: fromUser.email, subject: `Ownership of "${org.name}" transferred`, text: `${req.user.name} accepted ownership of "${org.name}". You're now an admin on it.` });
  res.json({ ok: true });
});

router.post("/:id/transfer-ownership/cancel", (req, res) => {
  const org = db.prepare("SELECT * FROM organizations WHERE id = ?").get(req.params.id);
  if (!org) return res.status(404).json({ error: "Organization not found." });
  const transfer = getOpenTransfer(org.id);
  if (!transfer || transfer.from_user_id !== req.user.id) {
    return res.status(404).json({ error: "No pending ownership transfer from you for this organization." });
  }
  db.prepare("UPDATE org_ownership_transfers SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?").run(transfer.id);
  res.json({ ok: true });
});

module.exports = router;
