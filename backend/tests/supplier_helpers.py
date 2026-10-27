"""Helpers for tests that need a supplier row or a supplier login token."""
import hashlib

from app.core.database import SessionLocal
from app.core.security import get_password_hash
from app.models.supplier import Supplier, SupplierVendorCode
from app.repositories.gcp_invoice import get_all_cached_invoices
from app.services.supplier_service import build_session


def get_or_create_supplier(pan, codes, *, name="Test Supplier", channel="msetuSrm",
                           status="Active", password="Passw0rd!") -> int:
    """Insert a supplier directly (no validation) if its PAN isn't there yet; return its id."""
    db = SessionLocal()
    try:
        supplier = db.query(Supplier).filter(Supplier.pan == pan).first()
        if supplier:
            return supplier.id
        supplier = Supplier(
            pan=pan, name=name, channel=channel, status=status,
            password_hash=get_password_hash(password) if password else None,
        )
        supplier.vendor_codes = [SupplierVendorCode(vendor_code=c) for c in codes]
        db.add(supplier)
        db.commit()
        return supplier.id
    finally:
        db.close()


def supplier_headers(supplier_id) -> dict:
    """A valid Authorization header for that supplier (same token a real login issues)."""
    db = SessionLocal()
    try:
        supplier = db.get(Supplier, supplier_id)
        return {"Authorization": f"Bearer {build_session(supplier)['token']}"}
    finally:
        db.close()


def free_vendor_codes(count) -> list[str]:
    """`count` real vendor codes from the invoice data that no supplier owns yet."""
    db = SessionLocal()
    try:
        taken = {row.vendor_code.lower() for row in db.query(SupplierVendorCode).all()}
    finally:
        db.close()
    free = []
    for row in get_all_cached_invoices():
        code = str(row.get("SUPPLIER") or "").strip()
        if code and code.lower() not in taken and code not in free:
            free.append(code)
        if len(free) == count:
            return free
    raise AssertionError("Not enough unused vendor codes in the test data")
