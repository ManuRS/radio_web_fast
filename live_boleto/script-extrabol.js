/*===========================*/
/*====    RELOJ OFICIAL    ====*/
/*===========================*/

let officialBaseTime = null;
let localBaseTime = null;

// Una medida que tarda más que esto en responder no es fiable: la hora oficial se fechó en
// algún punto del viaje de ida y vuelta y el error puede ser de varios segundos. Se descarta
// y se vuelve a intentar enseguida (hasta REINTENTOS_HORA_OFICIAL veces; además se repite cada 2 minutos).
const MAX_RESPUESTA_HORA_MS = 3000;
const REINTENTOS_HORA_OFICIAL = 3;
const ESPERA_REINTENTO_HORA_MS = 20000;
let reintentosHoraOficial = 0;

// De las medidas buenas se conserva la más rápida: cuanto menos tarda la respuesta, menor es
// el error posible (la mitad del viaje de ida y vuelta). Sustituirla cada 2 minutos por la
// última, aunque fuera peor, hacía bailar la hora oficial hasta ±1,5 s de una a otra.
// Una medida se sustituye si llega otra igual o más rápida, si ya es vieja (el reloj del
// dispositivo deriva) o si la nueva no encaja con ella (alguien ha cambiado la hora del dispositivo).
const VIDA_MEDIDA_HORA_MS = 30 * 60000;
let idaYVueltaBase = Infinity;

// Obtener hora oficial desde internet
async function obtenerHoraOficial() {
    try {
        const t0 = Date.now();
        const response = await fetch("https://time.now/developer/api/timezone/Europe/Madrid", { cache: "no-store" });
        const t1 = Date.now();

        if (!response.ok) throw new Error("HTTP " + response.status);

        const data = await response.json();
        const oficial = new Date(data.datetime);

        // Una respuesta sin fecha válida daría un desfase NaN y la página creería que
        // nunca es horario de noticias (y cortaría las que estén sonando).
        if (Number.isNaN(oficial.getTime())) throw new Error("fecha no válida");

        const idaYVuelta = t1 - t0;

        if (idaYVuelta > MAX_RESPUESTA_HORA_MS) throw new Error("respuesta lenta (" + idaYVuelta + " ms)");

        reintentosHoraOficial = 0;

        // El servidor fechó la respuesta a mitad del viaje de ida y vuelta, no cuando llegó.
        const mitad = (t0 + t1) / 2;

        if (officialBaseTime && localBaseTime) {
            const edad = mitad - localBaseTime.getTime();
            const vigente = edad >= 0 && edad < VIDA_MEDIDA_HORA_MS;

            // Dos medidas encajan si sus desfases difieren menos que la suma de sus errores posibles
            const diferencia = Math.abs((oficial.getTime() - mitad) - desfaseRelojMs());
            const encajan = diferencia <= (idaYVuelta + idaYVueltaBase) / 2 + 100;

            // La que ya había es mejor: se sigue con ella
            if (vigente && encajan && idaYVuelta > idaYVueltaBase) return;
        }

        officialBaseTime = oficial;
        localBaseTime = new Date(mitad);
        idaYVueltaBase = idaYVuelta;

    } catch (err) {
        console.log("⚠️ No se pudo obtener la hora oficial", err);

        // Con una medida buena anterior se sigue con ella; el aviso solo sale si no hay ninguna.
        if (!officialBaseTime) ponerReloj("officialTime", "Hora oficial no disponible");

        if (reintentosHoraOficial < REINTENTOS_HORA_OFICIAL) {
            reintentosHoraOficial++;
            setTimeout(obtenerHoraOficial, ESPERA_REINTENTO_HORA_MS);
        }
    }
}

// Desfase (ms) del reloj del dispositivo respecto al reloj oficial:
// oficial = dispositivo + desfase. Si obtenerHoraOficial() aún no ha respondido,
// o no hay conexión con el servicio de hora, se usa el reloj del dispositivo tal cual.
function desfaseRelojMs() {
    if (officialBaseTime && localBaseTime) {
        return officialBaseTime.getTime() - localBaseTime.getTime();
    }
    return 0;
}

function ahoraOficialMs() {
    return Date.now() + desfaseRelojMs();
}

/*===========================*/
/*==  VENTANAS DE NOTICIAS ==*/
/*===========================*/

// Los horarios de las noticias son horas de Madrid, esté donde esté el dispositivo.
// Por eso el cálculo de ventanas no usa la zona horaria del móvil sino estas funciones.
const ZONA_HORARIA = "Europe/Madrid";

const formatoMadrid = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_HORARIA,
    hourCycle: "h23",
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric"
});

