"""Single sign-on through CC Services (legacy encrypted token): the round trip, and every way it
must refuse. CC Services itself is replaced by tests/helpers/sso.py."""
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit

from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.main import app
from app.models.audit_log import AuditLog
from app.models.user import SsoLogin, User
from app.services import sso_service
from tests.helpers.sso import FRONTEND, LOGIN_URL, cc_token, enable_sso, encrypt
from tests.helpers.users import internal_user_id

CALLBACK = sso_service.DEFAULT_CALLBACK_PATH
EXCHANGE = "/api/v1/auth/sso/exchange"


def _start(client, scope="all", remember=False):
    response = client.get("/api/v1/auth/sso/login", params={"scope": scope, "remember": str(remember).lower()},
                          follow_redirects=False)
    assert response.status_code == 302, response.text
    return response


def _callback(client, token, **params):
    response = client.get(CALLBACK, params={"token": token, **params}, follow_redirects=False)
    assert response.status_code == 302
    return response.headers["location"]


def _error(location):
    assert location.startswith(f"{FRONTEND}/login?"), location
    return parse_qs(urlsplit(location).query)["sso_error"][0]


def _code(location):
    assert location.startswith(f"{FRONTEND}/sso/callback?"), location
    return parse_qs(urlsplit(location).query)["code"][0]


def _sign_in(client, token, scope="all", remember=False):
    _start(client, scope, remember)
    return _callback(client, token)


def _set_user(username, **fields):
    db = SessionLocal()
    try:
        db.query(User).filter(User.username == username).update(fields)
        db.commit()
    finally:
        db.close()


def test_sso_is_off_unless_enabled(monkeypatch):
    monkeypatch.setenv("SSO_ENABLED", "false")
    client = TestClient(app)
    assert client.get("/api/v1/auth/sso/status").json() == {"enabled": False}
    assert client.get("/api/v1/auth/sso/login", follow_redirects=False).status_code == 404
    assert _error(_callback(client, cc_token("admin"))) == "disabled"


def test_enabled_without_legacy_switch_or_key_stays_off(monkeypatch):
    enable_sso(monkeypatch, SSO_CC_SERVICES_LEGACY_ENABLED="false")
    assert TestClient(app).get("/api/v1/auth/sso/status").json() == {"enabled": False}
    enable_sso(monkeypatch, SSO_TOKEN_DECRYPT_SECRET="")
    assert TestClient(app).get("/api/v1/auth/sso/status").json() == {"enabled": False}


def test_login_sets_a_short_lived_httponly_state_cookie_and_goes_to_cc_services(monkeypatch):
    enable_sso(monkeypatch)
    client = TestClient(app)
    assert client.get("/api/v1/auth/sso/status").json() == {"enabled": True}
    response = _start(client)
    assert response.headers["location"] == LOGIN_URL
    cookie = response.headers["set-cookie"]
    assert sso_service.STATE_COOKIE in cookie and "HttpOnly" in cookie and "Max-Age=600" in cookie
    assert "samesite=lax" in cookie.lower()


def test_full_round_trip_gives_the_normal_login_reply(monkeypatch):
    enable_sso(monkeypatch)
    client = TestClient(app)
    location = _sign_in(client, cc_token("ADMIN"), scope="all", remember=True)  # employee ID, any case
    assert "token" not in location  # our login token never travels in a URL
    reply = client.post(EXCHANGE, json={"code": _code(location)})
    assert reply.status_code == 200, reply.text
    body = reply.json()
    assert body["auth"]["username"] == "admin" and body["auth"]["channelScope"] == "all"
    assert body["remember"] is True
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['token']}"})
    assert me.status_code == 200
    db = SessionLocal()
    try:
        entry = db.query(AuditLog).filter(AuditLog.action == "Logged in").order_by(AuditLog.id.desc()).first()
        assert "(SSO)" in entry.detail
    finally:
        db.close()


