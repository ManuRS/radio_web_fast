/********************************
 * script-stats.js
 *
 * Estadística anónima: cuenta cuántos dispositivos distintos usan la app y cuánto escuchan, sin datos
 * personales. Un identificador aleatorio por navegador (sin IP, sin cuenta, sin relación con nada más),
 * los segundos de escucha y si se usa instalada (PWA) o en el navegador; cada dispositivo cuenta como un usuario.
 *
 * Solo se manda cuando hace falta: al abrir una página (una vez al día), al dejar de sonar y al cerrarla.
 * Mientras suena, los segundos se apuntan en el propio aparato en el día en que se escuchan (hora de España)
 * y, si la página se cierra sin avisar (Android la mata), salen en la siguiente apertura con su día.
 *
 * Lo recibe functions/api/stat.js (base de datos D1, variable STATS). Sin él (otra web, en local, sin red)
 * no pasa nada: lo pendiente se guarda y se reintenta. En http no se cuenta.
 * Es el mismo núcleo que js/stats.js de Radio Web Neo y Radio Proxy Web (aquí como script suelto).
 *
 * "Suena" = cualquier <audio> reproduciendo: los de la página (podcasts, tarjetas, boletines) y los que crea
 * script-livesound.js sin colgarlos del documento (el traspaso de la notificación). El <audio> en bucle del
 * ancla de Android (silencio) no cuenta. Si el sonido se corta un instante (reconexión, traspaso) no se
 * da por terminado hasta pasados SILENCIO_MS.
 ********************************/
