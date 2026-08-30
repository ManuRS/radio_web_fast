  // Referencia al slider de volumen
  const volumeSlider = document.getElementById('volume-slider');
  // Event listener para cambiar el volumen en tiempo real
  volumeSlider.addEventListener('input', (e) => {
    if (currentAudio) {
      currentAudio.volume = e.target.value;
    }
  });