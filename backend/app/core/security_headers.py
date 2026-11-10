"""HTTP security headers on every API response, and the switch for the interactive API docs.

The API only ever returns JSON or file downloads, so it can use the strictest settings: nothing
may frame it, no content may load from it as a page, and browsers must not guess content types.
The frontend's own HTML is served by the web server / reverse proxy, which must send its own
headers (see docs/handover notes); these cover the API.
"""
import os

from starlette.middleware.base import BaseHTTPMiddleware

# Swagger UI / ReDoc load scripts and styles from a CDN, so they get a looser policy.
DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")
API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"


def api_docs_enabled() -> bool:
    """ENABLE_API_DOCS=true turns on /docs, /redoc and /openapi.json. Off by default, so a deployed
    server does not publish a map of every endpoint; turn it on in a developer's backend/.env."""
    return os.getenv("ENABLE_API_DOCS", "false").strip().lower() in ("1", "true", "yes")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        headers = response.headers
        headers.setdefault("X-Content-Type-Options", "nosniff")
        headers.setdefault("X-Frame-Options", "DENY")
        headers.setdefault("Referrer-Policy", "no-referrer")
        headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
        headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        if not request.url.path.startswith(DOCS_PATHS):
            headers.setdefault("Content-Security-Policy", API_CSP)
        if request.url.path.startswith("/api/"):
            # Invoice, supplier and account data must never sit in a shared or browser cache.
            headers.setdefault("Cache-Control", "no-store")
        # HSTS is only meaningful (and only honoured) over HTTPS; behind a TLS-terminating proxy
        # run uvicorn with --proxy-headers so the scheme is reported correctly.
        if request.url.scheme == "https":
            headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        if "server" in headers:
            del headers["server"]
        return response