(() => {
  const APP = "rf";
  const TICK_MS = 30000;      // cada cuánto se apuntan en el aparato los segundos escuchados (sin red)
  const MAX_GAP_S = 300;      // un salto mayor entre dos medidas es que el aparato durmió o la página estuvo congelada: no se cuenta
  const SILENCIO_MS = 4000;   // un corte de menos que esto (reconexión, traspaso) no corta la escucha
  const DIA = /^\d{4}-\d{2}-\d{2}$/;

  if (location.protocol !== "https:") return;   // en local y sin https no se cuenta

  const KEY_ID = APP + "_uid", KEY_ST = APP + "_stat";
  const url = new URL("../api/stat", document.currentScript.src).href;   // este archivo vive en /js/: la función está en la raíz de la web

  const store = {
    get: k => localStorage.getItem(k),
    set: (k, v) => localStorage.setItem(k, v)
  };
  const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), x => x.toString(16).padStart(2, "0")).join("");
  const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });   // el mismo día que usa el servidor
  const pwa = () => matchMedia("(display-mode: standalone), (display-mode: minimal-ui)").matches || navigator.standalone === true;   // instalada (navigator.standalone: iOS)
  const now = () => performance.now();

  function send(body, beacon) {
    const data = JSON.stringify(body);
    if (beacon && navigator.sendBeacon) {
      try { return navigator.sendBeacon(url, data); } catch { return false; }
    }
    return fetch(url, { method: "POST", body: data, keepalive: true }).then(r => r.ok, () => false);
  }

  /********************************
   * Núcleo
   ********************************/
  let id = null;
  try {
    id = store.get(KEY_ID);
    if (!/^[0-9a-f]{32}$/.test(id || "")) {
      id = rand();
      store.set(KEY_ID, id);
      if (store.get(KEY_ID) !== id) id = null;
    }
  } catch { id = null; }   // sin almacenamiento no hay manera de reconocer al usuario: no se cuenta (cada apertura parecería uno nuevo)
  if (!id) return;

  let st = { d: "", p: {} };   // d: último día avisado; p: segundos de escucha aún sin enviar, por día
  try {
    const v = JSON.parse(store.get(KEY_ST) || "null");
    const ok = n => typeof n === "number" && Number.isFinite(n) && n >= 0;
    if (v && typeof v.d === "string") {
      st.d = v.d;
      if (v.p && typeof v.p === "object") { for (const [k, n] of Object.entries(v.p)) if (DIA.test(k) && ok(n)) st.p[k] = n; }
      else if (ok(v.s) && v.s > 0) st.p[today()] = v.s;   // formato anterior (sin día): al de hoy, como antes
    }
  } catch {}

  let since = null, timer = null, busy = false;
  const save = () => { try { store.set(KEY_ST, JSON.stringify(st)); } catch {} };

  // Pasa lo escuchado desde la última medida a "pendiente", en el día de ahora
  function tick(t = now()) {
    if (since !== null) {
      const gap = (t - since) / 1000;
      since = t;
      if (gap > 0 && gap <= MAX_GAP_S) { const d = today(); st.p[d] = (st.p[d] || 0) + gap; }
    }
    save();
  }

  // Manda lo pendiente, un envío por día y del más antiguo al más nuevo (y avisa del día si aún no se ha hecho).
  // beacon: al cerrar la página, que no espera respuesta
  async function flush(beacon = false) {
    if (busy) return;
    tick();
    const day = today();
    for (const k of Object.keys(st.p)) if (k !== day && st.p[k] < 1) delete st.p[k];   // restos de menos de 1 s de otros días
    const days = Object.keys(st.p).filter(k => st.p[k] >= 1).sort();
    if (st.d !== day && !days.includes(day)) days.push(day);
    if (!days.length) return;
    busy = true;
    try {
      for (const k of days) {
        const sec = Math.min(Math.floor(st.p[k] || 0), 86400);
        const body = { a: APP, id, s: sec, d: k, w: pwa() ? 1 : 0 };
        const ok = beacon ? send(body, true) : await send(body, false);
        if (!ok) break;
        if (k in st.p) { st.p[k] -= sec; if (k !== day && st.p[k] < 1) delete st.p[k]; }
        if (k === day) st.d = day;
      }
    } finally { busy = false; save(); }
  }

  function start() {
    if (since !== null) return;
    since = now();
    timer = setInterval(tick, TICK_MS);
    flush(false);
  }

  function stop(beacon = false, t = now()) {
    tick(t);
    since = null;
    if (timer) { clearInterval(timer); timer = null; }
    return flush(beacon);
  }

  /********************************
   * Detección de "suena"
   ********************************/
  const sonando = new Set();
  const vistos = new WeakSet();
  let silencio = null, fin = 0;   // fin: cuándo se quedó sin nada sonando

  function actualiza() {
    if (sonando.size) {
      if (silencio) { clearTimeout(silencio); silencio = null; }
      start();
    } else if (since !== null && !silencio) {
      fin = now();
      silencio = setTimeout(() => { silencio = null; if (!sonando.size) stop(false, fin); }, SILENCIO_MS);   // el tramo de silencio no se cuenta
    }
  }

  function evento(e) {
    const el = e.target;
    if (!(el instanceof HTMLMediaElement) || el.loop) return;   // el ancla (silencio en bucle) no cuenta
    if (e.type === "playing") sonando.add(el); else sonando.delete(el);
    actualiza();
  }

  const EVENTOS = ["playing", "pause", "ended", "emptied", "abort", "error"];
  // Los <audio> de la página: los eventos de medios no suben por el árbol, pero sí se pueden recoger en captura
  for (const t of EVENTOS) document.addEventListener(t, evento, true);

  // Los que no están en el documento (new Audio()): se enganchan la primera vez que se les manda reproducir
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (!vistos.has(this)) {
      vistos.add(this);
      if (!this.isConnected) for (const t of EVENTOS) this.addEventListener(t, evento);
    }
    return play.apply(this, arguments);
  };

  /********************************
   * Conexión con la página
   ********************************/
  addEventListener("pagehide", () => { sonando.clear(); if (silencio) { clearTimeout(silencio); silencio = null; } stop(true); });
  addEventListener("pageshow", e => { if (e.persisted) for (const a of document.querySelectorAll("audio")) if (!a.paused && !a.loop) sonando.add(a); actualiza(); });   // volver con atrás/adelante
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") tick(); });
  flush(false);   // aviso del día al abrir (y lo que quedara pendiente de la vez anterior)
})();
