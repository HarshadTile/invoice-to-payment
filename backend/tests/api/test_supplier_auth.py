from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.core.security import get_password_hash
from app.main import app
from app.models.supplier import Supplier, SupplierSetupToken
from app.repositories.srm_invoice import get_all_cached_invoices
from app.services.supplier_service import GENERIC_LOGIN_ERROR, issue_setup_link
from tests.helpers.suppliers import get_or_create_supplier, supplier_headers

client = TestClient(app)
AUTH = "/api/v1/auth"
PAN = "SAUTH1111A"
EMAIL = "sauth1111a@example.com"


@pytest.fixture(autouse=True)
def clean():
    yield
    db = SessionLocal()
    db.query(Supplier).filter(Supplier.pan.like("SAUTH%")).delete(synchronize_session=False)
    db.commit()
    db.close()


def _supplier(status="Active", password="Passw0rd!", codes=("SAUTH-V1", "SAUTH-V2")):
    return get_or_create_supplier(PAN, list(codes), name="Auth Test Ltd", status=status, password=password)


def _login(email=EMAIL, password="Passw0rd!"):
    return client.post(f"{AUTH}/supplier/login-with-password", json={"email": email, "password": password})


def _message(response):
    return response.json()["error"]["message"]


def _link_token(supplier_id):
    db = SessionLocal()
    try:
        return issue_setup_link(db, db.get(Supplier, supplier_id))["setupLink"].split("token=")[1]
    finally:
        db.close()


def test_login_success_returns_token_and_allowed_codes():
    _supplier()
    response = _login(email=EMAIL.upper())
    assert response.status_code == 200
    body = response.json()
    assert body["auth"]["authType"] == "supplier" and body["auth"]["pan"] == PAN and body["auth"]["email"] == EMAIL
    assert body["auth"]["vcodes"] == ["SAUTH-V1", "SAUTH-V2"]
    me = client.get(f"{AUTH}/me", headers={"Authorization": f"Bearer {body['token']}"})
    assert me.status_code == 200 and me.json()["auth"]["vcodes"] == ["SAUTH-V1", "SAUTH-V2"]


@pytest.mark.parametrize("case", ["wrong_password", "unknown_email", "inactive", "invited"])
def test_every_login_failure_has_the_same_message(case):
    _supplier(status={"inactive": "Inactive", "invited": "Invited"}.get(case, "Active"),
              password=None if case == "invited" else "Passw0rd!")
    response = _login(email="nobody-sauth@example.com" if case == "unknown_email" else EMAIL,
                      password="nope-nope" if case == "wrong_password" else "Passw0rd!")
    assert response.status_code == 401
    assert _message(response) == GENERIC_LOGIN_ERROR


def test_five_wrong_passwords_lock_the_account_then_it_unlocks():
    sid = _supplier()
    for _ in range(5):
        assert _login(password="wrong-pass").status_code == 401
    guess = _login(password="wrong-pass")  # a wrong guess while locked still looks generic
    assert guess.status_code == 401 and _message(guess) == GENERIC_LOGIN_ERROR
    locked = _login()  # the right password is told the account is locked, and for how long
    assert locked.status_code == 423 and "locked for 15 more minutes" in _message(locked)
    db = SessionLocal()
    db.get(Supplier, sid).locked_until = datetime.utcnow() - timedelta(minutes=1)
    db.commit()
    db.close()
    assert _login().status_code == 200


def test_a_correct_login_resets_the_failure_counter():
    sid = _supplier()
    for _ in range(4):
        _login(password="wrong-pass")
    assert _login().status_code == 200
    db = SessionLocal()
    assert db.get(Supplier, sid).failed_attempts == 0
    db.close()


