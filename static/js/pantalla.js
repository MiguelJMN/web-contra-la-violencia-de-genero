
(() => {
  'use strict';

  // ---------- Configuración ----------
  const CONFIG = {
    secuencia: ['mural', 'video', 'foro'],
    duracion: { mural: 5 * 60_000, foro: 5 * 60_000 }, // ms por vista (no aplica al vídeo)
    duracionPorDefecto: 5 * 60_000,
    refresco: 10_000,         // cada cuánto se piden los datos
    tiempoMaxPeticion: 8_000, // si la API no responde en este tiempo, se cancela
    videoArranque: 15_000,    // si el vídeo no ha empezado en este tiempo, se salta
    videoMaximo: 15 * 60_000, // tope de seguridad por si nunca llega 'ended'
  };

  const seg = Number(new URLSearchParams(location.search).get('seg'));
  if (seg > 0) {
    CONFIG.duracionPorDefecto = seg * 1000;
    CONFIG.duracion = { mural: seg * 1000, foro: seg * 1000 };
  }

  // ---------- Rotación de vistas ----------
  const video = document.getElementById('video25n');
  let indice = -1;
  let vistaActual = null;
  let temporizador = null;
  let guardia = null;

  function limpiarTemporizadores() {
    clearTimeout(temporizador);
    clearTimeout(guardia);
    temporizador = guardia = null;
  }

  function siguiente() {
    indice = (indice + 1) % CONFIG.secuencia.length;
    mostrarVista(CONFIG.secuencia[indice]);
  }

  function mostrarVista(nombre) {
    limpiarTemporizadores();
    if (vistaActual === 'video') detenerVideo();

    for (const n of CONFIG.secuencia) {
      const el = document.getElementById('vista-' + n);
      if (!el) continue;
      const visible = (n === nombre);
      el.hidden = !visible;
      // Por si estilos.css da display a .vista (eso anularía el atributo hidden)
      el.style.display = visible ? '' : 'none';
    }
    vistaActual = nombre;

    if (nombre === 'video') {
      arrancarVideo();
    } else {
      temporizador = setTimeout(siguiente, CONFIG.duracion[nombre] ?? CONFIG.duracionPorDefecto);
    }
  }

  // ---------- Vídeo ----------
  function arrancarVideo() {
    // Sin vídeo, o el archivo ya falló al cargar (p. ej. falta video.mp4): saltar ya
    if (!video || video.error || video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
      console.warn('Vídeo no disponible; paso a la siguiente vista.');
      setTimeout(siguiente, 0);
      return;
    }

    try {
      if (typeof iniciarVideo === 'function') {
        iniciarVideo(); // T08
      } else {
        video.currentTime = 0;
        video.play().catch(() => { if (vistaActual === 'video') siguiente(); });
      }
    } catch (e) {
      console.error('Error al iniciar el vídeo:', e);
      setTimeout(siguiente, 0);
      return;
    }

    // Si no arranca (autoplay bloqueado, falta video.mp4…), no nos quedamos atascados
    guardia = setTimeout(() => {
      if (vistaActual !== 'video') return;
      if (video.paused && video.currentTime === 0) {
        console.warn('El vídeo no arrancó; paso a la siguiente vista.');
        siguiente();
      } else {
        guardia = setTimeout(() => { if (vistaActual === 'video') siguiente(); }, CONFIG.videoMaximo);
      }
    }, CONFIG.videoArranque);
  }

  function detenerVideo() {
    try {
      if (typeof pararVideo === 'function') pararVideo(); // T08
      else if (video) video.pause();
    } catch (e) {
      console.error('Error al parar el vídeo:', e);
    }
  }

  if (video) {
    video.addEventListener('ended', () => { if (vistaActual === 'video') siguiente(); });
    video.addEventListener('error', () => { if (vistaActual === 'video') siguiente(); });
  }

  // ---------- Actualización de datos ----------
  async function actualizar(url, pintar) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), CONFIG.tiempoMaxPeticion);
    try {
      const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const datos = await res.json();
      if (!Array.isArray(datos)) throw new Error('formato inesperado');
      pintar(datos);
    } catch (e) {
      // Sin red, error del servidor o 401: no tocamos nada, se queda lo último pintado
      console.warn(`No se pudo actualizar ${url}:`, e.message);
    } finally {
      clearTimeout(t);
    }
  }

  async function cicloDatos() {
    await Promise.all([
      actualizar('/api/mural', d => { if (typeof pintarMural === 'function') pintarMural(d); }),
      actualizar('/api/foro',  d => { if (typeof pintarForo  === 'function') pintarForo(d); }),
    ]);
    // Se programa al terminar: si la red va lenta, las peticiones no se acumulan
    setTimeout(cicloDatos, CONFIG.refresco);
  }

  // ---------- Pantalla completa ----------
  // El botón se crea desde aquí para no tocar el esqueleto común de pantalla.html.
  function crearBotonPantallaCompleta() {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.id = 'btn-pantalla-completa';
    boton.textContent = 'Pantalla completa (o pulsa F11)';
    Object.assign(boton.style, {
      position: 'fixed', top: '1rem', left: '1rem', zIndex: '1000',
      padding: '.6rem 1rem', fontSize: '1rem', cursor: 'pointer',
    });

    boton.addEventListener('click', () => {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => { boton.textContent = 'Pulsa F11 para pantalla completa'; });
      } else {
        boton.textContent = 'Pulsa F11 para pantalla completa';
      }
      // Si el navegador había bloqueado el vídeo, el clic permite reintentarlo
      if (vistaActual === 'video' && video && video.paused) video.play().catch(() => {});
    });

    // En pantalla completa el botón desaparece; al salir, vuelve
    document.addEventListener('fullscreenchange', () => {
      boton.hidden = Boolean(document.fullscreenElement);
    });

    document.body.append(boton);
  }

  // ---------- Arranque ----------
  crearBotonPantallaCompleta();
  siguiente();   // muestra la primera vista
  cicloDatos();  // primera carga de datos inmediata, luego cada 10 s
})();
