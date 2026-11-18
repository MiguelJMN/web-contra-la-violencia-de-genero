// T08 — Vista de vídeo: iniciarVideo() y pararVideo().
//
// La T04 (pantalla.js) llama a iniciarVideo() al mostrar la vista de vídeo y
// pasa a la siguiente vista con el evento `ended` del <video id="video25n">.
//
// Los estilos de la vista viven aquí (se inyectan una vez) para no tocar
// estilos.css, que es de la T10. Todos van bajo #vista-video.

(function () {
  'use strict';

  const video = document.getElementById('video25n');

  // Vuelve al segundo 0 y reproduce sin sonido. Devuelve la promesa de play()
  // (nunca lanza): si el navegador no deja reproducir, se reintenta una vez
  // cuando el vídeo esté listo; si tampoco, la T04 salta la vista.
  function iniciarVideo() {
    if (!video) return Promise.resolve(false);
    prepararVideo();
    try {
      video.currentTime = 0;
    } catch (_) {
      // Sin metadatos aún: empezará en 0 de todas formas.
    }
    return reproducir().then(function (ok) {
      if (ok || video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return ok;
      return new Promise(function (resolver) {
        video.addEventListener('canplay', function () {
          reproducir().then(resolver);
        }, { once: true });
      });
    });
  }

  // Para el vídeo y lo deja en el principio para la próxima vez.
  function pararVideo() {
    if (!video) return;
    video.pause();
    try {
      video.currentTime = 0;
    } catch (_) {
      // Nada que rebobinar.
    }
  }

  function reproducir() {
    video.muted = true;   // sin sonido: los navegadores permiten el autoplay así
    const promesa = video.play();
    if (!promesa || typeof promesa.then !== 'function') return Promise.resolve(!video.paused);
    return promesa.then(
      function () { return true; },
      function (error) {
        console.warn('No se pudo reproducir el vídeo:', error && error.name);
        return false;
      }
    );
  }

  function prepararVideo() {
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.controls = false;
    video.loop = false;   // `ended` tiene que llegar para pasar de vista
    video.disablePictureInPicture = true;
  }

  function inyectarEstilos() {
    if (document.getElementById('video-estilos')) return;
    const estilo = document.createElement('style');
    estilo.id = 'video-estilos';
    estilo.textContent = `
#vista-video {
  position: relative;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: #000;
}
#vista-video #video25n {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;   /* pantalla completa sin deformar: franjas negras si hace falta */
  background: #000;
  pointer-events: none;
}
`;
    document.head.appendChild(estilo);
  }

  if (video) {
    prepararVideo();
    video.preload = 'auto';   // que esté cargado cuando llegue su turno
    inyectarEstilos();
  }

  window.iniciarVideo = iniciarVideo;
  window.pararVideo = pararVideo;
})();
