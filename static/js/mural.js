// T07 — Mural de burbujas: pintarMural(mensajes).
// Texto SIEMPRE con textContent, nunca innerHTML.
//
// Uso:
//   pintarMural([{id: 1, texto: "..."}, ...])
//
// Cada mensaje puede traer, si se quiere, su propia personalización:
//   color   cualquier color CSS ("#ff4d9d", "teal", "rgb(0 128 255)"). Por defecto, morado 25N.
//   fuente  una de las claves de FUENTES ("moderna", "manuscrita", "elegante"...).
//   emoji   uno o varios emojis que se muestran grandes encima del texto.
// Los valores que no son válidos se ignoran y se usa el predeterminado.
//
// Opcional: configurarMural({color, fuente, maxBurbujas, velocidad}) cambia los
// valores por defecto de todo el mural.
//
// Datos de prueba: abre la pantalla con ?demo=mural para verlo sin la API.
//
// Los estilos del mural viven aquí (se inyectan una vez) para no tocar
// estilos.css, que es de la T10. Todos van bajo #vista-mural.

(function () {
  'use strict';

  // --- Configuración ---------------------------------------------------------

  const FUENTES = {
    moderna: '"Poppins", "Segoe UI", system-ui, sans-serif',
    redonda: '"Nunito", "Segoe UI", system-ui, sans-serif',
    elegante: '"Playfair Display", Georgia, "Times New Roman", serif',
    manuscrita: '"Caveat", "Segoe Print", "Bradley Hand", cursive',
    divertida: '"Pacifico", "Segoe Script", cursive',
    titular: '"Bebas Neue", Impact, "Arial Narrow", sans-serif',
    maquina: '"Space Mono", ui-monospace, Consolas, monospace',
  };

  const URL_FUENTES = 'https://fonts.googleapis.com/css2' +
    '?family=Bebas+Neue&family=Caveat:wght@600&family=Nunito:wght@700' +
    '&family=Pacifico&family=Playfair+Display:wght@600&family=Poppins:wght@600' +
    '&family=Space+Mono:wght@700&display=swap';

  const CONFIG = {
    maxBurbujas: 30,
    color: '#8e3ff0',     // morado 25N
    fuente: 'moderna',
    velocidad: 55,        // px por segundo
    ocupacion: 0.42,      // parte de la pantalla que cubren las burbujas
  };

  const MAX_TEXTO = 200;
  const ESCALA_ENCIMA = 1.14;
  const reducirMovimiento = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Estado ----------------------------------------------------------------

  const burbujas = new Map();   // id -> burbuja activa
  const salientes = new Set();  // burbujas que se están yendo
  let contenedor = null;
  let capa = null;
  let ancho = 0;
  let alto = 0;
  let ultimoTiempo = 0;
  let iniciado = false;

  // --- API pública -----------------------------------------------------------

  function pintarMural(mensajes) {
    if (!Array.isArray(mensajes)) return;   // datos raros: se deja lo que hay
    if (!iniciar()) return;

    const validos = [];
    const vistos = new Set();
    for (const m of mensajes) {
      const limpio = limpiarMensaje(m);
      if (!limpio || vistos.has(limpio.id)) continue;
      vistos.add(limpio.id);
      validos.push(limpio);
      if (validos.length >= CONFIG.maxBurbujas) break;   // la API manda los más recientes primero
    }

    // Fuera las que ya no están (ocultadas por moderación o desplazadas por nuevas).
    for (const [id, b] of burbujas) {
      if (!vistos.has(id)) quitarBurbuja(b);
    }

    let nuevas = 0;
    for (const m of validos) {
      const b = burbujas.get(m.id);
      if (!b) {
        crearBurbuja(m, nuevas++);
      } else if (b.firma !== firmaDe(m)) {
        rellenar(b, m);
      }
    }

    recalcularTamanos();
    for (const b of burbujas.values()) {
      if (b.porAjustar) ajustarTexto(b);
    }
  }

  function configurarMural(opciones) {
    if (!opciones || typeof opciones !== 'object') return;
    if (colorARgb(opciones.color)) CONFIG.color = opciones.color;
    if (FUENTES[opciones.fuente]) CONFIG.fuente = opciones.fuente;
    if (opciones.maxBurbujas > 0) CONFIG.maxBurbujas = Math.min(60, Math.floor(opciones.maxBurbujas));
    if (opciones.velocidad >= 0) CONFIG.velocidad = Math.min(400, Number(opciones.velocidad));
    for (const b of burbujas.values()) {
      rellenar(b, b.mensaje);
      ajustarTexto(b);
    }
  }

  window.pintarMural = pintarMural;
  window.configurarMural = configurarMural;
  window.MURAL_FUENTES = Object.keys(FUENTES);

  // --- Arranque --------------------------------------------------------------

  function iniciar() {
    if (iniciado) return true;
    contenedor = document.getElementById('vista-mural');
    if (!contenedor) return false;
    iniciado = true;

    inyectarEstilos();
    cargarFuentes();

    contenedor.classList.add('mural');
    const fondo = document.createElement('div');
    fondo.className = 'mural-fondo';
    fondo.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 5; i++) fondo.appendChild(document.createElement('span'));
    capa = document.createElement('div');
    capa.className = 'mural-capa';
    contenedor.append(fondo, capa);

    medir();
    if ('ResizeObserver' in window) {
      new ResizeObserver(medir).observe(contenedor);
    } else {
      window.addEventListener('resize', medir);
    }
    if (document.fonts) {
      document.fonts.ready.then(reajustarTodas);
      document.fonts.addEventListener('loadingdone', reajustarTodas);
    }

    requestAnimationFrame(paso);
    return true;
  }

  function medir() {
    const nuevoAncho = contenedor.clientWidth;
    const nuevoAlto = contenedor.clientHeight;
    const cambio = nuevoAncho !== ancho || nuevoAlto !== alto;
    ancho = nuevoAncho;
    alto = nuevoAlto;
    if (!ancho || !alto) return;   // vista oculta: se espera a que se muestre
    if (cambio) recalcularTamanos();
    for (const b of burbujas.values()) {
      if (!b.colocada) colocar(b);
      if (b.porAjustar) ajustarTexto(b);
      b.x = limitar(b.x, b.r, ancho - b.r);
      b.y = limitar(b.y, b.r, alto - b.r);
    }
  }

  // --- Datos -----------------------------------------------------------------

  function limpiarMensaje(m) {
    if (!m || typeof m !== 'object') return null;
    if (typeof m.id !== 'number' && typeof m.id !== 'string') return null;
    if (typeof m.texto !== 'string') return null;
    const texto = m.texto.trim().slice(0, MAX_TEXTO);
    if (!texto) return null;
    return {
      id: String(m.id),
      texto: texto,
      color: colorARgb(m.color) ? m.color.trim() : null,
      fuente: FUENTES[m.fuente] ? m.fuente : null,
      emoji: limpiarEmoji(m.emoji),
    };
  }

  // Solo emojis (hasta unos pocos); cualquier letra o número lo invalida.
  function limpiarEmoji(valor) {
    if (typeof valor !== 'string') return '';
    const e = valor.trim();
    if (!e || e.length > 24) return '';
    try {
      if (!/\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]/u.test(e)) return '';
      const resto = e.replace(/[\u{1F1E6}-\u{1F1FF}#*0-9️⃣]/gu, '');
      if (/[\p{L}\p{N}<>&]/u.test(resto)) return '';
    } catch (_) {
      return '';
    }
    return e;
  }

  function firmaDe(m) {
    return [m.texto, m.color, m.fuente, m.emoji].join('\u0000');
  }

  const lienzo = document.createElement('canvas').getContext('2d');

  // Devuelve [r, g, b] o null si no es un color CSS válido.
  function colorARgb(valor) {
    if (typeof valor !== 'string' || !lienzo) return null;
    const v = valor.trim();
    if (!v || v.length > 60) return null;
    lienzo.fillStyle = '#010203';
    lienzo.fillStyle = v;
    const res = lienzo.fillStyle;
    if (res === '#010203' && v.toLowerCase() !== '#010203') return null;
    if (res[0] === '#') {
      return [1, 3, 5].map(function (i) { return parseInt(res.slice(i, i + 2), 16); });
    }
    const nums = res.match(/[\d.]+/g);
    return nums ? nums.slice(0, 3).map(function (n) { return Math.round(Number(n)); }) : null;
  }

  function luminancia(rgb) {
    const c = rgb.map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  // --- Burbujas --------------------------------------------------------------

  function crearBurbuja(m, orden) {
    const el = document.createElement('div');
    el.className = 'burbuja';
    const escala = document.createElement('div');
    escala.className = 'burbuja-escala';
    const cuerpo = document.createElement('div');
    cuerpo.className = 'burbuja-cuerpo';
    const contenido = document.createElement('div');
    contenido.className = 'burbuja-contenido';
    const emoji = document.createElement('span');
    emoji.className = 'burbuja-emoji';
    emoji.setAttribute('aria-hidden', 'true');
    const texto = document.createElement('p');
    texto.className = 'burbuja-texto';

    contenido.append(emoji, texto);
    cuerpo.appendChild(contenido);
    escala.appendChild(cuerpo);
    el.appendChild(escala);

    const angulo = Math.random() * Math.PI * 2;
    const b = {
      id: m.id, mensaje: m, el: el, escala: escala, cuerpo: cuerpo,
      contenido: contenido, emojiEl: emoji, textoEl: texto,
      x: 0, y: 0, r: 0, rObjetivo: 0, peso: 1,
      factorVel: 0.7 + Math.random() * 0.6,
      vx: Math.cos(angulo), vy: Math.sin(angulo),
      fsRel: 0.2, encima: false, saliendo: false, colocada: false,
      porAjustar: true, nacida: performance.now(), ultimoChoque: 0, firma: '',
    };

    cuerpo.style.setProperty('--dur', (6 + Math.random() * 4).toFixed(2) + 's');
    cuerpo.style.setProperty('--retraso', (-Math.random() * 8).toFixed(2) + 's');
    escala.style.animationDelay = Math.min(orden * 70, 1400) + 'ms';

    el.addEventListener('pointerenter', function () { ponerEncima(b, true); });
    el.addEventListener('pointerleave', function () { ponerEncima(b, false); });
    el.addEventListener('pointermove', function (ev) { seguirPuntero(b, ev); });

    rellenar(b, m);
    burbujas.set(m.id, b);
    capa.appendChild(el);
    return b;
  }

  function rellenar(b, m) {
    b.mensaje = m;
    b.firma = firmaDe(m);
    b.textoEl.textContent = m.texto;          // nunca innerHTML
    b.emojiEl.textContent = m.emoji;
    b.emojiEl.hidden = !m.emoji;

    const rgb = colorARgb(m.color) || colorARgb(CONFIG.color) || [142, 63, 240];
    const oscuro = rgb.map(function (v) { return Math.round(v * 0.45); });
    const claro = rgb.map(function (v) { return Math.round(v + (255 - v) * 0.55); });
    const clara = luminancia(rgb) > 0.6;
    const s = b.el.style;
    s.setProperty('--rgb', rgb.join(' '));
    s.setProperty('--rgb-osc', oscuro.join(' '));
    s.setProperty('--rgb-claro', claro.join(' '));
    s.setProperty('--alfa', clara ? '0.62' : '0.3');
    s.setProperty('--fuente', FUENTES[m.fuente || CONFIG.fuente] || FUENTES.moderna);
    b.el.classList.toggle('burbuja-clara', clara);

    // Los mensajes largos y con emoji necesitan algo más de sitio.
    const largo = Math.min(m.texto.length, MAX_TEXTO) / MAX_TEXTO;
    b.peso = 0.8 + 0.6 * Math.sqrt(largo) + (m.emoji ? 0.08 : 0);
    b.porAjustar = true;
  }

  function quitarBurbuja(b) {
    if (b.saliendo) return;
    b.saliendo = true;
    b.encima = false;
    burbujas.delete(b.id);
    salientes.add(b);
    b.el.classList.add('saliendo');
    setTimeout(function () {
      b.el.remove();
      salientes.delete(b);
    }, 700);
  }

  // Radio base para que entre todo sin amontonarse, según cuántas burbujas hay.
  function recalcularTamanos() {
    if (!ancho || !alto) return;
    let suma = 0;
    for (const b of burbujas.values()) suma += b.peso * b.peso;
    if (!suma) return;
    const menor = Math.min(ancho, alto);
    const base = limitar(Math.sqrt(CONFIG.ocupacion * ancho * alto / (Math.PI * suma)),
      menor * 0.06, menor * 0.22);
    for (const b of burbujas.values()) {
      b.rObjetivo = Math.min(base * b.peso, menor * 0.3);
      if (!b.colocada) colocar(b);
    }
  }

  // Busca un hueco libre: de varios puntos al azar, el que más lejos queda del resto.
  function colocar(b) {
    if (!ancho || !alto || !b.rObjetivo) return;
    b.r = b.rObjetivo;
    let mejor = [ancho / 2, alto / 2];
    let mejorHolgura = -Infinity;
    for (let i = 0; i < 60; i++) {
      const x = b.r + Math.random() * Math.max(1, ancho - 2 * b.r);
      const y = b.r + Math.random() * Math.max(1, alto - 2 * b.r);
      let holgura = Infinity;
      for (const o of burbujas.values()) {
        if (o === b || !o.colocada) continue;
        holgura = Math.min(holgura, Math.hypot(o.x - x, o.y - y) - o.r - b.r);
      }
      if (holgura > mejorHolgura) {
        mejorHolgura = holgura;
        mejor = [x, y];
      }
      if (holgura > b.r * 0.5) break;
    }
    b.x = mejor[0];
    b.y = mejor[1];
    b.colocada = true;
    aplicarTamano(b);
    ajustarTexto(b);
    dibujar(b);
  }

  function aplicarTamano(b) {
    const d = (b.r * 2).toFixed(1) + 'px';
    b.el.style.width = d;
    b.el.style.height = d;
    b.el.style.setProperty('--fs', (b.fsRel * b.r).toFixed(2) + 'px');
  }

  // Elige el tamaño de letra más grande con el que el texto cabe en la burbuja.
  function ajustarTexto(b) {
    if (!ancho || !b.r) { b.porAjustar = true; return; }
    const largo = b.mensaje.texto.length + (b.mensaje.emoji ? 6 : 0);
    let fs = Math.max(10, Math.min(b.r * 0.32, 1.55 * b.r / Math.sqrt(largo + 2)));
    const c = b.contenido;
    const poner = function () { b.el.style.setProperty('--fs', fs.toFixed(2) + 'px'); };
    // Al centrar con flex, lo que desborda por arriba no cuenta en scrollHeight:
    // se mide la altura real del emoji y del texto.
    const noCabe = function () {
      const altoEmoji = b.emojiEl.hidden ? 0 : b.emojiEl.offsetHeight * 1.08;
      return b.textoEl.offsetHeight + altoEmoji > c.clientHeight + 1 ||
        b.textoEl.scrollWidth > c.clientWidth + 1;
    };
    poner();
    for (let i = 0; i < 20 && fs > 9 && noCabe(); i++) {
      fs *= 0.93;
      poner();
    }
    b.fsRel = fs / b.r;
    b.porAjustar = false;
  }

  function reajustarTodas() {
    for (const b of burbujas.values()) ajustarTexto(b);
  }

  // --- Ratón -----------------------------------------------------------------

  function ponerEncima(b, valor) {
    if (b.saliendo) return;
    b.encima = valor;
    b.el.classList.toggle('encima', valor);
    if (!valor) {
      b.cuerpo.style.removeProperty('--mx');
      b.cuerpo.style.removeProperty('--my');
      b.escala.style.removeProperty('--inclinar-x');
      b.escala.style.removeProperty('--inclinar-y');
    }
  }

  // El brillo sigue al puntero y la burbuja se inclina un poco hacia él.
  function seguirPuntero(b, ev) {
    if (!b.encima) return;
    const caja = b.el.getBoundingClientRect();
    const px = (ev.clientX - caja.left) / caja.width;
    const py = (ev.clientY - caja.top) / caja.height;
    b.cuerpo.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
    b.cuerpo.style.setProperty('--my', (py * 100).toFixed(1) + '%');
    b.escala.style.setProperty('--inclinar-x', ((0.5 - py) * 16).toFixed(2) + 'deg');
    b.escala.style.setProperty('--inclinar-y', ((px - 0.5) * 16).toFixed(2) + 'deg');
  }

  // --- Física: movimiento, rebotes con los bordes y entre burbujas -------------

  function paso(t) {
    requestAnimationFrame(paso);
    const dt = Math.min(0.05, Math.max(0, (t - ultimoTiempo) / 1000));
    ultimoTiempo = t;
    if (document.hidden || !ancho || !alto || !burbujas.size) return;

    const lista = [];
    for (const b of burbujas.values()) if (b.colocada) lista.push(b);
    const velocidad = CONFIG.velocidad * (reducirMovimiento ? 0.25 : 1);

    for (const b of lista) {
      // El radio se acerca poco a poco al objetivo (cuando entran o salen otras).
      if (Math.abs(b.rObjetivo - b.r) > 0.3) {
        b.r += (b.rObjetivo - b.r) * Math.min(1, dt * 3);
        aplicarTamano(b);
      }
      if (b.encima) continue;   // la que tiene el ratón encima se queda quieta

      // Mantiene una velocidad de crucero suave (ni se paran ni se disparan).
      const v = Math.hypot(b.vx, b.vy) || 1;
      const ajuste = (velocidad * b.factorVel - v) * Math.min(1, dt * 0.9);
      b.vx += (b.vx / v) * ajuste;
      b.vy += (b.vy / v) * ajuste;

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); choque(b, t); }
      else if (b.x > ancho - b.r) { b.x = ancho - b.r; b.vx = -Math.abs(b.vx); choque(b, t); }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); choque(b, t); }
      else if (b.y > alto - b.r) { b.y = alto - b.r; b.vy = -Math.abs(b.vy); choque(b, t); }
    }

    // Choques elásticos entre burbujas (la masa crece con el área).
    for (let i = 0; i < lista.length; i++) {
      const a = lista[i];
      const ra = a.r * (a.encima ? ESCALA_ENCIMA : 1);
      const ia = a.encima ? 0 : 1 / (a.r * a.r);
      for (let j = i + 1; j < lista.length; j++) {
        const c = lista[j];
        const rc = c.r * (c.encima ? ESCALA_ENCIMA : 1);
        let dx = c.x - a.x;
        let dy = c.y - a.y;
        let dist = Math.hypot(dx, dy);
        const minimo = ra + rc;
        if (dist >= minimo) continue;
        const ic = c.encima ? 0 : 1 / (c.r * c.r);
        if (ia + ic === 0) continue;
        if (dist < 0.001) {
          dx = Math.random() - 0.5;
          dy = Math.random() - 0.5;
          dist = Math.hypot(dx, dy);
        }
        const nx = dx / dist;
        const ny = dy / dist;

        // Se separan para que no se monten.
        const solape = minimo - dist;
        const pa = solape * ia / (ia + ic);
        const pc = solape * ic / (ia + ic);
        a.x -= nx * pa; a.y -= ny * pa;
        c.x += nx * pc; c.y += ny * pc;

        // Rebote elástico en la dirección del choque.
        const vrel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
        if (vrel < 0) {
          const imp = -2 * vrel / (ia + ic);
          a.vx -= imp * ia * nx; a.vy -= imp * ia * ny;
          c.vx += imp * ic * nx; c.vy += imp * ic * ny;
          if (-vrel > 12) { choque(a, t); choque(c, t); }
        }
      }
    }

    for (const b of lista) {
      if (!b.encima) {
        b.x = limitar(b.x, b.r, ancho - b.r);
        b.y = limitar(b.y, b.r, alto - b.r);
      }
      dibujar(b);
    }
  }

  // Pequeño efecto gelatina al chocar.
  function choque(b, t) {
    if (b.encima || reducirMovimiento || t - b.ultimoChoque < 450 || t - b.nacida < 1600) return;
    b.ultimoChoque = t;
    b.escala.classList.remove('choque');
    void b.escala.offsetWidth;   // reinicia la animación
    b.escala.classList.add('choque');
  }

  function dibujar(b) {
    b.el.style.transform = 'translate3d(' + (b.x - b.r).toFixed(2) + 'px,' +
      (b.y - b.r).toFixed(2) + 'px,0)';
  }

  function limitar(v, min, max) {
    return max < min ? (min + max) / 2 : Math.min(max, Math.max(min, v));
  }

  // --- Estilos ---------------------------------------------------------------

  function cargarFuentes() {
    if (document.getElementById('mural-fuentes')) return;
    const enlace = document.createElement('link');
    enlace.id = 'mural-fuentes';
    enlace.rel = 'stylesheet';
    enlace.href = URL_FUENTES;
    document.head.appendChild(enlace);
  }

  function inyectarEstilos() {
    if (document.getElementById('mural-estilos')) return;
    const estilo = document.createElement('style');
    estilo.id = 'mural-estilos';
    estilo.textContent = CSS;
    document.head.appendChild(estilo);
  }

  const CSS = `
#vista-mural.mural {
  position: relative;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  isolation: isolate;
  background:
    radial-gradient(120% 90% at 50% 110%, #3a0d63 0%, transparent 60%),
    radial-gradient(90% 70% at 0% 0%, #2a0848 0%, transparent 70%),
    #13041f;
}

/* Fondo: manchas de color que se mueven despacio y dan algo que refractar al cristal. */
#vista-mural .mural-fondo { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
#vista-mural .mural-fondo span {
  position: absolute;
  width: 46vmax; height: 46vmax;
  border-radius: 50%;
  filter: blur(70px);
  opacity: .55;
  animation: mural-orbe 34s ease-in-out infinite alternate;
}
#vista-mural .mural-fondo span:nth-child(1) { background: #7b2cbf; left: -10%; top: -15%; }
#vista-mural .mural-fondo span:nth-child(2) { background: #c13584; right: -12%; top: 10%; animation-duration: 41s; animation-delay: -12s; }
#vista-mural .mural-fondo span:nth-child(3) { background: #5a189a; left: 25%; bottom: -30%; animation-duration: 47s; animation-delay: -20s; }
#vista-mural .mural-fondo span:nth-child(4) { background: #e0aaff; width: 26vmax; height: 26vmax; left: 55%; top: 40%; opacity: .28; animation-duration: 38s; animation-delay: -5s; }
#vista-mural .mural-fondo span:nth-child(5) { background: #3c096c; width: 34vmax; height: 34vmax; left: 5%; top: 45%; animation-duration: 52s; animation-delay: -30s; }

@keyframes mural-orbe {
  0%   { transform: translate(0, 0) scale(1); }
  50%  { transform: translate(8vw, 6vh) scale(1.15); }
  100% { transform: translate(-6vw, -4vh) scale(.92); }
}

#vista-mural .mural-capa { position: absolute; inset: 0; z-index: 1; }

/* Capa 1: posición (la mueve el JS). */
#vista-mural .burbuja {
  position: absolute;
  left: 0; top: 0;
  will-change: transform;
  z-index: 1;
  -webkit-tap-highlight-color: transparent;
}
#vista-mural .burbuja.encima { z-index: 10; }

/* Capa 2: entrada, salida, rebote y efecto al pasar el ratón. */
#vista-mural .burbuja-escala {
  width: 100%; height: 100%;
  transform: perspective(700px) rotateX(var(--inclinar-x, 0deg)) rotateY(var(--inclinar-y, 0deg)) scale(1);
  transition: transform .7s cubic-bezier(.17, 1.45, .35, 1);
  animation: burbuja-entrar 1.1s cubic-bezier(.2, 1.5, .4, 1) backwards;
}
#vista-mural .burbuja.encima .burbuja-escala {
  transform: perspective(700px) rotateX(var(--inclinar-x, 0deg)) rotateY(var(--inclinar-y, 0deg)) scale(${ESCALA_ENCIMA});
  transition: transform .5s cubic-bezier(.17, 1.45, .35, 1);
}
#vista-mural .burbuja-escala.choque { animation: burbuja-choque .55s cubic-bezier(.3, 1.6, .5, 1); }
#vista-mural .burbuja.saliendo { pointer-events: none; }
#vista-mural .burbuja.saliendo .burbuja-escala { animation: burbuja-salir .65s cubic-bezier(.5, -0.4, .7, .4) forwards; }

@keyframes burbuja-entrar {
  0%   { scale: 0; opacity: 0; filter: blur(8px); }
  60%  { opacity: 1; filter: blur(0); }
  100% { scale: 1; opacity: 1; filter: none; }
}
@keyframes burbuja-salir {
  0%   { scale: 1; opacity: 1; }
  30%  { scale: 1.12; opacity: 1; }
  100% { scale: 0; opacity: 0; filter: blur(6px); }
}
@keyframes burbuja-choque {
  0%   { scale: 1 1; }
  30%  { scale: 1.07 .93; }
  55%  { scale: .96 1.04; }
  80%  { scale: 1.02 .98; }
  100% { scale: 1 1; }
}

/* Capa 3: el cristal líquido, con su flotación suave. */
#vista-mural .burbuja-cuerpo {
  position: relative;
  width: 100%; height: 100%;
  border-radius: 50%;
  display: grid;
  place-items: center;
  overflow: hidden;
  background:
    radial-gradient(70% 70% at var(--mx, 30%) var(--my, 22%), rgb(255 255 255 / .30), transparent 55%),
    radial-gradient(90% 60% at 50% 115%, rgb(var(--rgb-claro) / .45), transparent 70%),
    rgb(var(--rgb) / var(--alfa, .3));
  -webkit-backdrop-filter: blur(16px) saturate(190%) brightness(1.1);
  backdrop-filter: blur(16px) saturate(190%) brightness(1.1);
  border: 1px solid rgb(255 255 255 / .32);
  box-shadow:
    inset 0 1.5px 1px rgb(255 255 255 / .65),
    inset 12px 16px 26px -14px rgb(255 255 255 / .6),
    inset -14px -18px 32px -12px rgb(var(--rgb-osc) / .7),
    inset 0 0 22px rgb(var(--rgb-claro) / .25),
    0 22px 45px -18px rgb(var(--rgb) / .75),
    0 6px 16px rgb(0 0 0 / .28);
  animation: burbuja-flotar var(--dur, 7s) ease-in-out var(--retraso, 0s) infinite alternate;
  transition: box-shadow .5s ease, background .5s ease, border-color .5s ease;
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  #vista-mural .burbuja-cuerpo { background-color: rgb(var(--rgb) / .75); }
}

/* Brillo especular arriba a la izquierda. */
#vista-mural .burbuja-cuerpo::before {
  content: "";
  position: absolute;
  left: 14%; top: 7%;
  width: 46%; height: 26%;
  border-radius: 50%;
  background: linear-gradient(180deg, rgb(255 255 255 / .75), rgb(255 255 255 / 0));
  filter: blur(2px);
  transform: rotate(-18deg);
  opacity: .8;
  pointer-events: none;
  transition: opacity .5s, transform .6s cubic-bezier(.2, 1.4, .4, 1);
}

/* Borde iridiscente que gira (más vivo al pasar el ratón). */
#vista-mural .burbuja-cuerpo::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  padding: 2px;
  background: conic-gradient(from 0deg,
    rgb(255 255 255 / .9), rgb(var(--rgb-claro) / .2), rgb(255 160 230 / .7),
    rgb(var(--rgb) / .1), rgb(160 220 255 / .7), rgb(255 255 255 / .9));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
  opacity: .45;
  animation: burbuja-girar 14s linear infinite;
  pointer-events: none;
  transition: opacity .5s;
}

#vista-mural .burbuja.encima .burbuja-cuerpo {
  border-color: rgb(255 255 255 / .6);
  box-shadow:
    inset 0 2px 1px rgb(255 255 255 / .85),
    inset 14px 18px 30px -12px rgb(255 255 255 / .75),
    inset -14px -18px 32px -12px rgb(var(--rgb-osc) / .6),
    inset 0 0 34px rgb(var(--rgb-claro) / .45),
    0 0 0 6px rgb(var(--rgb-claro) / .12),
    0 0 60px rgb(var(--rgb) / .65),
    0 30px 60px -20px rgb(var(--rgb) / .9);
  animation-play-state: paused;
}
#vista-mural .burbuja.encima .burbuja-cuerpo::before { opacity: 1; transform: rotate(-18deg) translate(4%, -6%) scale(1.08); }
#vista-mural .burbuja.encima .burbuja-cuerpo::after { opacity: 1; animation-duration: 3.5s; }

@keyframes burbuja-flotar {
  0%   { transform: translateY(-5px) scale(1, 1);        border-radius: 50% 50% 50% 50% / 50% 50% 50% 50%; }
  50%  { transform: translateY(4px)  scale(1.018, .982); border-radius: 52% 48% 51% 49% / 48% 52% 49% 51%; }
  100% { transform: translateY(-2px) scale(.988, 1.012); border-radius: 49% 51% 48% 52% / 51% 49% 52% 48%; }
}
@keyframes burbuja-girar { to { transform: rotate(1turn); } }

/* Contenido: emoji y texto, grandes y legibles a distancia. */
#vista-mural .burbuja-contenido {
  position: relative;
  z-index: 2;
  width: 72%;
  height: 66%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: .12em;
  overflow: hidden;
  text-align: center;
  color: #fff;
  font-family: var(--fuente);
  font-size: var(--fs, 24px);
}
#vista-mural .burbuja-emoji {
  font-size: 1.7em;
  line-height: 1.05;
  font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
  filter: drop-shadow(0 4px 8px rgb(0 0 0 / .3));
  transition: transform .6s cubic-bezier(.2, 1.6, .4, 1);
}
#vista-mural .burbuja.encima .burbuja-emoji { transform: scale(1.15) rotate(-6deg); }
#vista-mural .burbuja-texto {
  margin: 0;
  line-height: 1.16;
  font-weight: 600;
  overflow-wrap: anywhere;
  hyphens: auto;
  text-wrap: balance;
  text-shadow: 0 1px 2px rgb(0 0 0 / .4), 0 0 20px rgb(var(--rgb-osc) / .55);
}
#vista-mural .burbuja-clara .burbuja-contenido { color: #1c0a2e; }
#vista-mural .burbuja-clara .burbuja-texto { text-shadow: 0 1px 1px rgb(255 255 255 / .5); }

@media (prefers-reduced-motion: reduce) {
  #vista-mural .mural-fondo span,
  #vista-mural .burbuja-cuerpo,
  #vista-mural .burbuja-cuerpo::after { animation: none; }
}
`;

  // --- Datos de prueba (hasta que esté la API) ---------------------------------

  const MENSAJES_PRUEBA = [
    { id: 1, texto: 'Ni una menos', emoji: '💜' },
    { id: 2, texto: 'Vivas, libres y sin miedo', fuente: 'titular' },
    { id: 3, texto: 'Si nos tocan a una, nos tocan a todas', color: '#c13584', emoji: '✊' },
    { id: 4, texto: '<b>hola</b>' },
    { id: 5, texto: 'Te creo', fuente: 'manuscrita', emoji: '🤝' },
    { id: 6, texto: 'El silencio no nos protege', color: '#2ec4b6', fuente: 'elegante' },
    { id: 7, texto: 'Juntas somos más fuertes', emoji: '🌸', fuente: 'redonda' },
    { id: 8, texto: 'Llama al 016', color: '#ffd166', emoji: '📞', fuente: 'titular' },
    { id: 9, texto: 'No es amor si duele', fuente: 'divertida' },
    { id: 10, texto: 'Educar en igualdad es prevenir la violencia de género desde la infancia' },
    { id: 11, texto: 'Mi cuerpo, mi decisión', color: '#e63946', emoji: '🔥' },
    { id: 12, texto: 'Hermana, yo sí te creo', emoji: '💜💜', fuente: 'manuscrita' },
    { id: 13, texto: 'Por las que ya no están', color: '#5a189a', emoji: '🕯️' },
    { id: 14, texto: 'Basta ya', fuente: 'titular', color: '#ff4d9d' },
    { id: 15, texto: 'La igualdad se construye cada día, en casa, en clase y en la calle', fuente: 'redonda' },
    { id: 16, texto: 'Ni sumisas ni devotas: libres', fuente: 'divertida', emoji: '🦋' },
    { id: 17, texto: 'Nunca estás sola', color: '#4cc9f0', emoji: '🫂' },
    { id: 18, texto: 'No es no', fuente: 'maquina', emoji: '🚫' },
    { id: 19, texto: 'Que el miedo cambie de bando', fuente: 'elegante', color: '#9d4edd' },
    { id: 20, texto: 'Libres', emoji: '🕊️' },
    { id: 21, texto: 'Pide ayuda, hay salida', color: '#06d6a0', fuente: 'redonda' },
    { id: 22, texto: 'Rompe el silencio', emoji: '📢', fuente: 'titular' },
    { id: 23, texto: 'Respeto', color: '#f72585', fuente: 'manuscrita' },
    { id: 24, texto: 'Ninguna agresión sin respuesta', emoji: '🛡️' },
    { id: 25, texto: 'Queremos llegar a casa tranquilas', fuente: 'elegante' },
    { id: 26, texto: 'El machismo mata', color: '#b5179e', fuente: 'titular' },
    { id: 27, texto: 'Sororidad', emoji: '✨', fuente: 'divertida', color: '#c77dff' },
    { id: 28, texto: 'Ni golpes que duelan ni palabras que hieran' },
    { id: 29, texto: 'Aquí también se lucha', emoji: '🏫', color: '#7209b7' },
    { id: 30, texto: 'Ojalá un mundo donde este mural no haga falta', fuente: 'manuscrita', emoji: '🌍' },
  ];
  window.MURAL_PRUEBA = MENSAJES_PRUEBA;

  if (/[?&]demo=mural\b/.test(window.location.search)) {
    const arrancarDemo = function () { pintarMural(MENSAJES_PRUEBA.slice().reverse()); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', arrancarDemo);
    } else {
      arrancarDemo();
    }
  }
})();
