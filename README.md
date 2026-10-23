# radio_web_fast

Reproductor de radio *vibecodeado* con...

- Una lista actualizada de emisiones de radio en directo, que incluye enlaces oficiales a las principales emisoras españolas (más de 10 cadenas generalistas y más de 15 emisoras musicales)

- Una página que reproduce una emisión musical (o permanece en silencio) con conexión automática durante el día (de 8 a 20) a los boletines de la Cadena SER

- Siete listas de podcast: Algunas son simples visores de un feed xml, otras son selecciones curadas para mi uso personal

- Visor del RSS oficial de la portada de El País: Las mismas noticias de la web de inicio del periódico, pero sin distintos pesos visuales y con sus títulos completos (no los usados en la portada)

- Mapa de emisoras de la SER: No se garantiza que la información sea correcta o este 100% actualizada

### Puntos de instalación como Aplicación Web Progresiva (PWA)

- Radio en directo (la más recomendable): https://manurs.github.io/radio_web_fast/live

- Aplicación completa (adaptada a mi uso personal): https://manurs.github.io/radio_web_fast

- Modo sencillo (solo un botón con la SER): https://manurs.github.io/radio_web_fast/live_ser

## Hitos

- Programado en septiembre de 2025, utilizando las versiones gratuitas de Gemini y ChatGPT a través de la web (sin emplear paradigmas estilo Claude Code / OpenAI Codex). Se utilizaron únicamente *prompts* contra los modelos de lenguaje y sus respuestas en formato de texto (sin que los modelos tuvieran acceso a entornos ni capacidad de ejecutar comandos)

- Abril y mayo de 2026: mejora profunda de los permisos de audio en segundo plano, automatización de la reproducción de noticias cada hora y optimización del comportamiento como Aplicación Web Progresiva (PWA) que puede ser instalada en un teléfono móvil. Todo sin modificar la arquitectura general

### Problemas

- Código repetido: Inicialmente este proyecto no estaba pensado para ser alojado en un servidor; el objetivo era crear un arhivo HTML guardado en la memoria del dispositivo. Como resultado, gran parte del código se repite en muchas de las páginas. Esto supone un problema a la hora de realizar cambios, ya que es necesario aplicarlos en múltiples archivos

- Sin grandes protecciones contra las conexiones inestables o intermitentes (por ejemplo, no gestiona reconexiones y apenas compensa el *delay* en la reproducción)

### Estado del proyecto

- Base de código madura y que funciona correctamente para mis casos de uso
- Sería necesario refactorizar el código si se desea ampliar significativamente su funcionalidad

### Aportaciones

- Abierto a solicitudes para añadir streams de emisoras. Mensajes a través de LinkedIn o mediante Issues / Pull Request de GitHub
- Normas: se añaden streams oficiales y siempre intentando usar los enlaces canónicos pre-balanceo de servidores

## Libre de rastreos

- El código no incluye cookies ni ningún otro tipo de rastreo. Solo se comunica con los servidores de emisión de audio y con los feeds de podcast
- La web descarga una sola vez 6MB que se guardan como cache del sitio. Son las imágenes que se usan en el menú y para seleccionar emisoras
- Los anuncios al escuchar están siempre controlados y añadidos por la empresa que envía el correspondiente stream de audio o el podcast
