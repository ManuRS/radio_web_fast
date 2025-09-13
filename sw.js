const CACHE_NAME = "radio-cache-v1";
const FILES_TO_CACHE = [
  "radio_live.html",
  "resources/radio_mini.jpeg",
  "resources/micro.jpg",
  "resources/cope.jpg",
  "resources/ondacero.webp",
  "resources/rne.webp",
  "resources/esradio.jpg",
  "resources/los40e.jpg",
  "resources/los40c_micro.jpg",
  "resources/mega2.jpg",
  "resources/rockfm2.jpg",
  "resources/hitfm.jpg"
];

// Instalación
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

// Activación
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first
self.addEventListener("fetch", event => {
  if (event.request.url.startsWith("http")) {
    event.respondWith(
      caches.match(event.request).then(resp => resp || fetch(event.request))
    );
  }
});
