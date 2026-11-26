  
/******************************
  SLIDER SUPERIOR VOLUMEN
*******************************/
// Referencia al slider de volumen
const volumeSlider = document.getElementById('volume-slider');

// Event listener para cambiar el volumen en tiempo real
if (volumeSlider) {
  volumeSlider.addEventListener("input", function() {
    const audios = document.querySelectorAll("audio");
    audios.forEach(audio => {
      audio.volume = this.value;
    });
  });
}


/******************************
  SLIDER DOBLE
*******************************/
const news_volume = document.getElementById('radio_news_volume');
const music_volume = document.getElementById('radio_music_volume');

if (news_volume) {
  // Volumen de las noticias
  news_volume.addEventListener("input", (e) => {
    max_news_volume = Number(e.target.value);
    // Si las noticias aún esperan conectadas en silencio, solo se guarda el máximo
    if (noticiasAudibles) liveNews.volume = max_news_volume;
    seguirVolumenPin();   // si suena un pin hacia las noticias, lo acompaña
  });

  // Volumen de la música
  music_volume.addEventListener("input", (e) => {
    max_music_volume = Number(e.target.value);
    // Si la música aún espera conectada en silencio, solo se guarda el máximo
    if (musicaAudible) liveMusic.volume = max_music_volume;
    seguirVolumenPin();   // si suena un pin hacia la música, lo acompaña
  });
}


/******************************
  MODAL DE SALIDA
*******************************/
// Como en Radio Web Neo (backguard.js). Una vez que ha sonado algo, el gesto atrás no saca de la
// página: abre el modal "¿Salir y parar...?". Con el modal abierto, atrás lo cierra (como Cancelar);
// solo "Sí, salir" saca de la página: para el audio, vuelve atrás y, si no hay página anterior,
// intenta cerrar la ventana (una app instalada abierta desde su icono se cierra así). Si aun así
// sigue ahí, avisa de que ya se puede salir. Antes de dar a play, atrás funciona con normalidad.
//
// En pantallas táctiles con CloseWatcher (Chrome) el navegador avisa del gesto atrás sin tocar el
// historial: Android no anima la vista previa de la página anterior. Un vigilante nuevo por cada
// pregunta (Chrome solo deja cancelar un par de veces el mismo) y otro propio para el modal (el del
// <dialog> no se crea bien si se abre desde un gesto atrás). Sin CloseWatcher, o en PC (botón atrás
// del ratón, Alt+←), se añade una entrada propia al historial al empezar a sonar.
const exitModal = document.getElementById("exit-modal");

