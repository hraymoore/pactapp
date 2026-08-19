# Getting Pact onto the Google Play Store

Pact's web app is already installable as a PWA (see `website/manifest.json`,
`website/sw.js`). The fastest legitimate path onto the Play Store is
wrapping that PWA in a **Trusted Web Activity (TWA)** — a thin native
Android shell that opens `contrapact.net` full-screen with no browser
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
- `android/twa-manifest.json` — the config Bubblewrap needs to build the Android project, pre-filled from `manifest.json`. **You still need to fill in a real signing key and its fingerprint (see step 3).**
- `website/.well-known/assetlinks.json` — placeholder Digital Asset Links file; the app won't run chrome-less until you replace the fingerprint in here with your real one

## Why this isn't fully built for you

Building and signing the actual `.aab` requires things only you can hold:
a Google Play Developer account, your own Android signing key (if I
generated and held it, you'd be trusting me with the credential that
controls your app's identity on the Play Store forever — losing or leaking
it means you can never update the app again), and the live `contrapact.net`
domain to point the TWA at. None of that exists yet from where I'm sitting.
What's here gets you to a single `bubblewrap build` away from a submittable
package.

## Steps (once contrapact.net is live)

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
   `https://contrapact.net/.well-known/assetlinks.json` before the app will
   render full-screen instead of showing a browser bar.

5. **Store listing assets you'll need to prepare:**
   - App icon: already generated, `website/icons/icon-512.png`
   - At least 2 phone screenshots (take them from the live site in Chrome DevTools' device mode)
   - A 1024×500 feature graphic
   - Short description (≤80 chars) and full description
   - A **real, hosted privacy policy URL** — the current footer links (Terms/Privacy/Security) are placeholders; write and publish real pages before submitting, Play Console requires a working link
   - Data safety form: disclose what Pact collects (name, email, contract content; if Stripe Identity is enabled, disclose that ID/SSN verification data is collected and processed by Stripe, not stored by Pact — see `docs/PRODUCT-PLAN.md` §2)
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
