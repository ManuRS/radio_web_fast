/******************************************
 * 
 * CARGAR ULTIMOS N AUDIOS DE UN FEED
 * 
 * ****************************************/
// eq: true pasa los audios por el ecualizador (script-ecualizador.js); false suenan directos.
// El servidor del archivo debe permitir CORS; si no, el audio se recarga solo sin ecualizador.
// tituloNotif: si se indica, es la primera línea de la notificación de Android para todos los audios
// de la página (por defecto, el nombre que muestra la tarjeta).
async function cargaRSS_nlast(feedUrl_arg, numElems_arg, visual_arg, imagen_type="capitulo", eq=false, tituloNotif=null) {
  // Crear cascaron HTML
  const listaDiv = document.getElementById("lista");
  const contenedores = crearContenedoresPodcasts(numElems_arg , listaDiv);

  try {

    // Conseguir datos y extraer las N primeras entradas
    const feed = await descargarFeedRss(feedUrl_arg);
    const items = Array.from(feed.items).slice(0, numElems_arg);

    // Definir image si queremos la portada
    const imagen_select = defineImagenPodcast (feed, imagen_type);

    // Rellenar cada contenedor con su audio
    items.forEach((item, index) => construirUnCapitulo(item, contenedores[index], visual_arg, null, imagen_select, eq, tituloNotif) );

  } catch(e) {
    console.error("Error cargando RSS:", e);
  }

  // Los huecos que se quedan sin capítulo (feed caído o con menos entradas) desaparecen
  quitarHuecosVacios(contenedores);
}

/******************************************
 * 
 * CARGAR AUDIOS POR NOMBRE DE CAPITULOS
 * 
 * ****************************************/
// eq: true pasa los audios por el ecualizador (script-ecualizador.js); false suenan directos.
// El servidor del archivo debe permitir CORS; si no, el audio se recarga solo sin ecualizador.
async function cargarRSS_bycaps(podcasts, visualizacion, imagen_type="capitulo", eq=false) {

  // Crear cascaron HTML
  const listaDiv = document.getElementById("lista");
  const contenedores = crearContenedoresPodcasts(podcasts, listaDiv);

  // Índice del primer contenedor disponible
  let index = 0;

  // Recorremos cada uno de los podcast en la lista que nos ha llegado
  for (const pod of podcasts) {

    // Cuantos episodios se buscan del podcast pod
    const ncaps = pod.ncaps ?? 1;

    // Obtener los contenedores que corresponden a este podcast
    const contenedores_pod = contenedores.slice(index, index + ncaps);

    // Cargar los capítulos
    cargarRSS_onecap(pod.url, pod.nombre, pod.capitulo, contenedores_pod, visualizacion, pod.imagen_type, imagen_type, ncaps, eq);

    // Avanzar al siguiente bloque de contenedores
    index += ncaps;

  }
}

/* Esta funcion busca los capitulos con el titulo deseado en cada entrada pod*/
async function cargarRSS_onecap(feedUrl_arg, name_arg, capitulo_arg, contenedores_arg, visual_arg, imagen_type, imagen_type_global, ncaps=1, eq=false) {
  try {
    // Conseguir datos
    const feed = await descargarFeedRss(feedUrl_arg);
    const items = feed.items;

    // Definir image si queremos la portada
    const imagen_select = defineImagenPodcast (feed, imagen_type, imagen_type_global);

    // Contador
    let ncaps_encontrados=0;

    // Recorremos cada elemento del feed
    for (const item of items) {

      // Obtener el título de este elemento
      const titulo = item.querySelector("title")?.textContent || "";

      // Buscamos si es un episodio de los que queremos
      if (capitulo_arg.some(c => titulo.includes(c))) {

        // Han cantado Bingo!
        construirUnCapitulo(item, contenedores_arg[ncaps_encontrados], visual_arg, name_arg, imagen_select, eq);

        // Comprobar si hemos acabado
        if (++ncaps_encontrados == ncaps){
          break;
        }
        
      }
    }

  } catch(e) {
    console.error("Error cargando RSS:", e);
  }

  // Los huecos que se quedan sin capítulo (no aparece o el feed falla) desaparecen
  quitarHuecosVacios(contenedores_arg);
}

/******************************************
 * 
 * ESCAPAR TEXTO PARA HTML
 * 
 * ****************************************/