if (exitModal && typeof exitModal.showModal === "function") {
  const MOVIL = matchMedia("(pointer: coarse)").matches;
  const usarVigilante = MOVIL && "CloseWatcher" in window;
  const nota = document.getElementById("exit-note");
  if (nota && !MOVIL) nota.textContent = "Para seguir escuchando, no cierres la pestaña";

  let audioIniciado = false;   // ha sonado algo: desde entonces se pregunta (hasta salir con "Sí, salir")
  let conEntrada = false;      // sin CloseWatcher: la entrada propia está en el historial
  let saliendo = false;
  let vigilante = null;
  let vigilanteModal = null;

  const abrirModal = () => {
    if (!exitModal.open) exitModal.showModal();
    if (!usarVigilante || vigilanteModal) return;
    const v = new CloseWatcher();
    vigilanteModal = v;
    v.addEventListener("close", () => { vigilanteModal = null; cancelar(); });
  };

  const cerrarModal = () => {
    if (exitModal.open) exitModal.close();
  };

  exitModal.addEventListener("close", () => {
    if (vigilanteModal) { vigilanteModal.destroy(); vigilanteModal = null; }
  });

  const armarVigilante = () => {
    if (vigilante || saliendo || !audioIniciado || exitModal.open) return;
    const v = new CloseWatcher();
    vigilante = v;
    // Primer gesto atrás: abrir el modal. Chrome solo deja cancelarlo si se ha tocado la página
    // desde el último; si no, salta a "close" para que nadie quede atrapado.
    v.addEventListener("cancel", event => {
      if (!event.cancelable) return;
      event.preventDefault();
      v.destroy();
      vigilante = null;
      abrirModal();
    });
    v.addEventListener("close", () => {
      vigilante = null;
      if (!saliendo) history.back();
    });
  };

  // Vigilar el siguiente gesto atrás (sin CloseWatcher: una sola entrada propia en el historial)
  const armar = () => {
    if (usarVigilante) { armarVigilante(); return; }
    if (conEntrada || saliendo || !audioIniciado) return;
    history.pushState({ exitModal: true }, "", location.href);
    conEntrada = true;
  };

  const cancelar = () => {
    cerrarModal();
    armar();
  };

  // Armarlo con la primera reproducción, incluidos los audios creados dinámicamente
  document.addEventListener("play", event => {
    if (!(event.target instanceof HTMLAudioElement)) return;
    audioIniciado = true;
    armar();
  }, true);

  window.addEventListener("popstate", event => {
    if (event.state && event.state.exitModal) { conEntrada = true; return; }   // se ha vuelto hacia delante a la entrada propia
    if (!conEntrada) return;
    conEntrada = false;
    if (saliendo) return;
    if (!audioIniciado) { history.back(); return; }   // ya se salió con "Sí, salir": el atrás sigue su camino
    if (exitModal.open) cerrarModal(); else abrirModal();
    armar();   // siempre queda una entrada propia detrás: con el modal abierto, atrás lo cierra
  });

  // Escape (o atrás con el vigilante propio del <dialog>)
  exitModal.addEventListener("cancel", event => {
    event.preventDefault();
    cancelar();
  });

  document.getElementById("exit-cancel").addEventListener("click", cancelar);
  document.getElementById("exit-close").addEventListener("click", cancelar);

  document.getElementById("exit-go").addEventListener("click", () => {
    if (saliendo) return;
    saliendo = true;
    cerrarModal();

    // Parar el audio: el directo con su propia parada (sin reconexiones) y cualquier otro <audio>
    if (typeof window.rwfPararAudio === "function") window.rwfPararAudio();
    document.querySelectorAll("audio").forEach(audio => { if (!audio.paused) audio.pause(); });
    audioIniciado = false;

    history.go(conEntrada ? -2 : -1);   // con entrada propia hay que saltar también esa

    // Si no había página anterior, la ventana no se va: se intenta cerrar y, si sigue ahí, se avisa
    setTimeout(() => {
      window.close();
      setTimeout(() => {
        saliendo = false;
        if (document.visibilityState === "visible") {
          mostrarAviso(MOVIL ? "Ya puedes salir de la app" : "Ya puedes cerrar la pestaña");
        }
      }, 200);
    }, 300);
  });

  // Volver a la página desde la caché del navegador (atrás y adelante): nada a medias
  window.addEventListener("pageshow", event => {
    if (event.persisted) saliendo = false;
  });
}

// Aviso breve abajo de la pantalla
function mostrarAviso(texto) {
  const aviso = document.createElement("div");
  aviso.className = "rwf-aviso";
  aviso.setAttribute("role", "status");
  aviso.textContent = texto;
  document.body.appendChild(aviso);
  aviso.addEventListener("animationend", () => aviso.remove());
}
  
/******************************
  TOGGLE MODO OSCURO
*******************************/

/* Selector de tema reutilizable. Requiere el botón #theme-toggle,
 #theme-label y #theme-icon, además de la pequeña inicialización en el head. */

const toggle = document.getElementById('theme-toggle');
const icon = document.getElementById('theme-icon');
const label = document.getElementById('theme-label');
// Las páginas se abren dentro de un marco sobre el index (script-app.js) y Chrome solo hace caso al
// theme-color de la página de arriba: dentro del marco se escribe en el meta del index
const themeColorMeta = (() => {
  if (window.parent !== window) {
    try {
      const meta = window.parent.document.getElementById('theme-color-meta');
      if (meta) return meta;
    } catch (error) {}
  }
  return document.getElementById('theme-color-meta');
})();

/* Esto lo coloca al final en el movil */
const lista = document.getElementById("lista");
const links = document.getElementById("links");
if (toggle && lista) {
  lista.after(toggle);
}

function applyTheme(theme) {
  const dark = theme === 'dark';

  document.documentElement.dataset.theme = dark ? 'dark' : 'light';

    if (toggle && icon && label) {
      icon.textContent = dark ? '☀️' : '🌙';
      label.textContent = dark ? 'Modo claro' : 'Modo oscuro';
      toggle.setAttribute('aria-label', dark ? 'Activar modo claro' : 'Activar modo oscuro');
      toggle.setAttribute('aria-pressed', String(dark));
    }

    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', dark ? '#111827' : '#f6f6f6');
    }

    // Permite que páginas con componentes especiales, como el mapa,
    // reaccionen al cambio sin duplicar la lógica común.
    window.dispatchEvent(new CustomEvent('radio-theme-change', {
      detail: { theme: dark ? 'dark' : 'light' }
    }));
}