def test_matches_by_email_and_plain_text_tokens(monkeypatch):
    enable_sso(monkeypatch)
    client = TestClient(app)
    assert _code(_sign_in(client, cc_token(email="Admin@Example.com")))
    assert _code(_sign_in(client, encrypt("admin")))  # a token that is just the employee ID


def test_callback_without_the_state_cookie_is_refused(monkeypatch):
    enable_sso(monkeypatch)
    assert _error(_callback(TestClient(app), cc_token("admin"))) == "state"


def test_tampered_cookie_is_refused(monkeypatch):
    enable_sso(monkeypatch)
    client = TestClient(app)
    client.cookies.set(sso_service.STATE_COOKIE, "not-a-real-state")
    assert _error(_callback(client, cc_token("admin"))) == "state"


def test_bad_tokens_are_refused(monkeypatch):
    enable_sso(monkeypatch)
    client = TestClient(app)
    assert _error(_sign_in(client, "garbage!!")) == "token"
    assert _error(_sign_in(client, cc_token("admin", key="ffffffffffffffffffffffffffffffff"))) == "token"
    assert _error(_sign_in(client, encrypt('{"name": "nobody"}'))) == "token"
    _start(client)
    assert _error(client.get(CALLBACK, follow_redirects=False).headers["location"]) == "token"


def test_old_tokens_are_refused(monkeypatch):
    enable_sso(monkeypatch)
    old = datetime.now(timezone.utc) - timedelta(minutes=10)
    assert _error(_sign_in(TestClient(app), cc_token("admin", issued_at=old))) == "expired"


def test_a_token_works_only_once(monkeypatch):
    enable_sso(monkeypatch)
    client = TestClient(app)
    token = cc_token("admin")
    assert _code(_sign_in(client, token))
    assert _error(_sign_in(client, token)) == "replay"


def test_a_token_without_a_time_is_blocked_only_for_the_token_window(monkeypatch):
    """Such a token is the same at every login; blocking it for ever would lock its owner out."""
    enable_sso(monkeypatch)
    client = TestClient(app)
    token = encrypt("admin")
    assert _code(_sign_in(client, token))
    assert _error(_sign_in(client, token)) == "replay"
    db = SessionLocal()
    try:
        db.query(SsoLogin).update({SsoLogin.created_at: datetime.utcnow() - timedelta(minutes=5)})
        db.commit()
    finally:
        db.close()
    assert _code(_sign_in(client, token))


def test_only_existing_active_unlocked_accounts(monkeypatch):
    enable_sso(monkeypatch)
    client = TestClient(app)
    assert _error(_sign_in(client, cc_token("no-such-person"))) == "no_account"

    internal_user_id("sso_staff", role="Viewer", channel_scope="poPortal")
    _set_user("sso_staff", status="Inactive")
    assert _error(_sign_in(client, cc_token("sso_staff"), scope="poPortal")) == "inactive"
    _set_user("sso_staff", status="Invited")
    assert _error(_sign_in(client, cc_token("sso_staff"), scope="poPortal")) == "inactive"
    _set_user("sso_staff", status="Active", locked_until=datetime.utcnow() + timedelta(minutes=10))
    assert _error(_sign_in(client, cc_token("sso_staff"), scope="poPortal")) == "locked"
    _set_user("sso_staff", locked_until=None)
    assert _code(_sign_in(client, cc_token("sso_staff"), scope="poPortal"))


def test_workspace_rules_are_the_same_as_password_login(monkeypatch):
    enable_sso(monkeypatch)
    internal_user_id("sso_staff", role="Viewer", channel_scope="poPortal")
    _set_user("sso_staff", status="Active", locked_until=None)
    client = TestClient(app)
    code = _code(_sign_in(client, cc_token("sso_staff"), scope="msetuSrm"))
    reply = client.post(EXCHANGE, json={"code": code})
    assert reply.status_code == 403


