/********************************
 * Configuración
 ********************************/
const BUFFER_AHEAD_LIMIT_SECONDS = 6;
const BUFFER_CHECK_INTERVAL_MS = 10000;
const RECONNECT_DELAY_MS = 5000;
const RECONNECT_WATCHDOG_MS = 15000;

/********************************
 * Estado del reproductor
 ********************************/
let currentAudio = null;
let currentCard = null;
let currentHls = null;

let latencyInterval = null;
let reconnectTimer = null;
let reconnecting = false;


/********************************
 * Utilidades
 ********************************/

function getStreamSrc(audio) {
  return audio?.getAttribute("data-src")?.trim() || "";
}

function isHlsSource(src) {
  return /\.m3u8(?:[?#].*)?$/i.test(src);
}

// Comprobamos si esta emisora sigue siendo la seleccionada.
// No dependemos de audio.paused, porque ended también lo activa.
function isPlaybackRequested(audio) {
  return (
    audio === currentAudio &&
    currentCard !== null &&
    currentCard.classList.contains("playing")
  );
}

function clearBufferMonitor() {
  if (latencyInterval !== null) {
    clearInterval(latencyInterval);
    latencyInterval = null;
  }
}

function clearReconnectTimer() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function destroyCurrentHls() {
  if (!currentHls) return;

  const hls = currentHls;
  currentHls = null;

  hls.destroy();
}

function applyCurrentVolume(audio) {
  const slider = document.getElementById("volumeSlider");

  if (!slider) return;

  const volume = Number(slider.value);

  if (Number.isFinite(volume)) {
    audio.volume = Math.max(0, Math.min(1, volume));
  }
}


/********************************
 * Parar y limpiar el reproductor
 ********************************/

function stopCurrentPlayback() {
  clearBufferMonitor();
  clearReconnectTimer();

  const previousAudio = currentAudio;
  const previousCard = currentCard;

  // Desactivamos primero la sesión para impedir
  // que un evento tardío inicie otra reconexión.
  currentAudio = null;
  currentCard = null;
  reconnecting = false;

  if (previousCard) {
    previousCard.classList.remove("playing");
  }

  destroyCurrentHls();

  if (previousAudio) {
    previousAudio.pause();
    previousAudio.removeAttribute("src");
    previousAudio.load();
  }
}


/********************************
 * Botón de reproducción y pausa
 ********************************/

function playPause(card) {
  const audio = card.querySelector("audio");

  if (!audio) {
    console.error("La tarjeta no contiene ningún elemento audio.");
    return;
  }

  const src = getStreamSrc(audio);

  if (!src) {
    console.error("La emisora no tiene data-src configurado.");
    return;
  }

  // Si pulsamos la emisora activa, paramos la reproducción.
  if (
    audio === currentAudio &&
    currentCard === card &&
    card.classList.contains("playing")
  ) {
    stopCurrentPlayback();
    return;
  }

  // Al cambiar de emisora, limpiamos completamente la anterior.
  stopCurrentPlayback();

  currentAudio = audio;
  currentCard = card;

  card.classList.add("playing");
  applyCurrentVolume(audio);

  startStream(audio, src);
}


/********************************
 * Inicio del stream
 ********************************/

function startStream(audio, src) {
  if (!isPlaybackRequested(audio)) return;

  clearBufferMonitor();
  destroyCurrentHls();

  // Eliminar el recurso anterior y forzar una carga limpia.
  audio.pause();
  audio.removeAttribute("src");
  audio.load();

  /*********** HLS ***********/

  if (isHlsSource(src)) {

    // HLS mediante hls.js.
    if (typeof Hls !== "undefined" && Hls.isSupported()) {

      const hls = new Hls({
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 10
      });

      currentHls = hls;

      // Gestionar errores propios de hls.js.
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (
          !isPlaybackRequested(audio) ||
          currentHls !== hls ||
          !data.fatal
        ) {
          return;
        }

        console.warn("Error fatal en HLS:", data.details);

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {

          // hls.js intenta recuperar la conexión.
          hls.startLoad();

        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {

          // Intentar recuperar errores del decodificador.
          hls.recoverMediaError();

        } else {

          // Error fatal que no podemos recuperar directamente.
          reconnectAudio(audio, "error fatal de HLS");
        }
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (
          !isPlaybackRequested(audio) ||
          currentHls !== hls
        ) {
          return;
        }

        requestAudioPlay(audio, "reproducción HLS");
      });

      hls.loadSource(src);
      hls.attachMedia(audio);

    // HLS nativo, por ejemplo, en Safari.
    } else if (
      audio.canPlayType("application/vnd.apple.mpegurl") ||
      audio.canPlayType("audio/mpegurl")
    ) {

      audio.src = src;
      audio.load();

      requestAudioPlay(audio, "reproducción HLS nativa");

    } else {

      console.error("Este navegador no soporta HLS.");
      stopCurrentPlayback();
    }

    return;
  }

  /*********** MP3 / AAC ***********/

  audio.src = src;
  audio.load();

  requestAudioPlay(audio, "reproducción de audio");
}


/********************************
 * Reproducir y gestionar errores
 ********************************/

function requestAudioPlay(audio, context) {
  function handlePlayError(error) {
    if (!isPlaybackRequested(audio)) return;

    console.error(`Error en ${context}:`, error);

    // No repetir intentos automáticos si el navegador
    // exige una nueva interacción del usuario.
    if (error?.name === "NotAllowedError") {
      stopCurrentPlayback();
      return;
    }

    // Los demás errores pueden ser transitorios.
    reconnectAudio(audio, context);
  }

  let playPromise;

  try {
    playPromise = audio.play();
  } catch (error) {
    handlePlayError(error);
    return;
  }

  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(handlePlayError);
  }
}