/* Aplicar el tema inicial */
applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

/* Botón de cambio de tema */
if (toggle) {
  toggle.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';

    applyTheme(next);

    try {
      localStorage.setItem('radio-page-theme', next);
    } catch (error) {
      // El selector sigue funcionando si el almacenamiento no está disponible.
    }
  });
}

/* Sin tema elegido por el usuario, la app sigue al del dispositivo también cuando este cambia */
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
  try {
    const guardado = localStorage.getItem('radio-page-theme');
    if (guardado === 'dark' || guardado === 'light') return;
  } catch (error) {
    // Sin almacenamiento no hay elección guardada: se sigue al dispositivo.
  }
  applyTheme(event.matches ? 'dark' : 'light');
});

/* Sincronizar los cambios procedentes de otras pestañas */
window.addEventListener('storage', event => {
  if (event.key === 'radio-page-theme' && event.newValue !== null) {
    applyTheme(event.newValue === 'dark' ? 'dark' : 'light');
  }
});

/******************************
  TÍTULO FIJO EN MÓVIL
*******************************/
// En móvil, al bajar, el título se fija arriba y se reduce a una barra superior pequeña de Material
// (título de 22 px en una barra de 64 px; reglas en theme-aux.css). La barra de estado del sistema
// (meta theme-color) toma el color de la barra para que se fundan, y al volver arriba recupera el normal.
// Colores: --barra-fondo y --theme-color (theme-colors.css).
const tituloPagina = document.querySelector('body > h1');
const pantallaMovil = window.matchMedia('(max-width: 42em)');
const TITULO_PX = 22;       // tamaño del título en la barra
const BARRA_MIN_PX = 64;    // alto mínimo de la barra
let umbralTitulo = 0;
let escalaTitulo = 1;
let tituloFijo = false;

// Mide el título para colocarlo en la barra: cuánto hay que bajar para fijarlo, a qué escala queda y
// qué alto necesita la barra (sus líneas de texto; los <br> sueltos no cuentan). Si hay varias líneas, la barra crece
function medirTituloFijo() {
  if (!tituloPagina) return;
  const estilo = getComputedStyle(tituloPagina);
  if (estilo.position !== 'sticky') return;   // no es móvil
  // Dónde está el título sin fijar (cada página lo coloca algo distinto: márgenes del body...)
  const posicion = tituloPagina.style.position;
  tituloPagina.style.position = 'static';
  const natural = tituloPagina.getBoundingClientRect().top + window.scrollY;
  tituloPagina.style.position = posicion;
  escalaTitulo = Math.min(1, TITULO_PX / parseFloat(estilo.fontSize));
  const texto = [...tituloPagina.childNodes].find(nodo => nodo.nodeType === Node.TEXT_NODE && nodo.textContent.trim());
  if (!texto) return;
  const rango = document.createRange();
  rango.selectNodeContents(texto);
  const lineas = rango.getClientRects();
  if (!lineas.length) return;
  // Con el título ya reducido, lo medido va a escala
  const medido = tituloFijo ? escalaTitulo : 1;
  const alto = (lineas[lineas.length - 1].bottom - lineas[0].top) / medido * escalaTitulo;
  const barra = Math.max(BARRA_MIN_PX, Math.ceil(alto + 32));
  const arriba = (barra - alto) / 2;
  const raiz = document.documentElement.style;
  raiz.setProperty('--titulo-escala', escalaTitulo.toFixed(4));
  raiz.setProperty('--titulo-top', `${arriba.toFixed(1)}px`);
  raiz.setProperty('--barra-alto', `${barra}px`);
  umbralTitulo = natural - arriba;
}

function actualizarTituloFijo(forzar) {
  if (!tituloPagina) return;
  const fijo = pantallaMovil.matches && window.scrollY > umbralTitulo;
  if (fijo === tituloFijo && !forzar) return;
  tituloFijo = fijo;
  document.documentElement.classList.toggle('titulo-fijo', fijo);
  if (themeColorMeta) seguirBarraEstado();
}

