# Pact — Server

The real backend behind `/website`: authentication, contract storage, a
native e-signature flow, a server-enforced time-stamped audit trail, PDF
export, and pluggable AI / billing / identity / email integrations.

## Run it

```
cd server
npm install
cp .env.example .env   # fill in whatever keys you have — see below
npm start
```

Then open **http://localhost:4000** — that's the whole app. The server
serves `/website` directly (`express.static`) and mounts the API under
`/api/*`, so there's nothing separate to deploy.

Storage is a single SQLite file at `server/data/pact.sqlite`, created and
seeded (72 templates) automatically on first boot via Node's built-in
`node:sqlite` — no database server, no native build step.

## Guardrails (always on, no key required)

- A **persistent "not legal advice" disclaimer** on the contract editor, the
  Pact AI chat panel, `sign.html`, and both PDF exports.
- **Family Law drafting is hard-blocked**, not just discouraged: `routes/ai.js`
  checks `contracts.ai_restricted` (inherited from the template) or a
  divorce/custody keyword heuristic on freeform requests
  (`services/ai-guardrails.js`) **before** calling the model, and returns a
  fixed, deterministic redirect to the informational template instead —
  this works even with no `ANTHROPIC_API_KEY` set.
- **Every AI call is logged**, successful or blocked, to `ai_audit_log`
  (`GET /api/ai/audit`), and mirrored into the relevant contract's own
  `audit_log` when one is scoped to the call.
- **No raw SSN/EIN storage**, in testing or production — see Identity
  verification below.

## What's real right now (no keys required)

- **Auth** — bcrypt-hashed passwords, JWT session cookies (`server/src/auth-utils.js`); accounts lock
  after 7 failed login attempts, and `POST /api/auth/forgot-password` issues a 30-minute temporary
  password (emailed via `services/mailer.js`, or returned directly in the response when SMTP isn't
  configured, for local testing) that also clears a lockout — see `website/forgot-password.html` and
  `POST /api/auth/change-password`
- **Pact AI chat** — `POST /api/ai/chat` (Professional/Enterprise tiers) is a real multi-turn conversation,
  optionally scoped to one contract for context, that can draft, revise (with a one-click "apply to
  contract" action in the dashboard), and summarize contracts at whatever reading level/audience the user
  asks for — see `services/ai-provider.js`'s `chatWithAI`
- **Contracts** — real CRUD, scoped to the logged-in profile or named parties
- **State-based contract engine** — every contract picks a governing state at
  creation (`server/src/us-states.js`); Arkansas and Texas have deep,
  hand-written templates across 3 categories, every other state gets the
  generic templates with the governing-law clause auto-filled to that state
  (`applyGoverningLaw` in `services/contract-factory.js`) — see
  `GET /api/templates?state=`, `GET /api/templates/states`
- **Templates** — 72 templates across 20 genres, tier-gated at creation time, searchable by name/genre/description/keywords
- **Upload & attachments** — bring your own document (PDF/Word/text/image) as a contract instead of a template, plus supporting attachments on any contract
- **Sharing** — the owner can grant another existing Pact profile view or edit access to one specific contract
- **Business accounts** — `routes/organizations.js`: create a business (name + optional, self-reported
  EIN), invite existing Pact profiles as admin/member, and every contract created under it lands in one
  shared directory (`GET /api/organizations/:id/contracts`) every member can browse. `resolveAccess()` in
  `routes/contracts.js` grants owners/admins edit on any org contract, members edit only their own and view
  the rest.
- **e-Signature** — Pact's own token-based flow (`routes/sign.js` for outside
  counterparties, `POST /api/contracts/:id/sign` for the logged-in owner).
  Typed name + timestamp + IP recorded per signer; once every party has
  signed, the contract is locked (`status = 'signed'`) and every subsequent
  edit becomes a server-timestamped **amendment** in `audit_log`, not a
  silent overwrite — see `services/signing.js` and the `PUT /api/contracts/:id`
  handler.
- **PDF export** — real, generated per request with `pdf-lib`
  (`services/pdf.js`), including the signature block and full audit trail.

