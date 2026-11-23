"""Single sign-on for staff through Mahindra CC Services.

The round trip (routes in app/api/v1/auth.py):
  1. GET /api/v1/auth/sso/login     -> sets a short-lived signed "state" cookie, redirects to CC Services
  2. CC Services signs the person in and redirects back to SSO_CALLBACK_PATH with an encrypted token
  3. callback                       -> checks the cookie, decrypts the token, finds the existing Active
                                       user, stores a one-time code (60 s), redirects to the frontend
  4. POST /api/v1/auth/sso/exchange -> swaps that code for the normal login token ({token, auth})

Our login token never appears in a URL; the CC Services token is accepted once only.

Legacy CC Services tokens are AES-ECB/PKCS#7 encrypted but NOT signed: whoever holds the decrypt key
can make a valid-looking token. That is why the key must stay secret, tokens are single use, and old
tokens are refused when they carry a time. Prefer a signed (JWT) or verify-API contract when CC
Services offers one.

Every value comes from the environment (.env), so moving from a test registration to our own app ID
and key is a settings change only:
  SSO_ENABLED, SSO_LOGIN_URL, SSO_CALLBACK_PATH, SSO_TOKEN_PARAM, SSO_STATE_PARAM,
  SSO_CC_SERVICES_LEGACY_ENABLED, SSO_TOKEN_DECRYPT_SECRET, SSO_TOKEN_KEY_ENCODING,
  SSO_TOKEN_MAX_AGE_SECONDS, SSO_EMPLOYEE_ID_FIELDS, SSO_EMAIL_FIELDS, SSO_TIME_FIELDS,
  SSO_COOKIE_SAMESITE, FRONTEND_URL
"""
import base64
import binascii
import hashlib
import json
import logging
import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import jwt
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.audit import current_ip, write_audit
from app.core.security import ALGORITHM, get_secret_key
from app.models.user import SsoLogin, User

logger = logging.getLogger(__name__)

DEFAULT_CALLBACK_PATH = "/api/v1/auth/sso/callback"
STATE_COOKIE = "i2p_sso_state"
STATE_MINUTES = 10
CODE_SECONDS = 60
KEEP_ROWS_HOURS = 24
_TRUE = {"1", "true", "yes", "on"}
_KEY_ENCODINGS = {"utf8", "base64", "hex"}

DEFAULT_EMPLOYEE_ID_FIELDS = "employeeId,employeeID,EmployeeId,empId,EmpId,emp_id,empCode,tokenNo,userId,UserId,username,user,sub"
DEFAULT_EMAIL_FIELDS = "email,emailaddress,user_mail,Email,emailId,EmailId,mail,upn,preferred_username,unique_name"
DEFAULT_TIME_FIELDS = "timestamp,Timestamp,ts,iat,issuedAt,time,loginTime"


class SsoError(Exception):
    """A refused SSO step. `code` is a short, safe word the frontend turns into a message."""

    def __init__(self, code: str, reason: str):
        super().__init__(reason)
        self.code = code
        self.reason = reason


@dataclass
class SsoIdentity:
    employee_id: str | None
    email: str | None
    issued_at: datetime | None
    fields: tuple = ()  # names of the token's fields (never values), for the audit log


# ---------- settings ----------

def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip().strip("'\"")


def _list(name: str, default: str) -> list[str]:
    return [item.strip() for item in _env(name, default).split(",") if item.strip()]


def login_url() -> str:
    return _env("SSO_LOGIN_URL")


def legacy_mode() -> bool:
    return _env("SSO_CC_SERVICES_LEGACY_ENABLED").lower() in _TRUE


def is_enabled() -> bool:
    """On only when switched on AND usable: a login URL and a way to check tokens. Today the only
    supported check is the legacy CC Services decrypt mode, which must be enabled explicitly."""
    if _env("SSO_ENABLED").lower() not in _TRUE:
        return False
    if not login_url() or not legacy_mode() or not _env("SSO_TOKEN_DECRYPT_SECRET"):
        logger.warning("SSO_ENABLED is set but SSO_LOGIN_URL, SSO_CC_SERVICES_LEGACY_ENABLED or "
                       "SSO_TOKEN_DECRYPT_SECRET is missing; SSO stays off.")
        return False
    return True


