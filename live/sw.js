
const CACHE_NAME = "radio-live-cache-v11";

const FILES_TO_CACHE = [
  "./",

  "./index.html",

  "../resources/favicon.ico",
  "../resources/icon-192.png",
  "../resources/icon-512.png",
  "../resources/radio_mini.jpeg",

  "../resources/micro.jpg",
  "../resources/cope.jpg",
  "../resources/ondacero.webp",
  "../resources/rne.webp",
  "../resources/esradio.jpg",
  "../resources/rac1.webp",

  "../resources/sercat.png",
  "../resources/catradio.png",
  "../resources/radio4.png",
  "../resources/radio3.png",
  "../resources/marca.png",
  "../resources/radio5.png",

  "../resources/los40_estudio.jpg",
  "../resources/los40c_micro.jpg",
  "../resources/mega2.jpg",
  "../resources/hitfm.jpg",
  "../resources/rockfm.webp",
  "../resources/melodiafm.png",

  "../resources/europafm.webp",
  "../resources/cadena100.webp",
  "../resources/dial.webp",
  "../resources/kissfm.webp",
  "../resources/los40_dance.webp",
  "../resources/los40_urban.webp",

  "../resources/clasica.webp",
  "../resources/flaixfm.webp",
  "../resources/flaixbac.webp",
  "../resources/rac105.png",
  "../resources/radiole.jpg",
  "../resources/fiestaradio.webp",
];

// Instalación
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Instalando archivos...');
      // En lugar de addAll, usamos un bucle para que si uno falla, los demás sigan
      return Promise.allSettled(
        FILES_TO_CACHE.map(url => {
          return cache.add(url).catch(err => console.warn(`No se pudo cachear: ${url}`));
        })
      );
    })
  );
  self.skipWaiting();
});

// Activación
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => {
      // Una vez limpia la caché, reclamamos el control
      return self.clients.claim();
    })
  );
});

// Fetch: cache-first
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Si el archivo está en la caché, lo devolvemos. Si no, lo pedimos a la red.
      return response || fetch(event.request);
    }).catch(() => {
      // Opcional: Si falla todo (estás offline y no está en caché)
      console.log('Service Worker fetch event exception');
    })
  );
});
