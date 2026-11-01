import pytest
from fastapi.testclient import TestClient

from app.core.database import Base, SessionLocal, engine
from app.core.security import create_access_token, get_password_hash
from app.main import app
from app.models.supplier import Supplier, SupplierSetupToken
from app.models.user import User
from app.services import vendor_directory

ROWS = [
    {"SUPPLIER": "TSTV001", "SUPPLIER_NAME": "Acme Tools", "PAN_NO": "TSTPA1111A"},
    {"SUPPLIER": "TSTV002", "SUPPLIER_NAME": "Acme Tools Pune", "PAN_NO": "TSTPA1111A"},
    {"SUPPLIER": "TSTV003", "SUPPLIER_NAME": "Bolt Works", "PAN_NO": "TSTPB2222B"},
    {"SUPPLIER": "TSTV004", "SUPPLIER_NAME": "Cog Ltd", "PAN_NO": "TSTPC3333C"},
    {"SUPPLIER": "TSTV005", "SUPPLIER_NAME": "No Pan Traders", "PAN_NO": ""},
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
msetu = TestClient(app, headers=_auth("internal", _user("sup_api_msetu", "Invoice Team L2", "msetuSrm"), {"channelScope": "msetuSrm"}))
po = TestClient(app, headers=_auth("internal", _user("sup_api_po", "Invoice Team L2", "poPortal"), {"channelScope": "poPortal"}))
viewer = TestClient(app, headers=_auth("internal", _user("sup_api_viewer", "Invoice Team L1", "msetuSrm"), {"channelScope": "msetuSrm"}))
anonymous = TestClient(app)


@pytest.fixture(autouse=True)
def vendor_data_and_cleanup(monkeypatch):
    monkeypatch.setattr(vendor_directory, "get_all_cached_invoices", lambda: ROWS)
    monkeypatch.setattr(vendor_directory, "get_po_invoices", lambda: [])
    yield
    db = SessionLocal()
    db.query(Supplier).filter(Supplier.email.like("tst-%")).delete(synchronize_session=False)
    db.commit()
    db.close()


def _add(client, pan="TSTPA1111A", codes=("TSTV001",), email="tst-acme@example.com", **extra):
    return client.post(f"{BASE}/add-supplier", json={"pan": pan, "email": email, "vendorCodes": list(codes), **extra})


def _message(response):
    return response.json()["error"]["message"]


def test_search_vendors_needs_the_permission_and_counts_accounts_per_pan():
    assert anonymous.get(f"{BASE}/search-vendors?q=acme").status_code in (401, 403)
    assert viewer.get(f"{BASE}/search-vendors?q=acme").status_code == 403
    found = msetu.get(f"{BASE}/search-vendors?q=acme").json()
    assert found == [{"pan": "TSTPA1111A", "name": "Acme Tools", "vendorCodes": ["TSTV001", "TSTV002"],
                      "codeChannels": {"TSTV001": ["msetuSrm"], "TSTV002": ["msetuSrm"]}, "accounts": 0}]
    _add(msetu)
    assert msetu.get(f"{BASE}/search-vendors?q=acme").json()[0]["accounts"] == 1


def test_add_supplier_creates_an_invited_account_and_emails_a_setup_link():
    response = _add(msetu, codes=("TSTV001", "tstv002"), email="TST-Acme@Example.com")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["pan"] == "TSTPA1111A" and body["status"] == "Invited" and body["channel"] == "msetuSrm"
    assert body["vendorCodes"] == ["TSTV001", "TSTV002"] and body["email"] == "tst-acme@example.com"
    assert "setupLink" not in body  # links go by email, never to the screen
    db = SessionLocal()
    assert db.query(SupplierSetupToken).filter(SupplierSetupToken.supplier_id == body["id"]).count() == 1
    db.close()


@pytest.mark.parametrize("payload,fragment", [
    ({"pan": "BAD", "vendorCodes": ["TSTV001"]}, "PAN must be"),
    ({"pan": "ZZZZZ9999Z", "vendorCodes": ["TSTV001"]}, "not found in the invoice data"),
    ({"pan": "TSTPA1111A", "vendorCodes": []}, "at least one vendor code"),
    ({"pan": "TSTPA1111A", "vendorCodes": ["TSTV003"]}, "does not belong to PAN"),
    ({"pan": "", "vendorCodes": ["NOPE-1"]}, "NOPE-1 was not found"),
])
def test_add_supplier_validation(payload, fragment):
    response = msetu.post(f"{BASE}/add-supplier", json={"email": "tst-val@example.com", **payload})
    assert response.status_code == 400 and fragment in _message(response)


def test_a_pan_can_have_several_accounts_sharing_codes_but_each_email_is_unique():
    first = _add(msetu, codes=("TSTV001", "TSTV002"), email="tst-pune@example.com")
    second = _add(msetu, codes=("TSTV002",), email="tst-chennai@example.com")  # another location, shared code
    assert first.status_code == 200 and second.status_code == 200, second.text
    same_email = _add(msetu, codes=("TSTV001",), email="TST-PUNE@example.com")
    assert same_email.status_code == 400 and "already has a supplier account" in _message(same_email)


def test_a_vendor_without_a_pan_is_added_by_vendor_code():
    response = _add(msetu, pan=None, codes=("tstv005",), email="tst-nopan@example.com")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["pan"] is None and body["vendorCodes"] == ["TSTV005"] and body["name"] == "No Pan Traders"


def test_channels_follow_the_vendor_codes(monkeypatch):
    # TSTV002 also invoices through PO Portal; TSTV006 only through PO Portal.
    monkeypatch.setattr(vendor_directory, "get_po_invoices", lambda: [
        {"SUPPLIER": "TSTV002", "SUPPLIER_NAME": "Acme Tools Pune", "PAN_NO": "TSTPA1111A"},
        {"SUPPLIER": "TSTV006", "SUPPLIER_NAME": "Cog Ltd", "PAN_NO": "TSTPC3333C"},
    ])
    both = _add(admin, codes=("TSTV001", "TSTV002"), email="tst-both@example.com", channel="mfoxPortal")
    assert both.status_code == 200, both.text
    assert both.json()["channels"] == ["msetuSrm", "poPortal"]  # no channel is picked; the codes decide
    # Each channel's team sees the supplier whose codes are in its channel.
    assert any(s["email"] == "tst-both@example.com" for s in msetu.get(f"{BASE}/list-suppliers").json())
    assert any(s["email"] == "tst-both@example.com" for s in po.get(f"{BASE}/list-suppliers").json())
    # A one-channel team can't give access to codes from another channel only.
    refused = _add(msetu, pan="TSTPC3333C", codes=("TSTV006",), email="tst-cog@example.com")
    assert refused.status_code == 400 and "managed by the PO Portal team" in _message(refused)
    assert _add(po, pan="TSTPC3333C", codes=("TSTV006",), email="tst-cog@example.com").json()["channels"] == ["poPortal"]


def test_a_team_cannot_see_or_change_another_channels_supplier():
    supplier_id = _add(msetu).json()["id"]
    assert all(s["id"] != supplier_id for s in po.get(f"{BASE}/list-suppliers").json())
    assert any(s["id"] == supplier_id for s in admin.get(f"{BASE}/list-suppliers").json())
    for method, path, body in [
        ("put", f"{supplier_id}/update-supplier-vendor-codes", {"vendorCodes": ["TSTV001"]}),
        ("post", f"{supplier_id}/generate-setup-link", None),
        ("post", f"{supplier_id}/deactivate-supplier", None),
    ]:
        response = getattr(po, method)(f"{BASE}/{path}", **({"json": body} if body else {}))
        assert response.status_code == 404


def test_update_vendor_codes_and_email():
    supplier_id = _add(msetu, codes=("TSTV001",)).json()["id"]
    url = f"{BASE}/{supplier_id}/update-supplier-vendor-codes"
    assert msetu.put(url, json={"vendorCodes": ["TSTV002"]}).json()["vendorCodes"] == ["TSTV002"]
    assert msetu.put(url, json={"vendorCodes": []}).status_code == 400
    assert msetu.put(url, json={"vendorCodes": ["TSTV003"]}).status_code == 400
    _add(msetu, codes=("TSTV001",), email="tst-other@example.com")
    taken = msetu.put(f"{BASE}/{supplier_id}/update-supplier-email", json={"email": "tst-other@example.com"})
    assert taken.status_code == 400
    moved = msetu.put(f"{BASE}/{supplier_id}/update-supplier-email", json={"email": "tst-new@example.com"})
    assert moved.json()["email"] == "tst-new@example.com"


def test_generate_setup_link_replaces_the_old_link_and_only_works_for_invited():
    created = _add(msetu).json()
    db = SessionLocal()
    old = db.query(SupplierSetupToken).filter(SupplierSetupToken.supplier_id == created["id"]).one().token
    db.close()
    assert msetu.post(f"{BASE}/{created['id']}/generate-setup-link").status_code == 200
    db = SessionLocal()
    assert db.query(SupplierSetupToken).filter(SupplierSetupToken.token == old).one().used is True
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
    assert msetu.post(f"{BASE}/{supplier_id}/reset-supplier-password").json()["status"] == "Invited"
    db = SessionLocal()
    assert db.get(Supplier, supplier_id).password_hash is None
    db.close()


def test_only_an_admin_can_delete():
    supplier_id = _add(msetu).json()["id"]
    assert msetu.delete(f"{BASE}/{supplier_id}/delete-supplier").status_code == 403
    assert admin.delete(f"{BASE}/{supplier_id}/delete-supplier").status_code == 200
    assert all(s["id"] != supplier_id for s in admin.get(f"{BASE}/list-suppliers").json())


def test_list_suppliers_search_and_status_filters():
    _add(msetu)
    _add(msetu, pan="TSTPB2222B", codes=("TSTV003",), email="tst-bolt@example.com")
    assert [s["pan"] for s in msetu.get(f"{BASE}/list-suppliers?search=bolt").json()] == ["TSTPB2222B"]
    assert [s["pan"] for s in msetu.get(f"{BASE}/list-suppliers?search=tstv001").json()] == ["TSTPA1111A"]
    assert [s["email"] for s in msetu.get(f"{BASE}/list-suppliers?search=tst-bolt").json()] == ["tst-bolt@example.com"]
    assert not [s for s in msetu.get(f"{BASE}/list-suppliers?status=Active").json() if s["email"].startswith("tst-")]


def test_each_team_changes_only_its_own_channels_codes(monkeypatch):
    # TSTV001 is SRM only; TSTV002 is in both channels; TSTV006 is PO Portal only.
    monkeypatch.setattr(vendor_directory, "get_po_invoices", lambda: [
        {"SUPPLIER": "TSTV002", "SUPPLIER_NAME": "Acme Tools Pune", "PAN_NO": "TSTPA1111A"},
        {"SUPPLIER": "TSTV006", "SUPPLIER_NAME": "Acme Tools PO", "PAN_NO": "TSTPA1111A"},
    ])
    supplier_id = _add(msetu, codes=("TSTV001",), email="tst-teams@example.com").json()["id"]
    url = f"{BASE}/{supplier_id}/update-supplier-vendor-codes"
    # The PO Portal team adds its code; it sends only what it sees as its own, SRM's code stays.
    added = po.put(url, json={"vendorCodes": ["TSTV006"]})
    assert added.status_code == 200, added.text
    assert added.json()["vendorCodes"] == ["TSTV001", "TSTV006"]
    assert added.json()["codeChannels"]["TSTV006"] == ["poPortal"]
    # The SRM team saves an older list without the PO code: the PO code is not removed.
    stale = msetu.put(url, json={"vendorCodes": ["TSTV001", "TSTV002"]})
    assert stale.json()["vendorCodes"] == ["TSTV001", "TSTV002", "TSTV006"]
    # Neither team can add the other's code; a code in both channels belongs to both teams.
    refused = msetu.put(url, json={"vendorCodes": ["TSTV001", "TSTV002"]})
    assert refused.status_code == 200
    assert po.put(url, json={"vendorCodes": ["TSTV006"]}).json()["vendorCodes"] == ["TSTV001", "TSTV006"]  # PO removed TSTV002
    # An Admin's list is taken as it is.
    assert admin.put(url, json={"vendorCodes": ["TSTV006"]}).json()["vendorCodes"] == ["TSTV006"]
