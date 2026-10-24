
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