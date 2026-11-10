

// Aplicar el tema guardado antes de mostrar la página para evitar destellos.
try {
  const savedTheme = localStorage.getItem('radio-page-theme');
  if (savedTheme === 'dark' || savedTheme === 'light') {
    document.documentElement.dataset.theme = savedTheme;
    // Color de la barra de estado desde el primer momento (el meta lleva el claro y
    // script-interfaz.js lo ajustaba al final, con la página ya pintada)
    const meta = document.getElementById('theme-color-meta');
    if (meta) meta.setAttribute('content', savedTheme === 'dark' ? '#111827' : '#f6f6f6');
  }
} catch (error) {
  // Si el almacenamiento está bloqueado, la página funciona en modo claro.
}

