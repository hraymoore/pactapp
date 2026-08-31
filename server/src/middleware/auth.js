const db = require("../db");
const { verifyToken } = require("../auth-utils");

function attachUser(req, res, next) {
  const token = req.cookies && req.cookies.pact_token;
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      const user = db
        .prepare(
          "SELECT id, name, email, tier, account_type, legal_first_name, legal_last_name, date_of_birth, created_at, temp_password_expires_at FROM users WHERE id = ?"
        )
        .get(payload.sub);
      if (user) {
        req.user = {
          id: user.id,
          name: user.name,
          email: user.email,
          tier: user.tier,
          accountType: user.account_type,
          legalFirstName: user.legal_first_name,
          legalLastName: user.legal_last_name,
          dateOfBirth: user.date_of_birth,
          created_at: user.created_at,
          passwordIsTemporary: !!user.temp_password_expires_at,
        };
      }
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Log in required." });
  next();
}

function requireTier(tiers) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Log in required." });
    if (!tiers.includes(req.user.tier)) {
      return res.status(403).json({
        error: `This feature requires the ${tiers.join(" or ")} tier.`,
        requiredTiers: tiers,
        currentTier: req.user.tier,
      });
    }
    next();
  };
}

module.exports = { attachUser, requireAuth, requireTier };
