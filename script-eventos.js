(function () {

  "use strict";

/*******************
 * EVENTOS
 ******************/
  const EVENTOS = {
    "01-01": [
      {
        titulo: "¡Feliz {año}!",
        emojis: ["🎉", "🎊", "🥂", "✨", "🎆", "🥳"],
        efecto: "explosion"
      }
    ],

    "26-10": [
      {
        titulo: "¡Día Mundial de la Radio {año}!",
        emojis: ["📻", "🎙️", "🎧", "🟡", "🔴", "🔵", "🟢"],
        efecto: "confeti"
      },
      {
        titulo: "¡Viva la radio siempre!",
        emojis: ["📻", "💛", "🎙️", "🎧"],
        efecto: "explosion"
      }
    ],

    "17-06": [
      {
        titulo: "¡Feliz {años} cumpleaños Radio Madrid!",
        añoInicio: 1925,
        emojis: ["📻", "🎂", "🎉", "🎙️", "🎊", "🥳", "💛"],
        efecto: "confeti"
      }
    ],

    "18-07": [
      {
        titulo: "¡Los 40 Principales, {años} años de éxitos!",
        añoInicio: 1966,
        emojis: ["🔊", "🎧", "🎉", "✨", "🎵", "🥳", "❤️"],
        efecto: "explosion"
      }
    ],

    "09-09": [
      {
        titulo: "¡Radio Web Fast cumple {años} años!",
        añoInicio: 2025,
        emojis: ["📻", "🎂", "🎉", "🎆", "🎧", "🥳"],
        efecto: "explosion"
      }
    ],

    "31-10": [
      {
        titulo: "¡Feliz Juawelin!",
        emojis: ["🎃", "👻", "🪦", "🍬", "🧛", "🧟"],
        efecto: "explosion"
      }
    ],

    "14-11": [
      {
        titulo: "¡Radio Barcelona, {años} años en el aire!",
        añoInicio: 1924,
        emojis: ["📻", "🎂", "🎉", "🎊", "🥳", "💛"],
        efecto: "confeti"
      },
      {
        titulo: "¡Feliz {años} cumpleaños Cadena SER!",
        añoInicio: 1924,
        emojis: ["📻", "🎂", "🎉", "🎊", "🥳", "💛"],
        efecto: "explosion"
      }
    ],

    "25-12": [
      {
        titulo: "¡Feliz Navidad!",
        emojis: ["🎄", "🎅", "🎁", "❄️", "⭐", "🔔"],
        efecto: "confeti"
      }
    ]
  };

/*******************
 * obtenerPagina
 ******************/
  // Página en la que se ejecuta el script.
  function obtenerPagina() {
    const paginaDeclarada = document.documentElement.dataset.page;

    if (["index", "live", "live_ser"].includes(paginaDeclarada)) {
      return paginaDeclarada;
    }

    const ruta = window.location.pathname.replace(/\/+$/, "");

    if (/\/live_ser(?:\/index\.html)?$/.test(ruta)) {
      return "live_ser";
    }

    if (/\/live(?:\/index\.html)?$/.test(ruta)) {
      return "live";
    }

    return "index";
  }

/*******************
 * obtenerEvento
 ******************/
  function obtenerEvento() {
    const ahora = new Date();
    const clave = String(ahora.getDate()).padStart(2, "0") +
      "-" +
      String(ahora.getMonth() + 1).padStart(2, "0");

    const eventosDelDia = EVENTOS[clave];

    if (!eventosDelDia || eventosDelDia.length === 0) {
      return null;
    }

    // Si hay varios eventos en la misma fecha, elige uno al azar.
    const evento = eventosDelDia[
      Math.floor(Math.random() * eventosDelDia.length)
    ];

    const añoActual = ahora.getFullYear();

    let titulo = evento.titulo
      .replace(/\{año\}/g, añoActual);

    if (evento.añoInicio) {
      titulo = titulo.replace(
        /\{años\}/g,
        añoActual - evento.añoInicio
      );
    }

    return {
      ...evento,
      titulo
    };
  }

/*******************
 * actualizarTitulos
 ******************/
  function actualizarTitulos(titulo) {
    document.title = titulo;

    const encabezado = document.querySelector("h1");

    if (encabezado) {
      encabezado.textContent = titulo;
    }
  }

/*******************
 * lanzarLluvia
 ******************/
  function lanzarLluvia(emojis) {
    if (!emojis || emojis.length === 0) return;

    document.querySelectorAll(".evento-lluvia").forEach(e => e.remove());
    document.getElementById("lluvia-estilo")?.remove();

    const estilo = document.createElement("style");
    estilo.id = "lluvia-estilo";
    estilo.textContent = `
      .evento-lluvia {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 99999;
        pointer-events: none;
        user-select: none;
        line-height: 1;
        white-space: nowrap;
        will-change: transform, opacity;
      }
    `;
    document.head.appendChild(estilo);

    const cantidad = 72;
    const ancho = window.innerWidth;
    const alto = window.innerHeight;
    const elementos = [];

    for (let i = 0; i < cantidad; i++) {
      const emoji = document.createElement("span");
      emoji.className = "evento-lluvia";
      emoji.textContent =
        emojis[Math.floor(Math.random() * emojis.length)];

      emoji.style.fontSize = (30 + Math.random() * 28) + "px";
      document.body.appendChild(emoji);

      elementos.push({
        elemento: emoji,
        x: Math.random() * ancho,
        y: -40 - Math.random() * alto * 0.7,

        // Velocidad vertical individual.
        velocidad: 70 + Math.random() * 130,

        // Balanceo horizontal suave, distinto para cada emoji.
        amplitud: 8 + Math.random() * 35,
        frecuencia: 0.7 + Math.random() * 1.8,
        fase: Math.random() * Math.PI * 2,
        deriva: (Math.random() - 0.5) * 35,

        // Giro propio, con sentido y velocidad aleatorios.
        giro: (Math.random() - 0.5) * 160,
        rotacion: Math.random() * 360,

        tamaño: 0.7 + Math.random() * 0.7,
        tiempo: Math.random() * 3,

        // Variaciones naturales de aparición.
        opacidad: 1
      });
    }

    let anterior = null;
    let animacionId;

    function animar(marcaTiempo) {
      if (anterior === null) anterior = marcaTiempo;

      const dt = Math.min((marcaTiempo - anterior) / 1000, 0.04);
      anterior = marcaTiempo;

      let quedan = 0;

      for (const p of elementos) {
        if (p.terminado) continue;

        p.tiempo += dt;
        p.y += p.velocidad * dt;
        p.x += p.deriva * dt;

        // Balanceo continuo, como objetos arrastrados por el aire.
        const balanceo =
          Math.sin(p.tiempo * p.frecuencia + p.fase) * p.amplitud;

        // Pequeña variación de giro durante la caída.
        const rotacion = p.rotacion + p.giro * p.tiempo;

        p.elemento.style.opacity = p.opacidad;
        p.elemento.style.transform =
          `translate3d(${p.x + balanceo}px, ${p.y}px, 0) ` +
          `rotate(${rotacion}deg) scale(${p.tamaño})`;

        if (p.y > alto + 80 || p.x < -100 || p.x > ancho + 100) {
          p.elemento.remove();
          p.terminado = true;
        } else {
          quedan++;
        }
      }

      if (quedan > 0) {
        animacionId = requestAnimationFrame(animar);
      } else {
        cancelarAnimationFrame(animacionId);
        estilo.remove();
      }
    }

    animacionId = requestAnimationFrame(animar);
  }

/*******************
 * lanzarConfeti
 ******************/
  function lanzarConfeti(emojis) {
    if (!emojis || emojis.length === 0) return;

    // Evitar duplicar la animación si se ejecuta dos veces.
    document.getElementById("confeti-canon-estilo")?.remove();
    document.querySelectorAll(".evento-confeti").forEach(e => e.remove());

    const estilo = document.createElement("style");
    estilo.id = "confeti-canon-estilo";

    estilo.textContent = `
      .evento-confeti {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 99999;
        pointer-events: none;
        user-select: none;
        line-height: 1;
        white-space: nowrap;
        will-change: transform, opacity;
      }
    `;

    document.head.appendChild(estilo);

    const cantidad = 72;
    const ancho = window.innerWidth;
    const alto = window.innerHeight;
    const elementos = [];

    for (let i = 0; i < cantidad; i++) {
      const emoji = document.createElement("span");
      emoji.className = "evento-confeti";
      emoji.textContent =
        emojis[Math.floor(Math.random() * emojis.length)];

      emoji.style.fontSize = (30 + Math.random() * 28) + "px";

      // Colocarlo directamente en el punto de salida, sin mostrarlo en (0, 0).
      emoji.style.transform = "translate3d(-1000px, -1000px, 0)";
      emoji.style.opacity = "0";

      document.body.appendChild(emoji);

      const inicioX = ancho * (0.25 + Math.random() * 0.5);
      const inicioY = alto + 30;

      elementos.push({
        elemento: emoji,

        // Posición inicial, debajo de la pantalla.
        x: inicioX,
        y: inicioY,

        // Impulso inicial del cañón.
        vx: (Math.random() - 0.5) * 3.5,
        vy: -(alto * (0.65 + Math.random() * 0.6)) / 1.6,

        // Cada emoji tiene su propia física.
        gravedad: alto * (0.75 + Math.random() * 0.45) / 8,
        balanceo: 3 + Math.random() * 4,
        frecuencia: 1.5 + Math.random() * 2,
        fase: Math.random() * Math.PI * 2,
        giro: (Math.random() - 0.5) * 220,
        tamaño: 0.8 + Math.random() * 0.4,
        tiempo: 0,
        duracion: 12 + Math.random() * 2,
        retraso: Math.random() * 0.25
      });
    }

    let anterior = null;
    let animacionId;

    function animar(marcaTiempo) {
      if (anterior === null) anterior = marcaTiempo;

      // Limitar el paso temporal evita saltos si el navegador se ralentiza.
      const dt = Math.min((marcaTiempo - anterior) / 1000, 0.04);
      anterior = marcaTiempo;

      let quedan = 0;

      for (const p of elementos) {
        if (p.terminado) continue;

        if (p.retraso > 0) {
          p.retraso -= dt;
          quedan++;
          continue;
        }

        p.tiempo += dt;

        // Movimiento físico continuo: impulso y gravedad.
        p.x += p.vx * 60 * dt;
        p.y += p.vy * dt;

        p.vy += p.gravedad * dt;

        // Balanceo lateral suave durante el recorrido.
        const balanceo = Math.sin(
          p.tiempo * p.frecuencia + p.fase
        ) * p.balanceo;

        const progreso = Math.min(p.tiempo / p.duracion, 1);

        // Permanecen visibles casi todo el recorrido y se desvanecen al final.
        const inicioFade = 0.94;
        const opacidad = progreso < inicioFade
          ? 1
          : Math.max(0, (1 - progreso) / (1 - inicioFade));

        p.elemento.style.opacity = opacidad;
        p.elemento.style.transform =
          `translate3d(${p.x + balanceo}px, ${p.y}px, 0) ` +
          `rotate(${p.giro * p.tiempo}deg) scale(${p.tamaño})`;

        if (p.tiempo >= p.duracion || p.y > alto + 100) {
          p.elemento.remove();
          p.terminado = true;
        } else {
          quedan++;
        }
      }

      if (quedan > 0) {
        animacionId = requestAnimationFrame(animar);
      } else {
        cancelarAnimationFrame(animacionId);
        estilo.remove();
      }
    }

    animacionId = requestAnimationFrame(animar);
  }

/*******************
 * iniciar
 ******************/
  function iniciar() {
    const pagina = obtenerPagina();

    if (!["index", "live", "live_ser"].includes(pagina)) {
      return;
    }

    const evento = obtenerEvento();

    if (!evento) {
      return;
    }

    actualizarTitulos(evento.titulo);
    if (evento.efecto === "explosion") {
      lanzarConfeti(evento.emojis);
    } else {
      lanzarLluvia(evento.emojis);
    }
  }

/*******************
 * esto espera a que la página esté cargada
 ******************/
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }

})();