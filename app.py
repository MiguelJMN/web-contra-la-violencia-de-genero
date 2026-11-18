"""Aplicación Flask del proyecto 25N.

Responsables:
- T01: creación de la app, init de la BD, POST /mural, POST /foro, /participa, /gracias
- T02: decorador de HTTP Basic Auth, GET /api/mural, GET /api/foro, GET /pantalla
- T03: GET /admin y POST /admin/<tabla>/<id>/<accion>

Toda la base de datos se usa a través de `bd.db` (no escribir SQL aquí).
"""

from flask import Flask, redirect, render_template, request, url_for

from bd import db


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

    return app


app = create_app()


if __name__ == "__main__":
    app.run()
