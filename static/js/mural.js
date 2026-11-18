// T07 — Mural de burbujas: pintarMural(mensajes).
// Texto SIEMPRE con textContent, nunca innerHTML.
//
// Uso:
//   pintarMural([{id: 1, texto: "..."}, ...])
//
// Cada mensaje puede traer, si se quiere, su propia personalización:
//   color   cualquier color CSS ("#ff4d9d", "teal", "rgb(0 128 255)"). Por defecto, morado 25N.
//   fuente  una de las claves de FUENTES ("moderna", "manuscrita", "elegante"...).
//   forma   una de las claves de FORMAS ("circulo", "corazon", "estrella"...).
//   emoji   uno o varios emojis que se muestran grandes encima del texto.
// Los valores que no son válidos se ignoran y se usa el predeterminado.
//
// Opcional: configurarMural({color, fuente, forma, maxBurbujas, velocidad}) cambia
// los valores por defecto de todo el mural.
//
// Datos de prueba: abre la pantalla con ?demo=mural para verlo sin la API.
//
// Los estilos del mural viven aquí (se inyectan una vez) para no tocar
// estilos.css, que es de la T10. Todos van bajo #vista-mural.
//
// Rendimiento: en cada fotograma solo cambia `transform` (lo mueve la tarjeta
// gráfica, sin recalcular la página). El tamaño real de cada burbuja solo se
// toca cuando cambia el número de burbujas.

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

  // Formas en coordenadas de 0 a 1 (se estiran a la caja de la burbuja).
  // El círculo no necesita trazado: es la burbuja clásica con border-radius.
  const FORMAS = {
    circulo: null,
    corazon: 'M0.5,0.95 C0.38,0.86 0.03,0.64 0.03,0.34 C0.03,0.16 0.16,0.04 0.31,0.04 ' +
      'C0.41,0.04 0.47,0.1 0.5,0.18 C0.53,0.1 0.59,0.04 0.69,0.04 C0.84,0.04 0.97,0.16 ' +
      '0.97,0.34 C0.97,0.64 0.62,0.86 0.5,0.95 Z',
    estrella: poligonoRedondeado(puntosEstrella(5, 0.5, 0.53, 0.49, 0.6), 0.32),
    // Cinco pétalos redondos (|cos| deja una muesca entre pétalo y pétalo).
    flor: trazadoPolar(function (a) { return 0.5 * (0.8 + 0.2 * Math.abs(Math.cos(2.5 * (a + Math.PI / 2)))); }),
    hexagono: poligonoRedondeado(puntosEstrella(3, 0.5, 0.5, 0.5, 1), 0.2),
    cuadrada: trazadoPolar(function (a) {
      // "Squircle": cuadrado de esquinas suaves, como los iconos de Apple.
      const c = Math.abs(Math.cos(a));
      const s = Math.abs(Math.sin(a));
      return 0.5 / Math.pow(Math.pow(c, 5) + Math.pow(s, 5), 1 / 5);
    }),
  };

  const CONFIG = {
    maxBurbujas: 30,
    color: '#8e3ff0',     // morado 25N
    fuente: 'moderna',
    forma: 'circulo',
    velocidad: 60,        // px por segundo
    ocupacion: 0.38,      // parte de la pantalla que cubren las burbujas
  };

  const MAX_TEXTO = 200;
  const SUBPASOS = 3;     // la física se calcula varias veces por fotograma: choques más suaves
  const reducirMovimiento = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Estado ----------------------------------------------------------------

  const burbujas = new Map();   // id -> burbuja activa
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
  }

  function configurarMural(opciones) {
    if (!opciones || typeof opciones !== 'object') return;
    if (colorARgb(opciones.color)) CONFIG.color = opciones.color;
    if (FUENTES[opciones.fuente]) CONFIG.fuente = opciones.fuente;
    if (Object.prototype.hasOwnProperty.call(FORMAS, opciones.forma)) CONFIG.forma = opciones.forma;
    if (opciones.maxBurbujas > 0) CONFIG.maxBurbujas = Math.min(60, Math.floor(opciones.maxBurbujas));
    if (opciones.velocidad >= 0) CONFIG.velocidad = Math.min(400, Number(opciones.velocidad));
    for (const b of burbujas.values()) rellenar(b, b.mensaje);
    recalcularTamanos();
  }

  window.pintarMural = pintarMural;
  window.configurarMural = configurarMural;
  window.MURAL_FUENTES = Object.keys(FUENTES);
  window.MURAL_FORMAS = Object.keys(FORMAS);

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
    capa = document.createElement('div');
    capa.className = 'mural-capa';
    contenedor.append(fondo, crearDefinicionesSvg(), capa);

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
      forma: Object.prototype.hasOwnProperty.call(FORMAS, m.forma) ? m.forma : null,
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
    return [m.texto, m.color, m.fuente, m.forma, m.emoji].join('\u0000');
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

  // --- Formas ----------------------------------------------------------------

  function puntosEstrella(puntas, cx, cy, radio, proporcionInterior) {
    const pts = [];
    const n = puntas * 2;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + i * Math.PI / puntas;
      const r = i % 2 ? radio * proporcionInterior : radio;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return pts;
  }

  // Polígono con las esquinas redondeadas con curvas (t = cuánto se redondea).
  function poligonoRedondeado(pts, t) {
    const n = pts.length;
    const p = function (v) { return v[0].toFixed(4) + ',' + v[1].toFixed(4); };
    const hacia = function (a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; };
    let d = '';
    for (let i = 0; i < n; i++) {
      const ant = pts[(i - 1 + n) % n];
      const act = pts[i];
      const sig = pts[(i + 1) % n];
      const entrada = hacia(act, ant, t);
      const salida = hacia(act, sig, t);
      d += (i ? ' L' : 'M') + p(entrada) + ' Q' + p(act) + ' ' + p(salida);
    }
    return d + ' Z';
  }

  function trazadoPolar(radio) {
    let d = '';
    for (let i = 0; i < 144; i++) {
      const a = i / 144 * Math.PI * 2;
      const r = radio(a);
      d += (i ? ' L' : 'M') + (0.5 + r * Math.cos(a)).toFixed(4) + ',' + (0.5 + r * Math.sin(a)).toFixed(4);
    }
    return d + ' Z';
  }

  const SVG = 'http://www.w3.org/2000/svg';

  function nodoSvg(nombre, atributos, hijos) {
    const n = document.createElementNS(SVG, nombre);
    for (const k in atributos) n.setAttribute(k, atributos[k]);
    (hijos || []).forEach(function (h) { n.appendChild(h); });
    return n;
  }

  // Recortes de cada forma y degradados del cristal, compartidos por todas las burbujas.
  function crearDefinicionesSvg() {
    const defs = nodoSvg('defs', {});
    for (const nombre in FORMAS) {
      if (!FORMAS[nombre]) continue;
      defs.appendChild(nodoSvg('clipPath', { id: 'mural-clip-' + nombre, clipPathUnits: 'objectBoundingBox' },
        [nodoSvg('path', { d: FORMAS[nombre] })]));
    }
    const parada = function (o, c, a) { return nodoSvg('stop', { offset: o, 'stop-color': c, 'stop-opacity': a }); };
    defs.appendChild(nodoSvg('radialGradient', { id: 'mural-brillo', cx: '0.32', cy: '0.2', r: '0.55' }, [
      parada('0', '#fff', '.42'), parada('.55', '#fff', '.06'), parada('1', '#fff', '0'),
    ]));
    defs.appendChild(nodoSvg('linearGradient', { id: 'mural-volumen', x1: '0', y1: '0', x2: '1', y2: '1' }, [
      parada('0', '#fff', '.85'), parada('.4', '#fff', '0'), parada('.6', '#000', '0'), parada('1', '#000', '.5'),
    ]));
    defs.appendChild(nodoSvg('linearGradient', { id: 'mural-iris', x1: '0', y1: '0', x2: '1', y2: '1' }, [
      parada('0', '#fff', '.95'), parada('.3', '#ffa0e6', '.7'), parada('.55', '#fff', '.15'),
      parada('.8', '#a0dcff', '.75'), parada('1', '#fff', '.9'),
    ]));
    defs.appendChild(nodoSvg('filter', { id: 'mural-difuminar', x: '-20%', y: '-20%', width: '140%', height: '140%' }, [
      nodoSvg('feGaussianBlur', { stdDeviation: '0.03' }),
    ]));
    const svg = nodoSvg('svg', { class: 'mural-defs', width: '0', height: '0', 'aria-hidden': 'true' }, [defs]);
    return svg;
  }

  // Capas de cristal dibujadas con el contorno de la forma (para las que no son círculo).
  function crearCristalSvg(d) {
    const comun = { d: d, fill: 'none', 'vector-effect': 'non-scaling-stroke' };
    return nodoSvg('svg', { class: 'burbuja-svg', viewBox: '0 0 1 1', preserveAspectRatio: 'none', 'aria-hidden': 'true' }, [
      nodoSvg('path', { d: d, fill: 'url(#mural-brillo)' }),
      nodoSvg('path', Object.assign({ class: 'burbuja-volumen', stroke: 'url(#mural-volumen)', filter: 'url(#mural-difuminar)' }, comun)),
      nodoSvg('path', Object.assign({ stroke: 'url(#mural-iris)', 'stroke-width': '4', opacity: '.7' }, comun)),
      nodoSvg('path', Object.assign({ stroke: 'rgba(255,255,255,.6)', 'stroke-width': '1.5' }, comun)),
    ]);
  }

  // --- Burbujas --------------------------------------------------------------

  function crearBurbuja(m, orden) {
    const el = document.createElement('div');
    el.className = 'burbuja';
    const escala = document.createElement('div');
    escala.className = 'burbuja-escala';
    const sombra = document.createElement('div');
    sombra.className = 'burbuja-sombra';
    sombra.setAttribute('aria-hidden', 'true');
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
    escala.append(sombra, cuerpo);
    el.appendChild(escala);

    const angulo = Math.random() * Math.PI * 2;
    const b = {
      id: m.id, mensaje: m, el: el, escala: escala, cuerpo: cuerpo, svg: null,
      contenido: contenido, emojiEl: emoji, textoEl: texto,
      x: 0, y: 0, r: 0, rObjetivo: 0, rDom: 0, peso: 1, forma: null,
      factorVel: 0.75 + Math.random() * 0.5,
      giro: (Math.random() - 0.5) * 0.4,
      vx: Math.cos(angulo), vy: Math.sin(angulo),
      saliendo: false, colocada: false, porAjustar: true,
      nacida: performance.now(), ultimoChoque: 0, firma: '',
    };

    escala.style.setProperty('--dur', (5 + Math.random() * 4).toFixed(2) + 's');
    escala.style.setProperty('--retraso-flotar', (-Math.random() * 9).toFixed(2) + 's');
    escala.style.setProperty('--retraso', Math.min(orden * 70, 1400) + 'ms');

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
    s.setProperty('--alfa', clara ? '0.62' : '0.32');
    s.setProperty('--fuente', FUENTES[m.fuente || CONFIG.fuente] || FUENTES.moderna);
    b.el.classList.toggle('burbuja-clara', clara);

    const forma = m.forma || CONFIG.forma;
    if (forma !== b.forma) {
      b.forma = forma;
      b.el.dataset.forma = forma;
      if (b.svg) { b.svg.remove(); b.svg = null; }
      if (FORMAS[forma]) {
        b.svg = crearCristalSvg(FORMAS[forma]);
        b.cuerpo.insertBefore(b.svg, b.contenido);
      }
    }

    // Los mensajes largos y con emoji necesitan algo más de sitio; la estrella también.
    const largo = Math.min(m.texto.length, MAX_TEXTO) / MAX_TEXTO;
    b.peso = (0.8 + 0.6 * Math.sqrt(largo) + (m.emoji ? 0.08 : 0)) * (forma === 'estrella' ? 1.12 : 1);
    b.porAjustar = true;
  }

  function quitarBurbuja(b) {
    if (b.saliendo) return;
    b.saliendo = true;
    burbujas.delete(b.id);
    b.el.classList.add('saliendo');
    setTimeout(function () { b.el.remove(); }, 700);
  }

  // Radio base para que entre todo sin amontonarse, según cuántas burbujas hay.
  function recalcularTamanos() {
    if (!ancho || !alto) return;
    let suma = 0;
    for (const b of burbujas.values()) suma += b.peso * b.peso;
    if (!suma) return;
    const menor = Math.min(ancho, alto);
    const base = limitar(Math.sqrt(CONFIG.ocupacion * ancho * alto / (Math.PI * suma)),
      menor * 0.06, menor * 0.21);
    for (const b of burbujas.values()) {
      b.rObjetivo = Math.min(base * b.peso, menor * 0.28);
      if (!b.colocada) colocar(b);
      // El tamaño real del elemento solo cambia aquí; la transición la hace `scale`.
      if (Math.abs(b.rDom - b.rObjetivo) > 0.5) fijarTamano(b, b.rObjetivo);
      if (b.porAjustar) ajustarTexto(b);
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
    dibujar(b);
  }

  function fijarTamano(b, r) {
    b.rDom = r;
    const d = (r * 2).toFixed(1) + 'px';
    b.el.style.width = d;
    b.el.style.height = d;
    if (b.svg) b.svg.querySelector('.burbuja-volumen').setAttribute('stroke-width', (r * 0.32).toFixed(1));
    b.porAjustar = true;
  }

  // Elige el tamaño de letra más grande con el que el texto cabe en la burbuja.
  function ajustarTexto(b) {
    if (!ancho || !b.rDom) { b.porAjustar = true; return; }
    const r = b.rDom;
    const largo = b.mensaje.texto.length + (b.mensaje.emoji ? 6 : 0);
    let fs = Math.max(10, Math.min(r * 0.32, 1.55 * r / Math.sqrt(largo + 2)));
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
    b.porAjustar = false;
  }

  function reajustarTodas() {
    for (const b of burbujas.values()) ajustarTexto(b);
  }

  // --- Física: movimiento, rebotes con los bordes y entre burbujas -------------

  function paso(t) {
    requestAnimationFrame(paso);
    const dt = Math.min(0.04, Math.max(0, (t - ultimoTiempo) / 1000));
    ultimoTiempo = t;
    if (document.hidden || !ancho || !alto || !burbujas.size || !dt) return;

    const lista = [];
    for (const b of burbujas.values()) if (b.colocada) lista.push(b);
    const velocidad = CONFIG.velocidad * (reducirMovimiento ? 0.25 : 1);
    const h = dt / SUBPASOS;

    for (const b of lista) {
      // El radio se acerca suavemente al objetivo (cuando entran o salen otras).
      b.r += (b.rObjetivo - b.r) * Math.min(1, dt * 2.5);

      // Deriva: la dirección gira despacio para que la trayectoria sea curva y orgánica.
      b.giro += (Math.random() - 0.5) * dt * 0.6;
      b.giro = limitar(b.giro, -0.35, 0.35);
      const g = b.giro * dt;
      const cos = Math.cos(g);
      const sin = Math.sin(g);
      const vx = b.vx * cos - b.vy * sin;
      b.vy = b.vx * sin + b.vy * cos;
      b.vx = vx;

      // Velocidad de crucero: tras un choque vuelve poco a poco a su ritmo.
      const v = Math.hypot(b.vx, b.vy) || 1;
      const ajuste = (velocidad * b.factorVel - v) * Math.min(1, dt * 0.7);
      b.vx += (b.vx / v) * ajuste;
      b.vy += (b.vy / v) * ajuste;
    }

    for (let s = 0; s < SUBPASOS; s++) {
      for (const b of lista) {
        b.x += b.vx * h;
        b.y += b.vy * h;
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); choque(b, t, 1, 0); }
        else if (b.x > ancho - b.r) { b.x = ancho - b.r; b.vx = -Math.abs(b.vx); choque(b, t, 1, 0); }
        if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); choque(b, t, 0, 1); }
        else if (b.y > alto - b.r) { b.y = alto - b.r; b.vy = -Math.abs(b.vy); choque(b, t, 0, 1); }
      }
      chocarEntreSi(lista, t);
    }

    for (const b of lista) dibujar(b);
  }

  // Choques elásticos entre burbujas (la masa crece con el área).
  function chocarEntreSi(lista, t) {
    for (let i = 0; i < lista.length; i++) {
      const a = lista[i];
      const ia = 1 / (a.r * a.r);
      for (let j = i + 1; j < lista.length; j++) {
        const c = lista[j];
        let dx = c.x - a.x;
        let dy = c.y - a.y;
        const minimo = a.r + c.r;
        if (Math.abs(dx) >= minimo || Math.abs(dy) >= minimo) continue;
        let dist = Math.hypot(dx, dy);
        if (dist >= minimo) continue;
        const ic = 1 / (c.r * c.r);
        if (dist < 0.001) {
          dx = Math.random() - 0.5;
          dy = Math.random() - 0.5;
          dist = Math.hypot(dx, dy);
        }
        const nx = dx / dist;
        const ny = dy / dist;

        // Se separan con suavidad (solo una parte del solape por subpaso: sin tirones).
        const solape = (minimo - dist) * 0.5;
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
          if (-vrel > 15) { choque(a, t, nx, ny); choque(c, t, nx, ny); }
        }
      }
    }
  }

  // Efecto gelatina al chocar: se aplasta en la dirección del golpe.
  // Se hace con la Web Animations API, que no obliga a recalcular la página.
  function choque(b, t, nx, ny) {
    if (b.saliendo || reducirMovimiento || t - b.ultimoChoque < 500 || t - b.nacida < 1800) return;
    if (!b.escala.animate) return;
    b.ultimoChoque = t;
    const horizontal = Math.abs(nx) > Math.abs(ny);
    const aplastar = horizontal ? '0.92 1.07' : '1.07 0.92';
    const rebotar = horizontal ? '1.04 0.97' : '0.97 1.04';
    b.escala.animate([
      { scale: '1 1' }, { scale: aplastar, offset: 0.28 }, { scale: rebotar, offset: 0.6 }, { scale: '1 1' },
    ], { duration: 650, easing: 'cubic-bezier(.25,.8,.35,1)' });
  }

  function dibujar(b) {
    const k = b.rDom ? b.r / b.rDom : 1;
    b.el.style.transform = 'translate3d(' + (b.x - b.rDom).toFixed(2) + 'px,' +
      (b.y - b.rDom).toFixed(2) + 'px,0) scale(' + k.toFixed(4) + ')';
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
  background: #13041f;
}

