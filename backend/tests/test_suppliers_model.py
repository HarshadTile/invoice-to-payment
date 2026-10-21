from app.core.database import SessionLocal
from app.core.permissions import ADMIN_LOCKED_CAPABILITIES, CAPABILITIES, DEFAULT_ROLE_MATRIX, normalize_matrix
from app.models.supplier import Supplier, SupplierVendorCode


def test_manage_suppliers_capability_defaults():
    assert "manageSuppliers" in CAPABILITIES
    assert DEFAULT_ROLE_MATRIX["Admin"]["manageSuppliers"] is True
    assert DEFAULT_ROLE_MATRIX["Invoice Team"]["manageSuppliers"] is True
    for role in ("Approver", "Accounts", "Viewer"):
        assert DEFAULT_ROLE_MATRIX[role]["manageSuppliers"] is False
    assert "manageSuppliers" in ADMIN_LOCKED_CAPABILITIES


def test_older_saved_matrix_gains_the_new_capability():
    saved = {"Admin": {"manageUsers": True}, "Invoice Team": {}}
    cleaned = normalize_matrix(saved)
    assert cleaned["Admin"]["manageSuppliers"] is True
    assert cleaned["Invoice Team"]["manageSuppliers"] is True


def test_supplier_rows_round_trip_with_vendor_codes():
    db = SessionLocal()
    try:
        supplier = Supplier(pan="MDLTA0001A", name="Model Test", channel="msetuSrm")
        supplier.vendor_codes = [SupplierVendorCode(vendor_code="MDLT-1"), SupplierVendorCode(vendor_code="MDLT-2")]
        db.add(supplier)
        db.commit()
        loaded = db.query(Supplier).filter(Supplier.pan == "MDLTA0001A").one()
        assert loaded.status == "Invited"
        assert loaded.failed_attempts == 0
        assert sorted(c.vendor_code for c in loaded.vendor_codes) == ["MDLT-1", "MDLT-2"]
        db.delete(loaded)
        db.commit()
        assert db.query(SupplierVendorCode).filter(SupplierVendorCode.vendor_code == "MDLT-1").count() == 0
    finally:
        db.close()
