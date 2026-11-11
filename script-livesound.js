/********************************
 * script-livesound.js
 *
 * Reproduce un stream de radio en directo y lo mantiene vivo: reconecta tras cortes de
 * red o cobertura, salta al directo al reanudar y conserva la notificación de Android
 * (traspaso entre dos <audio>, así la notificación no desaparece al reconectar).
 *
 * Dos formas de uso:
 *  - Páginas de tarjetas (.card con un <audio data-src="...">): no hay que hacer nada,
 *    se crea una instancia por defecto y quedan los globales playPause(card), etc.
 *  - Páginas con su propia lógica (live_boleto): una instancia por stream,
 *      const live = createLiveSound({ shouldResume: () => true });
 *      live.bindAudioEvents(audioEl);   // el <audio> lleva data-src y vive dentro de una tarjeta oculta
 *      live.startLive(card);            // arranca o salta al directo
 *      live.volume = 0.5;               // también el del elemento de relevo
 *      live.hold();                     // pausa retenida: la notificación no se cierra
 *      live.stop();                     // cierra la sesión (la notificación desaparece)
 *      live.playing                     // true si algún <audio> suena
 *    shouldResume() devuelve false para vetar que la notificación reanude esa emisora.
 *    Con { notificacion: false } la instancia no toca el título ni los botones de la
 *    notificación (RWFNotificacion, en script-interfaz.js): los pone la página.
 *
 * Ecualizador: los <audio> con data-eq="true" pasan por script-ecualizador.js, que debe
 * cargarse antes que este fichero. Si no está cargado, todo suena como siempre.
 *
 * Todo el estado de una instancia vive en createLiveSound() y lo comparten sus partes
 * (reconexión, traspaso, pausa y eventos), por eso va en un único bloque.
 ********************************/

/********************************
 * Configuración
 ********************************/
const BUFFER_AHEAD_LIMIT_SECONDS = 6;
const BUFFER_CHECK_INTERVAL_MS = 10000;

// La espera crece con cada intento fallido (el último valor se repite)
// y vuelve a empezar cuando el sonido se recupera
const RECONNECT_BACKOFF_MS = [2000, 4000, 8000, 10000];

// Tras una reconexión, la espera creciente solo se reinicia cuando la emisora lleva este tiempo
// sonando seguido. Si suena un instante y vuelve a caerse, el contador sigue donde estaba (si no,
// una emisora que se cae cada pocos segundos reconectaría cada ~6 s para siempre).
const STABLE_PLAY_MS = 10000;

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
const HANDOVER_RELEASE_DELAY_MS = 1500;

// Al cambiar a otra emisora, la anterior sigue sonando hasta que la nueva suena. Si la nueva
// no suena en este tiempo (URL caída, servidor colgado), se descarta y se vuelve a la anterior.
const SWITCH_TIMEOUT_MS = 15000;

// Al cambiar a otra emisora, cuando la nueva suena las dos se oyen a la vez: una sale y la otra
// entra (fundido cruzado de potencia constante, como en Neo) durante este tiempo. Con 0 el cambio
// es el de siempre: la anterior se corta en seco y la nueva entra de golpe.
const CROSSFADE_MS = 1200;

// Si la anterior estaba en pausa no hay nada con lo que cruzar: la nueva solo sube durante este tiempo.
const FADE_IN_MS = 500;

/********************************
 * Instancias y notificación (comunes a todas)
 ********************************/

// Cada llamada a createLiveSound() gestiona un stream independiente (su propia
// reconexión, traspaso y pausa). Las páginas de tarjetas usan una sola, creada
// al final del fichero; live_boleto crea dos (noticias y música).
const __liveInstances = [];

function refreshMediaSessionState() {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

  const states = __liveInstances.map(item => item.getMediaState());
  const state = states.includes("playing") ? "playing"
              : states.includes("paused") ? "paused" : "none";

  try {
    navigator.mediaSession.playbackState = state;
  } catch (error) {
    // Sin soporte: la reproducción no depende de esto.
  }
}


/********************************
 * Fábrica: un stream en directo independiente
 ********************************/
