/******************************
  INFORMACIÓN (solo live)
*******************************/
// Botón "Información" y su modal. Va después de script-interfaz.js: ese script deja el botón de modo
// oscuro al final de la lista (móvil) y aquí se coloca el de información justo debajo.
// Las dos frases de la línea fuerte se alternan mientras el modal está abierto, con el mismo efecto que el
// pie de Radio Web Neo: la frase que sale sube y se va, la que entra sube desde abajo, y al aparecer los
// emojis dan un bote (uno detrás de otro) o, si es solo texto, lo recorre un brillo.
// Con "reducir movimiento" cambian sin animaciones. Con la pestaña oculta no cambian.

(() => {
  const SWAP_MS = 6000;
  const PHRASES = ['Con ❤️ por la 📻', '¡Viva la radio siempre!'];
  const EMOJI = /(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}️?)*)/u;

  const btn = document.getElementById('info-toggle');
  const dlg = document.getElementById('info-modal');
  const box = document.getElementById('info-phrase');
  const closeBtn = document.getElementById('info-close');
  if (!btn) return;
  // Navegador sin <dialog>: sin botón antes que un botón que no hace nada
  if (!dlg || !box || typeof dlg.showModal !== 'function') { btn.style.display = 'none'; return; }

  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.after(btn);

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let cur = 0, timer = 0, playTimer = 0;

  // Una frase: el texto, con cada emoji en su propio elemento (para el bote)
  function render(text) {
    const el = document.createElement('span');
    el.className = 'fp';
    let k = 0;
    text.split(EMOJI).forEach((part, i) => {
      if (!part) return;
      if (i % 2) {
        const e = document.createElement('span');
        e.className = 'fe';
        e.style.setProperty('--k', k++);
        e.textContent = part;
        el.appendChild(e);
      } else el.appendChild(document.createTextNode(part));
    });
    el.classList.add(k ? 'fp-emoji' : 'fp-text');
    return el;
  }

  // Efecto de la frase que se ve
  function play() {
    if (reduce.matches) return;
    const el = box.querySelector('.fp:not(.out)');
    if (!el || el.classList.contains('in')) return;   // la que está entrando lo hace al terminar de entrar
    el.classList.remove('play');
    void el.offsetWidth;
    el.classList.add('play');
    const last = el.classList.contains('fp-emoji') ? [...el.querySelectorAll('.fe')].pop() : el;
    last.addEventListener('animationend', () => el.classList.remove('play'), { once: true });
  }

  function swap() {
    if (document.hidden) return;
    cur = (cur + 1) % PHRASES.length;
    const old = box.querySelector('.fp:not(.out)'), next = render(PHRASES[cur]);
    if (reduce.matches || !old) { box.replaceChildren(next); return; }
    old.classList.add('out');
    old.addEventListener('animationend', e => { if (e.animationName === 'info-fp-out') old.remove(); });
    next.classList.add('in');
    next.addEventListener('animationend', function done(e) {
      if (e.animationName !== 'info-fp-in') return;
      next.removeEventListener('animationend', done);
      next.classList.remove('in');
      play();
    });
    box.appendChild(next);
  }

  function open() {
    cur = 0;
    box.replaceChildren(render(PHRASES[0]));
    dlg.showModal();
    clearTimeout(playTimer);
    clearInterval(timer);
    playTimer = setTimeout(play, 350);   // tras la entrada del modal
    timer = setInterval(swap, SWAP_MS);
  }

  function stop() {
    clearTimeout(playTimer);
    clearInterval(timer);
  }

  btn.addEventListener('click', open);
  closeBtn.addEventListener('click', () => dlg.close());
  // Tocar fuera de la caja (el fondo cuenta como el propio <dialog>)
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  // Se dispara con ✕, fondo, Esc o gesto atrás
  dlg.addEventListener('close', stop);
})();
