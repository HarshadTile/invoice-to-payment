import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Union

import jwt
from dotenv import load_dotenv
from passlib.context import CryptContext

# backend/.env is gitignored and holds this machine's secrets (see .env.example).
load_dotenv(dotenv_path=Path(__file__).resolve().parents[2] / ".env")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

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

ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

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
