# Pact

A contract lifecycle platform — create, edit, sign and track agreements in
one profile-gated place, with AI assistance on the top two subscription
tiers.

## Quick start

```
cd server
npm install
cp .env.example .env   # optional — fill in AI/billing/identity/email keys
npm start
```

Open **http://localhost:4000**. The server serves the website and the API
together — nothing else to run.

## Layout

- **`website/`** — the front end (plain HTML/CSS/JS, no build step). See `website/README.md`.
- **`server/`** — the real backend: auth, contract storage, native e-signature, time-stamped audit trail, PDF export, and pluggable AI/billing/identity/email integrations. See `server/README.md`.
- **`docs/PRODUCT-PLAN.md`** — what's fully live today vs. still a placeholder, the identity-verification design choice, tier structure, and the mobile app roadmap.
- **`pactstore/`** — an older, unrelated Java project from before Pact; not part of this product.