def callback_path() -> str:
    path = _env("SSO_CALLBACK_PATH", DEFAULT_CALLBACK_PATH)
    return path if path.startswith("/") else f"/{path}"


DEFAULT_TOKEN_PARAMS = "jwt_token,token,ssoToken,sso_token,data,encData,encToken,accessToken,access_token"


def token_params() -> list[str]:
    """Query/form parameter(s) that may carry the CC Services token, first found wins."""
    return _list("SSO_TOKEN_PARAM", DEFAULT_TOKEN_PARAMS)


def pick_token(params: dict) -> str | None:
    for name in token_params():
        if params.get(name):
            return params[name]
    return None


def state_param() -> str:
    """Name of the query parameter that carries our state through CC Services. Empty (default):
    CC Services is not sent one, and the state cookie alone proves this browser started the login."""
    return _env("SSO_STATE_PARAM")


def frontend_url() -> str:
    return _env("FRONTEND_URL", "http://localhost:5173").rstrip("/")


def cookie_secure() -> bool:
    return frontend_url().startswith("https://")


def cookie_samesite() -> str:
    """"lax" works when CC Services redirects back with a GET. If it POSTs a form instead, the
    cookie needs "none" (which browsers allow only with Secure, i.e. HTTPS)."""
    value = _env("SSO_COOKIE_SAMESITE", "lax").lower()
    return value if value in {"lax", "strict", "none"} else "lax"


def max_token_age() -> int:
    try:
        return max(30, int(_env("SSO_TOKEN_MAX_AGE_SECONDS", "120")))
    except ValueError:
        return 120


def _decrypt_key() -> bytes:
    secret = _env("SSO_TOKEN_DECRYPT_SECRET")
    encoding = _env("SSO_TOKEN_KEY_ENCODING", "utf8").lower()
    if encoding not in _KEY_ENCODINGS:
        raise SsoError("config", f"SSO_TOKEN_KEY_ENCODING must be one of {sorted(_KEY_ENCODINGS)}")
    try:
        if encoding == "base64":
            key = base64.b64decode(secret)
        elif encoding == "hex":
            key = bytes.fromhex(secret)
        else:
            key = secret.encode("utf-8")
    except (ValueError, binascii.Error) as exc:
        raise SsoError("config", f"SSO_TOKEN_DECRYPT_SECRET is not valid {encoding}") from exc
    if len(key) not in (16, 24, 32):
        raise SsoError("config", f"SSO decrypt key is {len(key)} bytes; AES needs 16, 24 or 32 "
                                 "(check SSO_TOKEN_KEY_ENCODING)")
    return key


# ---------- the state cookie ----------

def new_state(scope: str | None, remember: bool) -> tuple[str, str]:
    """(cookie value, nonce). The cookie is signed with the login-token key and expires quickly."""
    nonce = secrets.token_urlsafe(24)
    payload = {"typ": "sso_state", "nonce": nonce, "scope": scope or None, "remember": bool(remember),
               "exp": datetime.now(timezone.utc) + timedelta(minutes=STATE_MINUTES)}
    return jwt.encode(payload, get_secret_key(), algorithm=ALGORITHM), nonce


def read_state(cookie: str | None, returned_state: str | None) -> dict:
    if not cookie:
        raise SsoError("state", "no state cookie (login not started from this browser, or it expired)")
    try:
        state = jwt.decode(cookie, get_secret_key(), algorithms=[ALGORITHM])
    except jwt.InvalidTokenError as exc:
        raise SsoError("state", "state cookie invalid or expired") from exc
    if state.get("typ") != "sso_state":
        raise SsoError("state", "not a state cookie")
    if state_param() and not secrets.compare_digest(str(returned_state or ""), state["nonce"]):
        raise SsoError("state", "state returned by CC Services does not match")
    return state


def provider_redirect_url(nonce: str) -> str:
    url = login_url()
    if not state_param():
        return url
    parts = urlsplit(url)
    query = parse_qsl(parts.query, keep_blank_values=True) + [(state_param(), nonce)]
    return urlunsplit(parts._replace(query=urlencode(query)))


# ---------- the CC Services token ----------