## What needs a key to go live

Every integration below fails closed with a clear message (never a fake
canned response) until its key is set in `.env`:

| Integration | Env var(s) | Behavior without it |
|---|---|---|
| Pact AI (draft/analyze) | `ANTHROPIC_API_KEY` | `501` — "Pact AI is not connected yet" |
| Billing (Stripe Checkout) | `STRIPE_SECRET_KEY` | Tier is applied directly, no payment collected |
| Identity verification | `STRIPE_SECRET_KEY` (+ `STRIPE_IDENTITY_ENABLED`) | `501` — "Identity verification is not connected yet" |
| Email (signing invitations) | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | Signing link is returned in the API response to share manually |

**Identity verification is deliberately routed through Stripe Identity
rather than built in-house.** Pact never collects or stores a government ID
image, selfie, or SSN itself — that data carries real compliance weight
(GLBA/FCRA-type obligations, state biometric-privacy laws, breach-notice
exposure). Stripe Identity's hosted flow captures and holds that data;
Pact's `identity_verifications` table only stores a status
(`pending`/`verified`/`failed`) and the verified name. See
`services/identity-provider.js` for the swap points if you'd rather use
Persona, Onfido, Plaid Identity Verification, or Jumio — they follow the
same "create a session, redirect, receive a webhook" shape.

## Stripe billing details worth knowing

- **One Customer per profile.** `getOrCreateCustomer` in `services/billing-provider.js`
  creates a Stripe Customer once (stored as `users.stripe_customer_id`) and reuses it for
  every checkout — required for the billing portal below and for upgrades/downgrades to
  work correctly.
- **Changing tier updates the existing subscription in place** (with proration) instead of
  starting a second one, as long as the webhook has told Pact about the first subscription
  (see below) — so `STRIPE_WEBHOOK_SECRET` isn't optional in any environment where users
  might actually upgrade or downgrade.
- **`POST /api/billing/portal`** opens Stripe's hosted Customer Portal (update card, view
  invoices, self-serve cancel) for the logged-in user's stored customer — enable it once at
  https://dashboard.stripe.com/settings/billing/portal (test mode has its own toggle) or
  Stripe returns a "no configuration" error.
- **Cancellations sync back automatically**: the webhook listens for
  `customer.subscription.deleted` and downgrades the user to `starter` — without this,
  someone who cancels (via the portal or the Stripe dashboard) would keep their paid tier
  in Pact forever.
- **Webhook delivery is idempotent**: `purchases.stripe_session_id` is `UNIQUE`, and the
  webhook handler treats a duplicate `checkout.session.completed` delivery (Stripe does
  retry) as an already-fulfilled no-op rather than erroring.

## Stripe webhooks locally

`STRIPE_SECRET_KEY` alone is enough to test Checkout and Identity in
"direct/polling" mode. For real-time webhook-driven updates (subscription
changes, verification results) instead of the client-side polling fallback,
run the Stripe CLI against your local server:

```
stripe listen --forward-to localhost:4000/api/billing/webhook \
  --events checkout.session.completed,customer.subscription.updated,customer.subscription.deleted
stripe listen --forward-to localhost:4000/api/identity/webhook
```

and put the CLI's printed signing secret in `STRIPE_WEBHOOK_SECRET`. In production, add the
same three event types (plus whatever Identity needs) to the webhook endpoint you configure
in the Stripe Dashboard at https://dashboard.stripe.com/webhooks.

## Project layout

```
server/
  src/
    index.js              # Express app, mounts routes, serves /website
    db.js                 # node:sqlite schema
    seed-templates.js      # 72-template catalog
    us-states.js             # canonical state list for the state engine
    auth-utils.js           # bcrypt + JWT helpers
    middleware/auth.js       # attachUser / requireAuth / requireTier
    routes/                  # auth, templates, contracts, sign, ai, billing, identity, purchases, organizations
    services/                # pdf, signing, contract-factory, uploads, purchases, ai-provider, ai-guardrails, billing-provider, identity-provider, mailer, organizations
```
