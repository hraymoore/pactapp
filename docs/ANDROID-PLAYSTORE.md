# Getting Pact onto the Google Play Store

Pact's web app is already installable as a PWA (see `website/manifest.json`,
`website/sw.js`). The fastest legitimate path onto the Play Store is
wrapping that PWA in a **Trusted Web Activity (TWA)** — a thin native
Android shell that opens `www.pactappstore.com` full-screen with no browser
chrome. This is the same technique Google itself documents and is how many
production apps (Twitter Lite, Starbucks, and plenty of smaller SaaS
products) ship on Play. It reuses 100% of the existing web app instead of
maintaining a parallel native codebase.

`docs/PRODUCT-PLAN.md` also documents a deeper React Native app as a later
phase, for when you want real native features (push notifications, offline
drafting, biometric login) beyond what a TWA gives you. Do the TWA first —
it gets you into the Play Store fastest with what already exists.

## What's already in this repo

- `website/manifest.json` — the PWA manifest (name, icons, colors, start URL)
- `website/icons/` — generated app icons at 192/512/512-maskable, matching the site's gold/ruby/emerald mark
- `website/sw.js` — service worker, makes the PWA installable
- `android/twa-manifest.json` — the config Bubblewrap needs to build the Android project, pre-filled from `manifest.json` and pointed at the live `www.pactappstore.com` domain. **You still need to fill in a real signing key and its fingerprint (see step 3).**
- `website/.well-known/assetlinks.json` — placeholder Digital Asset Links file; the app won't run chrome-less until you replace the fingerprint in here with your real one
- `docs/play-store-assets/` — everything for the Play Console store listing that doesn't require the Android SDK: 4 real phone screenshots (`screenshots/`, 824×1830, captured live from the current site), a 1024×500 feature graphic, the 512×512 app icon, and `STORE-LISTING.md` with ready-to-paste short/full descriptions, category, tags, the Data Safety form answers (written from what `server/src/db.js` and the Privacy Policy actually say Pact collects), and the content-rating guidance.

## Why the actual `.aab` still isn't built

Two separate things, both real, neither worked around from here:

1. **Building it requires the Android SDK**, which Bubblewrap downloads from
   `dl.google.com` — blocked by this environment's network policy (confirmed:
   `curl` to it fails with a 403 from the egress gateway, "organization
   policy"). This has to run somewhere with real internet access to Google's
   servers: your own machine, or a CI runner without that restriction.
2. **The signing key is a one-way door.** Whoever holds it controls the
   app's identity on the Play Store forever — losing or leaking it means
   you can never publish an update again. If I generated and held it, you'd
   be trusting me with that credential permanently. Building it yourself
   (step 3 below) means only you ever hold it.

What's here gets you to a single `bubblewrap build` away from a submittable
package, plus the store listing already written.

## Steps (once www.pactappstore.com is live)

1. **Google Play Developer account** — $25 one-time fee at
   [play.google.com/console](https://play.google.com/console/), if you
   don't have one already.

2. **Install Bubblewrap and let it set up its own JDK/Android SDK** (this
   downloads a few hundred MB — do it on your own machine, not a
   constrained sandbox):
   ```
   npm install -g @bubblewrap/cli
   ```

3. **Build from the provided config:**
   ```
   cd android
   bubblewrap build
   ```
   The first run will offer to generate a signing key for you — say yes,
   name it `android.keystore` to match `twa-manifest.json`, and **back that
   file up somewhere safe outside git** (a password manager or secure
   vault). It's already covered by a repo-root `.gitignore` entry you
   should add: `android/*.keystore`.

4. **Get the key's SHA-256 fingerprint** and wire it into the asset links
   file so the OS trusts the TWA to open without a browser address bar:
   ```
   keytool -list -v -keystore android/android.keystore -alias android
   ```
   Copy the `SHA256:` value, paste it into
   `website/.well-known/assetlinks.json` (replacing the placeholder), and
   deploy — it must be reachable at
   `https://www.pactappstore.com/.well-known/assetlinks.json` before the app will
   render full-screen instead of showing a browser bar.

5. **Store listing assets — already prepared in `docs/play-store-assets/`:**
   - App icon (`icon-512.png`)
   - 4 real phone screenshots (`screenshots/`) — home, templates, pricing, security pages
   - A 1024×500 feature graphic (`feature-graphic-1024x500.png`)
   - Short + full description, category, tags, and Data Safety form answers — all in `STORE-LISTING.md`, ready to paste into Play Console
   - Privacy policy URL: `https://www.pactappstore.com/privacy.html` (live, no longer a placeholder)
   - Still worth adding once you have a real (non-empty) demo account: one authenticated dashboard/editor screenshot, taken from an actual phone or Chrome DevTools device mode
   - Content rating questionnaire (Pact will rate as a general business/productivity app)

6. **Upload** the generated `.aab` (in `android/app-release-bundle.aab`
   after `bubblewrap build`) in Play Console → Production (or start with
   Internal Testing to try it privately first) → Create release.

## One policy thing to check before you submit

Pact's subscriptions bill through Stripe, not Google Play Billing. Google's
Payments policy generally requires **Play Billing for digital
content/services consumed inside the app**, with carve-outs for certain
app categories and (in some regions, post-2024 policy changes) external
payment links. Because the TWA is just the website opened full-screen,
where the actual checkout happens matters: keeping Stripe Checkout as a
normal web flow (not something that looks like an in-app purchase button)
is the safer pattern, but this is a real compliance judgment call —
read Play Console's current
[Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738)
before submitting, since Google updates it periodically and a violation
here is a common first-submission rejection reason.