def _b64(text: str) -> bytes | None:
    text = text.strip()
    try:
        return base64.b64decode(text + "=" * (-len(text) % 4),
                                altchars=b"-_" if ("-" in text or "_" in text) else None, validate=True)
    except (binascii.Error, ValueError):
        return None


def _token_candidates(raw: str) -> list[bytes]:
    """Possible AES bytes, most likely first. CC Services (DEV, Nov 2026) sends the AES bytes base64
    encoded TWICE; single base64 and hex are tried too. A '+' may have become a space on the way."""
    text = raw.strip().replace(" ", "+")
    candidates = []
    outer = _b64(text)
    if outer:
        try:
            inner = _b64(outer.decode("ascii"))
        except UnicodeDecodeError:
            inner = None
        if inner:
            candidates.append(inner)
        candidates.append(outer)
    try:
        candidates.append(bytes.fromhex(text))
    except ValueError:
        pass
    candidates = [data for data in candidates if data and len(data) % 16 == 0]
    if not candidates:
        raise SsoError("token", "token is not base64/hex AES data")
    return candidates


def decrypt_token(raw: str) -> str:
    key = _decrypt_key()
    for data in _token_candidates(raw):
        decryptor = Cipher(algorithms.AES(key), modes.ECB()).decryptor()  # noqa: S305 - CC Services legacy contract
        padded = decryptor.update(data) + decryptor.finalize()
        try:
            unpadder = padding.PKCS7(128).unpadder()
            return (unpadder.update(padded) + unpadder.finalize()).decode("utf-8").strip()
        except (ValueError, UnicodeDecodeError):
            continue
    raise SsoError("token", "token did not decrypt (wrong key or not a CC Services token)")


def _parse_time(value) -> datetime | None:
    if value in (None, ""):
        return None
    try:
        number = float(value)
        if number > 1e12:  # milliseconds
            number /= 1000
        return datetime.fromtimestamp(number, tz=timezone.utc).replace(tzinfo=None)
    except (TypeError, ValueError, OverflowError, OSError):
        pass
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _first(data: dict, fields: list[str]):
    lowered = {str(key).lower(): value for key, value in data.items()}
    for field in fields:
        value = data.get(field, lowered.get(field.lower()))
        if value not in (None, ""):
            return value
    return None


def _jwt_payload(text: str) -> dict | None:
    """The claims of a JWT found INSIDE the encrypted token. Its signature is not checked here: the
    trust comes from the AES layer around it (only CC Services and we hold that key)."""
    parts = text.split(".")
    if len(parts) != 3 or not text.startswith("eyJ"):
        return None
    try:
        payload = json.loads(base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4)))
    except (ValueError, binascii.Error):
        return None
    return payload if isinstance(payload, dict) else None


def parse_identity(plain: str) -> SsoIdentity:
    """Decrypted text: a JSON object or a JWT (field names from SSO_*_FIELDS), or just an employee
    ID / email."""
    data = _jwt_payload(plain)
    if data is not None:
        exp = _parse_time(data.get("exp"))
        if exp and exp < datetime.utcnow() - timedelta(seconds=60):
            raise SsoError("expired", "the JWT inside the token has expired")
    else:
        try:
            data = json.loads(plain)
        except ValueError:
            data = None
    if isinstance(data, dict):
        employee = _first(data, _list("SSO_EMPLOYEE_ID_FIELDS", DEFAULT_EMPLOYEE_ID_FIELDS))
        email = _first(data, _list("SSO_EMAIL_FIELDS", DEFAULT_EMAIL_FIELDS))
        issued = _parse_time(_first(data, _list("SSO_TIME_FIELDS", DEFAULT_TIME_FIELDS)))
        identity = SsoIdentity(str(employee).strip() if employee else None,
                               str(email).strip() if email else None, issued, tuple(sorted(data)))
    elif plain and "@" in plain:
        identity = SsoIdentity(None, plain, None)
    elif plain and not plain.startswith(("{", "[")):
        identity = SsoIdentity(plain, None, None)
    else:
        identity = SsoIdentity(None, None, None)
    if not identity.employee_id and not identity.email:
        raise SsoError("token", "token has no employee ID or email")
    return identity


def _check_fresh(identity: SsoIdentity) -> None:
    if identity.issued_at is None:
        return
    age = (datetime.utcnow() - identity.issued_at).total_seconds()
    if age > max_token_age() or age < -60:
        raise SsoError("expired", f"token time is {int(age)} s old (limit {max_token_age()} s)")


