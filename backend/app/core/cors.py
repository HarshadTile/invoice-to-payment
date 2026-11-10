"""Which browser origins may call the API from another origin.

Never "*": the list is the deployed frontend (FRONTEND_URL) plus any extra origins named in
CORS_ORIGINS (comma separated). The local Vite dev server origins are included only while
FRONTEND_URL points at localhost, i.e. in development. When the frontend and API are served from
the same origin behind one reverse proxy, the browser does not use CORS at all."""
import os
from urllib.parse import urlsplit

DEV_ORIGINS = ("http://localhost:5173", "http://127.0.0.1:5173")


def _origin(url: str) -> str:
    parts = urlsplit(url.strip())
    return f"{parts.scheme}://{parts.netloc}" if parts.scheme and parts.netloc else ""


def cors_allowed_origins() -> list[str]:
    frontend = _origin(os.getenv("FRONTEND_URL", "http://localhost:5173"))
    extra = [_origin(item) for item in os.getenv("CORS_ORIGINS", "").split(",")]
    origins = [frontend, *extra]
    if frontend.startswith(("http://localhost", "http://127.0.0.1")):
        origins.extend(DEV_ORIGINS)
    return sorted({origin for origin in origins if origin and origin != "*"})
