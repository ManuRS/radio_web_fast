  
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
// Una vez que ha sonado algo, el primer gesto atrás no saca de la página: abre un modal, y
// el segundo gesto sale. Antes de dar a play, el gesto atrás funciona con normalidad.
//
// Con CloseWatcher (Chrome y Edge 126, Firefox 149) el navegador avisa de la petición de
// cierre sin tocar el historial: no se añaden entradas fantasma. Solo se vigila el primer
// gesto: al abrir el modal se deja de vigilar, así el segundo gesto es un atrás normal del
// navegador, con su vista previa de la página anterior. "Seguir aquí" vuelve a vigilar
// (un vigilante nuevo por cada pregunta: Chrome solo deja cancelar un par de veces el mismo).
// En los navegadores que no lo soportan se usa el truco clásico de añadir una entrada al historial.
const exitModal = document.getElementById("exit-modal");
const stayBtn = document.getElementById("stay-btn");

if (exitModal && stayBtn) {
  let modalAbierto = false;

  const mostrarModal = () => {
    modalAbierto = true;
    exitModal.style.display = "flex";
  };

  const ocultarModal = () => {
    modalAbierto = false;
    exitModal.style.display = "none";
  };

  stayBtn.addEventListener("click", ocultarModal);

  /* --- Con CloseWatcher --- */
  const vigilarAtrasConCloseWatcher = () => {
    let vigilante = null;

    const armar = () => {
      // Con el modal abierto no se vigila: el siguiente gesto debe ser un atrás normal
      if (vigilante || modalAbierto) return;
      const watcher = new CloseWatcher();
      vigilante = watcher;

      // Primer gesto atrás: abrir el modal y dejar de vigilar. El navegador solo permite
      // cancelarlo si el usuario ha tocado la página desde el último gesto; si no, salta
      // directo a "close" para que nadie quede atrapado.
      watcher.addEventListener("cancel", event => {
        if (!event.cancelable) return;
        event.preventDefault();
        watcher.destroy();
        vigilante = null;
        mostrarModal();
      });

      // Cierre que no se ha podido preguntar: salir de la página
      watcher.addEventListener("close", () => {
        vigilante = null;
        history.back();
      });
    };

    // Armarlo con la primera reproducción, incluidos los audios creados dinámicamente
    document.addEventListener("play", event => {
      if (event.target instanceof HTMLAudioElement) armar();
    }, true);

    // Seguir aquí: volver a vigilar el gesto atrás
    stayBtn.addEventListener("click", armar);
  };

  /* --- Respaldo: navegadores sin CloseWatcher --- */
  const vigilarAtrasConHistorial = () => {
    let scrollPosition = 0;
    let audioIniciado = false;

    document.addEventListener("play", event => {
      if (event.target instanceof HTMLAudioElement) {
        audioIniciado = true;
      }
    }, true);

    // Crear una entrada para interceptar el primer gesto atrás
    history.pushState({ exitModal: true }, "", location.href);

    window.addEventListener("popstate", () => {
      // Sin audio previo: no interceptar la navegación
      if (!audioIniciado) {
        history.back();
        return;
      }

      // Si el modal está abierto, el siguiente gesto permite salir
      if (modalAbierto) {
        ocultarModal();
        return;
      }

      // Mostrar el modal
      scrollPosition = window.scrollY;
      mostrarModal();

      // Mantener una entrada para el siguiente gesto atrás
      history.pushState({ exitModal: true }, "", location.href);

      requestAnimationFrame(() => {
        window.scrollTo(0, scrollPosition);
      });
    });

    stayBtn.addEventListener("click", () => {
      window.scrollTo(0, scrollPosition);
    });
  };

  if ("CloseWatcher" in window) {
    vigilarAtrasConCloseWatcher();
  } else {
    vigilarAtrasConHistorial();
  }
}
  
/******************************
  TOGGLE MODO OSCURO
*******************************/

/* Selector de tema reutilizable. Requiere el botón #theme-toggle,
 #theme-label y #theme-icon, además de la pequeña inicialización en el head. */

const toggle = document.getElementById('theme-toggle');
const icon = document.getElementById('theme-icon');
const label = document.getElementById('theme-label');
const themeColorMeta = document.getElementById('theme-color-meta');

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
  if (themeColorMeta) {
    const raiz = getComputedStyle(document.documentElement);
    const color = raiz.getPropertyValue(fijo ? '--barra-fondo' : '--theme-color').trim();
    if (color) themeColorMeta.setAttribute('content', color);
  }
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
  window.addEventListener('radio-theme-change', () => actualizarTituloFijo(true));  // applyTheme() repone el color normal
}

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
