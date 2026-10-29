
/********************************
 * Configuración
 ********************************/
const BUFFER_AHEAD_LIMIT_SECONDS = 6;
const BUFFER_CHECK_INTERVAL_MS = 10000;

// La espera crece con cada intento fallido (el último valor se repite)
// y vuelve a empezar cuando el sonido se recupera
const RECONNECT_BACKOFF_MS = [2000, 4000, 8000, 10000];

const RECONNECT_WATCHDOG_MS = 15000;

// Cada STALL_CHECK_INTERVAL_MS se comprueba si currentTime avanza.
// Si no avanza durante STALL_LIMIT_MS (y el audio no está en pausa), se reconecta.
const STALL_CHECK_INTERVAL_MS = 2000;
const STALL_LIMIT_MS = 8000;

// Tras cada "playing" no se aplica la regla de búfer excesivo durante
// este tiempo, porque tras una recuperación el navegador descarga más rápido
// de lo normal y provocaría un segundo corte justo después de reconectar.
const BUFFER_GRACE_PERIOD_MS = 30000;

// Tras un traspaso, el elemento antiguo se silencia al momento pero se
// libera pasado este tiempo, para que Android registre ya el reproductor nuevo
// antes de que desaparezca el viejo.
const HANDOVER_RELEASE_DELAY_MS = 600000;

/********************************
 * Estado del reproductor
 ********************************/
let currentAudio = null;
let currentCard = null;
let currentHls = null;

let latencyInterval = null;
let reconnectTimer = null;
let reconnecting = false;

let stallInterval = null;        // watchdog de progreso de currentTime
let lastPlaybackTime = 0;        // último currentTime observado
let lastProgressAt = 0;          // momento en que currentTime avanzó por última vez
let lastPlayingAt = 0;           // momento del último evento "playing"
let reconnectAttempts = 0;       // intentos fallidos seguidos (para la espera creciente)
let attemptInFlight = false;     // hay un intento de reconexión en curso (ya lanzado)

// Emisora en pausa por un motivo externo (notificación, sistema...).
// Sigue cargada en su elemento <audio> para que la notificación permanezca,
// pero ya no es la emisora activa: sin temporizadores ni reconexiones.
let pausedAudio = null;
let pausedCard = null;

// Traspaso en marcha. Mientras el stream nuevo (currentAudio) no suena,
// el elemento anterior queda aquí como "relevo saliente" sin tocarlo.
let retiringAudio = null;
let retiringHls = null;

// Elementos ya silenciados que se liberarán tras HANDOVER_RELEASE_DELAY_MS.
let pendingReleases = [];

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

function clearStallWatchdog() {
  if (stallInterval !== null) {
    clearInterval(stallInterval);
    stallInterval = null;
  }
}

function clearReconnectTimer() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

