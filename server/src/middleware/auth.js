const db = require("../db");
const { verifyToken } = require("../auth-utils");

function attachUser(req, res, next) {
  const token = req.cookies && req.cookies.pact_token;
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      const user = db.prepare("SELECT id, name, email, tier, created_at FROM users WHERE id = ?").get(payload.sub);
      if (user) req.user = user;
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
