// VaultFront Service Worker
// Provides offline lobby browsing and PWA installability.
// Does NOT cache gameplay WebSocket traffic — only static assets and the shell.

const CACHE_NAME = "vaultfront-v1";

// Assets to pre-cache on install (the app shell)
const PRECACHE_URLS = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => (self as ServiceWorkerGlobalScope).skipWaiting()),
  );
});

self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => (self as ServiceWorkerGlobalScope).clients.claim()),
  );
});

self.addEventListener("fetch", (event: FetchEvent) => {
  const url = new URL(event.request.url);

  // Never intercept WebSocket upgrades, API calls, or game worker traffic
  if (
    event.request.method !== "GET" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/lobbies") ||
    url.pathname.startsWith("/w0") ||
    url.pathname.startsWith("/w1")
  ) {
    return;
  }

  // Network-first for HTML navigation (always fresh shell)
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match("/").then((r) => r ?? Response.error()),
      ),
    );
    return;
  }

  // Cache-first for static assets (hashed filenames)
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ??
        fetch(event.request).then((response) => {
          if (response.ok && url.pathname.startsWith("/assets/")) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }),
    ),
  );
});
