
const CACHE_NAME = "radio-full-cache-v4";

const FILES_TO_CACHE = [
  "index.html",
  "live/index.html",

  "resources/ser_a1.jpg",
  "resources/redaser.jpg",
  "resources/gran_via.jpg",
  "resources/mesa_audio.webp",
  "resources/radio_mini.jpeg",
  "resources/sol.webp",
  "resources/silksong.webp",
  "resources/retiro.webp",
  "resources/waves.jpg",
  "resources/elpais.jpg",
  "resources/spain.jpg",
  "resources/mn.jpeg",

  "resources/favicon2.ico",
  "resources/icon2-192.png",
  "resources/icon2-512.png",
  "resources/radio_mini.jpeg",

  "resources/micro.jpg",
  "resources/cope.jpg",
  "resources/ondacero.webp",
  "resources/rne.webp",
  "resources/esradio.jpg",
  "resources/rac1.webp",

  "resources/sercat.png",
  "resources/catradio.png",
  "resources/radio4.png",
  "resources/radio3.png",
  "resources/marca.png",
  "resources/radio5.png",

  "resources/los40_estudio.jpg",
  "resources/los40c_micro.jpg",
  "resources/mega2.jpg",
  "resources/hitfm.jpg",
  "resources/rockfm.webp",
  "resources/melodiafm.png",

  "resources/europafm.webp",
  "resources/cadena100.webp",
  "resources/dial.webp",
  "resources/kissfm.webp",
  "resources/los40_dance.webp",
  "resources/los40_urban.webp",

  "resources/clasica.webp",
  "resources/flaixfm.webp",
  "resources/flaixbac.webp",
  "resources/rac105.png",
  "resources/radiole.jpg",
  "resources/fiestaradio.webp",
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
