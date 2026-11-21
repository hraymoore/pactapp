const db = require("../db");

// Format-only validation (XX-XXXXXXX, 9 digits) — self-reported, never
// checked against the IRS or any registry. There's no free third-party
// EIN/KYB verification API; see server/README.md for the paid vendors
// (Persona, Middesk) that would slot in here the same way Stripe Identity
// slots into identity-provider.js, if this business ever pays for one.
const EIN_FORMAT = /^\d{2}-?\d{7}$/;

function isValidEinFormat(ein) {
  return EIN_FORMAT.test(String(ein || "").trim());
}

function normalizeEin(ein) {
  const digits = String(ein || "").replace(/\D/g, "");
  return digits.length === 9 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : ein;
}

function getMembership(organizationId, userId) {
  return db
    .prepare("SELECT * FROM organization_members WHERE organization_id = ? AND user_id = ?")
    .get(organizationId, userId);
}

function requireMembership(organizationId, userId, roles) {
  const membership = getMembership(organizationId, userId);
  if (!membership) {
    const err = new Error("You are not a member of this organization.");
    err.status = 403;
    throw err;
  }
  if (roles && !roles.includes(membership.role)) {
    const err = new Error(`This action requires the ${roles.join(" or ")} role.`);
    err.status = 403;
    throw err;
  }
  return membership;
}

// Enterprise-tier businesses get the owner party on their contracts
// branded as "Legal Name on behalf of Business Name" rather than just one
// or the other — this is an Enterprise-only distinction (the pricing page
// draws the same line for unlimited seats); Professional and below, which
// also support team members, keep the plain account name. Returns null
// when the tier/account conditions aren't met, so callers can fall back
// to the plain name unchanged.
function businessPartyLabel(userId, organizationId) {
  const user = db
    .prepare("SELECT id, name, account_type, legal_first_name, legal_last_name FROM users WHERE id = ?")
    .get(userId);
  if (!user) return null;

  let org;
  if (user.account_type === "business") {
    // A business account always owns exactly one organization, created at
    // signup — use it even when the contract wasn't explicitly tied to an
    // organizationId, since there's nothing ambiguous to resolve.
    org = db.prepare("SELECT * FROM organizations WHERE owner_user_id = ?").get(user.id);
  } else if (organizationId) {
    org = db.prepare("SELECT * FROM organizations WHERE id = ?").get(organizationId);
  }
  if (!org) return null;

  const owner = db.prepare("SELECT tier FROM users WHERE id = ?").get(org.owner_user_id);
  if (!owner || owner.tier !== "business") return null;

  const legalName =
    user.account_type === "business"
      ? org.point_of_contact || user.name
      : user.legal_first_name && user.legal_last_name
      ? `${user.legal_first_name} ${user.legal_last_name}`
      : user.name;

  return `${legalName} on behalf of ${org.name}`;
}

module.exports = { isValidEinFormat, normalizeEin, getMembership, requireMembership, businessPartyLabel };
