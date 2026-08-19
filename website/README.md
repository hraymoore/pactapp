# Pact — Website

The Pact front end: marketing site + a profile-gated contract app, backed
by the real API in `/server`. This folder has no build step — it's plain
HTML/CSS/JS served directly by the backend.

**Run it via the server, not a static file server** — every page now calls
real `/api/*` endpoints (auth, contracts, signing, AI, billing, identity),
so opening these files with `python3 -m http.server` will load the pages
but auth/contracts/signing won't work without the API behind them:

```
cd ../server
npm install
npm start
```

Then open **http://localhost:4000**.

## Pages

- `index.html` — home
- `about.html` — company story + roadmap
- `pricing.html` — 4 subscription tiers + comparison table (upgrades in place if you're logged in)
- `templates.html` — filterable contract template gallery (39 templates, 12 genres), fetched from the API
- `features.html` — security, e-signature and Pact AI overview
- `signup.html` / `login.html` — real profile creation/login against the backend
- `dashboard.html` — gated app: contract list, editor, send/sign, AI panel, audit trail, billing & identity settings
- `sign.html` — public page an outside counterparty opens from a signing link (no account needed)
- `contact.html` — contact form

## How auth works

`js/app.js` defines `PactAPI`, a small fetch wrapper around the backend's
cookie-based JWT sessions (`/api/auth/*`). There's no client-side mock
left — `PactAPI.me()`, `.signup()`, `.login()`, `.logout()` all hit the
real server. See `/docs/PRODUCT-PLAN.md` and `server/README.md` for what's
fully live vs. still pluggable (AI/billing/identity fail closed with a
clear message until their API keys are set).

## Design system

All colors, spacing and components live in `css/style.css` as CSS custom
properties: obsidian/paper grounds, silver/paper text, and gold/ruby/emerald
accents. Dark sections always use light text; light (`section-paper`)
sections always use dark text.
