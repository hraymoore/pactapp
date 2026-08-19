# Pact — Website Preview

A static, dependency-free HTML/CSS/JS build of the Pact marketing site and
gated app dashboard. Open `index.html` directly in a browser, or serve the
folder with any static file server:

```
cd website
python3 -m http.server 8080
```

## Pages

- `index.html` — home
- `about.html` — company story + roadmap
- `pricing.html` — 4 subscription tiers + comparison table
- `templates.html` — filterable contract template gallery (39 templates, 12 genres)
- `features.html` — security, e-signature and Pact AI overview
- `signup.html` / `login.html` — profile creation (mock, local only)
- `dashboard.html` — gated app: contract list, editor, AI panel, audit trail
- `contact.html` — contact form

## How the demo auth works

There is no backend yet. `js/app.js` defines `PactAuth`, a small wrapper
around `localStorage` that stands in for real identity/session management.
Creating a profile on `signup.html` stores `{name, email, tier}` in the
browser; the dashboard and template gallery check for that profile to decide
what to show. See `/docs/PRODUCT-PLAN.md` for what a real implementation
needs (auth service, contract DB, e-signature provider, AI backend, billing).

## Design system

All colors, spacing and components live in `css/style.css` as CSS custom
properties: obsidian/paper grounds, silver/paper text, and gold/ruby/emerald
accents. Dark sections always use light text; light (`section-paper`)
sections always use dark text.
