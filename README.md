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

The web app is also an installable PWA (`website/manifest.json`,
`website/sw.js`) — the first step toward the Android Play Store app in
`docs/ANDROID-PLAYSTORE.md`.

## Layout

- **`website/`** — the front end (plain HTML/CSS/JS, no build step), also an installable PWA. See `website/README.md`.
- **`server/`** — the real backend: auth, contract storage, native e-signature, time-stamped audit trail, PDF export, and pluggable AI/billing/identity/email integrations. See `server/README.md`.
- **`android/`** — Trusted Web Activity config (`twa-manifest.json`) for packaging the PWA as a Google Play Store app. See `docs/ANDROID-PLAYSTORE.md`.
- **`docs/PRODUCT-PLAN.md`** — what's fully live today vs. still a placeholder, the identity-verification design choice, tier structure, and the mobile app roadmap.
- **`docs/DEPLOYMENT.md`** — hosting + DNS steps for pointing contrapact.net at a live deployment.
- **`docs/ANDROID-PLAYSTORE.md`** — how to package and submit the Android app.
- **`pactstore/`** — an older, unrelated Java project from before Pact; not part of this product.
