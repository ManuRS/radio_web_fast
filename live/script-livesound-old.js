
/********************************
 * Declaraciones
 * *****************************/
let currentAudio = null;
let currentCard = null;
let currentHls = null; // instancia de hls.js

let latencyInterval = null;
let reconnectTimer = null;
let reconnecting = false;

/********************************
 * Funcion de play y pausa
 * *****************************/
function playPause(card) {
  const audio = card.querySelector('audio');
  const originalSrc = audio.getAttribute("data-src");

  // Limpiar intervalo de latencia previo si existía
  if (latencyInterval) {
    clearInterval(latencyInterval);
    latencyInterval = null;
  }

  // Si ya hay otro sonando, lo paro y limpio
  if (currentAudio && currentAudio !== audio) {

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    reconnecting = false;

    currentAudio.pause();
    if (currentHls) {
      currentHls.destroy();
      currentHls = null;
    }
    currentAudio.removeAttribute("src");
    currentAudio.load();
    if (currentCard) currentCard.classList.remove("playing");
  }

  // Audio pausado
  if (audio.paused) {

    audio.volume = volumeSlider.value; // Aplicar el volumen actual del slider al nuevo audio
    
    if (originalSrc.endsWith(".m3u8")) {

      /*********** Caso HLS ***********/
      if (Hls.isSupported()) {
        // Configuramos hls.js para priorizar baja latencia
        currentHls = new Hls({
          liveSyncDurationCount: 3, // Reduce el número de fragmentos antes del borde en directo
          liveMaxLatencyDurationCount: 10,
        });
        currentHls.loadSource(originalSrc);
        currentHls.attachMedia(audio);
        currentHls.on(Hls.Events.MANIFEST_PARSED, () => {
          audio.play().catch(err => console.error("Error al reproducir HLS:", err));
        });
      } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari
        audio.src = originalSrc;
        audio.play();
      } else {
        console.error("Este navegador no soporta HLS");
      }

    } else {

      /*********** Caso MP3 / AAC clásico (Icecast / Shoutcast) ***********/
      if (!audio.src) audio.src = originalSrc;
      audio.play().catch(err => console.error("Error al reproducir:", err));

      // Control para evitar que el streaming de audio clásico se quede retrasado
      latencyInterval = setInterval(() => {
        if (!audio.paused && audio.buffered.length > 0) {
          const livePosition = audio.buffered.end(audio.buffered.length - 1);
          const margenSegundos = livePosition - audio.currentTime;

          console.log(`Margen con el directo: ${margenSegundos.toFixed(2)} segundos`);

          // Si el retraso acumulado supera los 6 segundos, saltamos al borde actual
          if (livePosition - audio.currentTime > 6) {
            console.warn("Retraso crítico detectado. Reiniciando stream para conectar al directo...");
            audio.src = originalSrc; // Esto limpia el búfer acumulado
            audio.load();
            audio.play().catch(err => console.error("Error al reconectar stream:", err));
          }
        }
      }, 10000);

    }

    card.classList.add("playing");
    currentAudio = audio;
    currentCard = card;

  } else {
    audio.pause();

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    reconnecting = false;

    if (currentHls) {
      currentHls.destroy();
      currentHls = null;
    }
    audio.removeAttribute("src");
    audio.load();

    card.classList.remove("playing");
    currentAudio = null;
    currentCard = null;
  }
}

/********************************
 * Reconexión automática ante problemas de conexión
 * *****************************/
document.querySelectorAll('.card audio').forEach(audio => {

  audio.addEventListener('error', () => {
    console.log("⚠️ Error en el stream");
    reconnectAudio(audio);
  });

  audio.addEventListener('ended', () => {
    console.log("⚠️ El stream ha terminado");
    reconnectAudio(audio);
  });

  audio.addEventListener('stalled', () => {
    console.log("⚠️ Stream detenido");
    reconnectAudio(audio);
  });

});

function reconnectAudio(audio) {
  // Solo reconectar si sigue siendo la emisora activa
  if (audio !== currentAudio || audio.paused || reconnecting) return;

  reconnecting = true;

  clearTimeout(reconnectTimer);

  reconnectTimer = setTimeout(() => {
    // Comprobar de nuevo que sigue siendo la emisora activa
    if (audio !== currentAudio || audio.paused) {
      reconnecting = false;
      return;
    }

    const src = audio.getAttribute("data-src");
    if (!src) {
      reconnecting = false;
      return;
    }

    console.log("🔄 Reconectando con la emisora...");

    // HLS
    if (src.endsWith(".m3u8")) {
      if (currentHls) {
        currentHls.destroy();
        currentHls = null;
      }

      if (Hls.isSupported()) {
        currentHls = new Hls({
          liveSyncDurationCount: 6,
          liveMaxLatencyDurationCount: 15
        });

        currentHls.loadSource(src);
        currentHls.attachMedia(audio);

        currentHls.on(Hls.Events.MANIFEST_PARSED, () => {
          audio.play().catch(err => console.error("Error al reconectar HLS:", err));
          reconnecting = false;
        });

      } else {
        audio.src = src;
        audio.load();
        audio.play().catch(err => console.error("Error al reconectar:", err));
        reconnecting = false;
      }

    // MP3 / AAC
    } else {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();

      audio.src = src;
      audio.load();

      audio.play().catch(err => console.error("Error al reconectar:", err));

      reconnecting = false;
    }

  }, 5000); // Esperamos 5 segundos antes de reconectar
}


