import pytest
from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.core.rate_limit import reset_rate_limits
from app.core.security import create_access_token, get_password_hash
from app.main import app
from app.models.supplier import Supplier, SupplierAccessRequest, SupplierSetupToken
from app.models.ticket_activity import Notification
from app.models.user import User
from app.services import supplier_service, vendor_directory
from tests.helpers.suppliers import get_or_create_supplier, supplier_headers

ROWS = [
    {"SUPPLIER": "TRQV001", "SUPPLIER_NAME": "Request Tools", "PAN_NO": "TRQPA1111A"},
    {"SUPPLIER": "TRQV002", "SUPPLIER_NAME": "Request Tools Pune", "PAN_NO": "TRQPA1111A"},
    {"SUPPLIER": "TRQV003", "SUPPLIER_NAME": "Request Tools Chennai", "PAN_NO": "TRQPA1111A"},
    {"SUPPLIER": "TRQV009", "SUPPLIER_NAME": "Panless Co", "PAN_NO": ""},
]
REQ = "/api/v1/supplier-requests"


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


ADMIN_ID = _user("sup_req_admin", "Admin", "all")
TEAM_ID = _user("sup_req_team", "Invoice Team L2", "msetuSrm")
OTHER_ID = _user("sup_req_po", "Invoice Team L2", "poPortal")


def _client(user_id, scope):
    token = create_access_token(subject=user_id, auth_type="internal", scope={"channelScope": scope})
    return TestClient(app, headers={"Authorization": f"Bearer {token}"})


admin, team, po_team = _client(ADMIN_ID, "all"), _client(TEAM_ID, "msetuSrm"), _client(OTHER_ID, "poPortal")
public = TestClient(app)


@pytest.fixture(autouse=True)
def setup(monkeypatch):
    sent = []
    monkeypatch.setattr(vendor_directory, "get_all_cached_invoices", lambda: ROWS)
    monkeypatch.setattr(vendor_directory, "get_po_invoices", lambda: [])
    monkeypatch.setattr(supplier_service, "smtp_is_configured", lambda: True)
    monkeypatch.setattr(supplier_service, "send_email", lambda to, subject, text, html=None: sent.append((to, subject, text)))
    reset_rate_limits()
    yield sent
    db = SessionLocal()
    db.query(SupplierAccessRequest).filter(SupplierAccessRequest.email.like("treq-%")).delete(synchronize_session=False)
    db.query(Supplier).filter(Supplier.email.like("treq-%")).delete(synchronize_session=False)
    db.query(Supplier).filter(Supplier.pan == "TRQPA1111A").delete(synchronize_session=False)
    db.query(Notification).filter(Notification.type.like("SUPPLIER_ACCESS_%")).delete(synchronize_session=False)
    db.commit()
    db.close()
    reset_rate_limits()


def _submit(email="treq-new@example.com", pan="TRQPA1111A", codes="TRQV001, trqv002", note="Pune plant"):
    return public.post(f"{REQ}/submit-request", json={"name": "Request Tools", "email": email, "pan": pan, "vendorCodes": codes, "note": note})


def _request_id(email="treq-new@example.com"):
    db = SessionLocal()
    try:
        return db.query(SupplierAccessRequest).filter(SupplierAccessRequest.email == email).order_by(SupplierAccessRequest.id.desc()).first().id
    finally:
        db.close()


def _message(response):
    return response.json()["error"]["message"]


def test_a_request_is_saved_acknowledged_and_notifies_the_supplier_team(setup):
    response = _submit()
    assert response.status_code == 200, response.text
    assert [to for to, *_ in setup] == ["treq-new@example.com"]  # "we received your request"
    rid = _request_id()
    # A supplier manager without Inquiry Desk access still sees the notification.
    listed = team.get("/api/v1/notifications/list-notifications").json()
    mine = [n for n in listed if n["type"] == "SUPPLIER_ACCESS_REQUEST" and n["request_id"] == rid]
    assert len(mine) == 1 and mine[0]["ticket_id"] is None
    assert any(n["request_id"] == rid for n in admin.get("/api/v1/notifications/list-notifications").json())
    # A team for another channel is not notified.
    assert not [n for n in po_team.get("/api/v1/notifications/list-notifications").json() if n["request_id"] == rid]
    requests = team.get(f"{REQ}/list-requests").json()
    assert requests["pendingCount"] >= 1 and any(r["id"] == rid for r in requests["items"])


