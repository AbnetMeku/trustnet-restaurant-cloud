import os

from dotenv import load_dotenv

load_dotenv()


class Config:
    DB_USER = os.environ.get("DB_USER", "trustnet_cloud")
    DB_PASSWORD = os.environ.get("DB_PASSWORD", "trustnet_cloud_password")
    DB_HOST = os.environ.get("DB_HOST", "localhost")
    DB_PORT = os.environ.get("DB_PORT", "5432")
    DB_NAME = os.environ.get("DB_NAME", "trustnet_cloud")
    SECRET_KEY = os.environ.get("SECRET_KEY", "change-me")
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "SQLALCHEMY_DATABASE_URI",
        f"postgresql+psycopg://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    TENANT_API_KEY = os.environ.get("TENANT_API_KEY", "change-me")
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", SECRET_KEY)
    HOST = os.environ.get("HOST", "127.0.0.1")
    PORT = int(os.environ.get("PORT", "7000"))
    DISABLE_TENANT_CUSTOM_BRANDING = os.environ.get("DISABLE_TENANT_CUSTOM_BRANDING", "true").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    SUPER_ADMIN_AUTO_CREATE = os.environ.get("SUPER_ADMIN_AUTO_CREATE", "true").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    SUPER_ADMIN_USERNAME = os.environ.get("SUPER_ADMIN_USERNAME")
    SUPER_ADMIN_PASSWORD = os.environ.get("SUPER_ADMIN_PASSWORD")
