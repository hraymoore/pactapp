# Deploying Pact to www.pactappstore.com

Pact ships as one deployable unit — `server/` serves both the API and the
static `website/` files, so there's a single process to run and a single
domain to point at it.

## 1. Pick a host

The app needs a host that can run a persistent Node process (not a static
host — `website/` alone won't work, it needs `server/` behind it) and that
gives the SQLite file a persistent disk. Good fits for this size of app:

- **Render** or **Railway** — simplest: connect the repo, set the build
  command to `cd server && npm install`, start command `node server/src/index.js`,
  add a persistent volume mounted at `server/data/`.
- **Fly.io** — same shape, plus a `fly.toml` with a mounted volume.
- A plain VPS (systemd service + a reverse proxy for TLS) if you'd rather
  run it yourself.

If you outgrow a single SQLite file (heavy concurrent writes, multi-region),
swap `server/src/db.js` for a managed Postgres — the schema is small and
the query style (`db.prepare(...).get/all/run`) maps directly to a
Postgres client with minimal rewriting.

## 2. Environment variables

Set these on the host (never commit them):

- `NODE_ENV=production` — turns on secure cookies and `trust proxy`
- `JWT_SECRET` — generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `PORT` — most hosts inject this automatically
- Whichever of `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `SMTP_*` you're ready to turn on — see `server/.env.example` and
  `server/README.md` for what each unlocks and how it fails closed without one

## 3. Point www.pactappstore.com at it

1. In your registrar's DNS settings, once www.pactappstore.com is purchased:
   - If the host gives you a static IP → add an `A` record for `@` (and `www`)
   - If the host gives you a hostname (Render/Railway/Fly all do) → add a
     `CNAME` record for `www` pointing at that hostname, and use the host's
     "apex domain" support (most provide ALIAS/ANAME or auto-flatten) for `@`
2. Add `www.pactappstore.com` (and `www.www.pactappstore.com` if you want both) as a
   custom domain in the host's dashboard — this is also how you get a free
   TLS certificate (Let's Encrypt) issued automatically on most hosts.
3. Once DNS propagates, `https://www.pactappstore.com` should reach the running
   server directly — no separate frontend deploy needed.

## 4. After it's live

- Update `website/manifest.json`, `robots.txt`, `sitemap.xml`, and the
  canonical/OG `<meta>` tags across `website/*.html` if the final domain
  ends up different from `www.pactappstore.com` (a single find-and-replace).
- Host `website/.well-known/assetlinks.json` (see
  `docs/ANDROID-PLAYSTORE.md`) so the Android app can verify domain
  ownership for the Trusted Web Activity.
- Point Stripe's webhook endpoints at
  `https://www.pactappstore.com/api/billing/webhook` and
  `https://www.pactappstore.com/api/identity/webhook` in the Stripe dashboard, and
  set `STRIPE_WEBHOOK_SECRET` from what it gives you.