def test_the_public_reply_is_the_same_whatever_the_data_says():
    good = _submit()
    unknown = _submit(email="treq-unknown@example.com", pan="ZZZZZ9999Z", codes="NOPE1")
    assert good.status_code == unknown.status_code == 200 and good.json() == unknown.json()


def test_duplicate_requests_and_existing_accounts_are_refused():
    assert _submit().status_code == 200
    again = _submit()
    assert again.status_code == 400 and "already waiting" in _message(again)
    get_or_create_supplier("TRQPA1111A", ["TRQV001"], email="treq-existing@example.com")
    taken = _submit(email="treq-existing@example.com")
    assert taken.status_code == 400 and "already has a supplier account" in _message(taken)
    assert public.post(f"{REQ}/submit-request", json={"name": "X", "email": "treq-x@example.com", "pan": "TRQPA1111A", "vendorCodes": ""}).status_code == 400
    assert _submit(email="treq-badpan@example.com", pan="BAD").status_code == 400


def test_review_details_show_the_match_and_approving_creates_the_account(setup):
    _submit(codes="TRQV001, NOPE1")
    rid = _request_id()
    details = team.get(f"{REQ}/{rid}/request-details").json()
    checks = {c["code"]: c for c in details["codeChecks"]}
    assert checks["TRQV001"]["found"] and checks["TRQV001"]["panMatches"] and not checks["NOPE1"]["found"]
    assert details["panCodes"] == ["TRQV001", "TRQV002", "TRQV003"] and details["dataName"] == "Request Tools"

    setup.clear()
    # The reviewer drops the unknown code and gives an extra one the supplier didn't ask for.
    approved = team.post(f"{REQ}/{rid}/approve-request", json={
        "vendorCodes": ["TRQV001", "TRQV003"], "note": "We couldn't find NOPE1 in our system. Please check it.",
    })
    assert approved.status_code == 200, approved.text
    body = approved.json()
    assert "We couldn't find NOPE1 in our system" in setup[0][2]  # the note goes into the setup email
    assert body["request"]["status"] == "Approved" and body["emailSent"] is True
    assert body["supplier"]["vendorCodes"] == ["TRQV001", "TRQV003"] and body["supplier"]["status"] == "Invited"
    assert [to for to, *_ in setup] == ["treq-new@example.com"] and "/supplier/setup?token=" in setup[0][2]
    db = SessionLocal()
    assert db.query(SupplierSetupToken).filter(SupplierSetupToken.supplier_id == body["supplier"]["id"]).count() == 1
    db.close()
    assert team.post(f"{REQ}/{rid}/approve-request", json={"vendorCodes": ["TRQV001"]}).status_code == 400


def test_a_second_location_of_the_same_pan_gets_its_own_account():
    get_or_create_supplier("TRQPA1111A", ["TRQV001", "TRQV002"], email="treq-pune@example.com")
    _submit(email="treq-chennai@example.com", codes="TRQV002, TRQV003")
    rid = _request_id("treq-chennai@example.com")
    details = team.get(f"{REQ}/{rid}/request-details").json()
    assert [a["email"] for a in details["existingAccounts"]] == ["treq-pune@example.com"]
    approved = team.post(f"{REQ}/{rid}/approve-request", json={"vendorCodes": ["TRQV002", "TRQV003"]})
    assert approved.status_code == 200, approved.text


def test_pan_is_compulsory_on_a_request_but_the_team_can_approve_a_vendor_without_one():
    refused = _submit(email="treq-nopan@example.com", pan="", codes="trqv009")
    assert refused.status_code == 400 and "Enter your PAN" in _message(refused)
    # The supplier gives a PAN; the reviewer finds the code has none in the data and approves without it.
    _submit(email="treq-nopan@example.com", pan="TRQPA1111A", codes="trqv009")
    rid = _request_id("treq-nopan@example.com")
    details = team.get(f"{REQ}/{rid}/request-details").json()
    assert details["codeChecks"][0]["found"] and not details["codeChecks"][0]["pan"]
    approved = team.post(f"{REQ}/{rid}/approve-request", json={"pan": "", "vendorCodes": ["TRQV009"]})
    assert approved.status_code == 200, approved.text
    assert approved.json()["supplier"]["pan"] is None and approved.json()["supplier"]["name"] == "Panless Co"


