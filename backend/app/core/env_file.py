"""Which settings file the backend reads, per environment.

    APP_ENV       file read            what it is for
    (not set)     backend/.env         a developer's machine (local)
    local         backend/.env
    dev           backend/.env.dev     the Dev server
    uat           backend/.env.uat     UAT
    prod          backend/.env.prod    Production

Every file is optional and gitignored (they hold passwords); the committed templates are
.env.example, .env.dev.example, .env.uat.example and .env.prod.example. A value already in the real
environment always wins over the file, so on Cloud Run the service's variables and Secret Manager
decide, and no file needs to exist (none is in the Docker image).
"""
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[2]
ENVIRONMENTS = {"local": ".env", "dev": ".env.dev", "uat": ".env.uat", "prod": ".env.prod"}


def app_env() -> str:
    name = (os.getenv("APP_ENV") or "local").strip().lower()
    if name not in ENVIRONMENTS:
        raise RuntimeError(f"APP_ENV={name!r} is not known; use one of: {', '.join(ENVIRONMENTS)}")
    return name


def env_file_path() -> Path:
    return BACKEND_DIR / ENVIRONMENTS[app_env()]


def load_env_file() -> Path:
    """Loads this environment's file (if it exists) without overriding real environment variables."""
    path = env_file_path()
    load_dotenv(dotenv_path=path, override=False)
    return path
