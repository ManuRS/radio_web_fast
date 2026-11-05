# radio_web_fast

Reproductor de radio *vibecodeado* con...

- Una lista actualizada de emisiones de radio en directo, que incluye enlaces oficiales a las principales emisoras españolas (más de 10 cadenas generalistas y más de 15 emisoras musicales)

- Una página que reproduce una emisión musical (o permanece en silencio) con conexión automática durante el día (de 8 a 20) a los boletines de la Cadena SER

- Siete listas de podcast: Algunas son simples visores de un feed xml, otras son selecciones curadas para mi uso personal

- Visor del RSS oficial de la portada de El País: Las mismas noticias de la web de inicio del periódico, pero sin distintos pesos visuales y con sus títulos completos (no los usados en la portada)

- Mapa de emisoras de la SER: No se garantiza que la información sea correcta o este 100% actualizada

### Puntos de instalación como Aplicación Web Progresiva (PWA)

- [Radio en directo](https://manurs.github.io/radio_web_fast/live/) es la versión más recomendable para escuchar en directo el catálogo de emisoras disponible

- [La aplicación completa](https://manurs.github.io/radio_web_fast/) está adaptada a mi uso personal con las listas de podcast, el visor de El País y el mapa de la SER

- [Modo sencillo](https://manurs.github.io/radio_web_fast/live_ser/) proporciona un solo botón con el directo de la SER. Fue el germen de esta aplicación: acercar la radio a quien no puede manejar aplicaciones repletas de anuncios y menús pero tampoco radios convencionales

## Hitos

- Septiembre de 2025: Desarrollo de la primera versión utilizando las opciones gratuitas de Gemini y ChatGPT a través de la web (sin emplear paradigmas estilo Claude Code / OpenAI Codex). Se utilizaron únicamente *prompts* contra los modelos de lenguaje y sus respuestas en formato de texto, sin que los modelos tuvieran acceso a entornos ni capacidad de ejecutar comandos.

- Abril y mayo de 2026: Mejora profunda de los permisos de audio en segundo plano, automatización de la reproducción de noticias cada hora y optimización del comportamiento como Aplicación Web Progresiva (PWA) que puede ser instalada en un teléfono móvil. Todo sin modificar la arquitectura general.

- Octubre de 2026 (Fase 1): Refactorización del código, modo oscuro y librería de audio. Inicialmente el proyecto no estaba pensado para ser alojado en un servidor; el objetivo era crear un archivo HTML guardado en el dispositivo. Creció poco a poco y gran parte del código se repetía en muchas de las páginas. La refactorización se realizó con mis ideas y esfuerzo, con la conversación con ChatGPT como ayudante y tester de los cambios. Es mi último gran homenaje a la programación tradicional. Migración con la librería de audio a un modelo algo más desatendido de desarrollo.

- Octubre de 2026 (Fase 2): Migración completa a un desarrollo desatendido usando Claude (Sonnet 5.5 en esfuerzo alto) para mejorar aún más la librería de audio, creando una aplicación aún más profesional y que cuenta con reconexión automática al recuperar una conexión a internet perdida. Mejoró también la gestión de las notificaciones en Android (no probado en iOS), el cálculo del *delay* de emisión online y el aspecto visual.

## Libre de rastreos

- El código no incluye cookies ni ningún otro tipo de rastreo. Solo se comunica: 1) Con los servidores de emisión de audio 2) Con los feeds de podcast 3) Con time.now en la página de conexión automática a los boletos de la SER 4) Con el feed RSS de El País en la página correspondiente 5) Con las librerías de visualización de mapas en la página de las emisoras de la SER

- La radio en directo usa HLS.js cuando es necesario. Es una librería de código abierto y el estándar de la industria para reproducir HLS, un formato desarrollado por Apple que usan los medios que ofrecen mejor calidad y latencia en su stream. No está soportado por defecto por los navegadores. No se descarga siempre, la versión utilizada se almacena en la cache del sitio.

- Mapa versión original: utiliza la librería Leaflet y su hoja de estilos así como las teselas de OpenStreetMap.

- Mapa versión actual: utiliza Leaflet (librería y estilos), MapLibre (librería y estilos), el puente maplibre-gl-leaflet para unir ambas librerías así como las teselas positron y dark de OpenFreeMap.

- La web descarga en la primera apertura unos ~8MB que se guardan como cache del sitio. Incluye el código propio para funcionar (HTML, CSS y JavaScript), la librería externa HLS.js, los sonidos de transición y las imágenes que se usan en el menú y para seleccionar emisoras en el reproductor en directo.

- Los anuncios al escuchar un audio están siempre controlados y añadidos por la empresa que envía el correspondiente stream de audio o el podcast
