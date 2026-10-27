import pytest
from fastapi.testclient import TestClient

from app.core.database import Base, SessionLocal, engine
from app.core.security import create_access_token, get_password_hash
from app.main import app
from app.models.supplier import Supplier, SupplierSetupToken, SupplierVendorCode
from app.models.user import User
from app.services import vendor_directory

ROWS = [
    {"SUPPLIER": "TSTV001", "SUPPLIER_NAME": "Acme Tools", "PAN_NO": "TSTPA1111A"},
    {"SUPPLIER": "TSTV002", "SUPPLIER_NAME": "Acme Tools Pune", "PAN_NO": "TSTPA1111A"},
    {"SUPPLIER": "TSTV003", "SUPPLIER_NAME": "Bolt Works", "PAN_NO": "TSTPB2222B"},
    {"SUPPLIER": "TSTV004", "SUPPLIER_NAME": "Cog Ltd", "PAN_NO": "TSTPC3333C"},
]
BASE = "/api/v1/suppliers"


def _auth(auth_type, subject, scope=None):
    token = create_access_token(subject=subject, auth_type=auth_type, scope=scope)
    return {"Authorization": f"Bearer {token}"}


def _user(username, role, channel_scope):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if not user:
            user = User(username=username, password_hash=get_password_hash("Passw0rd!"), name=username,
                        email=f"{username}@example.com", role=role, status="Active", channel_scope=channel_scope)
            db.add(user)
            db.commit()
            db.refresh(user)
        return user.id
    finally:
        db.close()


Base.metadata.create_all(bind=engine)
admin = TestClient(app, headers=_auth("internal", _user("sup_api_admin", "Admin", "all"), {"channelScope": "all"}))
msetu = TestClient(app, headers=_auth("internal", _user("sup_api_msetu", "Invoice Team", "msetuSrm"), {"channelScope": "msetuSrm"}))
po = TestClient(app, headers=_auth("internal", _user("sup_api_po", "Invoice Team", "poPortal"), {"channelScope": "poPortal"}))
viewer = TestClient(app, headers=_auth("internal", _user("sup_api_viewer", "Viewer", "msetuSrm"), {"channelScope": "msetuSrm"}))
anonymous = TestClient(app)


@pytest.fixture(autouse=True)
def vendor_data_and_cleanup(monkeypatch):
    monkeypatch.setattr(vendor_directory, "get_all_cached_invoices", lambda: ROWS)
    yield
    db = SessionLocal()
    db.query(Supplier).filter(Supplier.pan.like("TST%")).delete(synchronize_session=False)
    db.commit()
    db.close()


def _add(client, pan="TSTPA1111A", codes=("TSTV001",), **extra):
    return client.post(f"{BASE}/add-supplier", json={"pan": pan, "vendorCodes": list(codes), **extra})


def test_search_vendors_needs_the_permission_and_groups_by_pan():
    assert anonymous.get(f"{BASE}/search-vendors?q=acme").status_code in (401, 403)
    assert viewer.get(f"{BASE}/search-vendors?q=acme").status_code == 403
    found = msetu.get(f"{BASE}/search-vendors?q=acme").json()
    assert found == [{"pan": "TSTPA1111A", "name": "Acme Tools", "vendorCodes": ["TSTV001", "TSTV002"], "alreadyRegistered": False}]
    _add(msetu)
    assert msetu.get(f"{BASE}/search-vendors?q=acme").json()[0]["alreadyRegistered"] is True


def test_add_supplier_returns_invited_supplier_and_a_setup_link():
    response = _add(msetu, codes=("TSTV001", "tstv002"))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["pan"] == "TSTPA1111A" and body["status"] == "Invited" and body["channel"] == "msetuSrm"
    assert body["vendorCodes"] == ["TSTV001", "TSTV002"]
    assert "/supplier/setup?token=" in body["setupLink"]
    listed = msetu.get(f"{BASE}/list-suppliers").json()
    assert [s["pan"] for s in listed] == ["TSTPA1111A"]
    assert "setupLink" not in listed[0]


@pytest.mark.parametrize("payload,fragment", [
    ({"pan": "BAD", "vendorCodes": ["TSTV001"]}, "PAN must be"),
    ({"pan": "ZZZZZ9999Z", "vendorCodes": ["TSTV001"]}, "not found in the invoice data"),
    ({"pan": "TSTPA1111A", "vendorCodes": []}, "at least one vendor code"),
    ({"pan": "TSTPA1111A", "vendorCodes": ["TSTV003"]}, "does not belong to PAN"),
])
def test_add_supplier_validation(payload, fragment):
    response = msetu.post(f"{BASE}/add-supplier", json=payload)
    assert response.status_code == 400 and fragment in response.json()["error"]["message"]


