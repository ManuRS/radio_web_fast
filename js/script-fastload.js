// Aplicar el tema antes de mostrar la página para evitar destellos: el guardado por el usuario y,
// si no ha elegido ninguno, el del dispositivo.
try {
  let tema = null;
  try {
    tema = localStorage.getItem('radio-page-theme');
  } catch (error) {
    // Almacenamiento bloqueado: se usa el del dispositivo.
  }
  if (tema !== 'dark' && tema !== 'light') {
    tema = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = tema;
  // Color de la barra de estado desde el primer momento (el meta lleva el claro y
  // script-interfaz.js lo ajustaba al final, con la página ya pintada)
  const meta = document.getElementById('theme-color-meta');
  if (meta) meta.setAttribute('content', tema === 'dark' ? '#111827' : '#f6f6f6');
} catch (error) {
  // Si no se puede saber, la página funciona en modo claro.
}