// La barra de estado copia el color que se ve arriba: la barra (--barra-fondo) con su opacidad sobre el
// color normal (--theme-color). La barra aparece de golpe y el color se escribe en el mismo momento;
// como Radio Web Neo, se sigue escribiendo en cada fotograma un rato después (750 ms)
const SEGUIR_BARRA_MS = 750;
let barraRaf = 0, barraFin = 0;
const aRgb = hex => {
  const h = hex.trim().replace('#', '');
  const c = h.length === 3 ? [...h].map(x => x + x) : h.match(/../g);
  return c && c.length === 3 ? c.map(v => parseInt(v, 16)) : null;
};
function pintarBarraEstado() {
  if (!themeColorMeta) return;
  // En el index con una página abierta, manda la de dentro
  const marco = document.getElementById('rwf-pagina');
  if (marco) {
    try {
      if (marco.contentWindow.rwfPintarBarraEstado) return marco.contentWindow.rwfPintarBarraEstado();
    } catch (error) {}
  }
  const raiz = getComputedStyle(document.documentElement);
  const normal = aRgb(raiz.getPropertyValue('--theme-color'));
  const barra = aRgb(raiz.getPropertyValue('--barra-fondo'));
  if (!normal || !barra) return;
  const opacidad = pantallaMovil.matches ? parseFloat(getComputedStyle(document.body, '::before').opacity) || 0 : 0;
  themeColorMeta.setAttribute('content', '#' + normal.map((v, i) =>
    Math.round(v + (barra[i] - v) * opacidad).toString(16).padStart(2, '0')).join(''));
}
function pasoBarraEstado() {
  pintarBarraEstado();
  barraRaf = performance.now() < barraFin ? requestAnimationFrame(pasoBarraEstado) : 0;
}
function seguirBarraEstado() {
  pintarBarraEstado();
  barraFin = performance.now() + SEGUIR_BARRA_MS;
  if (!barraRaf) barraRaf = requestAnimationFrame(pasoBarraEstado);
}

function iniciarTituloFijo() {
  medirTituloFijo();
  actualizarTituloFijo(true);
}

if (tituloPagina) {
  iniciarTituloFijo();
  window.addEventListener('scroll', () => actualizarTituloFijo(false), { passive: true });
  window.addEventListener('resize', iniciarTituloFijo);
  window.addEventListener('load', iniciarTituloFijo);                    // con las fuentes ya cargadas
  window.addEventListener('pageshow', iniciarTituloFijo);                // al volver atrás a una página guardada (bfcache)
  window.addEventListener('radio-theme-change', () => actualizarTituloFijo(true));  // applyTheme() repone el color normal
}

// Al abrir una página en el marco, su color pasa a la barra de estado (aunque no tenga título fijo);
// al cerrarla, script-app.js llama a rwfPintarBarraEstado del index para recuperar el suyo
window.rwfPintarBarraEstado = pintarBarraEstado;
if (!tituloPagina) window.addEventListener('radio-theme-change', pintarBarraEstado);
pintarBarraEstado();

/******************************
  NOTIFICACION
*******************************/
// Notificación de Android (Media Session). Todas las páginas la manejan con la misma API:
//
//   RWFNotificacion.poner({
//     titulo: 'Texto de la primera línea',
//     acciones: { previoustrack, nexttrack, seekbackward, seekforward }
//   });
//
// La segunda línea es siempre "Radio Web Fast". Cada modo decide su título y sus botones:
// los podcasts (más abajo), las tarjetas de directo (script-livesound.js) y los boletos
// (live_boleto/index.html). Un botón solo aparece si se le pasa su función.
// Sin "acciones" se conservan los botones anteriores; con "acciones: {}" se quitan todos.
const RWFNotificacion = (() => {

  const SEGUNDA_LINEA = 'Radio Web Fast';
  const ACCIONES = ['previoustrack', 'nexttrack', 'seekbackward', 'seekforward'];

  // Sin soporte (otros navegadores): la API existe, pero no hace nada.
  if (!('mediaSession' in navigator && 'MediaMetadata' in window)) {
    return { poner() {} };
  }

  // Detectar la raíz de la aplicación
  let appBase = location.pathname.substring(
    0,
    location.pathname.lastIndexOf('/') + 1
  );

  // Volver a la raíz desde las carpetas de reproducción
  appBase = appBase.replace(/(?:live|live_boleto|live_ser|podcasts|extra)\/$/, '');

  // Lo que se ve ahora mismo en la notificación
  let tituloActual = SEGUNDA_LINEA;
  let accionesActuales = {};

  const publicar = () => {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: tituloActual,
        artist: SEGUNDA_LINEA,
        artwork: [
          {
            src: `${appBase}resources/notificacion.webp`,
            type: 'image/webp'
          }
        ]
      });
    } catch (error) {
      // La reproducción no depende de la notificación.
    }
  };

  const fijarAcciones = () => {
    ACCIONES.forEach(nombre => {
      try {
        // null quita el botón
        navigator.mediaSession.setActionHandler(nombre, accionesActuales[nombre] || null);
      } catch (error) {
        // Acción que este navegador no soporta: se ignora.
      }
    });
  };

  const poner = ({ titulo, acciones } = {}) => {
    if (typeof titulo === 'string' && titulo.trim() !== '') {
      tituloActual = titulo.trim();
    }

    if (acciones) {
      accionesActuales = acciones;
      fijarAcciones();
    }

    publicar();
  };

  publicar();

  // Cada vez que el audio empieza o se recupera (por ejemplo, tras una reconexión) se
  // vuelven a publicar los metadatos, para que Android reconstruya la notificación si la
  // había retirado. El listener es de captura porque los eventos de audio no burbujean.
  document.addEventListener('playing', event => {
    if (event.target instanceof HTMLAudioElement) publicar();
  }, true);

  return { poner };

})();

