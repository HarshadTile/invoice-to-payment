from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.database import Base, SessionLocal, engine
from app.core.security import get_password_hash
from app.main import app
from app.models.user import PasswordResetToken, User

Base.metadata.create_all(bind=engine)
client = TestClient(app)


@pytest.fixture(autouse=True)
def no_real_email(monkeypatch):
    """Every test in this file hits the real /forgot-password endpoint; never let that
    actually send mail (or depend on network/SMTP credentials being available)."""
    sent = []
    monkeypatch.setattr("app.core.password_reset.send_email", lambda to, subject, text, html=None: sent.append((to, subject, text, html)))
    return sent


def _make_user(db, username):
    user = db.query(User).filter(User.username == username).first()
    if user:
        return user
    user = User(
        username=username, password_hash=get_password_hash("OldPassw0rd!"),
        name=username.title(), email=f"{username}@example.com", role="Viewer", channel_scope="msetuSrm",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _cleanup(username):
    db = SessionLocal()
    user = db.query(User).filter(User.username == username).first()
    if user:
        db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.id).delete()
        db.delete(user)
        db.commit()
    db.close()


def _latest_token(user_id):
    db = SessionLocal()
    row = (db.query(PasswordResetToken)
           .filter(PasswordResetToken.user_id == user_id)
           .order_by(PasswordResetToken.id.desc()).first())
    db.close()
    return row


def test_forgot_password_gives_the_same_response_for_a_known_and_unknown_email(no_real_email):
    _cleanup("reset_user_1")
    db = SessionLocal()
    user = _make_user(db, "reset_user_1")
    db.close()

    known = client.post("/api/v1/auth/forgot-password", json={"email": user.email})
    unknown = client.post("/api/v1/auth/forgot-password", json={"email": "nobody-at-all@example.com"})

    assert known.status_code == 200 == unknown.status_code
    assert known.json() == unknown.json()
    assert len(no_real_email) == 1  # only the real account triggers an email

    _cleanup("reset_user_1")


def test_full_reset_flow_and_the_token_can_only_be_used_once(no_real_email):
    _cleanup("reset_user_2")
    db = SessionLocal()
    user = _make_user(db, "reset_user_2")
    user_id, email = user.id, user.email
    db.close()

    client.post("/api/v1/auth/forgot-password", json={"email": email})
    token = _latest_token(user_id).token

    too_short = client.post("/api/v1/auth/reset-password", json={"token": token, "password": "short"})
    assert too_short.status_code == 400

    ok = client.post("/api/v1/auth/reset-password", json={"token": token, "password": "BrandNewPass1!"})
    assert ok.status_code == 200

    reused = client.post("/api/v1/auth/reset-password", json={"token": token, "password": "AnotherOne1!"})
    assert reused.status_code == 400

    old_password = client.post("/api/v1/auth/login", json={"username": "reset_user_2", "password": "OldPassw0rd!"})
    assert old_password.status_code == 401

    new_password = client.post("/api/v1/auth/login", json={"username": "reset_user_2", "password": "BrandNewPass1!"})
    assert new_password.status_code == 200

    _cleanup("reset_user_2")


def test_reset_rejects_an_unknown_or_expired_token(no_real_email):
    bogus = client.post("/api/v1/auth/reset-password", json={"token": "not-a-real-token", "password": "Whatever1!"})
    assert bogus.status_code == 400

    _cleanup("reset_user_3")
    db = SessionLocal()
    user = _make_user(db, "reset_user_3")
    db.add(PasswordResetToken(
        token="already-expired-token", user_id=user.id,
        expires_at=datetime.utcnow() - timedelta(minutes=1),
    ))
    db.commit()
    db.close()

    expired = client.post("/api/v1/auth/reset-password", json={"token": "already-expired-token", "password": "Whatever1!"})
    assert expired.status_code == 400

    _cleanup("reset_user_3")


def test_a_new_request_invalidates_the_previous_outstanding_token(no_real_email):
    _cleanup("reset_user_4")
    db = SessionLocal()
    user = _make_user(db, "reset_user_4")
    user_id, email = user.id, user.email
    db.close()

    client.post("/api/v1/auth/forgot-password", json={"email": email})
    first_token = _latest_token(user_id).token

    client.post("/api/v1/auth/forgot-password", json={"email": email})
    second_token = _latest_token(user_id).token
    assert second_token != first_token

    stale = client.post("/api/v1/auth/reset-password", json={"token": first_token, "password": "Whatever1!"})
    assert stale.status_code == 400

    fresh = client.post("/api/v1/auth/reset-password", json={"token": second_token, "password": "Whatever1!"})
    assert fresh.status_code == 200

    _cleanup("reset_user_4")


def test_forgot_password_does_nothing_for_a_deactivated_account(no_real_email):
    _cleanup("reset_user_5")
    db = SessionLocal()
    user = _make_user(db, "reset_user_5")
    user.status = "Inactive"
    db.commit()
    email = user.email
    db.close()

    response = client.post("/api/v1/auth/forgot-password", json={"email": email})
    assert response.status_code == 200
    assert len(no_real_email) == 0  # no email sent, and no token created for a deactivated account

    _cleanup("reset_user_5")
