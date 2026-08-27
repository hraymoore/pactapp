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
seeded (62 templates) automatically on first boot via Node's built-in
`node:sqlite` — no database server, no native build step.

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
- **Templates** — 62 templates across 18 genres, tier-gated at creation time, searchable by name/genre/description/keywords
- **Upload & attachments** — bring your own document (PDF/Word/text/image) as a contract instead of a template, plus supporting attachments on any contract
- **Sharing** — the owner can grant another existing Pact profile view or edit access to one specific contract
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

## Stripe webhooks locally

`STRIPE_SECRET_KEY` alone is enough to test Checkout and Identity in
"direct/polling" mode. For real-time webhook-driven updates (subscription
changes, verification results) instead of the client-side polling fallback,
run the Stripe CLI against your local server:

```
stripe listen --forward-to localhost:4000/api/billing/webhook
stripe listen --forward-to localhost:4000/api/identity/webhook
```

and put the CLI's printed signing secret in `STRIPE_WEBHOOK_SECRET`.

## Project layout

```
server/
  src/
    index.js              # Express app, mounts routes, serves /website
    db.js                 # node:sqlite schema
    seed-templates.js      # 62-template catalog
    auth-utils.js           # bcrypt + JWT helpers
    middleware/auth.js       # attachUser / requireAuth / requireTier
    routes/                  # auth, templates, contracts, sign, ai, billing, identity, purchases
    services/                # pdf, signing, contract-factory, uploads, purchases, ai-provider, billing-provider, identity-provider, mailer
```
