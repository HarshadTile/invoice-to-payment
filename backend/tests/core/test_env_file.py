"""APP_ENV picks the settings file (.env, .env.dev, .env.uat, .env.prod); real variables always win;
the files with passwords are gitignored and only the templates are committed."""
import os
import subprocess

import pytest

from app.core import env_file


@pytest.fixture
def backend_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(env_file, "BACKEND_DIR", tmp_path)
    for name, value in {".env": "local", ".env.dev": "dev", ".env.uat": "uat", ".env.prod": "prod"}.items():
        (tmp_path / name).write_text(f"I2P_TEST_SMTP_HOST=smtp-{value}.example.com\n", encoding="utf-8")
    monkeypatch.delenv("I2P_TEST_SMTP_HOST", raising=False)
    yield tmp_path
    os.environ.pop("I2P_TEST_SMTP_HOST", None)


@pytest.mark.parametrize("app_env, expected", [
    (None, "smtp-local.example.com"), ("local", "smtp-local.example.com"), ("dev", "smtp-dev.example.com"),
    ("UAT", "smtp-uat.example.com"), ("prod", "smtp-prod.example.com"),
])
def test_app_env_picks_the_file(backend_dir, monkeypatch, app_env, expected):
    if app_env is None:
        monkeypatch.delenv("APP_ENV", raising=False)
    else:
        monkeypatch.setenv("APP_ENV", app_env)
    env_file.load_env_file()
    assert os.environ["I2P_TEST_SMTP_HOST"] == expected


def test_a_real_variable_wins_over_the_file(backend_dir, monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("I2P_TEST_SMTP_HOST", "from-secret-manager.example.com")
    env_file.load_env_file()
    assert os.environ["I2P_TEST_SMTP_HOST"] == "from-secret-manager.example.com"


def test_a_missing_file_is_fine_and_an_unknown_env_is_refused(tmp_path, monkeypatch):
    monkeypatch.setattr(env_file, "BACKEND_DIR", tmp_path)  # no files at all, as on Cloud Run
    monkeypatch.setenv("APP_ENV", "uat")
    assert env_file.load_env_file() == tmp_path / ".env.uat"
    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(RuntimeError, match="APP_ENV='production' is not known"):
        env_file.load_env_file()


def test_files_with_passwords_are_never_committed_only_templates():
    def ignored(name):
        return subprocess.run(["git", "check-ignore", "-q", name], cwd=env_file.BACKEND_DIR).returncode == 0
    for real in (".env", ".env.dev", ".env.uat", ".env.prod"):
        assert ignored(real), real
    for template in (".env.example", ".env.dev.example", ".env.uat.example", ".env.prod.example"):
        assert not ignored(template), template
        assert (env_file.BACKEND_DIR / template).exists(), template
