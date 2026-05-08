
const CACHE_NAME = "radio-ser-cache-v11";

const FILES_TO_CACHE = [
  "index.html",

  "../resources/favicon3.ico",
  "../resources/icon3-192.png",
  "../resources/icon3-512.png",

  "../resources/radio_mini.jpeg",
  "../resources/micro.jpg",
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
