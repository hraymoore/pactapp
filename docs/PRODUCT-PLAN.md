# Pact — Product Plan

Pact is a contract lifecycle platform: create, edit, sign and track agreements
in one profile-gated place, with AI assistance on the top two subscription
tiers. This document is the working plan behind `/website` — what's built as
a front-end preview today, what's intentionally a placeholder ("ghost") until
a real backend and third-party integrations exist, and where the mobile app
and integrations are headed.

## 1. What exists right now

`/website` is a static, dependency-free HTML/CSS/JS front end that is fully
navigable and demonstrates the entire product experience:

- Marketing site: Home, About, Pricing, Templates, Security & AI, Contact
- Profile creation / login (mock, stored in `localStorage` on-device only)
- A gated dashboard: contract list, an in-browser editor, download/send
  actions, a Pact AI panel (gated by tier), and a time-stamped audit trail
- A 39-template catalog spanning 12 business genres (`js/templates-data.js`)

Nothing here calls a real server. It's built so the UX, information
architecture, gating logic and visual system are all final — swapping the
mock `PactAuth` object and contract store for real API calls is the only
thing standing between this and a production app.

## 2. The "ghost" backend — what has to be built next

These are real services this preview intentionally stubs out:

| Capability | Current state | Real implementation needed |
|---|---|---|
| Identity / auth | `localStorage` mock in `js/app.js` | Real auth service (e.g. email+password with hashed storage, OAuth, or a managed provider like Auth0/Clerk/Supabase Auth) with session tokens, not client-side trust |
| Contract storage | `localStorage` mock array | Relational DB (contracts, versions, parties, signatures) + object storage for rendered PDFs |
| e-Signature | `alert()` stub in dashboard | Integration with a compliant e-signature API — **Adobe Acrobat Sign API** or **DocuSign API** are the leading candidates; both support embedded signing, audit certificates, and webhook events for "signed" state |
| Editing engine | `contenteditable` div | A real rich-text/clause editor (e.g. ProseMirror/Tiptap) with clause library, redlining, and version diffing |
| Time-stamped audit trail | `localStorage` array, client-generated timestamps | Server-generated, tamper-evident event log (append-only table or ledger) keyed off signature-completion webhooks from the e-signature provider — client timestamps are never trustworthy for this |
| AI drafting/editing/analysis | `alert()`-style canned response | Claude API (Anthropic) for drafting, clause suggestion, redline explanation and contract analysis/risk-flagging, called server-side with the contract text as context |
| Billing / subscriptions | Tier stored in mock profile | Stripe Billing (or similar) for the 4 subscription tiers, webhook-driven tier updates |
| Payments compliance | N/A | PCI scope stays with Stripe (or provider) — never touch raw card data directly |

**Design principle carried through the front end:** the moment a contract is
signed by both parties, it becomes read-mostly. Any edit after that point
must be captured as a *new, additive, time-stamped event* attributed to a
profile — never a silent overwrite of the executed text. That's why the
dashboard demo pushes to an audit log instead of mutating history.

## 3. Mobile app plan

Web ships first; native mobile is the next milestone.

- **Framework:** React Native (Expo) — lets the mobile team share types,
  validation and the clause/template data model with the web client, while
  still shipping true native apps to the App Store and Google Play.
- **Phase 1 (view + sign):** profile login, contract list, read-only view,
  and signing via the same e-signature integration as web (deep link into
  the provider's native/embedded signing flow).
- **Phase 2 (edit + notify):** full editor, push notifications for
  "awaiting your signature" and "contract amended," biometric login.
- **Phase 3 (AI on the go):** Pact AI drafting and contract analysis for
  Professional/Enterprise mobile users, offline draft caching.

## 4. Tier structure (as implemented in `pricing.html` / `signup.html`)

| Tier | Price | Core value |
|---|---|---|
| Starter | $7.99/mo | Core templates, view/download/send, capped e-signatures |
| Everyday | $11.99/mo | Full editor, unlimited e-signature, time-stamped change history |
| Professional | $20.99/mo | Everything in Everyday + Pact AI drafting, clause suggestions, risk flagging |
| Enterprise | $89.99/mo | Everything in Professional + portfolio-wide AI review, API access, SLA, white-label |

Pricing was set relative to comparable contract/e-signature tools (DocuSign,
PandaDoc, HelloSign personal-to-team tiers generally run $10–$65/mo per
seat, with enterprise plans quoted well above that) — Pact's tiers undercut
entry pricing while reserving AI for the two upper tiers to keep the entry
price accessible.

## 5. Visual identity

Palette: **Obsidian** (near-black ground), **Silver/Paper** (light surfaces
and body text on dark), **Gold** (primary accent — CTAs, highlights),
**Ruby** (AI + urgency accent), **Emerald** (success/signed-state accent).
Contrast rule enforced throughout `css/style.css`: dark backgrounds always
pair with silver/paper text, light backgrounds always pair with ink-dark
text; gold/ruby/emerald are used only as accents, never as body copy on a
background that would fail contrast.

## 6. Suggested build order for the real backend

1. Auth + profile service (replace `PactAuth`)
2. Contract data model + storage (replace `localStorage` contract mock)
3. e-Signature provider integration (Adobe Acrobat Sign or DocuSign) +
   webhook-driven audit trail
4. Billing (Stripe) wired to the 4 tiers
5. Claude API integration for Pact AI (drafting, clause suggestions, risk
   analysis) gated to Professional/Enterprise
6. React Native mobile app, Phase 1