function createLiveSound(options = {}) {

  /********************************
   * Estado del reproductor
   ********************************/
  let currentAudio = null;
  let currentCard = null;
  let currentHls = null;

  let bufferInterval = null;
  let reconnectTimer = null;
  let reconnecting = false;

  let stallInterval = null;        // watchdog de progreso de currentTime
  let lastPlaybackTime = 0;        // último currentTime observado
  let lastProgressAt = 0;          // momento en que currentTime avanzó por última vez
  let lastPlayingAt = 0;           // momento del último evento "playing"
  let reconnectAttempts = 0;       // intentos fallidos seguidos (para la espera creciente)
  let attemptInFlight = false;     // hay un intento de reconexión en curso (ya lanzado)
  let stableTimer = null;          // reinicia reconnectAttempts tras STABLE_PLAY_MS sonando seguido
  let reconnectEpoch = 0;          // cuenta los cortes: anula el temporizador de estabilidad pendiente

  // Emisora en pausa por un motivo externo (notificación, sistema...).
  // Sigue cargada en su elemento <audio> para que la notificación permanezca,
  // pero ya no es la emisora activa: sin temporizadores ni reconexiones.
  let pausedAudio = null;
  let pausedCard = null;

  // Traspaso en marcha. Mientras el stream nuevo (currentAudio) no suena,
  // el elemento anterior queda aquí como "relevo saliente" sin tocarlo.
  let retiringAudio = null;
  let retiringHls = null;
  let retiringCard = null;          // tarjeta a la que pertenece el relevo saliente
  let retiringWasPaused = false;    // el relevo saliente ya estaba en pausa antes del cambio
  let switchTimer = null;           // límite de espera de un cambio de emisora (SWITCH_TIMEOUT_MS)

  // Elementos ya silenciados que se liberarán tras HANDOVER_RELEASE_DELAY_MS.
  let pendingReleases = [];

  let ignoreRetiringPauseUntil = 0;

  // options.shouldResume() -> false impide que la notificación o el sistema
  // reanuden esta emisora (por defecto siempre se puede).
  function shouldResume() {
    return typeof options.shouldResume === "function" ? options.shouldResume() !== false : true;
  }

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
    if (bufferInterval !== null) {
      clearInterval(bufferInterval);
      bufferInterval = null;
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

  // Estado de la notificación de Android (Media Session). Con varias instancias,
  // el estado real de la notificación es el conjunto de todas (refreshMediaSessionState).
  let mediaState = "none";

  function setMediaSessionState(state) {
    mediaState = state;
    refreshMediaSessionState();
  }

  // Título y botones de la notificación de las páginas de tarjetas: el nombre de la
  // emisora y, si su categoría (generalistas o musicales) tiene más de una, << y >> para
  // recorrerla. live_boleto lo gestiona la propia página (options.notificacion = false).
  function publicarNotificacion(card) {
    if (options.notificacion === false) return;
    if (typeof RWFNotificacion === "undefined" || !card) return;

    const nombre = card.querySelector(".station-name")?.textContent.trim();
    if (!nombre) return;

    const categoria = card.classList.contains("musical") ? "musical" : "general";
    const tarjetas = [...document.querySelectorAll(`.card.${categoria}`)];
    const posicion = tarjetas.indexOf(card);

    // Cíclico: tras la última se vuelve a la primera. Se cuenta desde la última emisora
    // pedida (currentCard), no desde la que aún suena, para que varias pulsaciones
    // seguidas, antes de que conecte la nueva, avancen de una en una.
    const irA = (salto) => () => {
      const base = tarjetas.indexOf(currentCard ?? pausedCard);
      const desde = base >= 0 ? base : posicion;
      playPause(tarjetas[(desde + salto + tarjetas.length) % tarjetas.length]);
    };

    RWFNotificacion.poner({
      titulo: nombre,
      acciones: (tarjetas.length > 1 && posicion >= 0)
        ? { previoustrack: irA(-1), nexttrack: irA(1) }
        : {}
    });
  }

  function destroyCurrentHls() {
    if (!currentHls) return;

    const hls = currentHls;
    currentHls = null;

    hls.destroy();
  }

  // Volumen fijado desde fuera con setVolume(). Si es null, se usa el slider #volume-slider.
  let volumeOverride = null;

  // Volumen de referencia (0-1): el fijado con setVolume() o, si no, el del slider.
  // Devuelve null si no hay ninguno de los dos.
  function baseVolume() {
    if (volumeOverride !== null) return volumeOverride;

    const slider = document.getElementById("volume-slider");

    if (!slider) return null;

    const volume = Number(slider.value);

    return Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : null;
  }

  function applyCurrentVolume(audio) {
    // Una emisora que esperaba en silencio para entrar con fundido recupera su volumen.
    const estabaEnSilencio = audio.__entraConFundido === true;
    audio.__entraConFundido = false;

    const volume = baseVolume();

    if (volume !== null) audio.volume = volume;
    else if (estabaEnSilencio) audio.volume = 1;
  }

  /********************************
   * Fundido cruzado al cambiar de emisora
   ********************************/

  // Fundidos en marcha por elemento <audio>: el que sale y el que entra comparten el mismo registro.
  const crossfades = new Map();

  // Un elemento que se libera deja su fundido. Si es el que entra, no queda nada que fundir;
  // si es el que sale, el que entra termina de subir por su cuenta.
  function cancelCrossfade(audio) {
    const fade = crossfades.get(audio);

    if (!fade) return;

    crossfades.delete(audio);

    if (audio === fade.entering) {
      clearInterval(fade.timer);
      if (fade.leaving) crossfades.delete(fade.leaving);
    } else {
      fade.leaving = null;
    }
  }

  // leaving puede ser null: entonces solo sube la que entra.
  function startCrossfade(leaving, entering, ms) {
    if (leaving) cancelCrossfade(leaving);
    cancelCrossfade(entering);

    if (leaving) leaving.__volumenAlterado = true;
    entering.__volumenAlterado = true;

    const from = leaving ? leaving.volume : 1;
    const start = performance.now();
    const fade = { leaving, entering, timer: null };

    const step = () => {
      const k = Math.min(1, (performance.now() - start) / ms);
      const target = baseVolume() ?? from;

      // Potencia constante: la suma de los dos no se hunde en el centro del fundido.
      entering.volume = Math.max(0, Math.min(1, target * Math.sin(k * Math.PI / 2)));

      if (fade.leaving) {
        fade.leaving.volume = Math.max(0, Math.min(1, from * Math.cos(k * Math.PI / 2)));
      }

      if (k >= 1) {
        clearInterval(fade.timer);
        crossfades.delete(entering);
        if (fade.leaving) crossfades.delete(fade.leaving);
      }
    };

    if (leaving) crossfades.set(leaving, fade);
    crossfades.set(entering, fade);
    fade.timer = setInterval(step, 40);
    step();
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

    cancelCrossfade(audio);
    audio.__entraConFundido = false;

    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    audio.muted = false;

    // El elemento se reutilizará: si un fundido le dejó el volumen a medias, vuelve al de referencia.
    if (audio.__volumenAlterado) {
      audio.__volumenAlterado = false;
      audio.volume = baseVolume() ?? 1;
    }
  }

  function isAudioInUse(audio) {
    return (
      audio === currentAudio ||
      audio === retiringAudio ||
      audio === pausedAudio
    );
  }

  // Programa la liberación de un elemento ya silenciado.
  function scheduleRelease(audio, hls, delay = HANDOVER_RELEASE_DELAY_MS) {
    const entry = { audio, hls, timer: null };

    entry.timer = setTimeout(() => {
      pendingReleases = pendingReleases.filter(item => item !== entry);

      if (!isAudioInUse(audio)) {
        releaseAudioElement(audio, hls);
      }
    }, delay);

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

      // El relevo hereda si la emisora pasa por el ecualizador.
      if (active.dataset.eq) relief.dataset.eq = active.dataset.eq;

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
    retiringCard = currentCard;
    retiringWasPaused = false;
    currentHls = null;

    if (!audio.paused && audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
      ignoreRetiringPauseUntil = Date.now() + 1000;
      audio.pause();
    }

    // Antes se cargaba en silencio hasta que ya esté sonando.
    // relief.muted = true;
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
    const oldCard = retiringCard;
    const oldWasPaused = retiringWasPaused;
    const estabaEnSilencio = audio.__entraConFundido === true;

    retiringAudio = null;
    retiringHls = null;
    retiringCard = null;
    retiringWasPaused = false;
    clearSwitchTimer();

    audio.muted = false;
    audio.__entraConFundido = false;

    // Cambio a otra emisora (otra tarjeta). Si la anterior sonaba, las dos suenan a la vez mientras
    // una sale y la otra entra; si estaba en pausa, la nueva solo sube. Una reconexión de la misma
    // emisora (misma tarjeta) no se toca: la anterior casi siempre ya está cortada.
    const cambioDeTarjeta = CROSSFADE_MS > 0 && old && oldCard && oldCard !== currentCard;
    const solape = cambioDeTarjeta && !oldWasPaused && !old.paused && !old.muted;

    if (solape) {
      startCrossfade(old, audio, CROSSFADE_MS);
      scheduleRelease(old, oldHls, CROSSFADE_MS + 500);
      return;
    }

    if (estabaEnSilencio) {
      if (cambioDeTarjeta) startCrossfade(null, audio, FADE_IN_MS);
      else applyCurrentVolume(audio);
    }

    if (old) {
      old.muted = true;
      scheduleRelease(old, oldHls);
    }
  }

  // Cambio a otra tarjeta con una emisora ya cargada (sonando o en pausa): esa emisora
  // pasa a ser el "relevo saliente", igual que en una reconexión. Sigue ahí, con el
  // sonido, hasta que la nueva suena de verdad; entonces completeHandover() la retira.
  // Así Android no se queda ni un instante sin reproductor y la notificación no
  // parpadea. Si hay prisa (varios << seguidos), se retiene siempre la primera y las
  // intermedias, que aún no sonaban, se descartan.
  // Devuelve false (sin tocar nada) si no hay emisora que retener.
  function beginCardSwitch() {
    flushPendingReleases();

    let keep = null;
    let keepHls = null;
    let keepCard = null;
    let keepPaused = false;

    if (retiringAudio) {
      keep = retiringAudio;
      keepHls = retiringHls;
      keepCard = retiringCard;
      keepPaused = retiringWasPaused;

      if (currentAudio && currentAudio !== keep) {
        currentCard?.classList.remove("playing");
        releaseAudioElement(currentAudio, currentHls);
      }
    } else if (currentAudio && (currentAudio.src || currentHls)) {
      keep = currentAudio;
      keepHls = currentHls;
      keepCard = currentCard;
      currentCard?.classList.remove("playing");
    } else if (pausedAudio) {
      keep = pausedAudio;
      keepHls = currentHls;
      keepCard = pausedCard;
      keepPaused = true;
    }

    if (!keep) return false;

    clearBufferMonitor();
    clearStallWatchdog();
    clearReconnectTimer();

    pausedAudio = null;
    pausedCard = null;
    currentAudio = null;
    currentCard = null;
    currentHls = null;
    reconnecting = false;
    attemptInFlight = false;
    reconnectAttempts = 0;

    retiringAudio = keep;
    retiringHls = keepHls;
    retiringCard = keepCard;
    retiringWasPaused = keepPaused;

    console.log("Cambio de emisora: la anterior se retiene hasta que suene la nueva.");

    return true;
  }

  // Límite de espera de un cambio de emisora: si la nueva no suena a tiempo, se descarta y
  // vuelve la anterior (que seguía sonando) con su tarjeta marcada.
  function clearSwitchTimer() {
    if (switchTimer !== null) {
      clearTimeout(switchTimer);
      switchTimer = null;
    }
  }

  function armSwitchTimeout() {
    clearSwitchTimer();
    switchTimer = setTimeout(abortCardSwitch, SWITCH_TIMEOUT_MS);
  }

  function abortCardSwitch() {
    switchTimer = null;

    // Solo vale mientras el cambio siga a medias y sea a otra tarjeta.
    if (!retiringAudio || !currentAudio || !retiringCard || retiringCard === currentCard) return;

    console.warn("La nueva emisora no ha sonado a tiempo. Se vuelve a la anterior.");

    clearBufferMonitor();
    clearStallWatchdog();
    clearReconnectTimer();

    const failedAudio = currentAudio;
    const failedCard = currentCard;
    const failedHls = currentHls;

    const oldAudio = retiringAudio;
    const oldHls = retiringHls;
    const oldCard = retiringCard;
    const oldWasPaused = retiringWasPaused;

    retiringAudio = null;
    retiringHls = null;
    retiringCard = null;
    retiringWasPaused = false;

    currentAudio = null;
    currentCard = null;
    currentHls = null;
    reconnecting = false;
    attemptInFlight = false;
    reconnectAttempts = 0;

    failedCard.classList.remove("playing");
    releaseAudioElement(failedAudio, failedHls);

    if (oldWasPaused) {
      // La anterior estaba en pausa: vuelve a estar en pausa.
      pausedAudio = oldAudio;
      pausedCard = oldCard;
      currentHls = oldHls;
      setMediaSessionState("paused");
      return;
    }

    // La anterior seguía sonando: vuelve a ser la activa. Su "playing" ya pasó, así que
    // el periodo de gracia y los vigilantes se rearman a mano.
    currentAudio = oldAudio;
    currentCard = oldCard;
    currentHls = oldHls;
    oldCard.classList.add("playing");
    lastPlayingAt = Date.now();
    startBufferMonitor(oldAudio);
    startStallWatchdog(oldAudio);
    setMediaSessionState("playing");
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
    retiringCard = null;
    retiringWasPaused = false;
    clearSwitchTimer();
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

    // Cada elemento se libera una sola vez (pueden coincidir)
    new Set([previousAudio, heldAudio, retiring]).forEach(audio => {
      if (audio) releaseAudioElement(audio, audio === retiring ? retiringHlsInstance : null);
    });

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
    // Si el traspaso era un cambio a otra emisora, el reproductor antiguo es el de la
    // tarjeta anterior: la pausa queda en esa tarjeta, no en la nueva (si no, al reanudar
    // sonaría la emisora vieja bajo la tarjeta nueva).
    let held = audio;
    let heldHls = currentHls;
    let heldCard = card;
    let discarded = null;
    let discardedHls = null;

    if (retiringAudio) {
      discarded = audio;
      discardedHls = currentHls;
      held = retiringAudio;
      heldHls = retiringHls;
      heldCard = retiringCard || card;
      retiringAudio = null;
      retiringHls = null;
      retiringCard = null;
      retiringWasPaused = false;
    }

    clearSwitchTimer();

    pausedAudio = held;
    pausedCard = heldCard;
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
    if (!held.paused) held.__ownPauseUntil = Date.now() + 2000;
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
   * Para páginas con su propia lógica de cambio (live_boleto)
   ********************************/

  // Fija el volumen (0-1) del stream, también el de los elementos de relevo.
  // Pensado para fundidos: se puede llamar en cada paso del fundido.
  function setVolume(value) {
    // Acepta también strings numéricos (el value de un slider).
    value = Number(value);
    if (!Number.isFinite(value)) return;

    volumeOverride = Math.max(0, Math.min(1, value));

    [currentAudio, pausedAudio, retiringAudio].forEach(audio => {
      if (audio) audio.volume = volumeOverride;
    });
  }

  function getVolume() {
    if (volumeOverride !== null) return volumeOverride;

    const audio = currentAudio || pausedAudio;
    return audio ? audio.volume : 0;
  }

  // Arranca la tarjeta en directo, sin alternar como playPause():
  // si ya suena no hace nada y si está en pausa salta al directo.
  function startLive(card) {
    if (card === currentCard && card.classList.contains("playing")) return;

    if (card === pausedCard && pausedAudio) {
      resumeLive("inicio solicitado");
      return;
    }

    playPause(card);
  }

  // Deja la emisora en pausa retenida (igual que una pausa externa) en lugar de
  // liberarla: el <audio> conserva su fuente y la notificación de Android sigue ahí
  // con el botón de reproducir. Para páginas que paran la emisora por su cuenta.
  function hold() {
    if (currentAudio) enterPausedState(currentAudio);
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

    // Si pulsamos la emisora activa, queda en pausa: la notificación de Android no se
    // cierra y conserva su botón de reproducir. Al pulsar la tarjeta otra vez (o el botón
    // de la notificación) se reanuda saltando al directo.
    if (
      audio === currentAudio &&
      currentCard === card &&
      card.classList.contains("playing")
    ) {
      enterPausedState(audio);
      return;
    }

    // Al cambiar de emisora, la anterior se retiene hasta que la nueva suene (así la
    // notificación de Android no desaparece). Si no hay nada que retener, se limpia todo.
    const retenida = audio !== currentAudio && audio !== retiringAudio && audio !== pausedAudio &&
      beginCardSwitch();

    if (!retenida) stopCurrentPlayback();

    currentAudio = audio;
    currentCard = card;

    card.classList.add("playing");
    audio.muted = false; 
    applyCurrentVolume(audio);

    // La nueva espera en silencio y entra con fundido cuando suene (completeHandover): cruzado con
    // la anterior si sonaba o solo subiendo si estaba en pausa. Así no se oye ni un golpe al empezar.
    if (retenida && CROSSFADE_MS > 0) {
      audio.volume = 0;
      audio.__entraConFundido = true;
      audio.__volumenAlterado = true;
    }

    startStream(audio, src);

    if (retenida) armSwitchTimeout();
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

    // Si la emisora lleva ecualizador, se engancha a la cadena antes de cargar el stream
    // (con normalización del volumen: la radio en directo llega a niveles muy distintos).
    if (typeof Ecualizador !== "undefined") Ecualizador.conectar(audio, { normalizar: true });

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

    bufferInterval = setInterval(() => {

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

  // La espera creciente se reinicia solo si, tras volver a sonar, no hay ningún corte
  // nuevo durante STABLE_PLAY_MS y la emisora sigue siendo la activa y sonando.
  function clearStableTimer() {
    if (stableTimer !== null) {
      clearTimeout(stableTimer);
      stableTimer = null;
    }
  }

  function armStableReset(audio) {
    clearStableTimer();

    if (reconnectAttempts === 0) return;

    const epoch = reconnectEpoch;

    stableTimer = setTimeout(() => {
      stableTimer = null;

      if (epoch === reconnectEpoch && audio === currentAudio && !audio.paused && !reconnecting) {
        reconnectAttempts = 0;
      }
    }, STABLE_PLAY_MS);
  }

  // Espera creciente entre intentos.
  function getReconnectDelay() {
    const index = Math.min(reconnectAttempts, RECONNECT_BACKOFF_MS.length - 1);

    reconnectAttempts++;
    reconnectEpoch++;

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

    reconnectEpoch++;

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

  /********************************
   * Eventos del audio
   ********************************/

  function bindAudioEvents(audio) {

    // Evitar duplicar los listeners si este bloque se ejecuta otra vez.
    if (audio.dataset.streamRecoveryBound === "true") return;

    audio.dataset.streamRecoveryBound = "true";

    // Si la emisora lleva ecualizador, crossorigin tiene que estar puesto antes de cargar nada.
    if (typeof Ecualizador !== "undefined") Ecualizador.preparar(audio);

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
      lastPlayingAt = Date.now();
      armStableReset(audio);

      // Iniciar el monitor únicamente para MP3/AAC.
      startBufferMonitor(audio);

      // Vigilar que el audio realmente avanza.
      startStallWatchdog(audio);

      // Estado de la notificación de Android.
      setMediaSessionState("playing");
      publicarNotificacion(currentCard);

    });

    // Pausa que no hemos provocado nosotros (botón de la notificación de
    // Android, el propio sistema, auriculares desconectados...). La emisora queda
    // en pausa: la tarjeta deja de mostrar "Escuchando" y la notificación sigue
    // con su botón de reproducir. Al reanudar se salta al directo (resumeLive).
    audio.addEventListener("pause", () => {

    // Pausa provocada por esta misma librería (enterPausedState). El aviso llega
    // con retraso y puede coincidir con una reanudación inmediata: no es externa.
    if (audio.__ownPauseUntil && Date.now() < audio.__ownPauseUntil) {
      audio.__ownPauseUntil = 0;
      return;
    }

      // Pausa externa sobre el reproductor antiguo en pleno traspaso (la
      // notificación está ligada a él). Se pasa la emisora a pausa igualmente.
      if (audio === retiringAudio) {
        if (Date.now() < ignoreRetiringPauseUntil) return;
      
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

      // Cambio, antes stopCurrentPlayback(), que cerraba la sesión y hacía
      // desaparecer la notificación.
      enterPausedState(audio);
    });

    // Reanudación que no hemos provocado nosotros. Por ejemplo, Android
    // reanuda solo el audio al terminar una llamada. El navegador continuaría
    // desde el punto de la pausa (retrasado), así que se salta al directo.
    audio.addEventListener("play", () => {
      if (audio !== pausedAudio) return;

      // La página puede vetar la reanudación (p. ej. la música durante las noticias).
      if (!shouldResume()) {
        audio.pause();
        return;
      }

      resumeLive("reanudación desde el sistema");
    });

  }

  const api = {
    playPause, startLive, hold, stopCurrentPlayback, bindAudioEvents, getCardAudio,
    applyCurrentVolume, setVolume, getVolume, resumeLive, enterPausedState,
    recoverIfStalled, reconnectNow, reconnectAudio, startStream, isPlaybackRequested,
    getStreamSrc, isHlsSource, shouldResume,
    getMediaState: () => mediaState,
    get currentAudio() { return currentAudio; },
    get currentCard()  { return currentCard; },
    get pausedAudio()  { return pausedAudio; },
    get pausedCard()   { return pausedCard; },
    // true si alguno de sus elementos <audio> está sonando (original, relevo o saliente).
    get playing() { return [currentAudio, retiringAudio, pausedAudio].some(a => a && !a.paused); },
    // Elemento <audio> que tiene ahora el stream (cambia tras cada traspaso).
    get audio() { return currentAudio || pausedAudio; },
    get volume() { return getVolume(); },
    set volume(value) { setVolume(value); },
    stop: stopCurrentPlayback
  };

  __liveInstances.push(api);
  return api;
}

function recoverAllIfStalled(reason) {
  __liveInstances.forEach(item => item.recoverIfStalled(reason));
}

// Evitar duplicar los listeners si este bloque se ejecuta otra vez.
if (!window.__livesoundNetworkBound) {
  window.__livesoundNetworkBound = true;

  // navigator.onLine solo indica que hay red, no que haya internet,
  // así que "online" sirve para adelantar el reintento, pero no sustituye
  // a los reintentos periódicos.
  window.addEventListener("online", () => {
    recoverAllIfStalled("red recuperada");
  });

  window.addEventListener("offline", () => {
    console.warn("Sin conexión. Se reconectará cuando vuelva la red.");
  });

  // En móvil, al volver a la pestaña tras bloquear la pantalla,
  // los temporizadores pueden haberse congelado.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      recoverAllIfStalled("pestaña visible de nuevo");
    }
  });

  // Página restaurada desde la caché de ida y vuelta del navegador.
  window.addEventListener("pageshow", event => {
    if (event.persisted) {
      recoverAllIfStalled("página restaurada");
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
        const reason = "botón de reproducir de la notificación";
        let resumed = false;

        // Emisoras en pausa: se salta al directo (si su página lo permite).
        __liveInstances.forEach(item => {
          if (item.shouldResume() && item.resumeLive(reason)) resumed = true;
        });

        if (resumed) return;

        // Si no había ninguna en pausa pero el audio está parado o atascado,
        // se recupera igual que al volver la red.
        recoverAllIfStalled(reason);
      });

      // Botón de pausa de la notificación (o de unos auriculares). Con este manejador se sabe
      // que la pausa la ha pedido el usuario y se respeta siempre, también en plena reconexión
      // o sin red: antes, en esos casos, se tomaba por un corte y la radio volvía a sonar sola
      // al recuperarse la conexión. Las pausas del sistema (una llamada, otra app) siguen
      // llegando por el evento "pause" de cada <audio>, como siempre.
      navigator.mediaSession.setActionHandler("pause", () => {
        __liveInstances.forEach(item => item.hold());

        // Lo demás que suene en la página (p. ej. un pin de live_boleto) también se para,
        // como hacía el navegador por su cuenta.
        document.querySelectorAll("audio").forEach(audio => {
          if (!audio.paused) audio.pause();
        });
      });
    } catch (error) {
      // Sin soporte: el navegador mantiene su comportamiento por defecto.
    }
  }
}

/********************************
 * Instancia por defecto (páginas de tarjetas) y compatibilidad
 ********************************/

const __defaultLive = createLiveSound();

// Las páginas de tarjetas: se vinculan al cargar los <audio> que ya hay en el HTML.
document.querySelectorAll(".card audio").forEach(__defaultLive.bindAudioEvents);

// Único nombre que usa el HTML (onclick="playPause(this)")
window.playPause = __defaultLive.playPause;