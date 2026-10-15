import logging
import os
from datetime import datetime, timedelta
from typing import Any, Union
import jwt
from dotenv import load_dotenv
from passlib.context import CryptContext

# The secret must be readable here even if this module is imported before app.core.database
# (which is what normally loads backend/.env).
load_dotenv()

logger = logging.getLogger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

_DEV_SECRET_KEY = "SUPER_SECRET_KEY_REPLACE_IN_PRODUCTION"
_MIN_PRODUCTION_SECRET_LENGTH = 32


def load_secret_key(environ=None) -> str:
    """The key that signs login tokens.

    Set JWT_SECRET_KEY (backend/.env or the server's environment). With APP_ENV=production the
    app refuses to start without a strong one; elsewhere it falls back to a development key so a
    fresh checkout still runs. Anyone who knows the key can create valid logins.
    """
    env = os.environ if environ is None else environ
    key = (env.get("JWT_SECRET_KEY") or "").strip()
    if env.get("APP_ENV", "").strip().lower() == "production":
        if not key or key == _DEV_SECRET_KEY or len(key) < _MIN_PRODUCTION_SECRET_LENGTH:
            raise RuntimeError(
                f"JWT_SECRET_KEY must be set to a unique secret of at least "
                f"{_MIN_PRODUCTION_SECRET_LENGTH} characters when APP_ENV=production."
            )
        return key
    if not key:
        logger.warning("JWT_SECRET_KEY is not set; using the insecure development key. Do not run like this in production.")
        return _DEV_SECRET_KEY
    return key


SECRET_KEY = load_secret_key()
ALGORITHM = "HS256"
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
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
