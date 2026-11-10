"""Pre-VAPT hardening: staff lockout, no account enumeration, server-side logout, deactivated
accounts cut off at once, login rate limit, token lifetime, API docs switch, security headers."""
from datetime import datetime, timedelta, timezone

import jwt
from fastapi.testclient import TestClient

from app.api.v1 import auth as auth_api
from app.core.database import SessionLocal
from app.core.security import ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES, get_secret_key
from app.main import app
from app.models.user import User
from tests.helpers.suppliers import get_or_create_supplier

client = TestClient(app)
LOGIN = "/api/v1/auth/login"


def _login(username="admin", password="admin123"):
    return client.post(LOGIN, json={"username": username, "password": password})


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def _set(username, **fields):
    db = SessionLocal()
    try:
        db.query(User).filter(User.username == username).update(fields)
        db.commit()
    finally:
        db.close()


def test_five_wrong_passwords_lock_a_staff_account_then_it_unlocks():
    for _ in range(5):
        assert _login(password="wrong").status_code == 401
    locked = _login()  # right password, but locked
    assert locked.status_code == 401
    assert locked.json()["error"]["message"] == "Invalid username or password."
    _set("admin", locked_until=datetime.utcnow() - timedelta(minutes=1))
    assert _login().status_code == 200


def test_a_successful_login_resets_the_failure_count():
    for _ in range(4):
        _login(password="wrong")
    assert _login().status_code == 200
    for _ in range(4):
        _login(password="wrong")
    assert _login().status_code == 200  # 4 + 4 never reached 5 in a row


def test_unknown_user_and_wrong_password_look_identical():
    unknown, wrong = _login("nobody-here", "x"), _login("admin", "x")
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json() == wrong.json()


def test_account_state_is_only_revealed_with_the_right_password():
    _set("priya", status="Inactive")
    assert _login("priya", "wrong").json()["error"]["message"] == "Invalid username or password."
    assert _login("priya", "priya123").status_code == 403


def test_logout_ends_the_session_on_the_server():
    token = _login().json()["token"]
    assert client.get("/api/v1/auth/me", headers=_bearer(token)).status_code == 200
    assert client.post("/api/v1/auth/logout", headers=_bearer(token)).status_code == 200
    assert client.get("/api/v1/auth/me", headers=_bearer(token)).status_code == 401
    assert _login().status_code == 200  # signing in again works


def test_a_deactivated_account_is_cut_off_everywhere_at_once():
    token = _login().json()["token"]
    assert client.get("/api/v1/invoices/list-invoices?page_size=1", headers=_bearer(token)).status_code == 200
    _set("admin", status="Inactive")
    for path in ("/api/v1/invoices/list-invoices?page_size=1", "/api/v1/auth/me", "/api/v1/workspace"):
        assert client.get(path, headers=_bearer(token)).status_code == 403, path


def test_supplier_logout_ends_the_session_on_the_server():
    get_or_create_supplier("HARDN1234A", ["HARD-V1"], email="hardening.supplier@example.com", password="Passw0rd!")
    login = client.post("/api/v1/auth/supplier/login-with-password",
                        json={"email": "hardening.supplier@example.com", "password": "Passw0rd!"})
    token = login.json()["token"]
    assert client.get("/api/v1/auth/me", headers=_bearer(token)).status_code == 200
    client.post("/api/v1/auth/logout", headers=_bearer(token))
    assert client.get("/api/v1/auth/me", headers=_bearer(token)).status_code == 401


def test_login_attempts_from_one_address_are_rate_limited(monkeypatch):
    monkeypatch.setattr(auth_api, "LOGIN_ATTEMPTS_PER_IP", 3)
    codes = [_login("nobody-here", "x").status_code for _ in range(4)]
    assert codes == [401, 401, 401, 429]
    # A spoofed X-Forwarded-For header does not get a fresh allowance.
    spoofed = client.post(LOGIN, json={"username": "a", "password": "b"}, headers={"X-Forwarded-For": "1.2.3.4"})
    assert spoofed.status_code == 429


def test_tokens_expire_within_a_working_day():
    token = _login().json()["token"]
    claims = jwt.decode(token, get_secret_key(), algorithms=[ALGORITHM])
    lifetime = datetime.fromtimestamp(claims["exp"], timezone.utc) - datetime.now(timezone.utc)
    assert ACCESS_TOKEN_EXPIRE_MINUTES <= 24 * 60
    assert lifetime <= timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES + 1)


def test_api_docs_are_off_unless_enabled():
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404, path


def test_api_responses_carry_security_headers():
    response = client.get("/health")
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert "frame-ancestors 'none'" in response.headers["Content-Security-Policy"]
    assert "server" not in response.headers
    api = client.get("/api/v1/auth/portal-availability")
    assert api.headers["Cache-Control"] == "no-store"
