from flask import Flask, jsonify
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.security import generate_password_hash

from .config import Config
from .extensions import db, jwt, migrate
from .models import User
from .routes.admin import admin_bp
from .routes.auth import auth_bp
from .routes.compat import compat_bp
from .routes.devices import devices_bp
from .routes.health import health_bp
from .routes.licenses import licenses_bp
from .routes.policy import policy_bp
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
    app.register_blueprint(compat_bp, url_prefix="/api")
    app.register_blueprint(devices_bp, url_prefix="/api")
    app.register_blueprint(licenses_bp, url_prefix="/api")
    app.register_blueprint(policy_bp, url_prefix="/api")
    app.register_blueprint(sync_bp, url_prefix="/api")

    @app.get("/")
    def root():
        return jsonify({"service": "trustnet-restaurant-cloud", "status": "ok"})

    _seed_super_admin(app)

    return app


def _seed_super_admin(app: Flask) -> None:
    if not app.config.get("SUPER_ADMIN_AUTO_CREATE"):
        return
    username = app.config.get("SUPER_ADMIN_USERNAME")
    password = app.config.get("SUPER_ADMIN_PASSWORD")
    if not username or not password:
        return
    try:
        with app.app_context():
            if User.query.filter_by(role="super_admin").first():
                return
            if User.query.filter_by(username=username).first():
                app.logger.warning("Super admin username '%s' already exists; skipping seed.", username)
                return
            user = User(
                tenant_id=None,
                username=username,
                password_hash=generate_password_hash(password),
                role="super_admin",
            )
            db.session.add(user)
            db.session.commit()
            app.logger.info("Seeded super admin account: %s", username)
    except SQLAlchemyError as exc:
        app.logger.warning("Unable to seed super admin: %s", exc)
