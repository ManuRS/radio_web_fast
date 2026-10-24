
async function cargarRSS_nlast(feedUrl_arg, numElems_arg) {
  try {
    const res = await fetch(feedUrl_arg);
    const texto = await res.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(texto, "application/xml");

    const items = Array.from(xml.querySelectorAll("item")).slice(0, numElems_arg);

    const imageUrl = xml.querySelector("image > url")?.textContent || null;
    const htmlImagen = imageUrl ? `<img src="${imageUrl}" alt="Podcast">` : "";

    const listaDiv = document.getElementById("lista");

    items.forEach(item => {
      const titulo = item.querySelector("title")?.textContent || "Sin título";
      const pubDate = item.querySelector("pubDate")?.textContent || null;
      const audioUrl = item.querySelector("enclosure")?.getAttribute("url") || null;

      const contenedor = document.createElement("div");
      contenedor.className = "podcast";

      if (audioUrl) {
        contenedor.innerHTML = `
          <div class="podcast-contenido">
            ${htmlImagen}
            <div class="podcast-texto">
              <p class="titulo-principal">${titulo}</p>
              <br>
              <audio controls style="background-color: var(--audio-background, #f1f3f4);" src="${audioUrl}"></audio>
              <div class="controles">
                <div class="botones-reproduccion">
                <button onclick="
                    let a=this.closest('.podcast-texto').querySelector('audio');
                    if(a.paused){ a.play(); this.textContent='🔴 Pausa'; }
                    else { a.pause(); this.textContent='🟢 Play'; }
                ">🟢 Play</button>
              <button onclick="let a=this.closest('.podcast-texto').querySelector('audio'); a.currentTime = Math.max(0,a.currentTime-10)">⏪ -10s</button>
              <button onclick="let a=this.closest('.podcast-texto').querySelector('audio'); a.currentTime = Math.min(a.duration,a.currentTime+10)">⏩ +10s</button>
              <button onclick="let a=this.closest('.podcast-texto').querySelector('audio'); a.playbackRate=a.playbackRate===1?2:1;this.textContent=a.playbackRate===2?'⏩ x1':'⏩ x2'">⏩ x2</button>
              </div>
              </div>
            </div>
          </div>
          <br>
        `;
      } else {
        contenedor.innerHTML = `<p class="titulo-principal">${titulo} (No se encontró audio)</p>`;
      }

      listaDiv.appendChild(contenedor);
    });

  } catch(e) {
    console.error("Error cargando RSS:", e);
  }
}