/* Fondo: manchas de color con degradados (sin filtros: no cuesta nada moverlas). */
#vista-mural .mural-fondo {
  position: absolute;
  inset: -20%;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(32% 38% at 18% 20%, rgb(123 44 191 / .85), transparent 70%),
    radial-gradient(30% 36% at 84% 30%, rgb(193 53 132 / .6), transparent 70%),
    radial-gradient(38% 34% at 45% 92%, rgb(90 24 154 / .85), transparent 70%),
    radial-gradient(18% 22% at 68% 62%, rgb(224 170 255 / .28), transparent 70%),
    radial-gradient(26% 30% at 12% 70%, rgb(60 9 108 / .9), transparent 70%);
  will-change: transform;
  animation: mural-fondo 60s ease-in-out infinite alternate;
}
@keyframes mural-fondo {
  0%   { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
  50%  { transform: translate3d(4%, 3%, 0) rotate(8deg) scale(1.06); }
  100% { transform: translate3d(-3%, -2%, 0) rotate(-6deg) scale(.97); }
}

#vista-mural .mural-defs { position: absolute; width: 0; height: 0; overflow: hidden; }
#vista-mural .mural-capa { position: absolute; inset: 0; z-index: 1; pointer-events: none; }

/* Capa 1: posición y tamaño (los mueve el JS solo con transform). */
#vista-mural .burbuja {
  position: absolute;
  left: 0; top: 0;
  will-change: transform;
  transform-origin: 50% 50%;
}

