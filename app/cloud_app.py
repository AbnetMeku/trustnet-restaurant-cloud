from flask import Flask, jsonify

from .config import Config
from .extensions import db, jwt, migrate
from .routes.admin import admin_bp
from .routes.auth import auth_bp
from .routes.devices import devices_bp
from .routes.health import health_bp
from .routes.licenses import licenses_bp
from .routes.sync import sync_bp
from .routes.tenants import tenants_bp


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)

    app.register_blueprint(health_bp, url_prefix="/api")
    app.register_blueprint(tenants_bp, url_prefix="/api")
    app.register_blueprint(auth_bp, url_prefix="/api")
    app.register_blueprint(admin_bp, url_prefix="/api")
    app.register_blueprint(devices_bp, url_prefix="/api")
    app.register_blueprint(licenses_bp, url_prefix="/api")
    app.register_blueprint(sync_bp, url_prefix="/api")

    @app.get("/")
    def root():
        return jsonify({"service": "trustnet-restaurant-cloud", "status": "ok"})

    return app