/* Podcasts: cada <audio> lleva su título en data-notif-titulo (lo pone script-cargarss.js).
   Al darle a play, la notificación pasa a ser la de ese capítulo, con los saltos de -10 y +10 s.
   Se registran como seekbackward/seekforward (Android Auto los dibuja como tales) y también
   en previoustrack/nexttrack, porque la notificación del móvil solo dibuja los botones de
   anterior y siguiente: así el -10 y el +10 salen en las dos. */
document.addEventListener('play', event => {
  const audio = event.target;
  if (!(audio instanceof HTMLAudioElement) || !audio.dataset.notifTitulo) return;

  const atras = () => { audio.currentTime = Math.max(0, audio.currentTime - 10); };
  const adelante = () => { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 10); };

  RWFNotificacion.poner({
    titulo: audio.dataset.notifTitulo,
    acciones: {
      previoustrack: atras,
      nexttrack: adelante,
      seekbackward: atras,
      seekforward: adelante
    }
  });
}, true);

/******************************
  OTROS
*******************************/
function actualizarEspacioInferior() {
  // Ñapa para index y live
  if (document.documentElement.dataset.page !== 'index') return;

  const hayScroll =
      document.documentElement.scrollHeight >
      document.documentElement.clientHeight;

  document.body.classList.toggle('hay-scroll', hayScroll);
}

window.addEventListener('load', actualizarEspacioInferior);
window.addEventListener('resize', actualizarEspacioInferior);

/********************************
 * CATEGORIAS - Filtrar emisoras y separadores
 * *****************************/
function filterStations(category, btn) {
  // live/index.html oculta la otra categoría desde el primer pintado con este atributo
  document.documentElement.dataset.cat = category;

  // Seleccionamos tanto las tarjetas como los separadores
  const items = document.querySelectorAll('.card, .category-separator');
  const buttons = document.querySelectorAll('.category-btn');

  items.forEach(item => {
    if (item.classList.contains(category)) {
      // Mostrar elemento
      item.classList.remove("hidden");
      setTimeout(() => {
        item.style.position = "relative";
      }, 500);
    } else {
      // Ocultar elemento
      item.classList.add("hidden");
    }
  });

  // Marcar el botón activo
  buttons.forEach(b => b.classList.remove('active'));

  // Activar el botón si existe
  if (btn) {
    btn.classList.add('active');
  }

  // Guardar categoría en localStorage
  try {
    localStorage.setItem('selectedCategory', category);
  } catch (error) {
    // Con el almacenamiento bloqueado el filtro funciona igual; solo no se recuerda.
  }
}

/********************************
 * IMAGENES - Entrada con fundido al terminar de cargar (ver img.img-fundido en theme-aux.css)
 * *****************************/
// Las imágenes que ya están cargadas (de la caché) se dejan como están.
function fundirImagenes(contenedor) {
  contenedor.querySelectorAll("img").forEach(img => {
    if (img.complete) return;
    img.classList.add("img-fundido");
    const mostrar = () => img.classList.add("img-visible");
    img.addEventListener("load", mostrar, { once: true });
    img.addEventListener("error", mostrar, { once: true });
  });
}

/********************************
 * CATEGORIAS - Mostrar la categoría guardada (o "general" por defecto)
 * *****************************/
window.addEventListener("DOMContentLoaded", () => {
  // Las páginas sin botones de categoría no necesitan inicialización.
  const buttons = document.querySelectorAll('.category-btn');
  if (!buttons.length) return;

  let savedCategory = "general";
  try {
    savedCategory = localStorage.getItem("selectedCategory") || "general";
  } catch (error) {
    // Almacenamiento bloqueado: se muestra la categoría por defecto.
  }

  const btn = [...buttons].find(b =>
    b.getAttribute('onclick')?.includes(savedCategory)
  );

  filterStations(savedCategory, btn);
});