/* Capa 2: entrada, salida, flotación suave y efecto gelatina. */
#vista-mural .burbuja-escala {
  position: relative;
  width: 100%; height: 100%;
  animation:
    burbuja-entrar 1.1s cubic-bezier(.2, 1.5, .4, 1) var(--retraso, 0s) backwards,
    burbuja-flotar var(--dur, 7s) ease-in-out var(--retraso-flotar, 0s) infinite alternate;
}
#vista-mural .burbuja.saliendo .burbuja-escala {
  animation: burbuja-salir .65s cubic-bezier(.5, -0.4, .7, .4) forwards;
}

@keyframes burbuja-entrar {
  0%   { scale: 0; opacity: 0; }
  60%  { opacity: 1; }
  100% { scale: 1; opacity: 1; }
}
@keyframes burbuja-salir {
  0%   { scale: 1; opacity: 1; }
  30%  { scale: 1.12; opacity: 1; }
  100% { scale: 0; opacity: 0; }
}
@keyframes burbuja-flotar {
  0%   { translate: 0 -5px; rotate: -1.5deg; }
  50%  { translate: 3px 4px; rotate: 1deg; }
  100% { translate: -2px -1px; rotate: -.5deg; }
}

/* Capa 3: el cristal líquido. */
#vista-mural .burbuja-cuerpo {
  position: relative;
  width: 100%; height: 100%;
  border-radius: 50%;
  display: grid;
  place-items: center;
  overflow: hidden;
  background:
    radial-gradient(70% 70% at 30% 22%, rgb(255 255 255 / .30), transparent 55%),
    radial-gradient(90% 60% at 50% 115%, rgb(var(--rgb-claro) / .45), transparent 70%),
    rgb(var(--rgb) / var(--alfa, .32));
  -webkit-backdrop-filter: blur(10px) saturate(180%) brightness(1.1);
  backdrop-filter: blur(10px) saturate(180%) brightness(1.1);
  border: 1px solid rgb(255 255 255 / .32);
  box-shadow:
    inset 0 1.5px 1px rgb(255 255 255 / .65),
    inset 12px 16px 26px -14px rgb(255 255 255 / .6),
    inset -14px -18px 32px -12px rgb(var(--rgb-osc) / .7),
    inset 0 0 22px rgb(var(--rgb-claro) / .25),
    0 22px 45px -18px rgb(var(--rgb) / .75),
    0 6px 16px rgb(0 0 0 / .28);
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
  transform: rotate(-18deg);
  opacity: .8;
  pointer-events: none;
}

