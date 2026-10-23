

// Aplicar el tema guardado antes de mostrar la página para evitar destellos.
try {
  const savedTheme = localStorage.getItem('radio-page-theme');
  if (savedTheme === 'dark' || savedTheme === 'light') {
    document.documentElement.dataset.theme = savedTheme;
  }
} catch (error) {
  // Si el almacenamiento está bloqueado, la página funciona en modo claro.
}