def find_user(db: Session, identity: SsoIdentity) -> User | None:
    """Only people who already have an account here; SSO never creates users."""
    if identity.employee_id:
        # CC Services DEV sends "<employee ID>_<app id>_<sign-in method>": also try the first part.
        candidates = [identity.employee_id.lower()]
        if "_" in identity.employee_id:
            candidates.append(identity.employee_id.split("_", 1)[0].lower())
        for candidate in candidates:
            user = db.query(User).filter(func.lower(User.username) == candidate).first()
            if user:
                return user
    if identity.email:
        return db.query(User).filter(func.lower(User.email) == identity.email.lower()).first()
    return None


# ---------- one-time code ----------

def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _fail(db: Session, actor, error: SsoError, throttle_key: str | None = None):
    write_audit(db, actor, "Failed login", f"SSO: {error.reason}", throttle_key=throttle_key)
    raise error


def complete_callback(db: Session, raw_token: str | None, state: dict, received: str = "") -> str:
    """Steps 2-3: checks the CC Services token and returns a one-time code for the browser.
    `received` describes what arrived (parameter NAMES only, never values) for the audit log."""
    anonymous = "unknown (SSO)"
    ip_key = f"sso-fail|{current_ip()}"
    if not raw_token:
        _fail(db, anonymous, SsoError("token", f"no token returned by CC Services ({received or 'nothing received'}); "
                                               "set SSO_TOKEN_PARAM to the right name"), ip_key)
    token_hash = _digest(raw_token.strip())
    try:
        identity = parse_identity(decrypt_token(raw_token))
        _check_fresh(identity)
    except SsoError as error:
        if error.code == "config":
            logger.error("SSO configuration problem: %s", error.reason)
        _fail(db, anonymous, error, ip_key)

    who = identity.employee_id or identity.email
    now = datetime.utcnow()
    # A token is refused a second time for as long as it would be accepted at all. A token without
    # a time never expires by itself, so it is blocked for the same window rather than for ever
    # (it would be identical at every login and lock its owner out).
    replay_window = timedelta(seconds=max_token_age() + 60)
    if db.query(SsoLogin.id).filter(SsoLogin.token_hash == token_hash,
                                    SsoLogin.created_at >= now - replay_window).first():
        _fail(db, who, SsoError("replay", "this CC Services token was already used"), ip_key)
    if identity.issued_at is None:
        logger.warning("CC Services token carries no time; replay protection is limited to %s s",
                       int(replay_window.total_seconds()))
    user = find_user(db, identity)
    if not user:
        _fail(db, who, SsoError("no_account", f"no account for '{who}' (token fields: {', '.join(identity.fields) or 'none'})"), ip_key)
    if user.status == "Invited":
        _fail(db, user, SsoError("inactive", "account not activated yet (invite pending)"))
    if user.status != "Active":
        _fail(db, user, SsoError("inactive", "account is deactivated"))
    if user.locked_until and user.locked_until > datetime.utcnow():
        _fail(db, user, SsoError("locked", "account is locked after too many wrong passwords"))

    db.query(SsoLogin).filter(SsoLogin.created_at < now - timedelta(hours=KEEP_ROWS_HOURS)).delete()
    code = secrets.token_urlsafe(32)
    db.add(SsoLogin(code_hash=_digest(code), token_hash=token_hash, user_id=user.id,
                    channel_scope=state.get("scope"), remember=bool(state.get("remember")),
                    expires_at=now + timedelta(seconds=CODE_SECONDS), created_at=now))
    db.commit()
    return code


def redeem_code(db: Session, code: str) -> tuple[User, SsoLogin]:
    """Step 4: a code works once, within 60 seconds."""
    now = datetime.utcnow()
    row = db.query(SsoLogin).filter(SsoLogin.code_hash == _digest(code or "")).first()
    if not row or row.used_at is not None or row.expires_at < now:
        raise SsoError("code", "sign-in link invalid, used or expired")
    row.used_at = now
    db.commit()
    user = db.get(User, row.user_id)
    if not user or user.status != "Active":
        raise SsoError("inactive", "account is not active")
    return user, row
