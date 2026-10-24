
/******************************************
 * 
 * CARGAR ULTIMOS N AUDIOS DE UN FEED
 * 
 * ****************************************/
async function cargaRSS_nlast(feedUrl_arg, numElems_arg, visual_arg, imagen_capitulo=true) {
  try {

    // Conseguir datos y extraer las N primeras entradas
    const feed = await descargarFeedRss(feedUrl_arg);
    const items = Array.from(feed.items).slice(0, numElems_arg);

    // Conseguir la imagen del podcast
    const imageUrl = feed.imageUrl;
    htmlImagen = imageUrl ? `<img src="${imageUrl}" alt="Podcast">` : "";

    // Crear cascaron HTML
    const listaDiv = document.getElementById("lista");
    const contenedores = crearContenedoresPodcasts(items, listaDiv);

    // Rellenar cada contenedor con su audio
    items.forEach((item, index) => construirUnCapitulo(item, contenedores[index], visual_arg, null, imagen_capitulo) );

  } catch(e) {
    console.error("Error cargando RSS:", e);
  }
}

/******************************************
 * 
 * CARGAR AUDIOS POR NOMBRE DE CAPITULOS
 * 
 * ****************************************/
async function cargarRSS_bycaps(podcasts, titulo_antiguedad, imagen_capitulo=true) {

  // Crear cascaron HTML
  const listaDiv = document.getElementById("lista");
  const contenedores = crearContenedoresPodcasts(podcasts, listaDiv);

  /* Para cada podcasts, se llama a la funcion (se envía el podcast, su nombre, su capitulo y su contenedor)*/
  podcasts.forEach( (pod, index) => cargarRSS_onecap(pod.url, pod.nombre, pod.capitulo, contenedores[index], titulo_antiguedad, imagen_capitulo) );

}

/* Esta es la que busca 1 capitulo en 1 podcast*/
async function cargarRSS_onecap(feedUrl_arg, name_arg, capitulo_arg, contenedor_arg, visual_arg, imagen_capitulo) {
  try {
    // Conseguir datos
    const feed = await descargarFeedRss(feedUrl_arg);
    const items = feed.items;

    // Conseguir la imagen del podcast
    const imageUrl = feed.imageUrl;
    htmlImagen = imageUrl ? `<img src="${imageUrl}" alt="Podcast">` : "";

    // Recorremos cada elemento del feed
    for (const item of items) {

      // Obtener el título de este elemento
      const titulo = item.querySelector("title")?.textContent || "";

      // Buscamos si es un episodio de los que queremos
      if (capitulo_arg.some(c => titulo.includes(c))) {

        // Han cantado Bingo!
        construirUnCapitulo(item, contenedor_arg, visual_arg, personalizado=name_arg, imagen_capitulo);
        break;
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
function construirUnCapitulo(item, contenedor, visual, personalizado, imagen_capitulo){

  const titulo = item.querySelector("title")?.textContent || "Sin título";

  const pubDate = item.querySelector("pubDate")?.textContent || null;
  const antiguedad = pubDate ? tiempoDesde(pubDate) : "";
  const fecha = pubDate ? formatearFecha(pubDate) : "";

  const audioUrl = item.querySelector("enclosure")?.getAttribute("url") || null;
  if (imagen_capitulo) { defineImagenCapitulo(item); };

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
        ${htmlImagen}
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
function defineImagenCapitulo(item) {
  imageUrlElement = item.getElementsByTagName('itunes:image')[0];
  imageUrl = imageUrlElement ? imageUrlElement.getAttribute('href') : null;
  htmlImagen = imageUrl ? `<img src="${imageUrl}" alt="${item.nombre}">` : "";
}

/******************************************
 * 
 * CREAR CONTENEDORES
 * 
 * ****************************************/
function crearContenedoresPodcasts(podcasts, listaDiv) {

  const contenedores = podcasts.map(() => {
    const div = document.createElement("div");
    div.className = "podcast";
    listaDiv.appendChild(div);
    return div;
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
