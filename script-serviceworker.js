
if ('serviceWorker' in navigator) {
  // Registramos directamente sin esperar al 'load'
  navigator.serviceWorker.register('/sw.js', { scope: './' })
    .then(reg => {
      console.log('✅ Service Worker registrado');
      reg.update();
    })
    .catch(err => console.log('❌ Service Worker error de registro'));
}