// Estado de la notificación de Android (Media Session).
function setMediaSessionState(state) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

  try {
    navigator.mediaSession.playbackState = state;
  } catch (error) {
    // Sin soporte: la reproducción no depende de esto.
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
 * Traspaso entre dos elementos <audio>
 ********************************/

// Devuelve el audio de una tarjeta. Con dos elementos por tarjeta (el original
// y el de relevo), el que importa es el activo o el que está en pausa.
function getCardAudio(card) {
  if (card === currentCard && currentAudio) return currentAudio;
  if (card === pausedCard && pausedAudio) return pausedAudio;

  return card.querySelector("audio");
}

// Libera un elemento: corta su conexión y lo deja vacío y reutilizable.
function releaseAudioElement(audio, hls) {
  if (hls) {
    try {
      hls.destroy();
    } catch (error) {
      // Sin consecuencias.
    }
  }

  if (!audio) return;

  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  audio.muted = false;
}

function isAudioInUse(audio) {
  return (
    audio === currentAudio ||
    audio === retiringAudio ||
    audio === pausedAudio
  );
}

// Programa la liberación de un elemento ya silenciado.
function scheduleRelease(audio, hls) {
  const entry = { audio, hls, timer: null };

  entry.timer = setTimeout(() => {
    pendingReleases = pendingReleases.filter(item => item !== entry);

    if (!isAudioInUse(audio)) {
      releaseAudioElement(audio, hls);
    }
  }, HANDOVER_RELEASE_DELAY_MS);

  pendingReleases.push(entry);
}

// Libera ya todo lo que estaba pendiente de liberar.
function flushPendingReleases() {
  const entries = pendingReleases;
  pendingReleases = [];

  entries.forEach(entry => {
    clearTimeout(entry.timer);

    if (!isAudioInUse(entry.audio)) {
      releaseAudioElement(entry.audio, entry.hls);
    }
  });
}

// Devuelve el segundo elemento <audio> de la tarjeta, y lo crea la primera vez.
// Los dos elementos se alternan: el que se libera se reutiliza en el siguiente
// traspaso, así que nunca hay más de dos por tarjeta.
function getReliefAudio(card, active) {
  let relief = [...card.querySelectorAll("audio")].find(item => item !== active);

  if (!relief) {
    relief = document.createElement("audio");
    relief.preload = "none";
    card.appendChild(relief);

    bindAudioEvents(relief);
  }

  relief.setAttribute("data-src", getStreamSrc(active));

  return relief;
}

// Prepara el traspaso y devuelve el elemento que cargará el stream nuevo.
// Si no hay nada que conservar, devuelve el mismo elemento (como antes).
function beginHandover(audio) {

  // Ya hay un traspaso en marcha: los reintentos reutilizan el mismo relevo.
  if (retiringAudio) return audio;

  // Sin reproductor cargado no hay notificación que mantener.
  if (!audio.src && !currentHls) return audio;

  flushPendingReleases();

  const relief = getReliefAudio(currentCard, audio);

  retiringAudio = audio;
  retiringHls = currentHls;
  currentHls = null;

  // El nuevo carga en silencio hasta que ya esté sonando.
  //relief.muted = true;
  relief.volume = audio.volume;

  currentAudio = relief;

  console.log("Traspaso: el stream nuevo se carga en un segundo elemento.");

  return relief;
}

// El stream nuevo ya suena: se activa su sonido y se libera el anterior.
// Primero suena el nuevo y después se retira el viejo, para que Android no se
// quede ni un instante sin reproductor.
function completeHandover(audio) {
  const old = retiringAudio;
  const oldHls = retiringHls;

  retiringAudio = null;
  retiringHls = null;

  audio.muted = false;

  if (old) {
    old.muted = true;
    scheduleRelease(old, oldHls);
  }
}

/********************************
 * Parar y limpiar el reproductor
 ********************************/

function stopCurrentPlayback() {
  clearBufferMonitor();
  clearStallWatchdog();
  clearReconnectTimer();

  const previousAudio = currentAudio;
  const previousCard = currentCard;

  // Si había una emisora en pausa, también se libera.
  const heldAudio = pausedAudio;
  pausedAudio = null;
  pausedCard = null;

  // Lo mismo con un traspaso en marcha y con las liberaciones pendientes.
  const retiring = retiringAudio;
  const retiringHlsInstance = retiringHls;
  retiringAudio = null;
  retiringHls = null;
  flushPendingReleases();

  // Desactivamos primero la sesión para impedir
  // que un evento tardío inicie otra reconexión.
  currentAudio = null;
  currentCard = null;
  reconnecting = false;
  attemptInFlight = false;
  reconnectAttempts = 0; 

  setMediaSessionState("none");

  if (previousCard) {
    previousCard.classList.remove("playing");
  }

  destroyCurrentHls();

  if (previousAudio) {
    previousAudio.pause();
    previousAudio.removeAttribute("src");
    previousAudio.load();
    previousAudio.muted = false;
  }

  if (heldAudio && heldAudio !== previousAudio) {
    heldAudio.pause();
    heldAudio.removeAttribute("src");
    heldAudio.load();
  }

  if (retiring && retiring !== previousAudio && retiring !== heldAudio) {
    releaseAudioElement(retiring, retiringHlsInstance);
  }

}

/********************************
 * Pausa desde fuera y reanudación en directo
 ********************************/

// Pasa la emisora activa a "en pausa". A diferencia de stopCurrentPlayback(),
// el elemento <audio> conserva su fuente (pausado), de modo que Android
// mantiene la notificación con el botón de reproducir.
// La sesión deja de estar activa: la tarjeta pierde "playing" y no queda
// ningún temporizador ni reconexión en marcha.
function enterPausedState(audio) {
  if (!isPlaybackRequested(audio)) return;

  clearBufferMonitor();
  clearStallWatchdog();
  clearReconnectTimer();

  const card = currentCard;

  // Si la pausa llega en pleno traspaso, se queda en pausa el
  // reproductor antiguo (el que tiene la notificación) y se descarta el nuevo.
  let held = audio;
  let heldHls = currentHls;
  let discarded = null;
  let discardedHls = null;

  if (retiringAudio) {
    discarded = audio;
    discardedHls = currentHls;
    held = retiringAudio;
    heldHls = retiringHls;
    retiringAudio = null;
    retiringHls = null;
  }

  pausedAudio = held;
  pausedCard = card;
  currentHls = heldHls;

  currentAudio = null;
  currentCard = null;
  reconnecting = false;
  attemptInFlight = false;
  reconnectAttempts = 0;

  card.classList.remove("playing");

  if (discarded) {
    releaseAudioElement(discarded, discardedHls);
  }

  // Si la pausa solo había llegado a uno de los dos, se pausa el que queda.
  held.pause();
  held.muted = false;

  // HLS: dejamos de descargar, pero mantenemos hls.js enlazado al audio
  // para que la notificación siga ahí. Al reanudar se reconstruye entero.
  if (currentHls) {
    try {
      currentHls.stopLoad();
    } catch (error) {
      // Sin consecuencias: se reconstruirá al reanudar.
    }
  }

  setMediaSessionState("paused");
}

// Reanuda la emisora en pausa saltando al directo. No se continúa desde el
// punto de la pausa (iría retrasado): reconnectNow() monta una conexión nueva.
// Devuelve false si no había ninguna emisora en pausa.
function resumeLive(reason) {
  if (!pausedAudio || !pausedCard) return false;

  const audio = pausedAudio;
  const card = pausedCard;

  pausedAudio = null;
  pausedCard = null;

  currentAudio = audio;
  currentCard = card;

  card.classList.add("playing");
  applyCurrentVolume(audio);

  reconnectNow(audio, reason, true);

  return true;
}

/********************************
 * Botón de reproducción y pausa
 ********************************/

function playPause(card) {

  // Pulsar la tarjeta de una emisora en pausa la reanuda en directo,
  // con traspaso, igual que el botón de la notificación.
  if (card === pausedCard && pausedAudio) {
    resumeLive("tarjeta pulsada");
    return;
  }

  // La tarjeta puede tener dos elementos, y vale el que esté en uso.
  const audio = getCardAudio(card);

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
  audio.muted = false; 
  applyCurrentVolume(audio);

  startStream(audio, src);
}


/********************************
 * Inicio del stream
 ********************************/

function startStream(audio, src) {
  if (!isPlaybackRequested(audio)) return;

  clearBufferMonitor();
  clearStallWatchdog();
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
          failReconnectAttempt(audio, "error fatal de HLS");
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

    // Un play() pendiente se rechaza con AbortError cuando nuestro
    // propio load() / pause() lo interrumpe al reconectar. No es un fallo de red.
    if (error?.name === "AbortError") return;

    console.error(`Error en ${context}:`, error);

    // No repetir intentos automáticos si el navegador
    // exige una nueva interacción del usuario.
    if (error?.name === "NotAllowedError") {
      stopCurrentPlayback();
      return;
    }

    // Los demás errores pueden ser transitorios.
    failReconnectAttempt(audio, context);
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

      // Periodo de gracia tras cada "playing".
      if (Date.now() - lastPlayingAt < BUFFER_GRACE_PERIOD_MS) {
        console.debug("Búfer alto, pero estamos en periodo de gracia.");
        return;
      }

      console.warn(
        "Búfer excesivo. Se intentará establecer una conexión nueva."
      );

      // Aquí no hay motivo para esperar, así que se reconecta de inmediato.
      reconnectNow(audio, "búfer excesivo");
    }

  }, BUFFER_CHECK_INTERVAL_MS);
}


