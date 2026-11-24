"""Supplier password expiry: reminder 5 days before, expiry email on day 90, login blocked until reset."""
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.main import app
from app.models.audit_log import AuditLog
from app.models.supplier import Supplier
from app.services import supplier_service
from app.services.supplier_service import GENERIC_LOGIN_ERROR, PASSWORD_EXPIRED_MESSAGE, notify_password_expiry
from tests.helpers.suppliers import get_or_create_supplier

client = TestClient(app)
AUTH = "/api/v1/auth"
PAN = "SPEXP1111A"
EMAIL = "spexp1111a@example.com"
PASSWORD = "Passw0rd!"


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    monkeypatch.delenv("SUPPLIER_PASSWORD_MAX_AGE_DAYS", raising=False)
    monkeypatch.delenv("SUPPLIER_PASSWORD_REMINDER_DAYS", raising=False)
    yield
    db = SessionLocal()
    db.query(Supplier).filter(Supplier.pan.like("SPEXP%")).delete(synchronize_session=False)
    db.commit()
    db.close()


@pytest.fixture
def outbox(monkeypatch):
    sent = []
    monkeypatch.setattr(supplier_service, "smtp_is_configured", lambda: True)
    monkeypatch.setattr(supplier_service, "send_email",
                        lambda to, subject, text, html=None: sent.append({"to": to, "subject": subject, "text": text}))
    return sent


def _supplier(days_old, status="Active", **dates):
    sid = get_or_create_supplier(PAN, ["SPEXP-V1"], name="Expiry Test Ltd", status=status, password=PASSWORD)
    db = SessionLocal()
    supplier = db.get(Supplier, sid)
    supplier.password_changed_at = None if days_old is None else datetime.utcnow() - timedelta(days=days_old)
    for field, value in dates.items():
        setattr(supplier, field, value)
    db.commit()
    db.close()
    return sid


def _row(sid):
    db = SessionLocal()
    try:
        return db.get(Supplier, sid)
    finally:
        db.close()


def _login(password=PASSWORD):
    return client.post(f"{AUTH}/supplier/login-with-password", json={"email": EMAIL, "password": password})


def _message(response):
    return response.json()["error"]["message"]


def test_fresh_password_signs_in(outbox):
    _supplier(10)
    assert _login().status_code == 200
    assert outbox == []


def test_unknown_date_never_expires(outbox):
    _supplier(None)
    assert _login().status_code == 200


def test_expired_password_blocks_login_and_emails_a_reset_link(outbox):
    sid = _supplier(91)
    response = _login()
    assert response.status_code == 403 and _message(response) == PASSWORD_EXPIRED_MESSAGE
    assert len(outbox) == 1 and outbox[0]["to"] == EMAIL
    assert "has expired" in outbox[0]["subject"] and "/supplier/setup?token=" in outbox[0]["text"]
    assert _row(sid).password_expiry_notified_at is not None
    db = SessionLocal()
    try:
        assert db.query(AuditLog).filter(AuditLog.actor == f"Supplier {EMAIL}",
                                         AuditLog.detail.like("password expired%")).count() >= 1
    finally:
        db.close()


def test_expired_with_wrong_password_gets_the_generic_error(outbox):
    _supplier(91)
    response = _login(password="wrong-pass")
    assert response.status_code == 401 and _message(response) == GENERIC_LOGIN_ERROR
    assert outbox == []


def test_repeated_expired_logins_send_one_email_per_15_minutes(outbox):
    _supplier(91)
    assert _login().status_code == 403
    assert _login().status_code == 403
    assert len(outbox) == 1


def test_new_password_from_the_link_starts_a_new_period(outbox):
    sid = _supplier(91, password_reminder_sent_at=datetime.utcnow() - timedelta(days=6))
    assert _login().status_code == 403
    token = outbox[-1]["text"].split("token=")[1].split()[0]
    done = client.post(f"{AUTH}/supplier/complete-supplier-setup",
                       json={"token": token, "email": EMAIL, "password": "Chosen-pass1"})
    assert done.status_code == 200
    row = _row(sid)
    assert row.password_changed_at > datetime.utcnow() - timedelta(minutes=1)
    assert row.password_reminder_sent_at is None and row.password_expiry_notified_at is None
    assert _login(password="Chosen-pass1").status_code == 200


def test_job_sends_reminder_5_days_before_once(outbox):
    sid = _supplier(86)
    assert notify_password_expiry(SessionLocal()) == {"reminders": 1, "expired": 0}
    assert "expires in 4 days" in outbox[0]["subject"]
    assert _row(sid).password_reminder_sent_at is not None
    assert notify_password_expiry(SessionLocal()) == {"reminders": 0, "expired": 0}
    assert _login().status_code == 200  # still allowed to sign in during the reminder days


def test_job_sends_expired_email_once(outbox):
    sid = _supplier(90 + 1 / 24, password_reminder_sent_at=datetime.utcnow() - timedelta(days=5))
    assert notify_password_expiry(SessionLocal()) == {"reminders": 0, "expired": 1}
    assert "has expired" in outbox[0]["subject"]
    assert _row(sid).password_expiry_notified_at is not None
    assert notify_password_expiry(SessionLocal()) == {"reminders": 0, "expired": 0}
    assert len(outbox) == 1


@pytest.mark.parametrize("days_old,status", [(50, "Active"), (91, "Inactive")])
def test_job_skips_fresh_and_inactive_accounts(outbox, days_old, status):
    _supplier(days_old, status=status)
    assert notify_password_expiry(SessionLocal()) == {"reminders": 0, "expired": 0}
    assert outbox == []


def test_expiry_can_be_switched_off(outbox, monkeypatch):
    monkeypatch.setenv("SUPPLIER_PASSWORD_MAX_AGE_DAYS", "0")
    _supplier(400)
    assert _login().status_code == 200
    assert notify_password_expiry(SessionLocal()) == {"reminders": 0, "expired": 0}
