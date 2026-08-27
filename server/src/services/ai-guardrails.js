const db = require("../db");
const { logAudit } = require("./signing");

const MAX_SUMMARY_LEN = 2000;

function truncate(text) {
  const s = String(text || "");
  return s.length > MAX_SUMMARY_LEN ? s.slice(0, MAX_SUMMARY_LEN) + "…" : s;
}

// Durable, user-indexed record of every AI draft/analyze/chat call — the
// audit trail the guardrails require, independent of any one contract's
// own audit_log (a freeform draft has no contract yet when it happens).
// When the call is scoped to a contract, it's also mirrored into that
// contract's own audit_log so it shows up in the existing Audit Trail tab.
function logAiInteraction({ userId, contractId, type, input, output, blocked = false }) {
  db.prepare(
    `INSERT INTO ai_audit_log (user_id, contract_id, interaction_type, blocked, input_summary, output_summary)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(userId, contractId || null, type, blocked ? 1 : 0, truncate(input), truncate(output));

  if (contractId) {
    const user = db.prepare("SELECT name, email FROM users WHERE id = ?").get(userId);
    logAudit(
      contractId,
      user,
      blocked ? "ai_blocked" : "ai_suggestion",
      `Pact AI ${type}${blocked ? " (blocked — restricted category)" : ""}: ${truncate(input).slice(0, 200)}`
    );
  }
}

// Keyword heuristic for freeform requests with no contract context yet
// (e.g. "draft me a divorce settlement") — a hard, deterministic guardrail
// that doesn't depend on the model choosing to refuse. Contract-scoped
// requests are blocked via templates.ai_restricted / contracts.ai_restricted
// instead, which is more reliable than keyword-matching.
const RESTRICTED_KEYWORDS =
  /\b(divorce|marital settlement|child custody|custody agreement|custody arrangement|alimony|visitation schedule|separation agreement|annulment)\b/i;

function isRestrictedRequest(text) {
  return RESTRICTED_KEYWORDS.test(String(text || ""));
}

const RESTRICTED_RESPONSE =
  "Pact AI doesn't draft or suggest terms for divorce, custody, or other family-law matters — these are court " +
  "proceedings with state- and county-specific requirements where a wrong term can have real consequences. " +
  "Instead, open the Family Law category in Templates for an informational overview, and consult a licensed " +
  "family-law attorney or your local court's self-help resources for what your situation actually requires.\n\n" +
  "This is not legal advice.";

module.exports = { logAiInteraction, isRestrictedRequest, RESTRICTED_RESPONSE };
