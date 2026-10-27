
/********************************
 * SERVICEWORKER
 * *****************************/

if ('serviceWorker' in navigator) {
  // Detectar la raíz de la aplicación
  let appBase = location.pathname.substring(
    0,
    location.pathname.lastIndexOf('/') + 1
  );

  // Las páginas dentro de estas carpetas vuelven a la raíz
  appBase = appBase.replace(/(?:live|live_boleto|live_ser)\/$/, '');

  const swPath = `${appBase}sw.js`;

  navigator.serviceWorker.register(swPath, {
    scope: appBase
  })
    .then(reg => {
      console.log('✅ Service Worker registrado:', reg.scope);
      return reg.update();
    })
    .catch(err => {
      console.error('❌ Error al registrar el Service Worker:', err);
    });
}
