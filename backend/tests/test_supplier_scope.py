import pytest
from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.core.security import create_access_token
from app.main import app
from app.models.supplier import Supplier
from app.repositories.gcp_invoice import get_all_cached_invoices
from tests.supplier_helpers import free_vendor_codes, get_or_create_supplier, supplier_headers

client = TestClient(app)
PAN = "SCOPE1111A"


@pytest.fixture
def two_code_supplier():
    codes = free_vendor_codes(3)
    mine, other = codes[:2], codes[2]
    sid = get_or_create_supplier(PAN, mine, name="Scope Test Ltd")
    yield supplier_headers(sid), mine, other
    db = SessionLocal()
    db.query(Supplier).filter(Supplier.pan == PAN).delete(synchronize_session=False)
    db.commit()
    db.close()


def _codes(headers, params=""):
    items = client.get(f"/api/v1/invoices?page_size=1000{params}", headers=headers).json()["items"]
    return {i["supplier"]["vendor_code"] for i in items}


def test_supplier_sees_every_allowed_code_and_nothing_else(two_code_supplier):
    headers, mine, other = two_code_supplier
    assert _codes(headers) <= set(mine)
    assert _codes(headers, f"&vendor_code={other}") <= set(mine)  # a foreign code is ignored, never honoured
    assert _codes(headers, f"&vendor_code={mine[0]}") <= {mine[0]}


def test_summary_and_recent_are_limited_to_the_allowed_codes(two_code_supplier):
    headers, mine, other = two_code_supplier
    own_total = len(client.get("/api/v1/invoices?page_size=1000", headers=headers).json()["items"])
    assert client.get(f"/api/v1/invoices/summary?vendor_code={other}", headers=headers).json()["total"] == own_total
    for invoice in client.get("/api/v1/invoices/recent?limit=50", headers=headers).json():
        assert invoice["supplier"]["vendor_code"] in mine


def test_invoice_of_an_unallowed_code_is_not_found(two_code_supplier):
    headers, mine, other = two_code_supplier
    row = next(r for r in get_all_cached_invoices() if str(r.get("SUPPLIER")).strip() == other)
    assert client.get(f"/api/v1/invoices/{row['INV_NO']}", headers=headers).status_code == 404


def test_editing_the_code_list_applies_on_the_next_request(two_code_supplier):
    headers, mine, other = two_code_supplier
    db = SessionLocal()
    supplier = db.query(Supplier).filter(Supplier.pan == PAN).one()
    supplier.vendor_codes = [c for c in supplier.vendor_codes if c.vendor_code == mine[0]]
    db.commit()
    db.close()
    assert _codes(headers) <= {mine[0]}


def test_an_inactive_supplier_gets_nothing(two_code_supplier):
    headers, *_ = two_code_supplier
    db = SessionLocal()
    db.query(Supplier).filter(Supplier.pan == PAN).update({"status": "Inactive"})
    db.commit()
    db.close()
    assert client.get("/api/v1/invoices", headers=headers).status_code == 403
    assert client.get("/api/v1/workspace", headers=headers).status_code == 403
    assert client.get("/api/v1/tickets", headers=headers).status_code == 403


def test_tickets_listing_works_for_a_managed_supplier(two_code_supplier):
    headers, *_ = two_code_supplier
    response = client.get("/api/v1/tickets", headers=headers)
    assert response.status_code == 200


def test_a_legacy_vendor_code_token_still_sees_only_its_one_code():
    code = str(get_all_cached_invoices()[0]["SUPPLIER"]).strip()
    token = create_access_token(subject=code, auth_type="supplier", scope={"company": "Legacy"})
    legacy = {"Authorization": f"Bearer {token}"}
    assert _codes(legacy) <= {code}
    assert client.get("/api/v1/workspace", headers=legacy).status_code == 200