def test_rejecting_emails_the_reason(setup):
    _submit()
    rid = _request_id()
    setup.clear()
    assert team.post(f"{REQ}/{rid}/reject-request", json={"reason": "other"}).status_code == 400  # needs a note
    rejected = team.post(f"{REQ}/{rid}/reject-request", json={"reason": "not_in_system", "message": "Register with procurement first."})
    assert rejected.status_code == 200 and rejected.json()["request"]["status"] == "Rejected"
    (to, _, text), = setup
    assert to == "treq-new@example.com" and "not in our system yet" in text and "Register with procurement first." in text
    # Rejected: the supplier may send a corrected request.
    assert _submit().status_code == 200


def test_a_supplier_asks_to_add_and_remove_codes(setup):
    sid = get_or_create_supplier("TRQPA1111A", ["TRQV001", "TRQV002"], email="treq-change@example.com")
    supplier = TestClient(app, headers=supplier_headers(sid))
    assert supplier.post(f"{REQ}/request-access-change", json={"addCodes": "TRQV003", "note": ""}).status_code == 422
    assert supplier.post(f"{REQ}/request-access-change", json={"addCodes": "TRQV001", "note": "same"}).status_code == 400
    made = supplier.post(f"{REQ}/request-access-change", json={"addCodes": "trqv003", "removeCodes": ["TRQV002"], "note": "New plant"})
    assert made.status_code == 200, made.text
    assert made.json()["vendorCodes"] == ["TRQV001", "trqv003"]
    assert supplier.post(f"{REQ}/request-access-change", json={"addCodes": "TRQV002", "note": "again"}).status_code == 400
    assert supplier.get(f"{REQ}/my-latest-request").json()["request"]["status"] == "Pending"
    rid = made.json()["id"]
    assert any(n["type"] == "SUPPLIER_ACCESS_CHANGE" and n["request_id"] == rid
               for n in team.get("/api/v1/notifications/list-notifications").json())

    details = team.get(f"{REQ}/{rid}/request-details").json()
    assert details["supplier"]["vendorCodes"] == ["TRQV001", "TRQV002"] and details["request"]["addCodes"] == ["trqv003"]
    setup.clear()
    applied = team.post(f"{REQ}/{rid}/approve-request", json={"vendorCodes": ["TRQV001", "TRQV003"]})
    assert applied.status_code == 200 and applied.json()["supplier"]["vendorCodes"] == ["TRQV001", "TRQV003"]
    assert setup[0][0] == "treq-change@example.com" and "Added: TRQV003" in setup[0][2] and "Removed: TRQV002" in setup[0][2]


def test_only_the_supplier_team_reviews_requests():
    _submit()
    rid = _request_id()
    viewer = _client(_user("sup_req_viewer", "Invoice Team L1", "msetuSrm"), "msetuSrm")
    assert viewer.get(f"{REQ}/list-requests").status_code == 403
    assert public.get(f"{REQ}/list-requests").status_code in (401, 403)
    assert po_team.get(f"{REQ}/{rid}/request-details").status_code == 404  # another channel's request


def test_only_one_team_approves_and_the_other_is_told_who_did():
    _submit(email="treq-race@example.com")
    rid = _request_id("treq-race@example.com")
    first = team.post(f"{REQ}/{rid}/approve-request", json={"vendorCodes": ["TRQV001"]})
    assert first.status_code == 200, first.text
    second = admin.post(f"{REQ}/{rid}/approve-request", json={"vendorCodes": ["TRQV001", "TRQV002"]})
    assert second.status_code == 400
    assert _message(second) == "Already approved by sup_req_team (Msetu / SRM). Use Edit supplier to add your codes."
    assert admin.post(f"{REQ}/{rid}/reject-request", json={"reason": "mismatch"}).status_code == 400
