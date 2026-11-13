/********************************
 * script-ecualizador.js
 *
 * Ecualizador de tres bandas con limitador para los <audio> de radio en directo.
 *
 * Se activa por emisora con el atributo del <audio>:
 *    <audio data-src="..." data-eq="true">    pasa por el ecualizador
 *    <audio data-src="..." data-eq="false">   sale directo, como siempre (sin Web Audio)
 * Sin atributo equivale a "false".
 *
 * Para procesar el audio el navegador exige que el servidor del stream envíe CORS
 * (el <audio> se carga con crossorigin="anonymous"). Si no lo envía, el stream no carga
 * o suena en silencio: esas emisoras deben llevar data-eq="false".
 * live/test_eq.html comprueba qué emisoras lo permiten.
 *
 * Lo usan script-livesound.js (radio en directo; hay que cargar este fichero antes) y
 * script-cargarss.js (pódcast, con el argumento eq de cargarRSS_bycaps y cargaRSS_nlast).
 * Todos los <audio> con ecualizador comparten una sola cadena:
 *    audio -> entrada -> graves -> medios -> agudos -> limitador -> altavoces
 *
 * Normalización del volumen (solo radio en directo): cada emisora llega a un nivel distinto.
 * Se mide el nivel medio (RMS) de lo que llega, y se aplica la ganancia (subida o bajada,
 * con topes) que lo lleva a EQ_NORMALIZACION.objetivo, de forma suave. La ganancia va en el
 * propio <audio>, antes de entrar en la cadena común:
 *    audio -> ganancia -> entrada -> ...        (el analizador mide aparte, antes de la ganancia)
 * El nivel de cada emisora se recuerda en este navegador solo como punto de partida: la
 * medición no se detiene y lo recordado se va sustituyendo por lo medido. El limitador
 * final evita que se sature al subir.
 *
 * Un <audio> que ya ha pasado por el ecualizador no puede volver a sonar directo, y si
 * luego carga una emisora sin CORS se queda mudo. Quien cambie de emisora sobre el mismo
 * <audio> (live_boleto) debe sustituirlo por uno nuevo: estaConectado(audio) lo indica.
 ********************************/

/********************************
 * Configuración
 ********************************/
const EQ_AJUSTES = {
  lowHz: 100,    // graves: realza o baja todo lo que queda por debajo de esta frecuencia
  midHz: 1000,   // medios: campana centrada en esta frecuencia
  midQ: 0.8,     // anchura de la campana (más pequeña = más ancha)
  highHz: 8000,  // agudos: realza o baja todo lo que queda por encima de esta frecuencia

  low: 5,        // dB
  mid: -1,       // dB
  high: 4        // dB
};

// Los realces hacen que algunos picos pasen de 1,0 (saturación al salir). El limitador solo
// actúa en esos picos: por debajo del umbral no cambia ni el sonido ni el volumen.
const EQ_LIMITADOR = {
  threshold: -1,   // dB desde donde empieza a frenar
  knee: 0,         // 0 = cambio brusco en el umbral
  ratio: 20,       // casi un tope
  attack: 0.002,   // s
  release: 0.15    // s
};

// Normalización del volumen entre emisoras (ver arriba).
const EQ_NORMALIZACION = {
  objetivo: -16,   // dB (RMS): nivel al que se lleva todo lo que llega
  subidaMax: 24,   // dB: lo máximo que se sube una emisora floja
  bajadaMax: 8,    // dB: lo máximo que se baja una emisora muy alta
  tau: 8,          // s: lo que tarda en adaptarse el nivel medido
  silencio: -55    // dB: por debajo de esto se considera silencio y no cuenta
};

/********************************
 * Cadena de audio compartida
 ********************************/
