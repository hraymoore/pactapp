const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { isValidEinFormat, normalizeEin, getMembership, requireMembership } = require("../services/organizations");
const { logAudit } = require("../services/signing");

router.use(express.json());
router.use(requireAuth);

function orgWithRole(org, userId) {
  const membership = getMembership(org.id, userId);
  return { ...org, myRole: membership ? membership.role : null };
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
router.post("/:id/members", (req, res) => {
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

  const target = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase());
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

router.put("/:id/members/:memberId", (req, res) => {
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
  if (!["owner", "admin", "member"].includes(role)) {
    return res.status(400).json({ error: "role must be 'owner', 'admin' or 'member'." });
  }
  if (target.role === "owner" && role !== "owner") {
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

router.delete("/:id/members/:memberId", (req, res) => {
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

module.exports = router;
