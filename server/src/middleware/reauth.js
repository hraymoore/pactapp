const { hasRecentReauth } = require("../services/sessions");

// The "recent authentication" gate (spec 1.3) — a step-up check layered on
// top of requireAuth, not a replacement for it. A sensitive route gets
// both: router.post("/x", requireAuth, requireRecentAuth, handler).
//
// This does NOT itself write to account_audit_log: being asked to step up
// isn't an attempt at the sensitive action, it's a precondition that
// hasn't been met yet. The actual reauth challenge (POST /api/auth/
// reauth) logs its own success/failure, and each gated route logs the
// outcome of the action it protects.
function requireRecentAuth(req, res, next) {
  if (!req.sessionId || !hasRecentReauth(req.sessionId)) {
    return res.status(403).json({
      error: "Re-enter your password to continue — this confirms it's really you for a sensitive action.",
      needsReauth: true,
    });
  }
  next();
}

module.exports = { requireRecentAuth };
