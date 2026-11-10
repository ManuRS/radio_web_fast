

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


// TEMPORAL (v112): diagnóstico de la barrita de carga. Enseña unos segundos, abajo, cuánto
// tarda en cargar la página y qué recursos van más lentos. Para quitarlo, borrar este bloque.
(function () {
  const t0 = performance.now();
  const marcas = {};
  document.addEventListener('DOMContentLoaded', () => { marcas.dcl = Math.round(performance.now()); });
  new PerformanceObserver(lista => {
    for (const e of lista.getEntries()) if (e.name === 'first-contentful-paint') marcas.fcp = Math.round(e.startTime);
  }).observe({ type: 'paint', buffered: true });

  window.addEventListener('load', () => {
    marcas.load = Math.round(performance.now());
    setTimeout(() => {
      try {
        const nav = performance.getEntriesByType('navigation')[0] || {};
        const rec = performance.getEntriesByType('resource')
          .sort((a, b) => b.responseEnd - a.responseEnd).slice(0, 3)
          .map(r => r.name.split('/').slice(-2).join('/') + ' ' + Math.round(r.responseEnd));
        const linea = [
          location.pathname.split('/').filter(Boolean).pop() || 'index',
          nav.type,
          navigator.serviceWorker && navigator.serviceWorker.controller ? 'SW' : 'sin SW',
          'resp ' + Math.round(nav.responseStart),
          'dcl ' + marcas.dcl,
          'fcp ' + marcas.fcp,
          'load ' + marcas.load,
          'n=' + performance.getEntriesByType('resource').length
        ].join(' · ');
        const caja = document.createElement('div');
        caja.textContent = linea + '\n' + rec.join('\n');
        caja.style.cssText = 'position:fixed;left:4px;right:4px;bottom:4px;z-index:99999;padding:6px 8px;' +
          'background:rgba(0,0,0,.8);color:#9f9;font:11px/1.35 monospace;white-space:pre-wrap;' +
          'pointer-events:none;border-radius:6px';
        document.body.appendChild(caja);
        setTimeout(() => caja.remove(), 15000);
      } catch (_) {}
    }, 300);
  });
})();