def test_code_is_single_use_and_expires(monkeypatch):
    enable_sso(monkeypatch)
    client = TestClient(app)
    code = _code(_sign_in(client, cc_token("admin")))
    assert client.post(EXCHANGE, json={"code": code}).status_code == 200
    assert client.post(EXCHANGE, json={"code": code}).status_code == 401
    assert client.post(EXCHANGE, json={"code": "made-up"}).status_code == 401

    code = _code(_sign_in(client, cc_token("admin", issued_at=datetime.now(timezone.utc) - timedelta(seconds=5))))
    db = SessionLocal()
    try:
        db.query(SsoLogin).update({SsoLogin.expires_at: datetime.utcnow() - timedelta(seconds=1)})
        db.commit()
    finally:
        db.close()
    assert client.post(EXCHANGE, json={"code": code}).status_code == 401


def test_state_round_trip_when_cc_services_returns_it(monkeypatch):
    enable_sso(monkeypatch, SSO_STATE_PARAM="state")
    client = TestClient(app)
    assert _start(client).headers["location"].startswith(LOGIN_URL + "&state=")
    assert _error(_callback(client, cc_token("admin"), state="wrong")) == "state"
    # The failed callback cleared the cookie; start again.
    nonce = parse_qs(urlsplit(_start(client).headers["location"]).query)["state"][0]
    assert _code(_callback(client, cc_token("admin"), state=nonce))


def test_callback_accepts_a_posted_form(monkeypatch):
    enable_sso(monkeypatch)
    client = TestClient(app)
    _start(client)
    response = client.post(CALLBACK, data={"token": cc_token("admin")}, follow_redirects=False)
    assert _code(response.headers["location"])


def test_wrong_key_length_is_reported_as_a_refusal_not_a_crash(monkeypatch):
    enable_sso(monkeypatch, SSO_TOKEN_DECRYPT_SECRET="too-short")
    assert _error(_sign_in(TestClient(app), cc_token("admin"))) == "config"


def test_a_jwt_inside_the_encrypted_token_is_read(monkeypatch):
    """CC Services calls the parameter jwt_token: the AES layer may wrap a JWT."""
    import jwt as pyjwt
    enable_sso(monkeypatch)
    client = TestClient(app)
    inner = pyjwt.encode({"upn": "admin@example.com", "iat": int(datetime.now(timezone.utc).timestamp())},
                         "provider-key-we-do-not-have-0123456789", algorithm="HS256")
    _start(client)
    location = client.get(CALLBACK, params={"jwt_token": encrypt(inner)}, follow_redirects=False).headers["location"]
    assert _code(location)

    expired = pyjwt.encode({"upn": "admin@example.com", "exp": 1_000_000_000},
                           "provider-key-we-do-not-have-0123456789", algorithm="HS256")
    assert _error(_sign_in(client, encrypt(expired))) == "expired"


def test_double_base64_tokens_like_cc_services_dev_sends(monkeypatch):
    """CC Services DEV sends base64(base64(AES(JWT))) in jwt_token."""
    import base64 as b64
    import jwt as pyjwt
    enable_sso(monkeypatch)
    client = TestClient(app)
    inner = pyjwt.encode({"upn": "admin@example.com", "iat": int(datetime.now(timezone.utc).timestamp())},
                         "provider-key-we-do-not-have-0123456789", algorithm="HS256")
    double = b64.b64encode(encrypt(inner).encode("ascii")).decode("ascii")
    _start(client)
    location = client.get(CALLBACK, params={"jwt_token": double}, follow_redirects=False).headers["location"]
    assert _code(location)


def test_combined_id_from_cc_services_matches_the_employee_id(monkeypatch):
    """CC Services DEV sends '<employee ID>_<app id>_<sign-in method>' as the ID."""
    enable_sso(monkeypatch)
    internal_user_id("50000001", role="Admin")
    token = cc_token("50000001_afa00000-0000-0000-0000-000000000000_Multi-Factor Authentication (MFA)")
    assert _code(_sign_in(TestClient(app), token))
