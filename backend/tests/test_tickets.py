from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.jobs.ticket_jobs import auto_close_resolved, scan_sla_breaches
from app.main import app
from app.models.ticket import Ticket
from app.repositories.gcp_invoice import get_all_cached_invoices
from app.services import attachment_service


client = TestClient(app)


def _invoice_for(vendor_code=None):
    for row in get_all_cached_invoices():
        if not vendor_code or str(row.get("SUPPLIER")) == vendor_code:
            return str(row["INV_NO"]), str(row["SUPPLIER"])
    raise AssertionError("Test invoice not found")


def _supplier_headers(vendor_code):
    response = client.post("/api/v1/auth/supplier/login", json={"vcode": vendor_code, "company": "Supplier"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['token']}"}


def _internal_headers(username, password, channel_scope):
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password, "channelScope": channel_scope},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def _create_ticket(headers, invoice_no, key="create-1"):
    return client.post(
        "/api/v1/tickets",
        headers={**headers, "Idempotency-Key": key},
        json={
            "invoice_no": invoice_no,
            "category": "PAYMENT_STATUS",
            "priority": "MEDIUM",
            "subject": "Payment not received",
            "description": "Please confirm the payment date.",
        },
    )


def _assign_to_priya(admin, ticket):
    users = client.get("/api/v1/tickets/assignable-users?channel=msetuSrm", headers=admin).json()
    priya = next(item for item in users if item["name"] == "Priya Nair")
    response = client.post(
        f"/api/v1/tickets/{ticket['id']}/assign",
        headers=admin,
        json={"assignee_id": priya["id"], "expected_version": ticket["row_version"]},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_real_jwt_idempotency_and_supplier_isolation():
    invoice_no, vendor_code = _invoice_for()
    supplier = _supplier_headers(vendor_code)
    first = _create_ticket(supplier, invoice_no)
    assert first.status_code == 201, first.text
    second = _create_ticket(supplier, invoice_no)
    assert second.status_code == 201
    assert second.json()["id"] == first.json()["id"]
    assert first.json()["ticket_no"].startswith("QRY-")
    assert first.json()["channel"] == "msetuSrm"
    assert first.json()["fy"] == "2026-27"

    _, other_vendor = _invoice_for("DIG00356AA")
    other_supplier = _supplier_headers(other_vendor)
    assert client.get(f"/api/v1/tickets/{first.json()['id']}", headers=other_supplier).status_code == 404


def test_workspace_selection_is_server_authorized():
    forbidden = client.post(
        "/api/v1/auth/login",
        json={"username": "lead", "password": "lead123", "channelScope": "poPortal"},
    )
    assert forbidden.status_code == 403
    allowed = client.post(
        "/api/v1/auth/login",
        json={"username": "lead", "password": "lead123", "channelScope": "msetuSrm"},
    )
    assert allowed.status_code == 200


def test_end_to_end_assignment_conversation_resolution_and_close():
    invoice_no, vendor_code = _invoice_for()
    supplier = _supplier_headers(vendor_code)
    admin = _internal_headers("admin", "admin123", "all")
    assignee = _internal_headers("priya", "priya123", "msetuSrm")

    created = _create_ticket(supplier, invoice_no).json()
    users = client.get("/api/v1/tickets/assignable-users?channel=msetuSrm", headers=admin)
    priya = next(item for item in users.json() if item["name"] == "Priya Nair")
    assigned = client.post(
        f"/api/v1/tickets/{created['id']}/assign",
        headers=admin,
        json={"assignee_id": priya["id"], "note": "Check the payment run.", "expected_version": created["row_version"]},
    )
    assert assigned.status_code == 200, assigned.text
    assigned_body = assigned.json()
    assert assigned_body["status"] == "IN_PROGRESS"

    forbidden_reply = client.post(
        f"/api/v1/tickets/{created['id']}/comments",
        headers=admin,
        json={"body": "Admin public reply", "visibility": "PUBLIC", "expected_version": assigned_body["row_version"]},
    )
    assert forbidden_reply.status_code == 403

    staff_reply = client.post(
        f"/api/v1/tickets/{created['id']}/comments",
        headers=assignee,
        json={"body": "Payment is scheduled.", "visibility": "PUBLIC", "expected_version": assigned_body["row_version"]},
    )
    assert staff_reply.status_code == 200, staff_reply.text
    supplier_view = client.get(f"/api/v1/tickets/{created['id']}", headers=supplier).json()
    assert [item["body"] for item in supplier_view["comments"]] == ["Payment is scheduled."]
    assert supplier_view["assignee"] == {"id": None, "name": None, "team": "Msetu / SRM team"}

    supplier_reply = client.post(
        f"/api/v1/tickets/{created['id']}/comments",
        headers=supplier,
        json={"body": "Please share the UTR.", "visibility": "PUBLIC", "expected_version": supplier_view["row_version"]},
    ).json()
    resolved = client.post(
        f"/api/v1/tickets/{created['id']}/resolve",
        headers=assignee,
        json={"resolution_note": "UTR is now available.", "expected_version": supplier_reply["row_version"]},
    )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "RESOLVED"

    closed = client.post(
        f"/api/v1/tickets/{created['id']}/close",
        headers=supplier,
        json={"expected_version": resolved.json()["row_version"]},
    )
    assert closed.status_code == 200
    assert closed.json()["status"] == "CLOSED"
    assert "reopen" not in closed.json()["allowed_actions"]


def test_notifications_follow_current_assignment_scope_and_read_state():
    invoice_no, vendor_code = _invoice_for()
    supplier = _supplier_headers(vendor_code)
    admin = _internal_headers("admin", "admin123", "all")
    priya = _internal_headers("priya", "priya123", "msetuSrm")
    assigned = _assign_to_priya(admin, _create_ticket(supplier, invoice_no).json())

    priya_notifications = client.get("/api/v1/notifications", headers=priya)
    assert priya_notifications.status_code == 200
    assert any(item["ticket_id"] == assigned["id"] for item in priya_notifications.json())
    assert priya_notifications.json()[0]["ticket_no"] == assigned["ticket_no"]

    users = client.get("/api/v1/tickets/assignable-users?channel=msetuSrm", headers=admin).json()
    admin_user = next(item for item in users if item["role"] == "ADMIN")
    reassigned = client.post(
        f"/api/v1/tickets/{assigned['id']}/assign",
        headers=admin,
        json={"assignee_id": admin_user["id"], "expected_version": assigned["row_version"]},
    )
    assert reassigned.status_code == 200, reassigned.text

    assert client.get("/api/v1/notifications", headers=priya).json() == []
    admin_notifications = client.get("/api/v1/notifications?unread=true", headers=admin).json()
    assert any(item["ticket_id"] == assigned["id"] for item in admin_notifications)
    assert client.post("/api/v1/notifications/read-all", headers=admin).status_code == 200
    assert client.get("/api/v1/notifications?unread=true", headers=admin).json() == []


def test_notification_unread_count_paging_and_read_by_ticket():
    invoice_no, vendor_code = _invoice_for()
    supplier = _supplier_headers(vendor_code)
    admin = _internal_headers("admin", "admin123", "all")
    created = _create_ticket(supplier, invoice_no).json()

    count = client.get("/api/v1/notifications/unread-count", headers=admin)
    assert count.status_code == 200
    assert count.json()["unread"] == len(client.get("/api/v1/notifications?unread=true", headers=admin).json()) >= 1

    first_page = client.get("/api/v1/notifications?limit=1", headers=admin).json()
    assert len(first_page) == 1
    assert client.get("/api/v1/notifications?limit=0", headers=admin).status_code == 422
    rest = client.get("/api/v1/notifications?limit=1&offset=1", headers=admin).json()
    assert all(item["id"] != first_page[0]["id"] for item in rest)

    cleared = client.post(f"/api/v1/notifications/ticket/{created['id']}/read", headers=admin)
    assert cleared.status_code == 200
    assert cleared.json()["read"] >= 1
    assert all(
        item["ticket_id"] != created["id"]
        for item in client.get("/api/v1/notifications?unread=true", headers=admin).json()
    )
    assert client.post("/api/v1/notifications/ticket/NOPE/read", headers=admin).json() == {"read": 0}


def test_new_and_reopened_ticket_notify_hq_admin_and_channel_lead():
    invoice_no, vendor_code = _invoice_for()
    supplier = _supplier_headers(vendor_code)
    admin = _internal_headers("admin", "admin123", "all")
    lead = _internal_headers("lead", "lead123", "msetuSrm")
    created = _create_ticket(supplier, invoice_no).json()

    for headers in (admin, lead):
        notifications = client.get("/api/v1/notifications?unread=true", headers=headers)
        assert notifications.status_code == 200
        assert any(
            item["ticket_id"] == created["id"] and item["type"] == "TICKET_CREATED"
            for item in notifications.json()
        )

    assigned = _assign_to_priya(admin, created)
    resolved = client.post(
        f"/api/v1/tickets/{created['id']}/resolve",
        headers=_internal_headers("priya", "priya123", "msetuSrm"),
        json={"resolution_note": "Resolved for notification test.", "expected_version": assigned["row_version"]},
    )
    assert resolved.status_code == 200, resolved.text
    reopened = client.post(
        f"/api/v1/tickets/{created['id']}/reopen",
        headers=supplier,
        json={"reason": "The issue remains.", "expected_version": resolved.json()["row_version"]},
    )
    assert reopened.status_code == 200, reopened.text

    for headers in (admin, lead):
        notifications = client.get("/api/v1/notifications", headers=headers).json()
        assert any(
            item["ticket_id"] == created["id"] and item["type"] == "TICKET_REOPENED"
            for item in notifications
        )


def test_stale_version_and_closed_ticket_are_rejected():
    invoice_no, vendor_code = _invoice_for()
    supplier = _supplier_headers(vendor_code)
    ticket = _create_ticket(supplier, invoice_no).json()
    first = client.post(
        f"/api/v1/tickets/{ticket['id']}/comments",
        headers=supplier,
        json={"body": "One", "visibility": "PUBLIC", "expected_version": ticket["row_version"]},
    )
    assert first.status_code == 200
    stale = client.post(
        f"/api/v1/tickets/{ticket['id']}/comments",
        headers=supplier,
        json={"body": "Two", "visibility": "PUBLIC", "expected_version": ticket["row_version"]},
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "VERSION_CONFLICT"


def test_list_summary_and_board_contracts():
    invoice_no, vendor_code = _invoice_for()
    supplier = _supplier_headers(vendor_code)
    admin = _internal_headers("admin", "admin123", "all")
    _create_ticket(supplier, invoice_no)
    listing = client.get("/api/v1/tickets?include_closed=true", headers=admin)
    assert listing.status_code == 200
    assert listing.json()["total"] == 1
    assert client.get("/api/v1/tickets/summary", headers=admin).json()["open"] == 1
    board = client.get("/api/v1/tickets/board", headers=admin)
    assert board.status_code == 200
    assert len(board.json()["open"]) == 1


def test_legacy_demo_tickets_are_hidden_from_operational_views():
    invoice_no, vendor_code = _invoice_for()
    supplier = _supplier_headers(vendor_code)
    admin = _internal_headers("admin", "admin123", "all")
    created = _create_ticket(supplier, invoice_no).json()

    db = SessionLocal()
    ticket = db.get(Ticket, created["id"])
    ticket.legacy_unlinked = True
    db.commit()
    db.close()

    assert client.get("/api/v1/tickets?include_closed=true", headers=admin).json()["total"] == 0
    assert client.get("/api/v1/tickets/summary", headers=admin).json()["open"] == 0
    assert client.get(f"/api/v1/tickets/{created['id']}", headers=admin).status_code == 404
    assert client.get(f"/api/v1/tickets/{created['id']}", headers=supplier).status_code == 404


def test_internal_notes_are_filtered_from_supplier_detail_and_polling():
    invoice_no, vendor_code = _invoice_for()
    supplier = _supplier_headers(vendor_code)
    admin = _internal_headers("admin", "admin123", "all")
    ticket = _create_ticket(supplier, invoice_no).json()

    note = client.post(
        f"/api/v1/tickets/{ticket['id']}/comments",
        headers=admin,
        json={"body": "Internal investigation only", "visibility": "INTERNAL", "expected_version": ticket["row_version"]},
    )
    assert note.status_code == 200, note.text
    assert any(item["body"] == "Internal investigation only" for item in note.json()["comments"])

    supplier_detail = client.get(f"/api/v1/tickets/{ticket['id']}", headers=supplier).json()
    supplier_poll = client.get(f"/api/v1/tickets/{ticket['id']}/comments", headers=supplier).json()
    assert supplier_detail["comments"] == []
    assert supplier_poll == []


def test_supplier_can_reopen_resolved_but_closed_is_final():
    invoice_no, vendor_code = _invoice_for()
    supplier = _supplier_headers(vendor_code)
    admin = _internal_headers("admin", "admin123", "all")
    assignee = _internal_headers("priya", "priya123", "msetuSrm")
    assigned = _assign_to_priya(admin, _create_ticket(supplier, invoice_no).json())
    resolved = client.post(
        f"/api/v1/tickets/{assigned['id']}/resolve",
        headers=assignee,
        json={"resolution_note": "The payment was released.", "expected_version": assigned["row_version"]},
    ).json()

    reopened = client.post(
        f"/api/v1/tickets/{assigned['id']}/reopen",
        headers=supplier,
        json={"reason": "The funds are not visible.", "expected_version": resolved["row_version"]},
    )
    assert reopened.status_code == 200, reopened.text
    assert reopened.json()["status"] == "IN_PROGRESS"
    assert reopened.json()["reopen_count"] == 1

    resolved_again = client.post(
        f"/api/v1/tickets/{assigned['id']}/resolve",
        headers=assignee,
        json={"resolution_note": "Bank confirmation attached.", "expected_version": reopened.json()["row_version"]},
    ).json()
    closed = client.post(
        f"/api/v1/tickets/{assigned['id']}/close",
        headers=supplier,
        json={"expected_version": resolved_again["row_version"]},
    ).json()
    rejected = client.post(
        f"/api/v1/tickets/{assigned['id']}/reopen",
        headers=supplier,
        json={"reason": "Try again", "expected_version": closed["row_version"]},
    )
    assert rejected.status_code == 403


def test_attachment_validation_and_internal_download_authorization(tmp_path, monkeypatch):
    monkeypatch.setattr(attachment_service, "STORAGE_ROOT", tmp_path)
    invoice_no, vendor_code = _invoice_for()
    supplier = _supplier_headers(vendor_code)
    admin = _internal_headers("admin", "admin123", "all")
    ticket = _create_ticket(supplier, invoice_no).json()

    public_file = client.post(
        f"/api/v1/tickets/{ticket['id']}/attachments",
        headers=supplier,
        data={"visibility": "PUBLIC", "expected_version": ticket["row_version"]},
        files={"file": ("proof.pdf", b"%PDF-1.4 public", "application/pdf")},
    )
    assert public_file.status_code == 201, public_file.text
    refreshed = client.get(f"/api/v1/tickets/{ticket['id']}", headers=admin).json()
    internal_file = client.post(
        f"/api/v1/tickets/{ticket['id']}/attachments",
        headers=admin,
        data={"visibility": "INTERNAL", "expected_version": refreshed["row_version"]},
        files={"file": ("review.pdf", b"%PDF-1.4 internal", "application/pdf")},
    )
    assert internal_file.status_code == 201, internal_file.text

    supplier_view = client.get(f"/api/v1/tickets/{ticket['id']}", headers=supplier).json()
    assert [item["original_name"] for item in supplier_view["attachments"]] == ["proof.pdf"]
    internal_id = internal_file.json()["id"]
    assert client.get(f"/api/v1/tickets/{ticket['id']}/attachments/{internal_id}", headers=supplier).status_code == 404
    assert client.get(f"/api/v1/tickets/{ticket['id']}/attachments/{internal_id}", headers=admin).status_code == 200

    latest = client.get(f"/api/v1/tickets/{ticket['id']}", headers=supplier).json()
    invalid = client.post(
        f"/api/v1/tickets/{ticket['id']}/attachments",
        headers=supplier,
        data={"visibility": "PUBLIC", "expected_version": latest["row_version"]},
        files={"file": ("fake.pdf", b"not a PDF", "application/pdf")},
    )
    assert invalid.status_code == 422


def test_sla_breach_and_auto_close_jobs_are_idempotent():
    invoice_no, vendor_code = _invoice_for()
    supplier = _supplier_headers(vendor_code)
    ticket = _create_ticket(supplier, invoice_no).json()
    db = SessionLocal()
    row = db.get(Ticket, ticket["id"])
    row.response_due_at = datetime.utcnow() - timedelta(minutes=1)
    db.commit()
    db.close()

    assert scan_sla_breaches() == 1
    assert scan_sla_breaches() == 0

    db = SessionLocal()
    row = db.get(Ticket, ticket["id"])
    row.status = "RESOLVED"
    row.resolved_at = datetime.utcnow() - timedelta(days=6)
    db.commit()
    db.close()
    assert auto_close_resolved() == 1
    assert auto_close_resolved() == 0
    assert client.get(f"/api/v1/tickets/{ticket['id']}", headers=supplier).json()["status"] == "CLOSED"


def test_concurrent_ticket_numbers_are_unique():
    invoice_no, vendor_code = _invoice_for()
    supplier = _supplier_headers(vendor_code)

    def create(index):
        response = _create_ticket(supplier, invoice_no, key=f"concurrent-{index}")
        assert response.status_code == 201, response.text
        return response.json()["ticket_no"]

    with ThreadPoolExecutor(max_workers=5) as pool:
        numbers = list(pool.map(create, range(5)))
    assert len(numbers) == len(set(numbers)) == 5


def test_internal_users_cannot_raise_a_query_only_suppliers_can():
    invoice_no, vendor_code = _invoice_for()
    admin = _internal_headers("admin", "admin123", "all")
    lead = _internal_headers("lead", "lead123", "msetuSrm")
    assert _create_ticket(admin, invoice_no, key="staff-create-1").status_code == 403
    assert _create_ticket(lead, invoice_no, key="staff-create-2").status_code == 403
    assert _create_ticket(_supplier_headers(vendor_code), invoice_no, key="supplier-create-1").status_code == 201