const Ecualizador = (() => {
  let ctx = null;
  let entrada = null;
  let salida = null;

  // Un <audio> solo puede engancharse una vez a un contexto de Web Audio.
  const conectados = new WeakSet();

  /********************************
   * Normalización del volumen
   ********************************/

  const NIVELES_KEY = "rwf_niveles";   // emisora -> último nivel medido (dB)
  const NORM_KEY = "rwf_norm";         // "0" la desactiva (para pruebas)

  let normActiva = true;
  try { normActiva = localStorage.getItem(NORM_KEY) !== "0"; } catch (_) {}

  let niveles = {};
  try { niveles = JSON.parse(localStorage.getItem(NIVELES_KEY)) || {}; } catch (_) {}

  const normalizados = new Map();   // <audio> -> { analizador, ganancia, norm }
  let normTimer = null;
  const bufNivel = new Float32Array(2048);
  const aDb = p => 10 * Math.log10(p);

  // Nombre con el que se recuerda la emisora: el de su tarjeta (el <audio> de relevo
  // está en la misma tarjeta) o, si no hay, la URL del stream sin parámetros.
  function claveDe(audio) {
    const nombre = audio.closest?.(".card")?.querySelector(".station-name")?.textContent?.trim();
    if (nombre) return nombre;
    return (audio.getAttribute("data-src") || "").split("?")[0];
  }

  function gananciaDb(nivel) {
    const { objetivo, subidaMax, bajadaMax } = EQ_NORMALIZACION;
    return Math.min(subidaMax, Math.max(-bajadaMax, objetivo - nivel));
  }

  // Empieza la medición de esta emisora desde el nivel recordado, si lo hay. Si lo hay,
  // la ganancia se aplica ya, antes de que suene nada.
  function sembrar(nodos, clave) {
    const memoria = niveles[clave];
    const recordado = typeof memoria === "number";
    nodos.norm = {
      clave,
      pow: recordado ? Math.pow(10, memoria / 10) : null,
      cuenta: 0,
      seguro: recordado,
      ultimo: 0,
      registrado: 0,
      guardado: 0    // cada emisora lleva su cuenta: con una común, de dos que suenan a la vez solo se guardaba la primera
    };
    if (recordado && normActiva && ctx) {
      const db = gananciaDb(memoria);
      nodos.ganancia.gain.cancelScheduledValues(ctx.currentTime);
      nodos.ganancia.gain.value = Math.pow(10, db / 20);
    }
  }

  function normTick() {
    if (!ctx || ctx.state !== "running") return;

    for (const [audio, nodos] of normalizados) {
      if (!audio.isConnected) { normalizados.delete(audio); continue; }

      if (!normActiva) continue;

      // Solo se mide lo que está sonando de verdad
      if (audio.paused || audio.muted || audio.readyState < 2) continue;

      // El volumen del <audio> (deslizador, fundidos) se aplica antes de entrar en la
      // cadena: se deshace al medir, para que la normalización no lo corrija.
      const volumen = audio.volume;
      if (volumen < 0.05) continue;

      const clave = claveDe(audio);
      if (!nodos.norm || nodos.norm.clave !== clave) sembrar(nodos, clave);
      const n = nodos.norm;

      nodos.analizador.getFloatTimeDomainData(bufNivel);
      let suma = 0;
      for (let i = 0; i < bufNivel.length; i++) suma += bufNivel[i] * bufNivel[i];
      const p = suma / bufNivel.length / (volumen * volumen);

      if (aDb(p) >= EQ_NORMALIZACION.silencio) {
        const ahora = performance.now();
        const dt = n.ultimo ? (ahora - n.ultimo) / 1000 : 0.25;
        n.ultimo = ahora;
        n.cuenta++;
        n.pow = n.pow === null
          ? p
          : n.pow + (p - n.pow) * Math.max(Math.min(dt / EQ_NORMALIZACION.tau, 1), 1 / (n.cuenta + 1));
        if (n.cuenta >= 12) n.seguro = true;   // unos 3 s de audio medido
      }

      if (!n.seguro || n.pow === null) continue;

      const nivel = aDb(n.pow);
      const db = gananciaDb(nivel);
      nodos.ganancia.gain.setTargetAtTime(Math.pow(10, db / 20), ctx.currentTime, 0.5);
      nodos.nivel = nivel;
      nodos.db = db;

      if (Math.abs(db - n.registrado) >= 2) {
        n.registrado = db;
        console.log(`Normalización en ${clave}: nivel ${nivel.toFixed(0)} dB, ganancia ${db > 0 ? "+" : ""}${db.toFixed(0)} dB`);
      }

      if (Date.now() - n.guardado > 10000) {
        n.guardado = Date.now();
        niveles[clave] = Math.round(nivel * 10) / 10;
        try { localStorage.setItem(NIVELES_KEY, JSON.stringify(niveles)); } catch (_) {}
      }
    }
  }

  function normalizacion(activa) {
    normActiva = !!activa;
    try { localStorage.setItem(NORM_KEY, normActiva ? "1" : "0"); } catch (_) {}
    if (!normActiva && ctx) {
      for (const nodos of normalizados.values()) {
        nodos.ganancia.gain.setTargetAtTime(1, ctx.currentTime, 0.3);
      }
    }
    console.log("Normalización del volumen: " + (normActiva ? "activada" : "desactivada"));
  }

  function quiere(audio) {
    return audio?.dataset?.eq === "true";
  }

  function filtro(type, frequency, gain, Q) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.gain.value = gain;
    if (Q !== undefined) f.Q.value = Q;
    return f;
  }

  function crearCadena() {
    const AC = window.AudioContext || window.webkitAudioContext;

    if (!AC) throw new Error("Este navegador no tiene Web Audio.");

    // "playback": prioriza el ahorro de batería sobre la latencia, como corresponde a una radio.
    ctx = new AC({ latencyHint: "playback" });

    entrada = ctx.createGain();

    const graves = filtro("lowshelf", EQ_AJUSTES.lowHz, EQ_AJUSTES.low);
    const medios = filtro("peaking", EQ_AJUSTES.midHz, EQ_AJUSTES.mid, EQ_AJUSTES.midQ);
    const agudos = filtro("highshelf", EQ_AJUSTES.highHz, EQ_AJUSTES.high);

    salida = ctx.createDynamicsCompressor();
    salida.threshold.value = EQ_LIMITADOR.threshold;
    salida.knee.value = EQ_LIMITADOR.knee;
    salida.ratio.value = EQ_LIMITADOR.ratio;
    salida.attack.value = EQ_LIMITADOR.attack;
    salida.release.value = EQ_LIMITADOR.release;

    entrada.connect(graves);
    graves.connect(medios);
    medios.connect(agudos);
    agudos.connect(salida);
    salida.connect(ctx.destination);

    // Si el sistema suspende el contexto (otra app, cambio de salida...), se intenta
    // reanudar: con el audio conectado a él, un contexto parado deja la radio muda.
    ctx.addEventListener("statechange", () => {
      if (ctx.state !== "running" && ctx.state !== "closed") {
        ctx.resume().catch(() => {});
      }
    });

    console.log("Ecualizador: cadena de audio creada.");
  }

  // Se llama al enlazar el <audio>, antes de cargar ningún stream: el atributo
  // crossorigin tiene que estar puesto antes de que se descargue.
  function preparar(audio) {
    if (quiere(audio)) audio.crossOrigin = "anonymous";
  }

  // Crea la cadena y la deja en marcha. Los navegadores solo dejan arrancar el audio tras
  // un gesto del usuario: las páginas que cargan streams más tarde, sin que nadie pulse
  // nada (live_boleto), lo llaman en el primer clic.
  function iniciar() {
    try {
      if (!ctx) crearCadena();
      if (ctx.state !== "running") ctx.resume().catch(() => {});
    } catch (error) {
      console.warn("Ecualizador no disponible. Se reproduce sin él:", error);
    }
  }

  // Se llama justo antes de cargar el stream (dentro del clic del usuario la primera vez).
  // Si algo falla, el <audio> vuelve a su comportamiento normal y la radio sigue sonando.
  // Con { normalizar: true } (la radio en directo) el <audio> lleva además la normalización
  // del volumen. Solo se decide la primera vez: un <audio> ya conectado no cambia de cadena.
  function conectar(audio, { normalizar = false } = {}) {

    // El atributo data-eq puede cambiar entre una emisora y otra sobre el mismo <audio>.
    if (!quiere(audio)) {
      if (!conectados.has(audio)) audio.removeAttribute("crossorigin");
      return;
    }

    audio.crossOrigin = "anonymous";

    try {
      if (!ctx) crearCadena();

      if (ctx.state !== "running") ctx.resume().catch(() => {});

      if (conectados.has(audio)) return;

      const fuente = ctx.createMediaElementSource(audio);

      if (normalizar) {
        const analizador = ctx.createAnalyser();   // mide la emisora tal como llega
        analizador.fftSize = 2048;
        const ganancia = ctx.createGain();
        fuente.connect(analizador);
        fuente.connect(ganancia);
        ganancia.connect(entrada);

        const nodos = { analizador, ganancia, norm: null, nivel: null, db: null };
        normalizados.set(audio, nodos);
        sembrar(nodos, claveDe(audio));
        if (!normTimer) normTimer = setInterval(normTick, 250);
      } else {
        fuente.connect(entrada);
      }

      conectados.add(audio);

    } catch (error) {
      console.warn("Ecualizador no disponible. Se reproduce sin él:", error);
      audio.removeAttribute("crossorigin");
    }
  }

  // Para los pódcast, cuyo <audio> ya trae su src y se carga solo: se engancha al
  // empezar a sonar (siempre es un clic del usuario) y, si el servidor del archivo no
  // permite CORS, el <audio> falla al cargar y se recarga sin ecualizador.
  function vigilar(audio) {
    if (!quiere(audio)) return;

    audio.addEventListener("play", () => conectar(audio));

    audio.addEventListener("error", () => {
      if (conectados.has(audio) || !audio.hasAttribute("crossorigin")) return;

      console.warn("Este archivo no permite CORS. Se reproduce sin ecualizador.");

      // Si el fallo llega con el usuario ya esperando a que suene, se reanuda solo.
      const reanudar = !audio.paused;

      audio.removeAttribute("crossorigin");
      audio.dataset.eq = "false";
      audio.load();

      if (reanudar) audio.play().catch(() => {});
    });
  }

  function estaConectado(audio) {
    return conectados.has(audio);
  }

  return {
    preparar,
    iniciar,
    conectar,
    vigilar,
    estaConectado,
    normalizacion,
    nivelDe(audio) { const n = normalizados.get(audio); return n ? { nivel: n.nivel, ganancia: n.db } : null; },   // depuración
    get contexto() { return ctx; },   // para depuración y pruebas
    get salida() { return salida; }
  };
})();