/* Borde iridiscente del círculo, girando despacio. */
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
  opacity: .5;
  animation: burbuja-girar 14s linear infinite;
  pointer-events: none;
}
@keyframes burbuja-girar { to { transform: rotate(1turn); } }

/* Sombra exterior de las formas (el recorte se comería un box-shadow). */
#vista-mural .burbuja-sombra { display: none; }

/* --- Formas distintas del círculo: el cristal se recorta con su contorno --- */
#vista-mural .burbuja:not([data-forma="circulo"]) .burbuja-cuerpo {
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
#vista-mural .burbuja:not([data-forma="circulo"]) .burbuja-cuerpo::after { display: none; }
#vista-mural .burbuja:not([data-forma="circulo"]) .burbuja-sombra {
  display: block;
  position: absolute;
  inset: 6% 4% -4%;
  border-radius: 50%;
  background: radial-gradient(closest-side, rgb(var(--rgb) / .55), rgb(var(--rgb) / .2) 60%, transparent);
}
#vista-mural .burbuja-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}
#vista-mural [data-forma="corazon"]  .burbuja-cuerpo { clip-path: url(#mural-clip-corazon); }
#vista-mural [data-forma="estrella"] .burbuja-cuerpo { clip-path: url(#mural-clip-estrella); }
#vista-mural [data-forma="flor"]     .burbuja-cuerpo { clip-path: url(#mural-clip-flor); }
#vista-mural [data-forma="hexagono"] .burbuja-cuerpo { clip-path: url(#mural-clip-hexagono); }
#vista-mural [data-forma="cuadrada"] .burbuja-cuerpo { clip-path: url(#mural-clip-cuadrada); }

