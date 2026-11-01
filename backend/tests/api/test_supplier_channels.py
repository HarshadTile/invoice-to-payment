"""A supplier is scoped by vendor codes, not by channel: a vendor that invoices through both
Msetu / SRM and PO Portal sees both, and can raise a query on either."""
import pytest
from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.main import app
from app.models.supplier import Supplier
from app.repositories.srm_invoice import get_all_cached_invoices
from app.repositories.po_portal_invoice import get_all_cached_invoices as get_po_invoices
from tests.helpers.suppliers import get_or_create_supplier, supplier_headers

PAN = "SCHAN1111A"


def _codes_in_both_channels():
    """One vendor code from SRM data and one from PO Portal data (real test data)."""
    srm = next((str(r.get("SUPPLIER")).strip() for r in get_all_cached_invoices() if r.get("SUPPLIER")), None)
    po = next((str(r.get("SUPPLIER")).strip() for r in get_po_invoices() if r.get("SUPPLIER")), None)
    if not srm or not po:
        pytest.skip("Needs both SRM and PO Portal invoice data")
    return srm, po


@pytest.fixture
def two_channel_supplier():
    srm, po = _codes_in_both_channels()
    # Stored channel is SRM, as older accounts have; it must not narrow anything.
    sid = get_or_create_supplier(PAN, [srm, po] if srm != po else [srm], name="Two Channel Ltd", channel="msetuSrm")
    yield TestClient(app, headers=supplier_headers(sid)), srm, po
    db = SessionLocal()
    db.query(Supplier).filter(Supplier.pan == PAN).delete(synchronize_session=False)
    db.commit()
    db.close()


def test_a_supplier_sees_its_invoices_from_every_channel(two_channel_supplier):
    client, srm, po = two_channel_supplier
    response = client.get("/api/v1/invoices/list-invoices", params={"channel": "all", "page_size": 500})
    assert response.status_code == 200, response.text
    channels = {item["channel"] for item in response.json()["items"]}
    assert {"msetuSrm", "poPortal"} <= channels
    me = client.get("/api/v1/auth/me").json()["auth"]
    assert set(me["vcodes"]) >= {srm, po}
