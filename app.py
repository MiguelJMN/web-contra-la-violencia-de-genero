"""Aplicación Flask del proyecto 25N.

Responsables:
- T01: creación de la app, init de la BD, POST /mural, POST /foro, /participa, /gracias
- T02: decorador de HTTP Basic Auth, GET /api/mural, GET /api/foro, GET /pantalla
- T03: GET /admin y POST /admin/<tabla>/<id>/<accion>

Toda la base de datos se usa a través de `bd.db` (no escribir SQL aquí).
"""

import hmac
import os
from functools import wraps

from flask import Flask, Response, jsonify, redirect, render_template, request, url_for

from bd import db


# --- T02: HTTP Basic Auth -----------------------------------------------------
# Usuarios y contraseñas solo desde variables de entorno (.env), nunca en el código.
# Rol "admin": /admin, /pantalla y /api/*. Rol "pantalla": /pantalla y /api/*.
# Si falta la contraseña de un rol, ese rol no puede entrar.

def _cuentas():
    """{usuario: (rol, contraseña)} leído en cada petición desde el entorno."""
    cuentas = {}
    for rol, var_usuario, var_pass in (
        ("admin", "ADMIN_USER", "ADMIN_PASS"),
        ("pantalla", "PANTALLA_USER", "PANTALLA_PASS"),
    ):
        usuario = os.environ.get(var_usuario) or rol
        password = os.environ.get(var_pass)
        if password:
            cuentas[usuario] = (rol, password)
    return cuentas


def _rol_autenticado():
    """Devuelve el rol de las credenciales Basic de la petición, o None."""
    auth = request.authorization
    if auth is None or auth.username is None or auth.password is None:
        return None
    cuenta = _cuentas().get(auth.username)
    if cuenta is None:
        return None
    rol, esperada = cuenta
    if hmac.compare_digest(auth.password.encode("utf-8"), esperada.encode("utf-8")):
        return rol
    return None


def requiere_rol(*roles):
    """Decorador: 401 salvo credenciales Basic válidas de uno de los roles indicados."""

    def decorador(vista):
        @wraps(vista)
        def envoltura(*args, **kwargs):
            if _rol_autenticado() not in roles:
                return Response(
                    "Acceso restringido",
                    401,
                    {"WWW-Authenticate": 'Basic realm="25N", charset="UTF-8"'},
                )
            return vista(*args, **kwargs)

        return envoltura

    return decorador


def create_app():
    app = Flask(__name__)
    db.init_db()

    @app.get("/")
    def inicio():
        return redirect(url_for("participa"))

    @app.get("/participa")
    def participa():
        return render_template("participa.html")

    @app.post("/mural")
    def crear_mural():
        texto = request.form.get("texto", "").strip()
        if not texto:
            return render_template(
                "participa.html",
                error_message="Escribe un mensaje antes de enviarlo.",
            ), 400
        if len(texto) > db.MAX_MURAL_TEXTO:
            return render_template(
                "participa.html",
                error_message=(
                    f"El mensaje no puede superar los "
                    f"{db.MAX_MURAL_TEXTO} caracteres."
                ),
            ), 400

        db.insertar_mural(texto)
        return redirect(url_for("gracias"))

    @app.post("/foro")
    def crear_foro():
        titulo = request.form.get("titulo", "").strip()
        texto = request.form.get("texto", "").strip()

        if not titulo:
            error_message = "Escribe un título antes de enviar la reflexión."
        elif len(titulo) > db.MAX_FORO_TITULO:
            error_message = (
                f"El título no puede superar los "
                f"{db.MAX_FORO_TITULO} caracteres."
            )
        elif not texto:
            error_message = "Escribe una reflexión antes de enviarla."
        elif len(texto) > db.MAX_FORO_TEXTO:
            error_message = (
                f"La reflexión no puede superar los "
                f"{db.MAX_FORO_TEXTO} caracteres."
            )
        else:
            error_message = None

        if error_message:
            return render_template(
                "participa.html",
                error_message=error_message,
            ), 400

        db.insertar_foro(titulo, texto)
        return redirect(url_for("gracias"))

    @app.get("/gracias")
    def gracias():
        return render_template("gracias.html")

    # --- T02: pantalla y API JSON (solo contenido publicable) ---------------

    @app.get("/pantalla")
    @requiere_rol("admin", "pantalla")
    def pantalla():
        return render_template("pantalla.html")

    @app.get("/api/mural")
    @requiere_rol("admin", "pantalla")
    def api_mural():
        mensajes = db.listar_mural(solo_visibles=True, limite=30)
        return jsonify([{"id": m["id"], "texto": m["texto"]} for m in mensajes])

    @app.get("/api/foro")
    @requiere_rol("admin", "pantalla")
    def api_foro():
        reflexiones = db.listar_foro(solo_aprobadas=True)
        return jsonify(
            [{"id": r["id"], "titulo": r["titulo"], "texto": r["texto"]} for r in reflexiones]
        )

    return app


app = create_app()


if __name__ == "__main__":
    app.run()
