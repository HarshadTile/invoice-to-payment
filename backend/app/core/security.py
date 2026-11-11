import os
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Union

import bcrypt
import jwt
from dotenv import load_dotenv

# backend/.env is gitignored and holds this machine's secrets (see .env.example).
load_dotenv(dotenv_path=Path(__file__).resolve().parents[2] / ".env")

# Password hashing uses bcrypt directly (passlib, used before, is no longer maintained).
# Hashes are the standard $2b$ format with cost 12, exactly what passlib produced, so every
# existing password keeps working (tests/core/test_password_hashing.py proves it).
BCRYPT_ROUNDS = 12
BCRYPT_MAX_BYTES = 72
# A well-formed bcrypt hash. Anything else is rejected before bcrypt sees it: a truncated or
# corrupted value can make bcrypt's native code crash instead of simply not matching.
_BCRYPT_HASH = re.compile(r"^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$")

ALGORITHM = "HS256"
MIN_SECRET_LENGTH = 32
# The values that used to be committed in this file. Never accept them again.
_REJECTED_SECRETS = {"SUPER_SECRET_KEY_REPLACE_IN_PRODUCTION", "change-me", "secret", "changeme"}


def get_secret_key() -> str:
    """The key that signs every login token, read from JWT_SECRET_KEY.

    There is deliberately no fallback: a key that lives in the source code lets anyone who has
    the code forge an Admin login. Generate one with
        python -c "import secrets; print(secrets.token_urlsafe(48))"
    and put it in backend/.env (or the server's environment)."""
    key = os.getenv("JWT_SECRET_KEY", "").strip()
    if not key:
        raise RuntimeError("JWT_SECRET_KEY is not set. Add it to backend/.env (see .env.example).")
    if key in _REJECTED_SECRETS or len(key) < MIN_SECRET_LENGTH:
        raise RuntimeError(
            f"JWT_SECRET_KEY must be a random value of at least {MIN_SECRET_LENGTH} characters "
            "and must not be a placeholder."
        )
    return key

def _token_lifetime_minutes() -> int:
    """ACCESS_TOKEN_EXPIRE_MINUTES (default 8 hours: one working day). A stolen token is only
    useful until it expires, so keep this short; signing in again is cheap."""
    try:
        minutes = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))
    except ValueError:
        minutes = 480
    return max(5, min(minutes, 60 * 24))  # between 5 minutes and 1 day


ACCESS_TOKEN_EXPIRE_MINUTES = _token_lifetime_minutes()

def _password_bytes(password: str) -> bytes:
    # bcrypt only ever reads the first 72 bytes. passlib cut long passwords there too, so cutting
    # them the same way keeps old hashes valid (newer bcrypt releases raise instead of cutting).
    return (password or "").encode("utf-8")[:BCRYPT_MAX_BYTES]


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """True when the password matches the stored hash; False for a wrong password or an empty /
    unreadable hash (an account without a password can never be signed in to)."""
    if not isinstance(hashed_password, str) or not _BCRYPT_HASH.match(hashed_password):
        return False
    try:
        return bcrypt.checkpw(_password_bytes(plain_password), hashed_password.encode("ascii"))
    except (ValueError, TypeError, UnicodeEncodeError):
        return False


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(_password_bytes(password), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode("ascii")

def create_access_token(subject: Union[str, Any], auth_type: str, scope: dict = None, expires_delta: timedelta = None) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"exp": expire, "sub": str(subject), "auth_type": auth_type}
    if scope:
        to_encode["scope"] = scope
    encoded_jwt = jwt.encode(to_encode, get_secret_key(), algorithm=ALGORITHM)
    return encoded_jwt


def token_session_version(payload: dict) -> int:
    """The session version a token was issued with (tokens from before this existed count as 0)."""
    try:
        return int((payload.get("scope") or {}).get("sv", 0))
    except (TypeError, ValueError):
        return -1