#vista-mural [data-forma="corazon"] .burbuja-cuerpo::before { left: 12%; top: 11%; width: 30%; height: 16%; transform: rotate(-30deg); }
#vista-mural [data-forma="estrella"] .burbuja-cuerpo::before { left: 36%; top: 14%; width: 22%; height: 16%; transform: rotate(-10deg); }
#vista-mural [data-forma="cuadrada"] .burbuja-cuerpo::before { left: 10%; top: 6%; width: 50%; height: 20%; transform: rotate(-8deg); }

/* Zona del texto según la forma. */
#vista-mural [data-forma="corazon"]  .burbuja-contenido { width: 62%; height: 46%; top: -5%; }
#vista-mural [data-forma="estrella"] .burbuja-contenido { width: 42%; height: 36%; top: 4%; }
#vista-mural [data-forma="flor"]     .burbuja-contenido { width: 56%; height: 50%; }
#vista-mural [data-forma="hexagono"] .burbuja-contenido { width: 68%; height: 58%; }
#vista-mural [data-forma="cuadrada"] .burbuja-contenido { width: 78%; height: 72%; }

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
}
#vista-mural .burbuja-texto {
  margin: 0;
  line-height: 1.16;
  font-weight: 600;
  overflow-wrap: anywhere;
  hyphens: auto;
  text-wrap: balance;
  text-shadow: 0 1px 2px rgb(0 0 0 / .4), 0 0 18px rgb(var(--rgb-osc) / .55);
}
#vista-mural .burbuja-clara .burbuja-contenido { color: #1c0a2e; }
#vista-mural .burbuja-clara .burbuja-texto { text-shadow: 0 1px 1px rgb(255 255 255 / .5); }