/********************************
 * Watchdog de progreso de la reproducción
 ********************************/

// Con cobertura móvil es habitual que la conexión se pierda sin que
// el navegador lance error ni ended: el audio gasta el búfer y se queda
// parado. Aquí se detecta mirando si currentTime avanza (vale para MP3 y HLS).
function startStallWatchdog(audio) {
  clearStallWatchdog();

  lastPlaybackTime = audio.currentTime;
  lastProgressAt = Date.now();

  stallInterval = setInterval(() => {

    if (!isPlaybackRequested(audio) || reconnecting) return;

    // En pausa (p. ej. el sistema operativo ha pausado el audio): no es un
    // fallo de conexión, así que no acumulamos tiempo parado.
    if (audio.paused) {
      lastPlaybackTime = audio.currentTime;
      lastProgressAt = Date.now();
      return;
    }

    const now = audio.currentTime;

    if (now !== lastPlaybackTime) {
      lastPlaybackTime = now;
      lastProgressAt = Date.now();
      return;
    }

    if (Date.now() - lastProgressAt >= STALL_LIMIT_MS) {
      console.warn(
        "La reproducción no avanza. Se intentará establecer una conexión nueva."
      );

      reconnectNow(audio, "reproducción detenida sin avance");
    }

  }, STALL_CHECK_INTERVAL_MS);
}


