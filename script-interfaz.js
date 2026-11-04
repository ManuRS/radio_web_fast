  
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
const exitModal = document.getElementById("exit-modal");
const stayBtn = document.getElementById("stay-btn");

if (exitModal && stayBtn) {
  let scrollPosition = 0;
  let modalAbierto = false;
  let audioIniciado = false;

  // Detectar reproducciones, incluidos los audios creados dinámicamente
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
      exitModal.style.display = "none";
      modalAbierto = false;
      return;
    }

    // Mostrar el modal
    scrollPosition = window.scrollY;
    modalAbierto = true;
    exitModal.style.display = "flex";

    // Mantener una entrada para el siguiente gesto atrás
    history.pushState({ exitModal: true }, "", location.href);

    requestAnimationFrame(() => {
      window.scrollTo(0, scrollPosition);
    });
  });

  stayBtn.addEventListener("click", () => {
    exitModal.style.display = "none";
    modalAbierto = false;
    window.scrollTo(0, scrollPosition);
  });
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

/* Sincronizar los cambios procedentes de otras pestañas */
window.addEventListener('storage', event => {
  if (event.key === 'radio-page-theme' && event.newValue !== null) {
    applyTheme(event.newValue === 'dark' ? 'dark' : 'light');
  }
});

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
  appBase = appBase.replace(/(?:live|live_boleto|live_ser)\/$/, '');

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
   Al darle a play, la notificación pasa a ser la de ese capítulo, con los botones de -10 y +10 s. */
document.addEventListener('play', event => {
  const audio = event.target;
  if (!(audio instanceof HTMLAudioElement) || !audio.dataset.notifTitulo) return;

  RWFNotificacion.poner({
    titulo: audio.dataset.notifTitulo,
    acciones: {
      seekbackward: () => { audio.currentTime = Math.max(0, audio.currentTime - 10); },
      seekforward: () => { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 10); }
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
  localStorage.setItem('selectedCategory', category);
}

/********************************
 * CATEGORIAS - Mostrar la categoría guardada (o "general" por defecto)
 * *****************************/
window.addEventListener("DOMContentLoaded", () => {
  // Las páginas sin botones de categoría no necesitan inicialización.
  const buttons = document.querySelectorAll('.category-btn');
  if (!buttons.length) return;

  const savedCategory = localStorage.getItem("selectedCategory") || "general";

  const btn = [...buttons].find(b =>
    b.getAttribute('onclick')?.includes(savedCategory)
  );

  filterStations(savedCategory, btn);
});
