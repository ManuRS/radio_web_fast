  
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
  MODAL DE SALIDA
*******************************/

// Referencias al modal y botones
const exitModal = document.getElementById("exit-modal");
const stayBtn = document.getElementById("stay-btn");

if (exitModal && stayBtn) {
  // Mantener la posición de scroll al mostrar el modal
  let scrollPosition = 0;

  // Interceptar botón atrás
  window.addEventListener("load", () => {
    history.pushState({ exitModal: true }, "", location.href);

    window.addEventListener("popstate", () => {
      scrollPosition = window.scrollY;

      // Mostrar modal en vez de cerrar
      exitModal.style.display = "flex";

      // Reponer la entrada del historial
      history.pushState({ exitModal: true }, "", location.href);

      // Restaurar el scroll si el navegador lo modifica
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollPosition);
      });

    });

  });

  // Botón "Seguir escuchando"
  stayBtn.addEventListener("click", () => {
    exitModal.style.display = "none";
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



