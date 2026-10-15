import pytest

from app.core import security

PLACEHOLDER = "SUPER_SECRET_KEY_REPLACE_IN_PRODUCTION"
STRONG = "k" * 40


def test_uses_configured_secret():
    assert security.load_secret_key({"JWT_SECRET_KEY": STRONG}) == STRONG


def test_development_falls_back_to_placeholder_so_local_setups_keep_working():
    assert security.load_secret_key({}) == PLACEHOLDER


def test_production_requires_a_secret():
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        security.load_secret_key({"APP_ENV": "production"})


@pytest.mark.parametrize("weak", [PLACEHOLDER, "short", "   "])
def test_production_rejects_placeholder_and_short_secrets(weak):
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        security.load_secret_key({"APP_ENV": "production", "JWT_SECRET_KEY": weak})


def test_production_accepts_a_strong_secret():
    env = {"APP_ENV": "Production", "JWT_SECRET_KEY": STRONG}
    assert security.load_secret_key(env) == STRONG


def test_tokens_are_signed_with_the_loaded_secret():
    import jwt

    token = security.create_access_token(subject="1", auth_type="internal")
    payload = jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
    assert payload["sub"] == "1"
