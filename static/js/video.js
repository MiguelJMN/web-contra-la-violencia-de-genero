// T08 — Vista de vídeo: iniciarVideo() y pararVideo().
//
// La T04 (pantalla.js) llama a iniciarVideo() al mostrar la vista de vídeo y
// pasa a la siguiente vista con el evento `ended` del <video id="video25n">.
//
// Diseño: el vídeo va en un marco de cristal (mismo estilo que el mural), sobre
// un fondo morado con un resplandor que toma los colores del propio vídeo, con
// una cabecera del 25N, el tiempo que falta y una barra de progreso.
// Todo se construye aquí alrededor del <video> de pantalla.html, y los estilos
// se inyectan una vez bajo #vista-video para no tocar estilos.css (T10).

(function () {
  'use strict';

  const video = document.getElementById('video25n');
  const vista = document.getElementById('vista-video');

  let ambiente = null;      // <canvas> del resplandor
  let pincel = null;
  let barra = null;         // relleno de la barra de progreso
  let tiempo = null;        // texto con el tiempo restante
  let marco = null;
  let bucle = 0;
  let ultimoAmbiente = 0;

  // --- API pública -----------------------------------------------------------

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
    animarEntrada();
    actualizarProgreso();
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
    actualizarProgreso();
  }

  window.iniciarVideo = iniciarVideo;
  window.pararVideo = pararVideo;

  // --- Reproducción ----------------------------------------------------------

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

  // --- Interfaz --------------------------------------------------------------

  function construir() {
    vista.classList.add('video-vista');

    ambiente = document.createElement('canvas');
    ambiente.className = 'video-ambiente';
    ambiente.width = 48;
    ambiente.height = 27;
    ambiente.setAttribute('aria-hidden', 'true');
    pincel = ambiente.getContext('2d');

    const cabecera = document.createElement('header');
    cabecera.className = 'video-cabecera';
    const insignia = document.createElement('span');
    insignia.className = 'video-insignia';
    insignia.textContent = '25N';
    const titulo = document.createElement('span');
    titulo.className = 'video-titulo';
    titulo.textContent = 'Día Internacional de la Eliminación de la Violencia contra la Mujer';
    tiempo = document.createElement('span');
    tiempo.className = 'video-tiempo';
    tiempo.setAttribute('aria-hidden', 'true');
    cabecera.append(insignia, titulo, tiempo);

    marco = document.createElement('div');
    marco.className = 'video-marco';
    const progreso = document.createElement('div');
    progreso.className = 'video-progreso';
    progreso.setAttribute('aria-hidden', 'true');
    barra = document.createElement('span');
    progreso.appendChild(barra);

    video.replaceWith(marco);   // el <video> sigue siendo el mismo elemento (id incluido)
    marco.append(video, progreso);
    vista.prepend(ambiente);
    vista.insertBefore(cabecera, marco);

    video.addEventListener('loadedmetadata', ajustarProporcion);
    video.addEventListener('timeupdate', actualizarTiempo);
    video.addEventListener('play', arrancarBucle);
    video.addEventListener('seeked', actualizarProgreso);
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) ajustarProporcion();
  }

  // El marco toma la proporción del vídeo: así no hay franjas y no se deforma.
  function ajustarProporcion() {
    if (video.videoWidth && video.videoHeight) {
      vista.style.setProperty('--proporcion', (video.videoWidth / video.videoHeight).toFixed(4));
    }
    actualizarTiempo();
  }

  function animarEntrada() {
    if (!marco || !marco.animate || reducirMovimiento()) return;
    marco.animate([
      { opacity: 0, transform: 'translateY(2vh) scale(.95)', filter: 'blur(10px)' },
      { opacity: 1, transform: 'none', filter: 'blur(0)' },
    ], { duration: 1100, easing: 'cubic-bezier(.2,.9,.3,1)' });
  }

  // Barra de progreso fluida (en cada fotograma) y resplandor de colores del vídeo.
  function arrancarBucle() {
    if (bucle) return;
    const paso = function (t) {
      if (video.paused || video.ended || vista.hidden) {
        bucle = 0;
        actualizarProgreso();
        return;
      }
      actualizarProgreso();
      if (t - ultimoAmbiente > 200) {   // 5 veces por segundo basta para el resplandor
        ultimoAmbiente = t;
        pintarAmbiente();
      }
      bucle = requestAnimationFrame(paso);
    };
    bucle = requestAnimationFrame(paso);
  }

  function actualizarProgreso() {
    if (!barra) return;
    const d = video.duration;
    const p = d > 0 && isFinite(d) ? Math.min(1, video.currentTime / d) : 0;
    barra.style.transform = 'scaleX(' + p.toFixed(5) + ')';
  }

  function actualizarTiempo() {
    if (!tiempo) return;
    const d = video.duration;
    if (!(d > 0) || !isFinite(d)) { tiempo.textContent = ''; return; }
    const queda = Math.max(0, Math.ceil(d - video.currentTime));
    tiempo.textContent = Math.floor(queda / 60) + ':' + String(queda % 60).padStart(2, '0');
  }

  function pintarAmbiente() {
    if (!pincel || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    try {
      pincel.drawImage(video, 0, 0, ambiente.width, ambiente.height);
    } catch (_) {
      pincel = null;   // vídeo de otro origen: nos quedamos sin resplandor
    }
  }

  function reducirMovimiento() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // --- Estilos ---------------------------------------------------------------

  function inyectarEstilos() {
    if (document.getElementById('video-estilos')) return;
    const estilo = document.createElement('style');
    estilo.id = 'video-estilos';
    estilo.textContent = CSS;
    document.head.appendChild(estilo);
  }

  const CSS = `
#vista-video.video-vista {
  --proporcion: 1.5333;
  --hueco: 4vh;
  position: fixed;
  inset: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  justify-items: start;   /* a la izquierda: el QR de la T10 (abajo a la derecha) no tapa el vídeo */
  align-items: center;
  gap: 2vh;
  padding: var(--hueco);
  overflow: hidden;
  isolation: isolate;
  font-family: "Poppins", "Segoe UI", system-ui, sans-serif;
  color: #fff;
  background: #13041f;
}
#vista-video.video-vista[hidden] { display: none !important; }

/* Fondo morado con manchas de color que se mueven despacio (sin filtros). */
#vista-video.video-vista::before {
  content: "";
  position: absolute;
  inset: -20%;
  z-index: -2;
  background:
    radial-gradient(32% 38% at 18% 20%, rgb(123 44 191 / .8), transparent 70%),
    radial-gradient(30% 36% at 84% 30%, rgb(193 53 132 / .5), transparent 70%),
    radial-gradient(38% 34% at 45% 92%, rgb(90 24 154 / .85), transparent 70%),
    radial-gradient(26% 30% at 12% 70%, rgb(60 9 108 / .9), transparent 70%);
  will-change: transform;
  animation: video-fondo 60s ease-in-out infinite alternate;
}
@keyframes video-fondo {
  0%   { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
  50%  { transform: translate3d(4%, 3%, 0) rotate(8deg) scale(1.06); }
  100% { transform: translate3d(-3%, -2%, 0) rotate(-6deg) scale(.97); }
}

/* Resplandor: el vídeo en miniatura, muy difuminado, detrás del marco. */
#vista-video .video-ambiente {
  position: absolute;
  left: 42%;
  top: 54%;
  z-index: -1;
  width: 80vw;
  height: 70vh;
  transform: translate(-50%, -50%);
  filter: blur(9vh) saturate(1.6);
  opacity: .55;
  pointer-events: none;
}

/* Cabecera: pastilla de cristal con el 25N, el lema y el tiempo restante. */
#vista-video .video-cabecera {
  justify-self: start;
  display: flex;
  align-items: center;
  gap: 1.6vh;
  max-width: 100%;
  padding: 1vh 2.2vh 1vh 1vh;
  border-radius: 999px;
  background: rgb(255 255 255 / .08);
  -webkit-backdrop-filter: blur(14px) saturate(170%);
  backdrop-filter: blur(14px) saturate(170%);
  border: 1px solid rgb(255 255 255 / .22);
  box-shadow: inset 0 1px 1px rgb(255 255 255 / .35), 0 1vh 3vh rgb(0 0 0 / .3);
  animation: video-aparecer .9s cubic-bezier(.2, .9, .3, 1) both;
}
#vista-video .video-insignia {
  display: grid;
  place-items: center;
  height: 5.4vh;
  padding: 0 1.8vh;
  border-radius: 999px;
  font-size: 2.6vh;
  font-weight: 700;
  letter-spacing: .04em;
  background: linear-gradient(135deg, #9d4edd, #6a1b9a);
  box-shadow: inset 0 1px 1px rgb(255 255 255 / .45), 0 0 2.5vh rgb(157 78 221 / .65);
}
#vista-video .video-titulo {
  font-size: clamp(1rem, 2.4vh, 2rem);
  font-weight: 600;
  line-height: 1.2;
  text-shadow: 0 1px 2px rgb(0 0 0 / .4);
}
#vista-video .video-tiempo {
  margin-left: .6vh;
  padding: .5vh 1.4vh;
  border-radius: 999px;
  font-size: 2.1vh;
  font-variant-numeric: tabular-nums;
  color: #e9d5ff;
  background: rgb(0 0 0 / .22);
}
#vista-video .video-tiempo:empty { display: none; }

/* Marco de cristal con la proporción del vídeo, lo más grande posible. */
#vista-video .video-marco {
  position: relative;
  aspect-ratio: var(--proporcion);
  width: min(100%, calc((100dvh - 2 * var(--hueco) - 10vh) * var(--proporcion)));
  padding: 1vh;
  border-radius: 3.2vh;
  background: linear-gradient(145deg, rgb(255 255 255 / .16), rgb(255 255 255 / .04));
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid rgb(255 255 255 / .28);
  box-shadow:
    inset 0 1.5px 1px rgb(255 255 255 / .55),
    inset 0 -1px 1px rgb(0 0 0 / .25),
    0 3vh 8vh -2vh rgb(0 0 0 / .6),
    0 0 10vh rgb(142 63 240 / .35);
  box-sizing: border-box;
}
/* Reflejo sobre el borde superior del cristal. */
#vista-video .video-marco::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(180deg, rgb(255 255 255 / .22), transparent 18%);
  pointer-events: none;
}
#vista-video #video25n {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;   /* pantalla completa sin deformar */
  border-radius: 2.4vh;
  background: #000;
  pointer-events: none;
}

/* Barra de progreso fina dentro del marco, con brillo. */
#vista-video .video-progreso {
  position: absolute;
  left: 3vh;
  right: 3vh;
  bottom: 2.2vh;
  height: .7vh;
  border-radius: 999px;
  overflow: hidden;
  background: rgb(255 255 255 / .18);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  box-shadow: 0 0 0 1px rgb(255 255 255 / .12);
}
#vista-video .video-progreso span {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  transform-origin: left center;
  transform: scaleX(0);
  background: linear-gradient(90deg, #c77dff, #ff4d9d);
  box-shadow: 0 0 1.4vh rgb(255 77 157 / .8);
  will-change: transform;
}

@keyframes video-aparecer {
  from { opacity: 0; transform: translateY(-1.5vh); }
  to   { opacity: 1; transform: none; }
}

@media (prefers-reduced-motion: reduce) {
  #vista-video.video-vista::before,
  #vista-video .video-cabecera { animation: none; }
}
`;

  // --- Arranque --------------------------------------------------------------

  if (video && vista) {
    prepararVideo();
    video.preload = 'auto';   // que esté cargado cuando llegue su turno
    inyectarEstilos();
    construir();
  }
})();
