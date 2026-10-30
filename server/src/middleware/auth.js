const db = require("../db");
const { verifyToken, signToken, COOKIE_OPTS } = require("../auth-utils");
const { getActiveSession, touchSession, createSession } = require("../services/sessions");

function attachUser(req, res, next) {
  const token = req.cookies && req.cookies.pact_token;
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      const user = db
        .prepare(
          "SELECT id, name, email, tier, tier_expires_at, account_type, legal_first_name, legal_last_name, date_of_birth, created_at, temp_password_expires_at, account_status, mfa_enabled FROM users WHERE id = ?"
        )
        .get(payload.sub);
      // A closed account's token can still be cryptographically valid (JWTs
      // aren't revoked on close, they're stateless) — this per-request DB
      // check is what actually invalidates every existing session the
      // instant an account closes, without needing a separate token
      // blacklist. req.user simply never gets attached, same as being
      // logged out, so every requireAuth route rejects it automatically.
      // A token can fail to resolve to a live session two different ways,
      // and they must NOT be treated the same:
      //   - no `sid` claim at all: a cookie issued before sessions
      //     existed. Safe to quietly mint a session for it now and keep
      //     the browser logged in — nothing was ever revoked.
      //   - a `sid` claim that no longer resolves to an active session
      //     (logout, "sign out everywhere," or account closure revoked
      //     it): this token was deliberately invalidated. Minting a new
      //     session here would silently undo that revocation, so this
      //     case falls straight through to "not logged in" instead.
      let sessionId = null;
      if (payload.sid) {
        if (getActiveSession(payload.sid)) {
          sessionId = payload.sid;
          touchSession(sessionId);
        }
      } else if (user && user.account_status === "active") {
        sessionId = createSession({
          userId: user.id,
          ip: (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress,
          userAgent: req.headers["user-agent"],
        });
        res.cookie("pact_token", signToken(user, sessionId), COOKIE_OPTS);
      }

      if (user && user.account_status === "active" && sessionId) {
        req.sessionId = sessionId;

        req.user = {
          id: user.id,
          name: user.name,
          email: user.email,
          tier: user.tier,
          tierExpiresAt: user.tier_expires_at,
          accountType: user.account_type,
          legalFirstName: user.legal_first_name,
          legalLastName: user.legal_last_name,
          dateOfBirth: user.date_of_birth,
          created_at: user.created_at,
          passwordIsTemporary: !!user.temp_password_expires_at,
          mfaEnabled: !!user.mfa_enabled,
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