/********************************
 * Reconexión automática
 ********************************/

// Espera creciente entre intentos.
function getReconnectDelay() {
  const index = Math.min(reconnectAttempts, RECONNECT_BACKOFF_MS.length - 1);

  reconnectAttempts++;

  return RECONNECT_BACKOFF_MS[index];
}

function reconnectAudio(audio, reason = "problema de conexión") {

  // Solo reconectar si esta emisora sigue seleccionada.
  // No comprobar audio.paused: ended también debe recuperarse.
  if (!isPlaybackRequested(audio) || reconnecting) return;

  reconnecting = true;
  attemptInFlight = false;
  clearBufferMonitor();
  clearStallWatchdog();  
  clearReconnectTimer();

  const delay = getReconnectDelay();

  console.warn(
    `Reconexión solicitada: ${reason}. Nuevo intento en ${delay / 1000} segundos.`
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;

    if (!isPlaybackRequested(audio)) {
      reconnecting = false;
      return;
    }

    runReconnectAttempt(audio);

  }, delay);
}

// Lanza un intento de reconexión ya (sin esperas).
// Se salta la guarda de "reconnecting" de reconnectAudio, porque se usa
// justo cuando queremos adelantar un intento pendiente (red recuperada,
// vuelta a la pestaña) o cuando hay que cortar un stream que ya no funciona.
function reconnectNow(audio, reason = "problema de conexión", resetBackoff = false) {
  if (!audio || !isPlaybackRequested(audio)) return;

  clearBufferMonitor();
  clearStallWatchdog();
  clearReconnectTimer();

  if (resetBackoff) {
    reconnectAttempts = 0;
  }

  reconnecting = true;

  console.warn(`Reconexión inmediata: ${reason}.`);

  runReconnectAttempt(audio);
}

