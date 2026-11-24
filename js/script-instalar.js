/********************************
 * script-instalar.js
 *
 * Botón "Instalar" (solo en los tres sitios que se instalan: raíz, live/ y live_ser/, cada uno con su manifest): Chrome y Edge (Android y PC) avisan con "beforeinstallprompt" cuando la web se puede
 * instalar; se guarda el aviso y la ventana de instalación se abre con el botón. Va antes del de modo oscuro
 * (y del de información en live): arriba del todo, en PC y en el móvil. Solo se ve mientras se puede
 * instalar; en iPhone/iPad (sin ventana posible) sale igual y al pulsarlo dice cómo hacerlo durante unos segundos.
 * Instalada o en los navegadores que no lo avisan, no sale.
 * Es la misma idea que js/install.js de Radio Web Neo y Radio Proxy Web.
 ********************************/
(() => {
  let deferred = null, btn = null, back = 0;
  const LABEL = '<span>Instalar</span><span aria-hidden="true">📲</span>';
  const HOW = '<span>Compartir › Añadir a pantalla de inicio</span>';

  const installed = () => matchMedia("(display-mode: standalone), (display-mode: minimal-ui)").matches || navigator.standalone === true;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);   // iPad se presenta como Mac

  function paint() {
    const ok = (!!deferred || ios) && !installed();
    if (!btn) {
      if (!ok) return;
      const ref = document.getElementById("theme-toggle");
      if (!ref) return;   // página sin botones de abajo: sin botón
      btn = document.createElement("button");
      btn.className = "theme-toggle install-toggle";
      btn.type = "button";
      btn.innerHTML = LABEL;
      btn.addEventListener("click", install);
      ref.before(btn);   // orden: Instalar, Modo oscuro, Sobre el proyecto
    }
    btn.hidden = !ok;
  }

  async function install() {
    if (!deferred) {
      if (!ios) return;
      btn.innerHTML = HOW;   // iPhone: cómo hacerlo, y vuelve el texto de siempre
      clearTimeout(back);
      back = setTimeout(() => { btn.innerHTML = LABEL; }, 5000);
      return;
    }
    const e = deferred;
    deferred = null;
    paint();   // el aviso solo sirve una vez
    try { e.prompt(); } catch { return; }
    await e.userChoice.catch(() => {});
  }

  // Los botones de abajo se colocan al cargar la página (script-interfaz.js y script-info.js): el de instalar, después
  const ready = f => (document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", f) : f());

  addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; ready(paint); });
  addEventListener("appinstalled", () => { deferred = null; ready(paint); });
  if (ios) ready(paint);
})();
