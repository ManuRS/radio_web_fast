
const CACHE_NAME = "radio-full-cache-v82";

const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./hls.min-173.js",

  "./radio_boletos",
  "./radio_daily",
  "./radio_extra",
  "./radio_finde",
  "./radio_fun",
  "./radio_mañanas",
  "./radio_programas",

  "./extra_elpais",
  "./extra_mapaser",
  
  "./script-cargarss.js",
  "./script-ecualizador.js",
  "./script-eventos.js",
  "./script-fastload.js",
  "./script-interfaz.js",
  "./script-livesound.js",
  "./script-serviceworker.js",

  "./live_boleto/script-extrabol.js",

  "./theme-aux.css",
  "./theme-cards.css",
  "./theme-colors.css",
  "./theme-podcast.css",

  "./live/",
  "./live_boleto/",
  "./live_ser/",

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
  "./resources/radio_classic.webp",
  "./resources/federico.webp",
  "./resources/notificacion.webp",

  "./resources/favicon.ico",
  "./resources/favicon2.ico",
  "./resources/favicon3.ico",
  "./resources/icon-192.png",
  "./resources/icon-512.png",
  "./resources/icon2-192.png",
  "./resources/icon2-512.png",
  "./resources/icon3-192.png",
  "./resources/icon3-512.png",

  "./resources/micro.jpg",
  "./resources/cope.jpg",
  "./resources/ondacero.webp",
  "./resources/ondacero_b.webp",
  "./resources/rne.webp",
  "./resources/esradio.jpg",
  "./resources/rac1.webp",
  "./resources/rac1b.webp",

  "./resources/sercat.png",
  "./resources/catradio.png",
  "./resources/radio4.png",
  "./resources/radio3.png",
  "./resources/marca.png",
  "./resources/radio5.png",

  "./resources/radioexterior.png",
  "./resources/sermas.webp",
  "./resources/copemas.webp",

  "./resources/la1.webp",
  "./resources/24h.webp",
  "./resources/lasexta.webp",

  "./resources/los40_estudio.jpg",
  "./resources/los40c_micro.jpg",
  "./resources/mega.png",
  "./resources/mega2.jpg",
  "./resources/hitfm.jpg",
  "./resources/rockfm.webp",
  "./resources/melodiafm.png",

  "./resources/europafm.webp",
  "./resources/cadena100.webp",
  "./resources/cadena100b.png",
  "./resources/dial.webp",
  "./resources/kissfm.webp",
  "./resources/los40.webp",
  "./resources/los40c.webp",
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

  "./sounds/claim_corto.mp3",
  "./sounds/cortinilla_conversacion.mp3",

  "./sounds/desco_alt.mp3",
  "./sounds/desco_fin.mp3",  
  "./sounds/desco_fin_hxh.mp3",  
  "./sounds/desco_ini_gen.mp3",  

  "./sounds/los40_a.mp3",
  "./sounds/los40_b.mp3",
  "./sounds/los40c_a.mp3",
  "./sounds/pin_noid.mp3",
  "./sounds/radio_madrid.mp3",
];

// Cloudflare Pages redirige /live/index.html -> /live/ y /x.html -> /x.
// Una respuesta con redirected=true no se puede servir a una navegación (ERR_FAILED),
// así que se guarda una copia limpia, sin la marca de redirección.
async function limpiarRedireccion(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers
  });
}

// Instalación
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('⌛ Descargando cache...');

      // En lugar de addAll, usamos un bucle para que si uno falla, los demás sigan
      return Promise.allSettled(
        FILES_TO_CACHE.map(async (url) => {
          const req = new Request(url, { cache: 'reload' });
          const res = await fetch(req);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await cache.put(req, await limpiarRedireccion(res));
        })
      ).then(resultados => {

        // Avisar de los archivos que han fallado
        resultados.forEach((resultado, i) => {
          if (resultado.status === 'rejected') {
            console.warn(
              `⚠️ No se pudo cachear: ${FILES_TO_CACHE[i]}`,
              resultado.reason
            );
          }
        });

        const correctos = resultados.filter(
          resultado => resultado.status === 'fulfilled'
        ).length;

        const fallidos = resultados.length - correctos;

        if (fallidos === 0) {
          console.log('✅ Caché completada: todos los archivos descargados');
        } else {
          console.warn(
            `⚠️ Caché finalizada: ${correctos}/${resultados.length} archivos descargados. Fallidos: ${fallidos}`
          );
        }
      });
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

// Fetch: cache-first, solo para los ficheros de la propia app
self.addEventListener('fetch', (event) => {

  const req = event.request;
  const url = new URL(req.url);

  // Streams de radio, RSS, hora oficial, mapas...: no pasan por el service worker
  // (no se cachean y así su transmisión no depende de él).
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;


  event.respondWith(
    // ignoreSearch: live_boleto/index.html?music=2 debe encontrar live_boleto/index.html
    caches.match(req, { ignoreSearch: true }).then((response) => response || fetch(req))
  );
});
