
const CACHE_NAME = "radio-full-cache-v12";

const FILES_TO_CACHE = [
  "./",
  "./index.html",

  "./live/index.html",
  "./live_ser/index.html",

  "./manifest.json",
  "./live/manifest.json",
  "./live_ser/manifest.json",

  "./resources/ser_a1.jpg",
  "./resources/redaser.jpg",
  "./resources/gran_via.jpg",
  "./resources/mesa_audio.webp",
  "./resources/radio_mini.jpeg",
  "./resources/sol.webp",
  "./resources/silksong.webp",
  "./resources/retiro.webp",
  "./resources/waves.jpg",
  "./resources/elpais.jpg",
  "./resources/spain.jpg",
  "./resources/mn.jpeg",

  "./resources/favicon2.ico",
  "./resources/icon2-192.png",
  "./resources/icon2-512.png",

  "./resources/micro.jpg",
  "./resources/cope.jpg",
  "./resources/ondacero.webp",
  "./resources/rne.webp",
  "./resources/esradio.jpg",
  "./resources/rac1.webp",

  "./resources/sercat.png",
  "./resources/catradio.png",
  "./resources/radio4.png",
  "./resources/radio3.png",
  "./resources/marca.png",
  "./resources/radio5.png",

  "./resources/los40_estudio.jpg",
  "./resources/los40c_micro.jpg",
  "./resources/mega2.jpg",
  "./resources/hitfm.jpg",
  "./resources/rockfm.webp",
  "./resources/melodiafm.png",

  "./resources/europafm.webp",
  "./resources/cadena100.webp",
  "./resources/dial.webp",
  "./resources/kissfm.webp",
  "./resources/los40_dance.webp",
  "./resources/los40_urban.webp",

  "./resources/clasica.webp",
  "./resources/flaixfm.webp",
  "./resources/flaixbac.webp",
  "./resources/rac105.png",
  "./resources/radiole.jpg",
  "./resources/fiestaradio.webp",

  "./resources/live/classic.png",
  "./resources/live/hitfm.png",
  "./resources/live/los40.png",
  "./resources/live/megastar.png",
  "./resources/live/null.png",
  "./resources/live/off.png",
  "./resources/live/pin.png",
  "./resources/live/rockfm.png",
  "./resources/live/ser.png",
 
];

// Instalación
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Descargando cache');
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
        keys.map(key => {
          // SOLO borra si empieza por nuestro prefijo pero no es la versión actual
          if (key.startsWith('radio-full') && key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
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
