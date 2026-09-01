/* Single source of truth for Pact's sub-processor list — the vendors that
   process user data on Pact's behalf. Privacy Policy Section 4 and the
   Security page both render their sub-processor list from this same array
   at runtime instead of keeping two hand-maintained copies in sync. */
const PACT_SUB_PROCESSORS = [
  {
    name: "Stripe",
    purpose:
      "Payment processing, subscription billing, and (if you use it) identity verification. Stripe receives and stores your payment details and, for identity verification, your government-issued identification, photograph, or Social Security Number directly — Pact never receives or stores that data itself, only Stripe's verification result.",
  },
  {
    name: "Anthropic",
    purpose:
      "If you're on a tier with Pact AI and you use it, your prompt (and the contract text you're asking about, if any) is sent to Anthropic's API to generate a response. This only happens when you actively use an AI feature.",
  },
  {
    name: "Email delivery",
    purpose:
      "Transactional email only (password resets, signing-link notifications, attorney-review confirmations), sent via [SMTP/EMAIL PROVIDER NAME — not yet finalized]. No marketing email is sent.",
  },
];

function renderSubProcessorList(el) {
  if (!el) return;
  el.innerHTML = PACT_SUB_PROCESSORS.map(
    (p) => `<li><strong>${p.name}</strong> — ${p.purpose}</li>`
  ).join("");
}
