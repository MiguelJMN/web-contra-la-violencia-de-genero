"""T10 · Genera static/img/qr.png con la URL pública de /participa.

No necesita instalar nada: el código QR se calcula aquí mismo (modo byte,
versiones 1–10) y el PNG se escribe con zlib, que viene con Python.

Uso (desde la carpeta del repositorio):
    python herramientas/generar_qr.py https://LA-URL-PUBLICA/participa
    python herramientas/generar_qr.py URL salida.png      # otra ruta de salida
    python herramientas/generar_qr.py URL --matriz        # imprime la matriz (para pruebas)
    python herramientas/generar_qr.py URL --mascara=3     # fuerza una máscara (0–7)

El qr.png del repo se generó con --mascara=3 porque con esa máscara la matriz
coincide módulo a módulo con la librería qrcode-generator (verificación independiente).

Decisiones pensadas para escanear a 3–4 m desde una pantalla:
- Corrección de errores M (15 %): aguanta reflejos del proyector sin añadir
  demasiados módulos; cuantos menos módulos, más grande se ve cada uno.
- Borde de 4 módulos (margen de silencio estándar) en blanco.
- 20 px por módulo; el CSS lo escala con image-rendering: pixelated.
"""

import sys
import zlib
from pathlib import Path
from urllib.parse import urlparse

SALIDA_POR_DEFECTO = Path("static/img/qr.png")
NIVEL = "M"
PIXELES_POR_MODULO = 20
BORDE = 4

# Bits de formato de cada nivel de corrección (norma ISO/IEC 18004)
BITS_NIVEL = {"L": 1, "M": 0, "Q": 3, "H": 2}

# Por versión y nivel: (codewords de corrección por bloque, [(nº bloques, datos por bloque), ...])
BLOQUES = {
    1: {"L": (7, [(1, 19)]), "M": (10, [(1, 16)]), "Q": (13, [(1, 13)]), "H": (17, [(1, 9)])},
    2: {"L": (10, [(1, 34)]), "M": (16, [(1, 28)]), "Q": (22, [(1, 22)]), "H": (28, [(1, 16)])},
    3: {"L": (15, [(1, 55)]), "M": (26, [(1, 44)]), "Q": (18, [(2, 17)]), "H": (22, [(2, 13)])},
    4: {"L": (20, [(1, 80)]), "M": (18, [(2, 32)]), "Q": (26, [(2, 24)]), "H": (16, [(4, 9)])},
    5: {"L": (26, [(1, 108)]), "M": (24, [(2, 43)]), "Q": (18, [(2, 15), (2, 16)]), "H": (22, [(2, 11), (2, 12)])},
    6: {"L": (18, [(2, 68)]), "M": (16, [(4, 27)]), "Q": (24, [(4, 19)]), "H": (28, [(4, 15)])},
    7: {"L": (20, [(2, 78)]), "M": (18, [(4, 31)]), "Q": (18, [(2, 14), (4, 15)]), "H": (26, [(4, 13), (1, 14)])},
    8: {"L": (24, [(2, 97)]), "M": (22, [(2, 38), (2, 39)]), "Q": (22, [(4, 18), (2, 19)]), "H": (26, [(4, 14), (2, 15)])},
    9: {"L": (30, [(2, 116)]), "M": (22, [(3, 36), (2, 37)]), "Q": (20, [(4, 16), (4, 17)]), "H": (24, [(4, 12), (4, 13)])},
    10: {"L": (18, [(2, 68), (2, 69)]), "M": (26, [(4, 43), (1, 44)]), "Q": (24, [(6, 19), (2, 20)]), "H": (28, [(6, 15), (2, 16)])},
}

ALINEACION = {1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
              7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]}


# ---------- Reed-Solomon sobre GF(256), polinomio 0x11D ----------
def gf_mul(a, b):
    r = 0
    while b:
        if b & 1:
            r ^= a
        a <<= 1
        if a & 0x100:
            a ^= 0x11D
        b >>= 1
    return r


def rs_divisor(grado):
    resultado = [0] * (grado - 1) + [1]
    raiz = 1
    for _ in range(grado):
        for j in range(grado):
            resultado[j] = gf_mul(resultado[j], raiz)
            if j + 1 < grado:
                resultado[j] ^= resultado[j + 1]
        raiz = gf_mul(raiz, 2)
    return resultado


def rs_resto(datos, divisor):
    resultado = [0] * len(divisor)
    for b in datos:
        factor = b ^ resultado.pop(0)
        resultado.append(0)
        for i, coef in enumerate(divisor):
            resultado[i] ^= gf_mul(coef, factor)
    return resultado


# ---------- Codewords ----------
def capacidad_datos(version, nivel):
    _, grupos = BLOQUES[version][nivel]
    return sum(n * k for n, k in grupos)


def elegir_version(n_bytes, nivel):
    for v in range(1, 11):
        bits_cabecera = 4 + (8 if v < 10 else 16)
        if bits_cabecera + 8 * n_bytes <= capacidad_datos(v, nivel) * 8:
            return v
    sys.exit("La URL es demasiado larga para este generador (máx. versión 10).")