/********************************
 * Monitor de búfer para MP3 / AAC
 ********************************/

function startBufferMonitor(audio) {
  clearBufferMonitor();

  // No aplicar esta heurística a HLS.
  if (isHlsSource(getStreamSrc(audio))) return;

  latencyInterval = setInterval(() => {

    if (
      !isPlaybackRequested(audio) ||
      audio.paused ||
      reconnecting
    ) {
      return;
    }

    const buffered = audio.buffered;

    if (!buffered || buffered.length === 0) return;

    let bufferAhead;

    try {
      bufferAhead =
        buffered.end(buffered.length - 1) - audio.currentTime;
    } catch (error) {
      return;
    }

    if (!Number.isFinite(bufferAhead) || bufferAhead < 0) {
      return;
    }

    console.debug(
      `Búfer por delante: ${bufferAhead.toFixed(2)} segundos`
    );

    // Es una heurística, no una medición real del retraso FM.
    if (bufferAhead > BUFFER_AHEAD_LIMIT_SECONDS) {
      console.warn(
        "Búfer excesivo. Se intentará establecer una conexión nueva."
      );

      reconnectAudio(audio, "búfer excesivo");
    }

  }, BUFFER_CHECK_INTERVAL_MS);
}


/********************************
 * Reconexión automática
 ********************************/

function reconnectAudio(audio, reason = "problema de conexión") {

  // Solo reconectar si esta emisora sigue seleccionada.
  // No comprobar audio.paused: ended también debe recuperarse.
  if (!isPlaybackRequested(audio) || reconnecting) return;

  reconnecting = true;
  clearBufferMonitor();
  clearReconnectTimer();

  console.warn(
    `Reconexión solicitada: ${reason}. Nuevo intento en 5 segundos.`
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;

    if (!isPlaybackRequested(audio)) {
      reconnecting = false;
      return;
    }

    const src = getStreamSrc(audio);

    if (!src) {
      reconnecting = false;
      return;
    }

    console.log("Reconectando con la emisora...");

    // startStream limpia la fuente anterior y reconstruye HLS
    // cuando corresponde, o vuelve a cargar el stream clásico.
    startStream(audio, src);

    // Si la reproducción no se recupera, volveremos a intentarlo.
    // El evento playing cancela este temporizador al recuperarse.
    if (isPlaybackRequested(audio) && reconnecting) {

      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;

        if (
          !isPlaybackRequested(audio) ||
          !reconnecting
        ) {
          return;
        }

        console.warn(
          "La reconexión no se ha confirmado. Se preparará otro intento."
        );

        reconnecting = false;
        reconnectAudio(audio, "tiempo de espera agotado");

      }, RECONNECT_WATCHDOG_MS);
    }

  }, RECONNECT_DELAY_MS);
}


/********************************
 * Eventos del audio
 ********************************/

document.querySelectorAll(".card audio").forEach(audio => {

  // Evitar duplicar los listeners si este bloque se ejecuta otra vez.
  if (audio.dataset.streamRecoveryBound === "true") return;

  audio.dataset.streamRecoveryBound = "true";

  // Error del elemento multimedia.
  audio.addEventListener("error", () => {
    reconnectAudio(audio, "error del elemento audio");
  });

  // El stream ha terminado inesperadamente.
  audio.addEventListener("ended", () => {
    reconnectAudio(audio, "fin inesperado del stream");
  });

  // Se ha detenido la llegada de datos.
  audio.addEventListener("stalled", () => {
    reconnectAudio(audio, "stream detenido");
  });

  // La reproducción ha comenzado o se ha recuperado.
  audio.addEventListener("playing", () => {

    if (!isPlaybackRequested(audio)) return;

    // Una reproducción recuperada cancela cualquier reintento pendiente.
    clearReconnectTimer();
    reconnecting = false;

    // Iniciar el monitor únicamente para MP3/AAC.
    startBufferMonitor(audio);
  });

});