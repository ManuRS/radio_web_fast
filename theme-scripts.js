  

/*********
  VOLUMEN
**********/

// Referencia al slider de volumen
const volumeSlider = document.getElementById('volume-slider');

// Event listener para cambiar el volumen en tiempo real
if (volumeSlider) {
  volumeSlider.addEventListener('input', (e) => {
    if (currentAudio) {
      currentAudio.volume = e.target.value;
    }
  });
}


/*********
  MODO OSCURO
**********/

/* Selector de tema reutilizable. Requiere el botón #theme-toggle,
 #theme-label y #theme-icon, además de la pequeña inicialización en el head. */

const toggle = document.getElementById('theme-toggle');
const icon = document.getElementById('theme-icon');
const label = document.getElementById('theme-label');
const themeColorMeta = document.getElementById('theme-color-meta');

if (toggle && icon && label){

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const dark = theme === 'dark';
    icon.textContent = dark ? '☀️' : '🌙';
    label.textContent = dark ? 'Modo claro' : 'Modo oscuro';
    toggle.setAttribute('aria-label', dark ? 'Activar modo claro' : 'Activar modo oscuro');
    toggle.setAttribute('aria-pressed', String(dark));
    if (themeColorMeta) themeColorMeta.setAttribute('content', dark ? '#111827' : '#1a237e');
  }

  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

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