def codewords(datos, version, nivel):
    capacidad = capacidad_datos(version, nivel)
    bits = []

    def poner(valor, n):
        bits.extend((valor >> i) & 1 for i in range(n - 1, -1, -1))

    poner(0b0100, 4)                                   # modo byte
    poner(len(datos), 8 if version < 10 else 16)       # longitud
    for b in datos:
        poner(b, 8)
    poner(0, min(4, capacidad * 8 - len(bits)))        # terminador
    poner(0, (-len(bits)) % 8)                         # completar el byte
    cw = [int("".join(map(str, bits[i:i + 8])), 2) for i in range(0, len(bits), 8)]
    i = 0
    while len(cw) < capacidad:                         # bytes de relleno alternos
        cw.append(0xEC if i % 2 == 0 else 0x11)
        i += 1
    # Reparto en bloques, corrección de errores e intercalado
    n_ecc, grupos = BLOQUES[version][nivel]
    divisor = rs_divisor(n_ecc)
    bloques, pos = [], 0
    for n, k in grupos:
        for _ in range(n):
            bloque = cw[pos:pos + k]
            pos += k
            bloques.append((bloque, rs_resto(bloque, divisor)))
    final = []
    for i in range(max(len(b) for b, _ in bloques)):
        for b, _ in bloques:
            if i < len(b):
                final.append(b[i])
    for i in range(n_ecc):
        for _, e in bloques:
            final.append(e[i])
    return final


