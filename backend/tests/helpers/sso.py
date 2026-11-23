"""A stand-in for CC Services in tests: builds encrypted tokens the way the legacy contract does
(AES-ECB, PKCS#7 padding, base64) with a test-only key, and switches SSO on for one test."""
import base64
import json
from datetime import datetime, timezone

from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

TEST_KEY = "0123456789abcdef0123456789abcdef"  # 32 bytes, test only
LOGIN_URL = "https://cc.example.test/auth/login?id=test-app&env=DEV"
FRONTEND = "http://localhost:5173"


def enable_sso(monkeypatch, **extra):
    settings = {
        "SSO_ENABLED": "true",
        "SSO_LOGIN_URL": LOGIN_URL,
        "SSO_CC_SERVICES_LEGACY_ENABLED": "true",
        "SSO_TOKEN_DECRYPT_SECRET": TEST_KEY,
        "SSO_TOKEN_KEY_ENCODING": "utf8",
        "SSO_STATE_PARAM": "",
        "FRONTEND_URL": FRONTEND,
    }
    settings.update(extra)
    for name, value in settings.items():
        monkeypatch.setenv(name, value)


def encrypt(plain: str, key: str = TEST_KEY) -> str:
    padder = padding.PKCS7(128).padder()
    data = padder.update(plain.encode("utf-8")) + padder.finalize()
    encryptor = Cipher(algorithms.AES(key.encode("utf-8")), modes.ECB()).encryptor()
    return base64.b64encode(encryptor.update(data) + encryptor.finalize()).decode("ascii")


def cc_token(employee_id=None, email=None, issued_at=None, key: str = TEST_KEY) -> str:
    payload = {}
    if employee_id:
        payload["employeeId"] = employee_id
    if email:
        payload["email"] = email
    stamp = issued_at or datetime.now(timezone.utc)
    payload["timestamp"] = int(stamp.timestamp())
    return encrypt(json.dumps(payload), key)
