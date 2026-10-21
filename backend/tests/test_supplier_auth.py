from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.core.security import get_password_hash
from app.main import app
from app.models.supplier import Supplier, SupplierSetupToken
from app.repositories.gcp_invoice import get_all_cached_invoices
from app.services.supplier_service import GENERIC_LOGIN_ERROR, issue_setup_link
from tests.supplier_helpers import get_or_create_supplier, supplier_headers

client = TestClient(app)
AUTH = "/api/v1/auth"
PAN = "SAUTH1111A"


@pytest.fixture(autouse=True)
def clean():
    yield
    db = SessionLocal()
    db.query(Supplier).filter(Supplier.pan.like("SAUTH%")).delete(synchronize_session=False)
    db.commit()
    db.close()


def _supplier(status="Active", password="Passw0rd!", codes=("SAUTH-V1", "SAUTH-V2")):
    return get_or_create_supplier(PAN, list(codes), name="Auth Test Ltd", status=status, password=password)


def _login(pan=PAN, password="Passw0rd!"):
    return client.post(f"{AUTH}/supplier/login-with-password", json={"pan": pan, "password": password})


def _message(response):
    return response.json()["error"]["message"]


def _link_token(supplier_id):
    db = SessionLocal()
    try:
        return issue_setup_link(db, db.get(Supplier, supplier_id)).split("token=")[1]
    finally:
        db.close()


def test_login_success_returns_token_and_allowed_codes():
    _supplier()
    response = _login(pan=PAN.lower())
    assert response.status_code == 200
    body = response.json()
    assert body["auth"]["authType"] == "supplier" and body["auth"]["pan"] == PAN
    assert body["auth"]["vcodes"] == ["SAUTH-V1", "SAUTH-V2"]
    me = client.get(f"{AUTH}/me", headers={"Authorization": f"Bearer {body['token']}"})
    assert me.status_code == 200 and me.json()["auth"]["vcodes"] == ["SAUTH-V1", "SAUTH-V2"]


@pytest.mark.parametrize("case", ["wrong_password", "unknown_pan", "inactive", "invited"])
def test_every_login_failure_has_the_same_message(case):
    _supplier(status={"inactive": "Inactive", "invited": "Invited"}.get(case, "Active"),
              password=None if case == "invited" else "Passw0rd!")
    response = _login(pan="SAUTH9999Z" if case == "unknown_pan" else PAN,
                      password="nope-nope" if case == "wrong_password" else "Passw0rd!")
    assert response.status_code == 401
    assert _message(response) == GENERIC_LOGIN_ERROR


def test_five_wrong_passwords_lock_the_pan_then_it_unlocks():
    sid = _supplier()
    for _ in range(5):
        assert _login(password="wrong-pass").status_code == 401
    locked = _login()  # correct password, but locked: same message
    assert locked.status_code == 401 and _message(locked) == GENERIC_LOGIN_ERROR
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

    short = client.post(f"{AUTH}/supplier/complete-supplier-setup", json={"token": token, "pan": PAN, "password": "short"})
    assert short.status_code == 400
    wrong = client.post(f"{AUTH}/supplier/complete-supplier-setup", json={"token": token, "pan": "SAUTH9999Z", "password": "Chosen-pass1"})
    assert wrong.status_code == 400 and "doesn't match" in _message(wrong)

    done = client.post(f"{AUTH}/supplier/complete-supplier-setup", json={"token": token, "pan": PAN.lower(), "password": "Chosen-pass1"})
    assert done.status_code == 200
    assert _login(password="Chosen-pass1").status_code == 200

    reused = client.post(f"{AUTH}/supplier/complete-supplier-setup", json={"token": token, "pan": PAN, "password": "Another-pass1"})
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


def test_five_wrong_pans_on_the_setup_page_lock_the_supplier():
    sid = _supplier(status="Invited", password=None)
    token = _link_token(sid)
    for _ in range(5):
        client.post(f"{AUTH}/supplier/complete-supplier-setup", json={"token": token, "pan": "SAUTH9999Z", "password": "Chosen-pass1"})
    right = client.post(f"{AUTH}/supplier/complete-supplier-setup", json={"token": token, "pan": PAN, "password": "Chosen-pass1"})
    assert right.status_code == 400 and "Too many" in _message(right)


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


def test_the_original_vendor_code_login_still_works_unchanged():
    vendor_code = str(get_all_cached_invoices()[0]["SUPPLIER"]).strip()
    response = client.post(f"{AUTH}/supplier/login", json={"vcode": vendor_code, "company": "Supplier"})
    assert response.status_code == 200
    body = response.json()
    assert body["auth"]["vcode"] == vendor_code and "vcodes" not in body["auth"]
    me = client.get(f"{AUTH}/me", headers={"Authorization": f"Bearer {body['token']}"})
    assert me.status_code == 200 and me.json()["auth"]["vcode"] == vendor_code
