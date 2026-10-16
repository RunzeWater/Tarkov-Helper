// Offline shell for the installable web version. Game data is cached by the app itself (IndexedDB).
const CACHE = "tkh-shell-v1";
const SHELL = ["./", "index.html", "css/app.css", "js/app.js", "js/api.js", "js/i18n.js", "js/maps-config.js",
  "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css", "manifest.webmanifest", "icons/icon-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== "tkh-tiles").map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin === location.origin) {
    // network first so updates land, cache as fallback offline
    e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
  } else if (url.hostname === "assets.tarkov.dev") {
    // map tiles & item icons: cache first
    e.respondWith(caches.open("tkh-tiles").then(async (c) => (await c.match(e.request)) || fetch(e.request).then((r) => { if (r.ok || r.type === "opaque") c.put(e.request, r.clone()); return r; })));
  }
});
