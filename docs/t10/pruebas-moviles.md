# T10 · Pruebas de /participa en móviles

Cuándo: en cuanto T06 tenga el formulario y T05 la URL pública.
Hacerlo **con datos móviles** (fuera de la wifi del centro) y escaneando el QR real.

## Móviles probados

| Móvil / navegador | Pantalla | ¿QR a 3–4 m? | ¿Formulario OK? | Problemas |
|---|---|---|---|---|
| Android · Chrome | | | | |
| Android · Samsung Internet | | | | |
| iPhone · Safari | | | | |
| iPhone pequeño (SE) | | | | |
| Móvil grande / tablet | | | | |

## Qué comprobar en cada uno

**QR**
- [ ] Se escanea con la cámara normal desde 3 m y desde 4 m, de frente y en diagonal.
- [ ] Abre exactamente `/participa` (no la raíz, ni un aviso de ngrok/cloudflared).
- [ ] Con las luces de la sala como el día del evento (el proyector pierde contraste con luz).

**Formulario (/participa)**
- [ ] Se ve entero sin zoom ni scroll horizontal (360 px de ancho, iPhone SE 320 px).
- [ ] Al tocar un campo no se hace zoom raro (en iPhone pasa si la letra es < 16 px).
- [ ] El teclado no tapa el botón de enviar.
- [ ] Botones grandes y fáciles de pulsar (≥ 44 px).
- [ ] Se ve el aviso de no poner nombres reales ni datos identificativos.
- [ ] Contadores/límites: mensaje ≤ 200, título ≤ 80, reflexión ≤ 1000.
- [ ] Enviar vacío → no se guarda y se avisa.
- [ ] Emojis y tildes (ñ, á, 💜) se guardan y se ven bien en la pantalla.
- [ ] Tras enviar → llega a `/gracias`; atrás + recargar no duplica el envío (o al menos avisa).
- [ ] El mensaje aparece en el mural en ~10 s; la reflexión solo tras aprobarla en `/admin`.
- [ ] Modo oscuro del móvil activado: se sigue leyendo.

## Problemas encontrados (para pasar a T06/T05)

- 
