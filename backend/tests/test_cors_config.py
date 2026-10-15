from fastapi.testclient import TestClient

from app.main import app, cors_origins


def test_defaults_to_the_local_frontend():
    assert cors_origins({}) == ["http://localhost:5173", "http://127.0.0.1:5173"]


def test_uses_the_frontend_url():
    assert cors_origins({"FRONTEND_URL": "https://invoices.example.com/"}) == ["https://invoices.example.com"]


def test_cors_origins_setting_takes_priority_and_accepts_several():
    env = {"FRONTEND_URL": "https://a.example.com", "CORS_ORIGINS": " https://x.example.com , https://y.example.com/ "}
    assert cors_origins(env) == ["https://x.example.com", "https://y.example.com"]


def test_a_wildcard_is_ignored_because_it_is_unsafe_with_logins():
    assert cors_origins({"CORS_ORIGINS": "*"}) == ["http://localhost:5173", "http://127.0.0.1:5173"]


def test_other_websites_get_no_cors_permission():
    client = TestClient(app)
    allowed = client.get("/health", headers={"Origin": "http://localhost:5173"})
    other = client.get("/health", headers={"Origin": "https://evil.example.com"})
    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "access-control-allow-origin" not in other.headers
