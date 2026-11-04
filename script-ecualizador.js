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
  threshold: -2,   // dB desde donde empieza a frenar
  knee: 0,         // 0 = cambio brusco en el umbral
  ratio: 20,       // casi un tope
  attack: 0.002,   // s
  release: 0.15    // s
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
  function conectar(audio) {

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

      ctx.createMediaElementSource(audio).connect(entrada);
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
    get contexto() { return ctx; },   // para depuración y pruebas
    get salida() { return salida; }
  };
})();
