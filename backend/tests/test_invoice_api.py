from fastapi.testclient import TestClient

from app.core.security import create_access_token
from app.main import app


def _auth(auth_type, subject, scope=None):
    token = create_access_token(subject=subject, auth_type=auth_type, scope=scope)
    return {"Authorization": f"Bearer {token}"}


anonymous = TestClient(app)
client = TestClient(app, headers=_auth("internal", 1, {"channelScope": "all"}))
supplier = TestClient(app, headers=_auth("supplier", "DIM00505AA", {"company": "Forvis Mazars LLP"}))


def test_get_invoice_by_number(): 
    response = client.get(
        "/api/v1/invoices/INV-2627000165"
    )

    assert response.status_code == 200

    data = response.json()

    assert data["invoice_number"] == "INV-2627000165"
    assert data["invoice_type"] == "Service"
    assert data["status_flag"] == "A"
    assert data["overall_status"] == "Approved"


def test_invoice_not_found():
    response = client.get(
        "/api/v1/invoices/DOES-NOT-EXIST"
    )

    assert response.status_code == 404


def test_get_invoice_list():
    response = client.get(
        "/api/v1/invoices?page=1&page_size=20"
    )

    assert response.status_code == 200

    data = response.json()

    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "page_size" in data
    assert "total_pages" in data

    assert data["page"] == 1
    assert data["page_size"] == 20
    assert len(data["items"]) <= 20


def test_invalid_page():
    response = client.get(
        "/api/v1/invoices?page=0"
    )

    assert response.status_code == 422


def test_invalid_page_size():
    # page_size is now capped at 1000 (le=1000) since data is served from
    # in-memory cache — there is no per-request disk I/O to protect.
    # Anything above 1000 should still be rejected with 422.
    response = client.get(
        "/api/v1/invoices?page_size=1001"
    )

    assert response.status_code == 422


def test_filter_by_status():
    response = client.get(
        "/api/v1/invoices"
        "?page=1&page_size=20&status=Approved"
    )

    assert response.status_code == 200

    data = response.json()

    assert data["total"] == 693
    assert data["page"] == 1
    assert data["page_size"] == 20

    for invoice in data["items"]:
        assert invoice["overall_status"] == "Approved"


def test_filter_by_vendor_code():
    response = client.get(
        "/api/v1/invoices"
        "?page=1&page_size=20"
        "&vendor_code=DIG00356AA"
    )

    assert response.status_code == 200

    data = response.json()

    assert data["total"] == 14

    for invoice in data["items"]:
        assert invoice["supplier"]["vendor_code"] == "DIG00356AA"


def test_filter_by_invoice_number():
    response = client.get(
        "/api/v1/invoices"
        "?page=1&page_size=20"
        "&invoice_number=26-27%2FIT%2F101"
    )

    assert response.status_code == 200

    data = response.json()

    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["invoice_number"] == "26-27/IT/101"


def test_internal_login_success():
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin123", "channelScope": "all"},
    )

    assert response.status_code == 200

    data = response.json()
    assert data["auth"]["authType"] == "internal"
    assert data["auth"]["username"] == "admin"

def test_invoice_endpoints_require_login():
    for path in ("/api/v1/invoices", "/api/v1/invoices/summary", "/api/v1/invoices/recent",
                 "/api/v1/invoices/INV-2627000165"):
        assert anonymous.get(path).status_code in (401, 403), path


def test_supplier_only_sees_own_vendor_code():
    # asking for someone else's vendor code must not widen the result
    data = supplier.get("/api/v1/invoices?page_size=1000&vendor_code=DIG00356AA").json()

    assert data["total"] > 0
    assert {i["supplier"]["vendor_code"] for i in data["items"]} == {"DIM00505AA"}
    assert supplier.get("/api/v1/invoices/summary?vendor_code=DIG00356AA").json()["total"] == data["total"]


def test_supplier_cannot_open_another_suppliers_invoice():
    other = client.get("/api/v1/invoices?page_size=1&vendor_code=DIG00356AA").json()["items"][0]

    response = supplier.get(f"/api/v1/invoices/{other['invoice_number']}")

    assert response.status_code == 404


def test_supplier_responses_hide_internal_approval_details():
    item = supplier.get("/api/v1/invoices?page_size=1").json()["items"][0]
    workflow = item["workflow"]

    assert workflow["pending_with"] is None
    assert workflow["accountant"] is None
    assert workflow["approver_remarks"] is None
    assert all(v is None for v in workflow["approvers"].values())