def test_setup_link_check_and_completion_flow():
    sid = _supplier(status="Invited", password=None)
    token = _link_token(sid)
    check = client.get(f"{AUTH}/supplier/check-setup-link", params={"token": token})
    assert check.status_code == 200 and check.json()["name"] == "Auth Test Ltd" and "pan" not in check.json()

    short = client.post(f"{AUTH}/supplier/complete-supplier-setup", json={"token": token, "email": EMAIL, "password": "short"})
    assert short.status_code == 400
    wrong = client.post(f"{AUTH}/supplier/complete-supplier-setup", json={"token": token, "email": "someone-else@example.com", "password": "Chosen-pass1"})
    assert wrong.status_code == 400 and "doesn't match" in _message(wrong)

    done = client.post(f"{AUTH}/supplier/complete-supplier-setup", json={"token": token, "email": EMAIL.upper(), "password": "Chosen-pass1"})
    assert done.status_code == 200
    assert _login(password="Chosen-pass1").status_code == 200

    reused = client.post(f"{AUTH}/supplier/complete-supplier-setup", json={"token": token, "email": EMAIL, "password": "Another-pass1"})
    assert reused.status_code == 400
    assert client.get(f"{AUTH}/supplier/check-setup-link", params={"token": token}).status_code == 400


def test_expired_or_unknown_link_is_rejected():
    sid = _supplier(status="Invited", password=None)
    token = _link_token(sid)
    db = SessionLocal()
    db.query(SupplierSetupToken).filter(SupplierSetupToken.token == token).update({"expires_at": datetime.utcnow() - timedelta(minutes=1)})
    db.commit()
    db.close()
    assert client.get(f"{AUTH}/supplier/check-setup-link", params={"token": token}).status_code == 400
    assert client.get(f"{AUTH}/supplier/check-setup-link", params={"token": "nonsense"}).status_code == 400


def test_five_wrong_emails_on_the_setup_page_lock_the_supplier():
    sid = _supplier(status="Invited", password=None)
    token = _link_token(sid)
    for _ in range(5):
        client.post(f"{AUTH}/supplier/complete-supplier-setup", json={"token": token, "email": "someone-else@example.com", "password": "Chosen-pass1"})
    right = client.post(f"{AUTH}/supplier/complete-supplier-setup", json={"token": token, "email": EMAIL, "password": "Chosen-pass1"})
    assert right.status_code == 400 and "Too many" in _message(right)


def test_forgot_password_emails_a_reset_link_to_an_active_account(monkeypatch):
    from app.services import supplier_service
    sent = []
    monkeypatch.setattr(supplier_service, "smtp_is_configured", lambda: True)
    monkeypatch.setattr(supplier_service, "send_email", lambda to, subject, text, html=None: sent.append((to, text)))
    sid = _supplier()
    unknown = client.post(f"{AUTH}/supplier/forgot-password", json={"email": "nobody-sauth@example.com"})
    known = client.post(f"{AUTH}/supplier/forgot-password", json={"email": EMAIL})
    assert unknown.status_code == known.status_code == 200 and unknown.json() == known.json()  # never reveals accounts
    assert [to for to, _ in sent] == [EMAIL]
    token = sent[0][1].split("token=")[1].split()[0]
    assert client.get(f"{AUTH}/supplier/check-setup-link", params={"token": token}).json()["linkType"] == "reset"
    done = client.post(f"{AUTH}/supplier/complete-supplier-setup", json={"token": token, "email": EMAIL, "password": "Reset-pass-1"})
    assert done.status_code == 200
    assert _login(password="Passw0rd!").status_code == 401
    assert _login(password="Reset-pass-1").status_code == 200
    db = SessionLocal()
    assert db.get(Supplier, sid).status == "Active"
    db.close()


def test_sessions_end_when_the_supplier_is_deactivated_reset_or_deleted():
    sid = _supplier()
    headers = supplier_headers(sid)
    assert client.get(f"{AUTH}/me", headers=headers).status_code == 200

    db = SessionLocal()
    supplier = db.get(Supplier, sid)
    supplier.status = "Inactive"
    db.commit()
    assert client.get(f"{AUTH}/me", headers=headers).status_code == 403

    supplier.status, supplier.password_hash = "Active", get_password_hash("Brand-new-pass1")  # as after a reset + new setup
    db.commit()
    assert client.get(f"{AUTH}/me", headers=headers).status_code == 401  # old token's stamp no longer matches

    db.delete(supplier)
    db.commit()
    db.close()
    assert client.get(f"{AUTH}/me", headers=headers).status_code == 401


def test_the_passwordless_vendor_code_login_no_longer_exists():
    vendor_code = str(get_all_cached_invoices()[0]["SUPPLIER"]).strip()
    response = client.post(f"{AUTH}/supplier/login", json={"vcode": vendor_code, "company": "Supplier"})
    assert response.status_code in (404, 405)
    assert "token" not in response.text
