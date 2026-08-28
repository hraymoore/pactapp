// Deterministic, rule-based "does this contract have the clauses most
// contracts of any kind need" check — no AI call, no ANTHROPIC_API_KEY
// required, works the same whether or not Pact AI is configured. This is
// a structural smoke test, not a legal review: it flags an ABSENT keyword
// pattern, it can't tell you a present clause is actually well-drafted.
const CLAUSE_CHECKS = [
  {
    key: "termination",
    label: "Termination",
    pattern: /\b(terminat(e|es|ed|ion)|cancel(l)?ation)\b/i,
    hint: "How either party can end this agreement, and on what notice.",
  },
  {
    key: "payment",
    label: "Payment terms",
    pattern: /\b(payment|fee|compensation|invoice|\$|price)\b/i,
    hint: "Amount, schedule, and method of payment.",
  },
  {
    key: "governing_law",
    label: "Governing law",
    pattern: /\bgoverned by the laws of\b|\bgoverning law\b/i,
    hint: "Which state's law applies if there's a dispute.",
  },
  {
    key: "confidentiality",
    label: "Confidentiality",
    pattern: /\bconfidential(ity)?\b|\bnon-disclosure\b/i,
    hint: "Whether either party must keep the other's information private.",
  },
  {
    key: "dispute_resolution",
    label: "Dispute resolution",
    pattern: /\b(dispute|arbitration|mediation|litigation)\b/i,
    hint: "How disagreements get resolved (court, arbitration, mediation).",
  },
  {
    key: "liability",
    label: "Liability / indemnification",
    pattern: /\b(liab(le|ility)|indemnif(y|ication)|hold harmless)\b/i,
    hint: "Who's on the hook if something goes wrong.",
  },
];

function computeHealthScore(body) {
  const text = String(body || "");
  const results = CLAUSE_CHECKS.map((check) => ({
    key: check.key,
    label: check.label,
    hint: check.hint,
    present: check.pattern.test(text),
  }));
  const present = results.filter((r) => r.present);
  const missing = results.filter((r) => !r.present);
  return {
    score: present.length,
    total: results.length,
    checks: results,
    missing: missing.map((r) => r.label),
  };
}

module.exports = { computeHealthScore };
