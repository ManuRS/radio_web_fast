
const CACHE_NAME = "radio-ser-cache-v5";

const FILES_TO_CACHE = [
  "index.html",

  "../resources/favicon3.ico",
  "../resources/icon3-192.png",
  "../resources/icon3-512.png",

  "../resources/radio_mini.jpeg",
  "../resources/micro.jpg",
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