// Fecha y hora que marca el reloj de pared de Madrid en un instante (ms)
function partesMadrid(ms) {
    const p = {};
    for (const { type, value } of formatoMadrid.formatToParts(new Date(ms))) {
        if (type !== "literal") p[type] = Number(value);
    }
    return p;   // year, month, day, hour, minute, second
}

// Diferencia entre la hora de Madrid y UTC en ese instante (1 h en invierno, 2 h en verano)
function desfaseMadridMs(ms) {
    const p = partesMadrid(ms);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

// "HH:MM:SS" (hora de Madrid) -> milisegundos de esa hora en el mismo día de Madrid que "ref"
function hmsAMs(hms, ref) {
    const [h, m, s = 0] = hms.split(":").map(Number);
    const p = partesMadrid(ref);
    const comoUTC = Date.UTC(p.year, p.month - 1, p.day, h, m, s);

    // Se resta el desfase de Madrid. La segunda pasada corrige los días del cambio de hora.
    let ms = comoUTC - desfaseMadridMs(comoUTC);
    ms = comoUTC - desfaseMadridMs(ms);
    return ms;
}

// Ventana de noticias activa a la hora indicada (ms), o null.
// horariosPermitidos son horas reales de emisión: en el stream de internet las noticias
// entran en inicio + RETRASO_STREAM_S y salen en fin + RETRASO_STREAM_S. La conexión en
// silencio empieza conexion_previa_s antes de la entrada. (Ajustes en el script de la página.)
function ventanaNoticias(ahoraMs) {
    for (const h of horariosPermitidos) {
        const entradaMs = hmsAMs(h.inicio, ahoraMs) + RETRASO_STREAM_S * 1000;
        const salidaMs  = hmsAMs(h.fin, ahoraMs)    + RETRASO_STREAM_S * 1000;
        if (ahoraMs >= entradaMs - conexion_previa_s * 1000 && ahoraMs < salidaMs) {
            return { entradaMs, salidaMs };
        }
    }
    return null;
}

// "Minuto clave": el minuto XX:59 anterior a la hora en punto a la que van las noticias.
// Devuelve el instante (ms) en que empieza, es decir, las XX:59:00 de esa ventana.
// Se redondea a la hora más cercana a la entrada, porque la entrada cae a las XX:00:xx
// (XX:59:xx de emisión + el retraso del stream), o poco antes si el retraso es pequeño.
// Madrid va siempre a horas enteras de UTC, así que redondear el instante a la hora UTC
// es redondear a la hora de Madrid, sea cual sea la zona horaria del dispositivo.
function inicioMinutoClave(entradaMs) {
    const hora = 60 * 60 * 1000;
    return Math.round(entradaMs / hora) * hora - 60 * 1000;
}

/*===========================*/
/*==  RELOJES EN PANTALLA  ==*/
/*===========================*/

// Formatear hora HH:MM:SS (en la zona horaria indicada; sin indicarla, la del dispositivo)
function formatTime(date, timeZone) {
    return date.toLocaleTimeString('es-ES', {
        hour12: false,
        timeZone
    });
}

// Escribe un reloj. La primera vez que se rellena aparece con fundido (.time.visible)
function ponerReloj(id, texto) {
    const el = document.getElementById(id);
    el.innerText = texto;
    el.classList.add("visible");
}

// Actualizar relojes
function actualizarRelojes() {
    // Hora del dispositivo
    const nowDevice = new Date();
    ponerReloj("deviceTime", "Hora dispositivo " + formatTime(nowDevice));

    // Hora oficial simulando avance real
    if (officialBaseTime && localBaseTime) {
        const elapsed = nowDevice - localBaseTime;
        const officialNow = new Date(officialBaseTime.getTime() + elapsed);

        ponerReloj("officialTime", "Hora oficial " + formatTime(officialNow, ZONA_HORARIA));
        const minus_time = new Date(officialNow.getTime() - RETRASO_STREAM_S * 1000);
        ponerReloj("offsetTime", "Hora reproducción " + formatTime(minus_time, ZONA_HORARIA));
    }

}

/*===================================*/
/*== VISUALIZADOR SINTÉTICO (FAKE) ==*/
/*===================================*/
const canvas = document.getElementById('visualizer');
const canvasCtx = canvas.getContext('2d');

// Configuramos un array de datos manual
const bufferLength = 10; // Número de barras
let dataArray = new Array(bufferLength).fill(0);

// El tamaño del lienzo y el color de las barras no cambian en cada frame:
// se calculan una vez y solo se repiten cuando de verdad cambian.
let colorOnda = '';

function ajustarLienzo() {
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
}

function leerColorOnda() {
  colorOnda = getComputedStyle(document.documentElement).getPropertyValue('--live-fakewaves').trim();
}

window.addEventListener('resize', ajustarLienzo);
window.addEventListener('radio-theme-change', leerColorOnda);   // lo lanza applyTheme() en script-interfaz.js

function setupVisualizer() {
  ajustarLienzo();
  leerColorOnda();
  draw();
}

function isSomethingPlaying() {
  // El sonido de cada stream puede estar en su <audio> original o en el de relevo
  // (traspaso de script-livesound.js), así que se pregunta a cada instancia.
  return liveNews.playing || liveMusic.playing || !audio_prep.paused;
}


// Un único sitio decide qué logo se ve y si rebota. Los flujos de la página dicen qué
// logo toca (pedirLogo) y draw() lo pinta: ese logo mientras algo suena, y "off" sin rebote
// mientras no suena nada. Cuando vuelve el sonido (reconexión, play de la notificación...)
// reaparece solo el logo que toca, sin que nadie tenga que volver a pedirlo.
let logoIntencion = null;   // { src, bounce, valido }

// valido (opcional): mientras devuelva false, esa petición ya no vale (p. ej. un pin que ya terminó).
function pedirLogo(src, bounce = false, valido = null) {
  logoIntencion = { src, bounce, valido };
}

function quitarRebote() {
  if (logoIntencion) logoIntencion = { ...logoIntencion, bounce: false };
}

// Cambia el logo con fundido: queda transparente, carga el nuevo y entra
// (la transición de opacidad está en el CSS de la página). Sin esto, el logo cambia "a golpe".
function ponerLogo(src) {
  imgLogo.style.transition = 'none';
  imgLogo.style.opacity = '0';
  imgLogo.src = src;
  void imgLogo.offsetWidth;          // aplica ya la transparencia, sin transición
  imgLogo.style.transition = '';     // vuelve a mandar la transición del CSS

  const mostrar = () => { imgLogo.style.opacity = ''; };
  imgLogo.addEventListener('load', mostrar, { once: true });
  imgLogo.addEventListener('error', mostrar, { once: true });
  if (imgLogo.complete && imgLogo.naturalWidth) mostrar();
}

function pintarLogo(sonando) {
  if (logoIntencion && logoIntencion.valido && !logoIntencion.valido()) logoIntencion = null;

  const { src, bounce } = (sonando && logoIntencion) ? logoIntencion : { src: imgLogo_off, bounce: false };

  if (imgLogo.getAttribute('src') !== src) ponerLogo(src);
  imgLogo.classList.toggle('logo-sonando', bounce);
}

/*==================================*/
/*== VISUALIZADOR ORGÁNICO (FAKE) ==*/
/*==================================*/

// Variables para el control de suavizado
let speedFactors = Array.from({ length: bufferLength }, () => 0.003 + Math.random() * 0.007);
let phaseOffsets = Array.from({ length: bufferLength }, () => Math.random() * Math.PI * 2);
let noiseHeights = Array.from({ length: bufferLength }, () => Math.random() * 100);

function draw() {
    requestAnimationFrame(draw);

    const playing = isSomethingPlaying();
    const time = Date.now();

    for (let i = 0; i < bufferLength; i++) {
        if (playing) {
            // Ruido Browniano
            let variacion = (Math.random() - 0.5) * 1; // Salto de hasta * 5px
            noiseHeights[i] += variacion;

            // Mantener el ruido dentro de unos límites (que no se escape del canvas)
            if (noiseHeights[i] < 20) noiseHeights[i] += 10;
            if (noiseHeights[i] > canvas.height * 0.8) noiseHeights[i] -= 10;

            // Onda base
            let baseSin = Math.sin(time * speedFactors[i] + phaseOffsets[i]) * 20;
            let targetHeight = noiseHeights[i] + baseSin;

            // Suavizado de seguridad
            dataArray[i] = dataArray[i] + (targetHeight - dataArray[i]) * 0.3;
        }
    }

    // Sin sonido las barras quedan quietas y en rojo, y el logo pasa a "off" (sin rebote)
    pintarLogo(playing);

    // Renderizado
    canvasCtx.fillStyle = playing ? colorOnda : '#e64c3c';
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    const barWidth = (canvas.width / bufferLength) * 0.6;
    const spacing = (canvas.width / bufferLength) * 0.4;
    let x = spacing / 2;

    for (let i = 0; i < bufferLength; i++) {
        let barHeight = Math.max(dataArray[i], 4);
        let y = (canvas.height - barHeight) / 2;
        roundRect(canvasCtx, x, y, barWidth, barHeight, 6);
        x += barWidth + spacing;
    }
}

// Función auxiliar para que las barras no sean rectángulos secos
function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();
}