@media (prefers-reduced-motion: reduce) {
  #vista-mural .mural-fondo,
  #vista-mural .burbuja-escala,
  #vista-mural .burbuja-cuerpo::after { animation: none; }
}
`;

  // --- Datos de prueba (hasta que esté la API) ---------------------------------

  const MENSAJES_PRUEBA = [
    { id: 1, texto: 'Ni una menos', emoji: '💜', forma: 'corazon' },
    { id: 2, texto: 'Vivas, libres y sin miedo', fuente: 'titular' },
    { id: 3, texto: 'Si nos tocan a una, nos tocan a todas', color: '#c13584', emoji: '✊' },
    { id: 4, texto: '<b>hola</b>' },
    { id: 5, texto: 'Te creo', fuente: 'manuscrita', emoji: '🤝', forma: 'flor' },
    { id: 6, texto: 'El silencio no nos protege', color: '#2ec4b6', fuente: 'elegante', forma: 'cuadrada' },
    { id: 7, texto: 'Juntas somos más fuertes', emoji: '🌸', fuente: 'redonda', forma: 'flor' },
    { id: 8, texto: 'Llama al 016', color: '#ffd166', emoji: '📞', fuente: 'titular', forma: 'estrella' },
    { id: 9, texto: 'No es amor si duele', fuente: 'divertida', forma: 'corazon', color: '#e63946' },
    { id: 10, texto: 'Educar en igualdad es prevenir la violencia de género desde la infancia' },
    { id: 11, texto: 'Mi cuerpo, mi decisión', color: '#e63946', emoji: '🔥' },
    { id: 12, texto: 'Hermana, yo sí te creo', emoji: '💜💜', fuente: 'manuscrita', forma: 'corazon' },
    { id: 13, texto: 'Por las que ya no están', color: '#5a189a', emoji: '🕯️' },
    { id: 14, texto: 'Basta ya', fuente: 'titular', color: '#ff4d9d', forma: 'hexagono' },
    { id: 15, texto: 'La igualdad se construye cada día, en casa, en clase y en la calle', fuente: 'redonda', forma: 'cuadrada' },
    { id: 16, texto: 'Ni sumisas ni devotas: libres', fuente: 'divertida', emoji: '🦋' },
    { id: 17, texto: 'Nunca estás sola', color: '#4cc9f0', emoji: '🫂', forma: 'corazon' },
    { id: 18, texto: 'No es no', fuente: 'maquina', emoji: '🚫', forma: 'hexagono' },
    { id: 19, texto: 'Que el miedo cambie de bando', fuente: 'elegante', color: '#9d4edd' },
    { id: 20, texto: 'Libres', emoji: '🕊️', forma: 'estrella' },
    { id: 21, texto: 'Pide ayuda, hay salida', color: '#06d6a0', fuente: 'redonda' },
    { id: 22, texto: 'Rompe el silencio', emoji: '📢', fuente: 'titular' },
    { id: 23, texto: 'Respeto', color: '#f72585', fuente: 'manuscrita', forma: 'corazon' },
    { id: 24, texto: 'Ninguna agresión sin respuesta', emoji: '🛡️', forma: 'hexagono' },
    { id: 25, texto: 'Queremos llegar a casa tranquilas', fuente: 'elegante' },
    { id: 26, texto: 'El machismo mata', color: '#b5179e', fuente: 'titular' },
    { id: 27, texto: 'Sororidad', emoji: '✨', fuente: 'divertida', color: '#c77dff', forma: 'estrella' },
    { id: 28, texto: 'Ni golpes que duelan ni palabras que hieran', forma: 'cuadrada' },
    { id: 29, texto: 'Aquí también se lucha', emoji: '🏫', color: '#7209b7', forma: 'flor' },
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
