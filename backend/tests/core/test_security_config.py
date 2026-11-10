"""Signing key and CORS settings: no secrets in code, no wildcard origins."""
import pytest
from fastapi.testclient import TestClient

from app.core import security
from app.core.cors import cors_allowed_origins
from app.main import app


@pytest.mark.parametrize("value", ["", "   ", "SUPER_SECRET_KEY_REPLACE_IN_PRODUCTION", "changeme", "too-short"])
def test_a_missing_placeholder_or_short_key_is_refused(monkeypatch, value):
    monkeypatch.setenv("JWT_SECRET_KEY", value)
    with pytest.raises(RuntimeError):
        security.get_secret_key()


def test_a_strong_key_is_accepted(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "k" * 40)
    assert security.get_secret_key() == "k" * 40


def test_tokens_made_with_another_key_are_rejected(monkeypatch):
    forged = security.create_access_token("1", "internal")  # signed with the test key
    monkeypatch.setenv("JWT_SECRET_KEY", "a-completely-different-key-0123456789abcdef")
    response = TestClient(app).get("/api/v1/auth/me", headers={"Authorization": f"Bearer {forged}"})
    assert response.status_code == 401


def test_the_old_hardcoded_key_cannot_forge_a_login():
    import jwt
    forged = jwt.encode({"sub": "1", "auth_type": "internal"}, "SUPER_SECRET_KEY_REPLACE_IN_PRODUCTION", algorithm="HS256")
    response = TestClient(app).get("/api/v1/auth/me", headers={"Authorization": f"Bearer {forged}"})
    assert response.status_code == 401


def test_cors_origins_are_an_explicit_list(monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "https://portal.example.com/")
    monkeypatch.setenv("CORS_ORIGINS", "https://other.example.com, *")
    origins = cors_allowed_origins()
    assert origins == ["https://other.example.com", "https://portal.example.com"]
    assert "*" not in origins


def test_dev_origins_only_apply_to_a_localhost_frontend(monkeypatch):
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    monkeypatch.setenv("FRONTEND_URL", "http://localhost:5173")
    assert "http://127.0.0.1:5173" in cors_allowed_origins()
    monkeypatch.setenv("FRONTEND_URL", "https://portal.example.com")
    assert cors_allowed_origins() == ["https://portal.example.com"]


def test_preflight_from_an_unlisted_origin_gets_no_cors_headers():
    response = TestClient(app).options(
        "/api/v1/auth/login",
        headers={"Origin": "https://evil.example.com", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in response.headers
