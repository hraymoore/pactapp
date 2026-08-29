// Pact service worker — caches the static app shell as an offline fallback.
// Never caches /api/* — contracts, auth state and signatures must always
// come from the network, never a stale cache.
//
// Network-first, not cache-first: Pact ships new tier-gating and billing
// logic in app.js/templates.html/dashboard.html on every deploy, and a
// stale-while-revalidate strategy (serve cache immediately, refresh cache
// in the background for *next* time) left returning visitors running an
// old cached copy of that logic until the cache happened to catch up over
// several page loads — e.g. an old cached app.js still gating templates by
// a tier the user no longer has. Always try the network first so a
// deployed fix is visible on the very next load; fall back to cache only
// when the network is unreachable (offline).
//
// Bump CACHE_NAME whenever the shell asset list below changes, so old
// entries don't linger under a stale key.
const CACHE_NAME = "pact-shell-v2";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/about.html",
  "/pricing.html",
  "/templates.html",
  "/features.html",
  "/contact.html",
  "/css/style.css",
  "/js/app.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // never cache API calls

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/index.html")))
  );
});
