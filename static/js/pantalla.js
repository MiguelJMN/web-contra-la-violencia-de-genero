// T04 — Rotación de vistas y actualización cada 10 s (fetch a /api/mural y /api/foro).
//
// - Alterna mural → vídeo → foro. Solo una vista visible a la vez.
// - La vista de vídeo avanza con el evento 'ended' del vídeo, no por tiempo.
// - Cada 10 s pide la API (URLs en <body data-api-mural / data-api-foro>) y llama a pintarMural (T07) y pintarForo (T09).
// - Si una petición falla, se queda lo último que se pintó: nunca pantalla en blanco.
// - Crea un botón de pantalla completa (o se puede usar F11).
//
// Para pruebas: /pantalla?seg=20  → cada vista con tiempo dura 20 s en vez de 5 min.
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
      el.hidden = !visible; // estilos.css ya tiene .vista[hidden] { display: none !important }
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
    if (!url) { console.warn('Falta la URL de la API en <body data-api-…>'); return; }
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
      actualizar(document.body.dataset.apiMural, d => { if (typeof pintarMural === 'function') pintarMural(d); }),
      actualizar(document.body.dataset.apiForo,  d => { if (typeof pintarForo  === 'function') pintarForo(d); }),
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
    boton.className = 'boton-pantalla-completa'; // estilo y ocultación en pantalla completa: T10
    boton.textContent = 'Pantalla completa (o pulsa F11)';

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

    document.body.append(boton);
  }

  // ---------- Arranque ----------
  crearBotonPantallaCompleta();
  siguiente();   // muestra la primera vista
  cicloDatos();  // primera carga de datos inmediata, luego cada 10 s
})();
