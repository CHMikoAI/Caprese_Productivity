// Caprese service worker — deliberately minimal.
//
// Pages are server-rendered from live data behind a PIN gate, so nothing that
// contains your data is ever cached. The only job here is to make the app
// installable and to show a friendly page instead of the browser's error
// screen when the network is gone.

const CACHE = "caprese-shell-v1";
const OFFLINE_URL = "/offline";
const SHELL = [OFFLINE_URL, "/icons/icon-192.png", "/icons/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  // Drop caches from older versions, then take over open tabs immediately so a
  // stale worker can never linger.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Only page loads are handled; everything else goes straight to the network.
  if (request.method !== "GET" || request.mode !== "navigate") return;

  event.respondWith(
    fetch(request).catch(() =>
      caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error()),
    ),
  );
});