// Parte común de reconectar (antes estaba dentro del setTimeout de reconnectAudio).
function runReconnectAttempt(audio) {
  const src = getStreamSrc(audio);

  if (!src) {
    reconnecting = false;
    attemptInFlight = false;
    return;
  }

  // El stream nuevo se carga en un segundo elemento mientras el actual
  // sigue ahí. Los reintentos del mismo corte reutilizan ese segundo elemento.
  audio = beginHandover(audio);

  console.log("Reconectando con la emisora...");

  attemptInFlight = true;

  // startStream limpia la fuente anterior y reconstruye HLS
  // cuando corresponde, o vuelve a cargar el stream clásico.
  startStream(audio, src);

  // Si la reproducción no se recupera, volveremos a intentarlo.
  // El evento playing cancela este temporizador al recuperarse.
  armReconnectWatchdog(audio);
}

// Antes este bloque estaba dentro del setTimeout de reconnectAudio.
function armReconnectWatchdog(audio) {

  // Si startStream ya ha fallado de forma síncrona, attemptInFlight es false
  // y ya hay otro reintento programado: no lo pisamos.
  if (!isPlaybackRequested(audio) || !reconnecting || !attemptInFlight) return;

  clearReconnectTimer();

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

    attemptInFlight = false;
    reconnecting = false;
    reconnectAudio(audio, "tiempo de espera agotado");

  }, RECONNECT_WATCHDOG_MS);
}

// Para errores reales (evento error, fallo de play(), error fatal de HLS).
// Si ya hay un intento lanzado y falla, se pasa al siguiente sin esperar a que
// caduque el watchdog de 15 s. Si no hay intento en curso, equivale a reconnectAudio.
// Los eventos ambiguos (stalled, waiting...) NO deben usar esta función.
function failReconnectAttempt(audio, reason) {
  if (!isPlaybackRequested(audio)) return;

  if (reconnecting && attemptInFlight) {
    clearReconnectTimer();
    attemptInFlight = false;
    reconnecting = false;
  }

  reconnectAudio(audio, reason);
}


/********************************
 * Recuperación al volver la red o la pestaña
 ********************************/

// Solo actuamos si el audio está realmente parado o atascado,
// para no cortar un stream que sigue sonando bien.
function recoverIfStalled(reason) {
  const audio = currentAudio;

  if (!audio || !isPlaybackRequested(audio)) return;

  if (
    reconnecting ||
    audio.paused ||
    audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA
  ) {
    // La red acaba de volver o la página vuelve a estar activa:
    // empezamos de cero la espera creciente.
    reconnectNow(audio, reason, true);
  }
}

// Evitar duplicar los listeners si este bloque se ejecuta otra vez.
if (!window.__livesoundNetworkBound) {
  window.__livesoundNetworkBound = true;

  // navigator.onLine solo indica que hay red, no que haya internet,
  // así que "online" sirve para adelantar el reintento, pero no sustituye
  // a los reintentos periódicos.
  window.addEventListener("online", () => {
    recoverIfStalled("red recuperada");
  });

  window.addEventListener("offline", () => {
    console.warn("Sin conexión. Se reconectará cuando vuelva la red.");
  });

  // En móvil, al volver a la pestaña tras bloquear la pantalla,
  // los temporizadores pueden haberse congelado.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      recoverIfStalled("pestaña visible de nuevo");
    }
  });

  // Página restaurada desde la caché de ida y vuelta del navegador.
  window.addEventListener("pageshow", event => {
    if (event.persisted) {
      recoverIfStalled("página restaurada");
    }
  });
}

// Botón de reproducir de la notificación de Android.
// Este fichero solo se carga en las páginas de radio en directo, así que en
// las páginas de podcast el navegador sigue con su play/pausa normal.
if (!window.__livesoundMediaSessionBound) {
  window.__livesoundMediaSessionBound = true;

  if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
    try {
      navigator.mediaSession.setActionHandler("play", () => {

        // Emisora en pausa: se salta al directo.
        if (resumeLive("botón de reproducir de la notificación")) return;

        // Si no había ninguna en pausa pero el audio está parado o atascado,
        // se recupera igual que al volver la red.
        recoverIfStalled("botón de reproducir de la notificación");
      });
    } catch (error) {
      // Sin soporte: el navegador mantiene su comportamiento por defecto.
    }
  }
}

