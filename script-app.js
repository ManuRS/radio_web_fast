/******************************************
 *
 * APP INSTALADA EN ANDROID: NAVEGAR SIN LA BARRITA DE CARGA DE CHROME
 *
 * Desde Chrome 142, en una app instalada, Chrome pinta su barra de progreso (una línea fina
 * bajo la barra de estado) cada vez que la ventana carga otro documento: al pulsar una tarjeta
 * del index y al volver atrás. No depende de lo que tarde la página ni de sus colores.
 * La barra solo arranca con las cargas de la ventana principal; lo que se carga dentro de un
 * <iframe> no la mueve.
 *
 * Por eso, en la app instalada, el index no se abandona nunca: cada tarjeta abre su página en
 * un <iframe> a pantalla completa por encima del index, y el gesto atrás lo quita. Para la
 * página de dentro no cambia nada (misma URL, mismos scripts, su audio y su notificación).
 *
 * En el navegador normal y fuera de Android esto no hace nada: los enlaces navegan como siempre.
 *
 * Solo lo carga index.html.
 *
 * ****************************************/
(() => {
  // --- Solo en la app instalada de Android, y solo si esta página es la ventana principal ---
  const instalada = window.matchMedia(
    "(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)"
  ).matches;

  if (!instalada || window.top !== window || !/Android/i.test(navigator.userAgent)) return;

  // Carpeta de la app: solo se abren dentro los enlaces que cuelgan de ella
  const base = location.pathname.substring(0, location.pathname.lastIndexOf("/") + 1);

  // Tiempo máximo que se espera a que la página de dentro esté lista para enseñarla
  const ESPERA_MAXIMA_MS = 1500;

  let marco = null;

  const estilo = document.createElement("style");
  estilo.textContent = `
    #rwf-pagina {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 0;
      z-index: 2147483647;
      opacity: 0;
    }
    #rwf-pagina.lista { opacity: 1; }

    /* Con una página abierta, el index queda quieto y sin pintar por debajo */
    html.rwf-dentro { overflow: hidden; }
    html.rwf-dentro body > *:not(#rwf-pagina) { visibility: hidden; }
  `;
  document.head.appendChild(estilo);

  // --- Enseñar la página de dentro ---
  // Hasta que tiene contenido se sigue viendo el index, igual que al navegar entre páginas
  // el navegador mantiene la anterior hasta que la nueva pinta algo.
  function mostrarCuandoEsteLista(elMarco) {
    const inicio = performance.now();

    const mostrar = () => {
      if (marco !== elMarco) return;

      elMarco.style.background = getComputedStyle(document.body).backgroundColor;
      elMarco.classList.add("lista");
      document.documentElement.classList.add("rwf-dentro");

      // El gesto atrás y el teclado van a la página de dentro (su aviso de salida lo necesita)
      try {
        elMarco.contentWindow.focus();
      } catch (error) {
        // Sin acceso a la ventana de dentro no hay nada que enfocar
      }
    };

    const comprobar = () => {
      if (marco !== elMarco) return;

      let lista = false;

      try {
        const doc = elMarco.contentDocument;
        lista = !!doc && doc.URL !== "about:blank" && doc.readyState !== "loading";
      } catch (error) {
        lista = true;
      }

      if (lista || performance.now() - inicio > ESPERA_MAXIMA_MS) {
        // Un fotograma de margen para que la página ya esté pintada
        requestAnimationFrame(() => requestAnimationFrame(mostrar));
        return;
      }

      requestAnimationFrame(comprobar);
    };

    requestAnimationFrame(comprobar);
  }

  // --- Dentro de la página: los enlaces a otras webs no se cargan en el marco ---
  // Casi ninguna web se deja mostrar dentro de otra; se abren aparte, como hacía la app.
  function vigilarEnlacesDeDentro(elMarco) {
    let doc;

    try {
      doc = elMarco.contentDocument;
    } catch (error) {
      return;
    }

    if (!doc) return;

    doc.addEventListener("click", event => {
      const enlace = event.target.closest && event.target.closest("a[href]");
      if (!enlace || event.defaultPrevented) return;
      if (enlace.target && enlace.target !== "_self") return;

      let url;

      try {
        url = new URL(enlace.href, doc.baseURI);
      } catch (error) {
        return;
      }

      if (!/^https?:$/.test(url.protocol) || url.origin === location.origin) return;

      event.preventDefault();
      window.open(url.href, "_blank", "noopener");
    });
  }

  // --- Abrir y cerrar ---
  function abrir(url, nuevaEntrada) {
    if (marco) return;

    // La entrada del historial es la que hace que el gesto atrás vuelva al index.
    // (La primera carga de un <iframe> recién creado no añade entrada por sí sola.)
    if (nuevaEntrada) history.pushState({ rwfPagina: url }, "");

    const elMarco = document.createElement("iframe");
    elMarco.id = "rwf-pagina";
    elMarco.title = "Radio Web Fast";
    elMarco.addEventListener("load", () => vigilarEnlacesDeDentro(elMarco));
    elMarco.src = url;

    marco = elMarco;
    document.body.appendChild(elMarco);
    mostrarCuandoEsteLista(elMarco);
  }

  function cerrar() {
    if (!marco) return;

    // Al quitar el marco su página se descarga: el audio se para, igual que al salir de ella
    marco.remove();
    marco = null;
    document.documentElement.classList.remove("rwf-dentro");
  }

  // --- Tarjetas del index ---
  document.addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const enlace = event.target.closest && event.target.closest("a[href]");
    if (!enlace || enlace.hasAttribute("download")) return;
    if (enlace.target && enlace.target !== "_self") return;

    let url;

    try {
      url = new URL(enlace.href, location.href);
    } catch (error) {
      return;
    }

    // Solo páginas de la propia app (en GitHub Pages el mismo dominio aloja otras webs)
    if (url.origin !== location.origin || !url.pathname.startsWith(base)) return;

    event.preventDefault();
    abrir(url.href, true);
  });

  // --- Gesto atrás (y adelante) ---
  window.addEventListener("popstate", () => {
    const url = history.state && history.state.rwfPagina;

    if (url) {
      abrir(url, false);
    } else {
      cerrar();
    }
  });

  // Si Android recupera la app en una entrada que tenía una página abierta, se vuelve a abrir
  if (history.state && history.state.rwfPagina) {
    abrir(history.state.rwfPagina, false);
  }
})();
