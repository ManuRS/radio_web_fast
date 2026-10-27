
/******************************************
 * 
 * CARGAR ULTIMOS N AUDIOS DE UN FEED
 * 
 * ****************************************/
async function cargaRSS_nlast(feedUrl_arg, numElems_arg, visual_arg, imagen_type="capitulo") {
  try {

    // Crear cascaron HTML
    const listaDiv = document.getElementById("lista");
    const contenedores = crearContenedoresPodcasts(items, listaDiv);

    // Conseguir datos y extraer las N primeras entradas
    const feed = await descargarFeedRss(feedUrl_arg);
    const items = Array.from(feed.items).slice(0, numElems_arg);

    // Definir image si queremos la portada
    imagen_select = defineImagenPodcast (feed, imagen_type);

    // Rellenar cada contenedor con su audio
    items.forEach((item, index) => construirUnCapitulo(item, contenedores[index], visual_arg, null, imagen_select) );

  } catch(e) {
    console.error("Error cargando RSS:", e);
  }
}

/******************************************
 * 
 * CARGAR AUDIOS POR NOMBRE DE CAPITULOS
 * 
 * ****************************************/
async function cargarRSS_bycaps(podcasts, visualizacion, imagen_type="capitulo") {

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
    cargarRSS_onecap(pod.url, pod.nombre, pod.capitulo, contenedores_pod, visualizacion, pod.imagen_type, imagen_type, ncaps);

    // Avanzar al siguiente bloque de contenedores
    index += ncaps;

  }
}

/* Esta funcion busca los capitulos con el titulo deseado en cada entrada pod*/
async function cargarRSS_onecap(feedUrl_arg, name_arg, capitulo_arg, contenedores_arg, visual_arg, imagen_type, imagen_type_global, ncaps=1) {
  try {
    // Conseguir datos
    const feed = await descargarFeedRss(feedUrl_arg);
    const items = feed.items;

    // Definir image si queremos la portada
    imagen_select = defineImagenPodcast (feed, imagen_type, imagen_type_global);

    // Contador
    let ncaps_encontrados=0;

    // Recorremos cada elemento del feed
    for (const item of items) {

      // Obtener el título de este elemento
      const titulo = item.querySelector("title")?.textContent || "";

      // Buscamos si es un episodio de los que queremos
      if (capitulo_arg.some(c => titulo.includes(c))) {

        // Han cantado Bingo!
        construirUnCapitulo(item, contenedores_arg[ncaps_encontrados], visual_arg, name_arg, imagen_select);

        // Comprobar si hemos acabado
        if (++ncaps_encontrados == ncaps){
          break;
        }
        
      }
    }

  } catch(e) {
    console.error("Error cargando RSS:", e);
  }
}

/******************************************
 * 
 * CONSTRUIR CAPITULO
 * 
 * ****************************************/
function construirUnCapitulo(item, contenedor, visual, personalizado, imagen_select){

  const titulo = item.querySelector("title")?.textContent || "Sin título";

  const pubDate = item.querySelector("pubDate")?.textContent || null;
  const antiguedad = pubDate ? tiempoDesde(pubDate) : "";
  const fecha = pubDate ? formatearFecha(pubDate) : "";

  const audioUrl = item.querySelector("enclosure")?.getAttribute("url") || null;
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
          <audio controls style="background-color: var(--audio-background, #f1f3f4);" src="${audioUrl}"></audio>
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
    portada_podcast = imageUrl ? `<img src="${imageUrl}" alt="Podcast">` : "";
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
    return imageUrl ? `<img src="${imageUrl}" alt="${item.nombre}">` : "";

  }

  return imagen_select;
}

/******************************************
 * 
 * CREAR CONTENEDORES
 * 
 * ****************************************/
function crearContenedoresPodcasts(podcasts, listaDiv) {

  const contenedores = podcasts.flatMap(pod => {
    const n = pod.ncaps ?? 1;

    return Array.from({ length: n }, () => {
      const div = document.createElement("div");
      div.className = "podcast";
      listaDiv.appendChild(div);
      return div;
      });
    });

  return contenedores;
}

/******************************************
 * 
 * Descargar un RSS
 * 
 * ****************************************/
async function descargarFeedRss(url, antiCache=true){

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