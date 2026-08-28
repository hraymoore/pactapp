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

module.exports = { isValidEinFormat, normalizeEin, getMembership, requireMembership };
