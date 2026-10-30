/*===========================*/
/*====    RELOJ OFICIAL    ====*/
/*===========================*/

let officialBaseTime = null;
let localBaseTime = null;

// Obtener hora oficial desde internet
async function obtenerHoraOficial() {
    try {
        const response = await fetch("https://time.now/developer/api/timezone/Europe/Madrid");
        const data = await response.json();

        officialBaseTime = new Date(data.datetime);
        localBaseTime = new Date();

    } catch (err) {
        console.log("⚠️ No se pudo obtener la hora oficial");
        document.getElementById("officialTime").innerText = "Hora oficial no disponible"
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

// "HH:MM:SS" -> milisegundos de esa hora en el mismo día que "ref"
function hmsAMs(hms, ref) {
    const [h, m, s = 0] = hms.split(":").map(Number);
    const d = new Date(ref);
    d.setHours(h, m, s, 0);
    return d.getTime();
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

/*===========================*/
/*==  RELOJES EN PANTALLA  ==*/
/*===========================*/

// Formatear hora HH:MM:SS
function formatTime(date) {
    return date.toLocaleTimeString('es-ES', {
        hour12: false
    });
}

// Actualizar relojes
function actualizarRelojes() {
    // Hora del dispositivo
    const nowDevice = new Date();
    document.getElementById("deviceTime").innerText = "Hora dispositivo " + formatTime(nowDevice);

    // Hora oficial simulando avance real
    if (officialBaseTime && localBaseTime) {
        const elapsed = nowDevice - localBaseTime;
        const officialNow = new Date(officialBaseTime.getTime() + elapsed);

        document.getElementById("officialTime").innerText = "Hora oficial " + formatTime(officialNow);
        const minus_time = new Date(officialNow.getTime() - RETRASO_STREAM_S * 1000);
        document.getElementById("offsetTime").innerText = "Hora reproducción " + formatTime(minus_time) + "\n\n\n";
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

function setupVisualizer() {
  draw();
}

function isSomethingPlaying() {
  // El sonido de cada stream puede estar en su <audio> original o en el de relevo
  // (traspaso de script-livesound.js), así que se pregunta a cada instancia.
  return liveNews.playing || liveMusic.playing || !audio_prep.paused;
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

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

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
          
            canvasCtx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--live-fakewaves').trim();
        } else {
            dataArray[i] *= 1.0;
            noiseHeights[i] *= 1.0;
            canvasCtx.fillStyle = '#e64c3c';
            imgLogo.src = "../resources/live/off.png";
        }
    }

    // Renderizado
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