/********************************
 * Eventos del audio
 ********************************/

function bindAudioEvents(audio) {

  // Evitar duplicar los listeners si este bloque se ejecuta otra vez.
  if (audio.dataset.streamRecoveryBound === "true") return;

  audio.dataset.streamRecoveryBound = "true";

  // Error del elemento multimedia.
  audio.addEventListener("error", () => {
    // Si ya había un intento en curso, se pasa al siguiente sin esperar.
    failReconnectAttempt(audio, "error del elemento audio");
  });

  // El stream ha terminado inesperadamente.
  audio.addEventListener("ended", () => {
    reconnectAudio(audio, "fin inesperado del stream");
  });

  // Se ha detenido la llegada de datos.
  // La detección la hace startStallWatchdog (progreso de currentTime)
  audio.addEventListener("stalled", () => {
    if (isPlaybackRequested(audio)) {
      console.debug("Evento stalled: lo vigila el watchdog de progreso.");
    }
  });

  // La reproducción ha comenzado o se ha recuperado.
  audio.addEventListener("playing", () => {

    if (!isPlaybackRequested(audio)) return;

    if (retiringAudio) completeHandover(audio);

    // Una reproducción recuperada cancela cualquier reintento pendiente.
    clearReconnectTimer();
    reconnecting = false;
    attemptInFlight = false;
    reconnectAttempts = 0;
    lastPlayingAt = Date.now();

    // Iniciar el monitor únicamente para MP3/AAC.
    startBufferMonitor(audio);

    // Vigilar que el audio realmente avanza.
    startStallWatchdog(audio);

    // Estado de la notificación de Android.
    setMediaSessionState("playing");

  });

  // Pausa que no hemos provocado nosotros (botón de la notificación de
  // Android, el propio sistema, auriculares desconectados...). La emisora queda
  // en pausa: la tarjeta deja de mostrar "Escuchando" y la notificación sigue
  // con su botón de reproducir. Al reanudar se salta al directo (resumeLive).
  audio.addEventListener("pause", () => {

    // Pausa externa sobre el reproductor antiguo en pleno traspaso (la
    // notificación está ligada a él). Se pasa la emisora a pausa igualmente.
    if (audio === retiringAudio) {
      if (currentAudio && isPlaybackRequested(currentAudio) && navigator.onLine !== false) {
        console.warn("Pausa externa durante un traspaso. La emisora queda en pausa.");
        enterPausedState(currentAudio);
      }
      return;
    }

    // Sesión ya cerrada o en pausa (el usuario ha pulsado la tarjeta o ha cambiado de emisora).
    if (!isPlaybackRequested(audio)) return;

    // Pausa propia de startStream() durante una reconexión.
    if (reconnecting) return;

    // Fin del stream: el navegador pausa justo antes de lanzar "ended",
    // y "ended" ya se encarga de reconectar.
    if (audio.ended) return;

    // Por si el sistema pausara el audio a causa de la caída de red:
    // se trata como un corte, no como una parada del usuario.
    if (navigator.onLine === false) {
      reconnectAudio(audio, "pausa durante una caída de red");
      return;
    }

    console.warn("Pausa externa (notificación o sistema). La emisora queda en pausa.");

    // CAMBIO: antes stopCurrentPlayback(), que cerraba la sesión y hacía
    // desaparecer la notificación.
    enterPausedState(audio);
  });

  // Reanudación que no hemos provocado nosotros. Por ejemplo, Android
  // reanuda solo el audio al terminar una llamada. El navegador continuaría
  // desde el punto de la pausa (retrasado), así que se salta al directo.
  audio.addEventListener("play", () => {
    if (audio !== pausedAudio) return;

    resumeLive("reanudación desde el sistema");
  });

}

document.querySelectorAll(".card audio").forEach(bindAudioEvents);