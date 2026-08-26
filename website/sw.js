// Pact service worker — caches the static app shell for fast/offline
// loading. Never caches /api/* — contracts, auth state and signatures must
// always come from the network, never a stale cache.

const CACHE_NAME = "pact-shell-v1";
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
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached || caches.match("/index.html"));
      return cached || network;
    })
  );
});
