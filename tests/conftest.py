import os
import sys
from pathlib import Path

import pytest
from sqlalchemy.pool import StaticPool

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

os.environ.setdefault("SQLALCHEMY_DATABASE_URI", "sqlite://")
os.environ.setdefault("DISABLE_TENANT_CUSTOM_BRANDING", "true")

from app.cloud_app import create_app
from app.extensions import db


@pytest.fixture()
def app():
    os.environ["DISABLE_TENANT_CUSTOM_BRANDING"] = "true"
    test_app = create_app()
    test_app.config.update(
        TESTING=True,
        SQLALCHEMY_DATABASE_URI="sqlite://",
        SQLALCHEMY_ENGINE_OPTIONS={"poolclass": StaticPool},
    )
    with test_app.app_context():
        db.create_all()
        yield test_app
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()