function escaparHtml(texto) {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/******************************************
 * 
 * CONSTRUIR CAPITULO
 * 
 * ****************************************/
function construirUnCapitulo(item, contenedor, visual, personalizado, imagen_select, eq=false, tituloNotif=null){

  // Ya no es un hueco en carga: sale el esqueleto y manda la altura real
  contenedor.classList.remove("cargando");
  contenedor.removeAttribute("aria-hidden");

  // Solo se activa si la página ha cargado script-ecualizador.js
  const conEq = eq === true && typeof Ecualizador !== "undefined";
  if (eq === true && !conEq) console.warn("eq=true, pero esta página no carga script-ecualizador.js.");

  // Todo lo que viene del feed se escapa: se inserta como HTML y un título con "<" o "&"
  // (o algo peor) no debe poder romper la página ni colar etiquetas.
  const titulo = escaparHtml(item.querySelector("title")?.textContent || "Sin título");

  const pubDate = item.querySelector("pubDate")?.textContent || null;
  const antiguedad = pubDate ? tiempoDesde(pubDate) : "";
  const fecha = pubDate ? formatearFecha(pubDate) : "";

  const audioUrlFeed = item.querySelector("enclosure")?.getAttribute("url") || null;
  const audioUrl = audioUrlFeed ? escaparHtml(audioUrlFeed) : null;
  imagen_select = defineImagenCapitulo(item, imagen_select);


  let text_p;

  if (visual == "titulo"){
    text_p = `
      <p class="titulo-principal">${titulo}</p> <br>
    `;

  }

  if (visual == "titulo_antiguedad"){
    text_p = `
      <p class="titulo-principal">${titulo} / ${antiguedad}</p> <br>
    `;
  }

  if (visual == "personalizado_antiguedad"){
      text_p = `
        <p class="titulo-principal" style="display:inline">${personalizado} / ${antiguedad}</p> <br><br>
      `;
  }

  if (visual == "personalizado_antiguedad_titulo"){
      text_p = `
        <p class="titulo-principal" style="display:inline">${personalizado} / ${antiguedad}</p> <br><br>
        <p class="titulo-secundario" style="display:inline">${titulo}</p> <br><br>
      `;
  }

  if (audioUrl) {

    /*************************************************************/
    contenedor.innerHTML = `
      <div class="podcast-contenido">
        ${imagen_select}
        <div class="podcast-texto">
          ${text_p}
          <audio controls style="background-color: var(--audio-background, #f1f3f4);"${conEq ? ' data-eq="true" crossorigin="anonymous"' : ''} src="${audioUrl}"></audio>
          <div class="controles">
            <div class="botones-reproduccion">
              <button onclick="let a=this.closest('.podcast-texto').querySelector('audio'); if(a.paused){ a.play(); this.textContent='🔴 Pausa'; } else { a.pause(); this.textContent='🟢 Play'; } ">🟢 Play</button>
              <button onclick="let a=this.closest('.podcast-texto').querySelector('audio'); a.currentTime = Math.max(0,a.currentTime-10)">⏪ -10s</button>
              <button onclick="let a=this.closest('.podcast-texto').querySelector('audio'); a.currentTime = Math.min(a.duration,a.currentTime+10)">⏩ +10s</button>
              <button onclick="let a=this.closest('.podcast-texto').querySelector('audio'); a.playbackRate=a.playbackRate===1?2:1;this.textContent=a.playbackRate===2?'⏩ x1':'⏩ x2'">⏩ x2</button>
            </div>
          </div>
        </div>
      </div>
      <br>
    `;
    /*************************************************************/

    // Primera línea de la notificación de Android (ver RWFNotificacion en script-interfaz.js):
    // lo mismo que se ve como título en la tarjeta, sin la antigüedad. Es el nombre
    // personalizado si la tarjeta lo muestra y, si no, el título del capítulo. Una página puede
    // fijar el suyo para todos sus audios (tituloNotif).
    const tituloCapitulo = item.querySelector("title")?.textContent?.trim() || "Sin título";
    const nombreTarjeta = String(visual ?? "").startsWith("personalizado") ? String(personalizado ?? "").trim() : "";
    contenedor.querySelector("audio").dataset.notifTitulo = tituloNotif || nombreTarjeta || tituloCapitulo;

    // La imagen entra con fundido cuando termina de cargar (ver fundirImagenes en script-interfaz.js)
    if (typeof fundirImagenes === "function") fundirImagenes(contenedor);

    if (conEq) Ecualizador.vigilar(contenedor.querySelector("audio"));

  } else {
    contenedor.innerHTML = `<p class="titulo-principal">${titulo} (No se encontró audio)</p>`;
  }

  return;
}


/******************************************
 * 
 * IMAGEN DEL CAPITULO
 * 
 * ****************************************/
function defineImagenPodcast (feed, imagen_type, imagen_type_global=null) {

  // La img src html a devolver
  let imagen_select;

  // Preferencia global si no hay especifica
  if (imagen_type == null) {imagen_type = imagen_type_global};

  // Caso queremos usar la portada del podcast
  if (imagen_type == "general") {
    const imageUrl = feed.imageUrl;
    const portada_podcast = imageUrl ? `<img src="${escaparHtml(imageUrl)}" alt="Podcast">` : "";
    imagen_select = portada_podcast;
  }

  // Caso queremos usar la portada del capitulo
  else if (imagen_type == "capitulo" || imagen_type == null){
    imagen_select = null;
  }

  // Caso nos han dado una URL personalizada
  else{
    imagen_select = `<img src="${imagen_type}" alt="Podcast">`
  }

  return imagen_select;

}

function defineImagenCapitulo(item, imagen_select) {

  // Un null es que quieren que rellenemos con la imagen del capitulo (item)
  if (imagen_select==null) {

    // El item es un capitulo, por lo tanto sacamos su imagen y a correr
    const imageUrlElement = item.getElementsByTagName('itunes:image')[0];
    const imageUrl = imageUrlElement ? imageUrlElement.getAttribute('href') : null;
    const titulo = item.querySelector("title")?.textContent || "";
    return imageUrl ? `<img src="${escaparHtml(imageUrl)}" alt="${escaparHtml(titulo)}">` : "";

  }

  return imagen_select;
}

/******************************************
 * 
 * CREAR CONTENEDORES
 * 
 * ****************************************/
function crearContenedoresPodcasts(podcasts, listaDiv) {

  // Calcular el número total de contenedores
  const total = typeof podcasts === "number"
    ? podcasts
    : podcasts.reduce((suma, pod) => suma + (pod.ncaps ?? 1), 0);

  // Crear los contenedores, con su esqueleto de carga (ver .cargando en theme-podcast.css).
  // Reproduce la estructura de la tarjeta real: imagen, líneas de texto, audio y botones.
  return Array.from({ length: total }, () => {
    const div = document.createElement("div");
    div.className = "podcast cargando";
    div.setAttribute("aria-hidden", "true");
    div.innerHTML = `
      <div class="podcast-contenido">
        <span class="esq-img"></span>
        <div class="podcast-texto">
          <div class="esq-lineas"><i></i><i></i><i></i><i></i></div>
          <span class="esq-audio"></span>
          <div class="controles">
            <div class="botones-reproduccion esq-botones"><i></i><i></i><i></i><i></i></div>
          </div>
        </div>
      </div>
      <br>
    `;
    listaDiv.appendChild(div);
    return div;
  });
}

// Quita los contenedores que no se han llegado a rellenar: con su altura reservada
// quedarían como tarjetas con el esqueleto puesto para siempre.
function quitarHuecosVacios(contenedores) {
  contenedores.forEach(c => { if (c.classList.contains("cargando")) c.remove(); });
}

/******************************************
 * 
 * Descargar un RSS
 * 
 * ****************************************/

// Cada feed se descarga una sola vez por carga de página. Varias entradas de una misma
// página pueden usar el mismo feed (por ejemplo, distintas secciones de un programa) y
// comparten esa descarga, también cuando llegan en llamadas distintas a cargarRSS_bycaps.
// Es memoria de esta página solamente: al recargar se vuelve a pedir, así que sigue
// siendo siempre reciente.
const feedsPedidos = new Map();

function descargarFeedRss(url, antiCache=true){
  const clave = `${antiCache}|${url}`;

  if (!feedsPedidos.has(clave)) {
    const descarga = pedirFeedRss(url, antiCache);
    feedsPedidos.set(clave, descarga);

    // Si falla, el error no se queda guardado: la siguiente petición lo intenta de nuevo
    descarga.catch(() => feedsPedidos.delete(clave));
  }

  return feedsPedidos.get(clave);
}

async function pedirFeedRss(url, antiCache=true){

  let res;

  if (antiCache) {

    // Mejora de la URL
    const separador = url.includes("?") ? "&" : "?";
    url = `${url}${separador}t=${Date.now()}`;

    // Fetch con mejoras
    res = await fetch(url, { 
      cache: 'no-store',
      //headers: {
      //  'Cache-Control': 'no-cache',
      //  'Pragma': 'no-cache'
      //}
    });

  } else {
    // Fetch simple
    res = await fetch(url);
  }

  // Un error HTTP no se interpreta como un feed vacío (y así no se comparte como tal)
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`);

  // Preparacion del resultado
  const texto = await res.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(texto, "application/xml");

  // Resultado listo para su analisis
  return {
    // Los capítulos del podcast
    items: xml.querySelectorAll("item"),

    // La imagen general del podcast
    imageUrl: xml.getElementsByTagName("itunes:image")[0]?.getAttribute("href") || null

    // A veces la imagen aparece así
    //imageUrl = xml.querySelector("image > url")?.textContent || null;
  };

}

/**********************
  FECHAS Y HORA
**********************/

function tiempoDesde(publicacion) {
  const ahora = new Date();
  const pubDate = new Date(publicacion);
  const diffMs = ahora - pubDate;

  const diffSeg = Math.floor(diffMs / 1000);
  if (diffSeg < 60) return `Hace ${diffSeg} segundo${diffSeg === 1 ? "" : "s"}`;

  const diffMin = Math.floor(diffSeg / 60);
  if (diffMin < 60) return `Hace ${diffMin} minuto${diffMin === 1 ? "" : "s"}`;

  const diffHoras = Math.floor(diffMin / 60);
  if (diffHoras < 24) return `Hace ${diffHoras} hora${diffHoras === 1 ? "" : "s"}`;

  const diffDias = Math.floor(diffHoras / 24);
  return `Hace ${diffDias} día${diffDias === 1 ? "" : "s"}`;
}

function formatearFecha(fechaStr) {
  const date = new Date(fechaStr);
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const anio = date.getFullYear();
  return `${dia}/${mes}/${anio}`;
}