# ---------- Matriz ----------
class Matriz:
    def __init__(self, version):
        self.version = version
        self.tam = version * 4 + 17
        self.mod = [[False] * self.tam for _ in range(self.tam)]
        self.fun = [[False] * self.tam for _ in range(self.tam)]

    def fijar(self, x, y, oscuro):          # x = columna, y = fila
        self.mod[y][x] = oscuro
        self.fun[y][x] = True

    def patrones(self):
        t = self.tam
        for i in range(t):                  # temporización
            self.fijar(6, i, i % 2 == 0)
            self.fijar(i, 6, i % 2 == 0)
        for cx, cy in ((3, 3), (t - 4, 3), (3, t - 4)):   # localizadores + separador
            for dy in range(-4, 5):
                for dx in range(-4, 5):
                    x, y = cx + dx, cy + dy
                    if 0 <= x < t and 0 <= y < t:
                        self.fijar(x, y, max(abs(dx), abs(dy)) not in (2, 4))
        pos = ALINEACION[self.version]
        ultimo = len(pos) - 1
        for i, a in enumerate(pos):         # alineación
            for j, b in enumerate(pos):
                if (i, j) in ((0, 0), (0, ultimo), (ultimo, 0)):
                    continue
                for dy in range(-2, 3):
                    for dx in range(-2, 3):
                        self.fijar(a + dx, b + dy, max(abs(dx), abs(dy)) != 1)
        self.formato(NIVEL, 0)              # reserva las zonas de formato
        if self.version >= 7:               # información de versión
            resto = self.version
            for _ in range(12):
                resto = (resto << 1) ^ ((resto >> 11) * 0x1F25)
            bits = self.version << 12 | resto
            for i in range(18):
                bit = (bits >> i) & 1 == 1
                a, b = t - 11 + i % 3, i // 3
                self.fijar(a, b, bit)
                self.fijar(b, a, bit)

    def formato(self, nivel, mascara):
        datos = BITS_NIVEL[nivel] << 3 | mascara
        resto = datos
        for _ in range(10):
            resto = (resto << 1) ^ ((resto >> 9) * 0x537)
        bits = (datos << 10 | resto) ^ 0x5412
        b = lambda i: (bits >> i) & 1 == 1
        t = self.tam
        for i in range(6):
            self.fijar(8, i, b(i))
        self.fijar(8, 7, b(6))
        self.fijar(8, 8, b(7))
        self.fijar(7, 8, b(8))
        for i in range(9, 15):
            self.fijar(14 - i, 8, b(i))
        for i in range(8):
            self.fijar(t - 1 - i, 8, b(i))
        for i in range(8, 15):
            self.fijar(8, t - 15 + i, b(i))
        self.fijar(8, t - 8, True)          # módulo oscuro fijo

    def colocar(self, cw):
        t, i, total = self.tam, 0, len(cw) * 8
        derecha = t - 1
        while derecha >= 1:
            if derecha == 6:
                derecha = 5
            for vert in range(t):
                for j in range(2):
                    x = derecha - j
                    sube = ((derecha + 1) & 2) == 0
                    y = t - 1 - vert if sube else vert
                    if not self.fun[y][x] and i < total:
                        self.mod[y][x] = (cw[i >> 3] >> (7 - (i & 7))) & 1 == 1
                        i += 1
            derecha -= 2

    def aplicar_mascara(self, m):
        f = [lambda x, y: (x + y) % 2 == 0,
             lambda x, y: y % 2 == 0,
             lambda x, y: x % 3 == 0,
             lambda x, y: (x + y) % 3 == 0,
             lambda x, y: (x // 3 + y // 2) % 2 == 0,
             lambda x, y: x * y % 2 + x * y % 3 == 0,
             lambda x, y: (x * y % 2 + x * y % 3) % 2 == 0,
             lambda x, y: ((x + y) % 2 + x * y % 3) % 2 == 0][m]
        for y in range(self.tam):
            for x in range(self.tam):
                if not self.fun[y][x] and f(x, y):
                    self.mod[y][x] = not self.mod[y][x]

    def penalizacion(self):
        t, m, p = self.tam, self.mod, 0
        lineas = [m[y] for y in range(t)] + [[m[y][x] for y in range(t)] for x in range(t)]
        patron = [True, False, True, True, True, False, True]
        for linea in lineas:
            racha = 1                                   # regla 1: rachas de 5 o más
            for i in range(1, t + 1):
                if i < t and linea[i] == linea[i - 1]:
                    racha += 1
                else:
                    if racha >= 5:
                        p += racha - 2
                    racha = 1
            ext = [False] * 4 + list(linea) + [False] * 4   # regla 3: falsos localizadores
            for i in range(len(ext) - 6):
                if ext[i:i + 7] == patron:
                    antes = i >= 4 and not any(ext[i - 4:i])
                    despues = i + 11 <= len(ext) and not any(ext[i + 7:i + 11])
                    if antes or despues:
                        p += 40
        for y in range(t - 1):                          # regla 2: bloques 2x2
            for x in range(t - 1):
                if m[y][x] == m[y][x + 1] == m[y + 1][x] == m[y + 1][x + 1]:
                    p += 3
        oscuros = sum(sum(fila) for fila in m)          # regla 4: equilibrio
        p += abs(oscuros * 20 - t * t * 10) // (t * t) * 10
        return p


def generar_matriz(texto, nivel=NIVEL, mascara=None):
    datos = texto.encode("utf-8")
    version = elegir_version(len(datos), nivel)
    cw = codewords(datos, version, nivel)
    mejor = None
    for m in ([mascara] if mascara is not None else range(8)):
        q = Matriz(version)
        q.patrones()
        q.colocar(cw)
        q.aplicar_mascara(m)
        q.formato(nivel, m)
        pena = q.penalizacion()
        if mejor is None or pena < mejor[0]:
            mejor = (pena, m, q)
    return mejor[2], mejor[1]


# ---------- PNG (escala de grises, 8 bits) ----------
def guardar_png(q, salida):
    lado = (q.tam + 2 * BORDE) * PIXELES_POR_MODULO
    filas = bytearray()
    for y in range(lado):
        my = y // PIXELES_POR_MODULO - BORDE
        filas.append(0)                                  # filtro "ninguno"
        for x in range(lado):
            mx = x // PIXELES_POR_MODULO - BORDE
            oscuro = 0 <= mx < q.tam and 0 <= my < q.tam and q.mod[my][mx]
            filas.append(0 if oscuro else 255)

    def trozo(tipo, datos):
        return (len(datos).to_bytes(4, "big") + tipo + datos
                + zlib.crc32(tipo + datos).to_bytes(4, "big"))

    ihdr = lado.to_bytes(4, "big") * 2 + bytes([8, 0, 0, 0, 0])
    png = (b"\x89PNG\r\n\x1a\n" + trozo(b"IHDR", ihdr)
           + trozo(b"IDAT", zlib.compress(bytes(filas), 9)) + trozo(b"IEND", b""))
    salida.parent.mkdir(parents=True, exist_ok=True)
    salida.write_bytes(png)
    return lado


def comprobar_url(url):
    partes = urlparse(url)
    if partes.scheme not in ("http", "https") or not partes.netloc:
        sys.exit(f"URL no válida: {url!r}. Debe empezar por https://")
    if partes.scheme == "http":
        print("Aviso: la URL usa http; si el servidor tiene https, usa https.")
    if not partes.path.rstrip("/").endswith("/participa"):
        print("Aviso: la URL no termina en /participa. ¿Seguro que es la buena?")
    host = partes.hostname or ""
    if host in ("localhost", "127.0.0.1") or host.startswith("192.168."):
        print("Aviso: es una dirección local; desde un móvil con datos no funcionará.")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) not in (1, 2):
        sys.exit(__doc__)
    url = args[0].strip()
    comprobar_url(url)
    forzada = next((int(a.split("=")[1]) for a in sys.argv if a.startswith("--mascara=")), None)
    q, mascara = generar_matriz(url, mascara=forzada)
    if "--matriz" in sys.argv:
        print(f"version={q.version} nivel={NIVEL} mascara={mascara}")
        for fila in q.mod:
            print("".join("1" if c else "0" for c in fila))
        sys.exit()
    salida = Path(args[1]) if len(args) == 2 else SALIDA_POR_DEFECTO
    lado = guardar_png(q, salida)
    print(f"QR guardado en {salida}: versión {q.version}, nivel {NIVEL}, máscara {mascara}, "
          f"{q.tam}x{q.tam} módulos, {lado}x{lado} px")
    print("Compruébalo escaneándolo con 2–3 móviles desde 3–4 m en la pantalla real.")