def test_duplicate_pan_and_duplicate_vendor_code_are_rejected():
    assert _add(msetu).status_code == 200
    again = _add(msetu, codes=("TSTV002",))
    assert again.status_code == 400 and "already registered" in again.json()["error"]["message"]
    # A vendor code held by a different supplier (inserted directly) blocks adding it elsewhere.
    db = SessionLocal()
    stub = Supplier(pan="TSTPX9999X", name="Other", channel="msetuSrm", status="Invited")
    stub.vendor_codes = [SupplierVendorCode(vendor_code="TSTV003")]
    db.add(stub)
    db.commit()
    db.close()
    clash = _add(msetu, pan="TSTPB2222B", codes=("TSTV003",))
    assert clash.status_code == 400
    assert "already registered" in clash.json()["error"]["message"] and "TSTPX9999X" in clash.json()["error"]["message"]


def test_channel_rules():
    assert _add(admin).json()["channel"] == "msetuSrm"  # HQ defaults to the primary channel
    assert _add(admin, pan="TSTPB2222B", codes=("TSTV003",), channel="poPortal").json()["channel"] == "poPortal"
    forced = _add(msetu, pan="TSTPC3333C", codes=("TSTV004",), channel="poPortal")
    assert forced.json()["channel"] == "msetuSrm"  # a one-channel team's channel is forced


def test_a_team_cannot_see_or_change_another_channels_supplier():
    supplier_id = _add(msetu).json()["id"]
    assert po.get(f"{BASE}/list-suppliers").json() == []
    assert admin.get(f"{BASE}/list-suppliers").json()[0]["id"] == supplier_id
    for method, path, body in [
        ("put", f"{supplier_id}/update-supplier-vendor-codes", {"vendorCodes": ["TSTV001"]}),
        ("post", f"{supplier_id}/generate-setup-link", None),
        ("post", f"{supplier_id}/deactivate-supplier", None),
    ]:
        response = getattr(po, method)(f"{BASE}/{path}", **({"json": body} if body else {}))
        assert response.status_code == 404


def test_update_vendor_codes_replaces_the_list_and_needs_at_least_one():
    supplier_id = _add(msetu, codes=("TSTV001",)).json()["id"]
    url = f"{BASE}/{supplier_id}/update-supplier-vendor-codes"
    updated = msetu.put(url, json={"vendorCodes": ["TSTV002"]}).json()
    assert updated["vendorCodes"] == ["TSTV002"]
    assert msetu.put(url, json={"vendorCodes": []}).status_code == 400
    assert msetu.put(url, json={"vendorCodes": ["TSTV003"]}).status_code == 400


def test_generate_setup_link_replaces_the_old_link_and_only_works_for_invited():
    created = _add(msetu).json()
    old_token = created["setupLink"].split("token=")[1]
    fresh = msetu.post(f"{BASE}/{created['id']}/generate-setup-link").json()["setupLink"]
    assert fresh.split("token=")[1] != old_token
    db = SessionLocal()
    assert db.query(SupplierSetupToken).filter(SupplierSetupToken.token == old_token).one().used is True
    supplier = db.get(Supplier, created["id"])
    supplier.status = "Active"
    db.commit()
    db.close()
    assert msetu.post(f"{BASE}/{created['id']}/generate-setup-link").status_code == 400


def test_deactivate_activate_and_reset_password():
    supplier_id = _add(msetu).json()["id"]
    assert msetu.post(f"{BASE}/{supplier_id}/deactivate-supplier").json()["status"] == "Inactive"
    assert msetu.post(f"{BASE}/{supplier_id}/reset-supplier-password").status_code == 400  # activate first
    assert msetu.post(f"{BASE}/{supplier_id}/activate-supplier").json()["status"] == "Invited"  # never set a password
    db = SessionLocal()
    supplier = db.get(Supplier, supplier_id)
    supplier.password_hash, supplier.status = get_password_hash("Passw0rd!"), "Active"
    db.commit()
    db.close()
    reset = msetu.post(f"{BASE}/{supplier_id}/reset-supplier-password").json()
    assert reset["status"] == "Invited" and "/supplier/setup?token=" in reset["setupLink"]
    db = SessionLocal()
    assert db.get(Supplier, supplier_id).password_hash is None
    db.close()


def test_only_an_admin_can_delete():
    supplier_id = _add(msetu).json()["id"]
    assert msetu.delete(f"{BASE}/{supplier_id}/delete-supplier").status_code == 403
    assert admin.delete(f"{BASE}/{supplier_id}/delete-supplier").status_code == 200
    assert admin.get(f"{BASE}/list-suppliers").json() == []


def test_list_suppliers_search_and_status_filters():
    _add(msetu)
    _add(msetu, pan="TSTPB2222B", codes=("TSTV003",))
    assert [s["pan"] for s in msetu.get(f"{BASE}/list-suppliers?search=bolt").json()] == ["TSTPB2222B"]
    assert [s["pan"] for s in msetu.get(f"{BASE}/list-suppliers?search=tstv001").json()] == ["TSTPA1111A"]
    assert msetu.get(f"{BASE}/list-suppliers?status=Active").json() == []
