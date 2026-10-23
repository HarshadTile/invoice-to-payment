"""Create suppliers from the invoice data and manage their access.

Every endpoint needs an active internal user with the `manageSuppliers` capability. Paths are
named after the action so the call is obvious from the URL. No email is sent anywhere: add,
generate and reset return a setup link for the team to share with the supplier themselves."""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.v1.auth import _allowed_channels
from app.core.audit import write_audit
from app.core.database import get_db
from app.core.permissions import require_capability
from app.models.supplier import Supplier, SupplierVendorCode
from app.models.user import User
from app.services import vendor_directory
from app.services.supplier_service import issue_setup_link, serialize_supplier, vendor_codes_of

logger = logging.getLogger(__name__)
router = APIRouter()

SUPPLIER_CHANNELS = ("msetuSrm", "poPortal", "mfoxPortal")
manage_suppliers = require_capability("manageSuppliers", "You don't have permission to manage suppliers.")


class SupplierCreate(BaseModel):
    pan: str
    vendorCodes: list[str]
    channel: Optional[str] = None


class VendorCodesUpdate(BaseModel):
    vendorCodes: list[str]


def _is_admin(actor: User) -> bool:
    return actor.role == "Admin"


def _resolve_channel(actor: User, requested: Optional[str]) -> str:
    if _is_admin(actor):
        if requested is None:
            return SUPPLIER_CHANNELS[0]
        if requested not in SUPPLIER_CHANNELS:
            raise HTTPException(status_code=400, detail="Pick the channel this supplier belongs to.")
        return requested
    channels = [c for c in _allowed_channels(actor) if c in SUPPLIER_CHANNELS]
    if not channels:
        raise HTTPException(status_code=400, detail="Your account isn't assigned to a channel.")
    if len(channels) == 1:
        return channels[0]
    if requested is None:
        return channels[0]
    if requested in channels:
        return requested
    raise HTTPException(status_code=400, detail="Pick the channel this supplier belongs to.")


def _visible(db: Session, actor: User):
    query = db.query(Supplier)
    if _is_admin(actor):
        return query
    return query.filter(Supplier.channel.in_(_allowed_channels(actor)))


def _get_or_404(db: Session, actor: User, supplier_id: int) -> Supplier:
    supplier = _visible(db, actor).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found.")
    return supplier


def _creator_names(db: Session, suppliers: list[Supplier]) -> dict[int, str]:
    ids = {s.created_by for s in suppliers if s.created_by}
    return {u.id: u.name for u in db.query(User).filter(User.id.in_(ids)).all()} if ids else {}


def _resolve_codes(db: Session, pan: str, requested: list[str], supplier_id: Optional[int] = None) -> list[str]:
    """The data's spelling of each requested code, checked against the PAN and against other suppliers."""
    entry = vendor_directory.get_vendor_by_pan(pan)
    if entry is None:
        raise HTTPException(status_code=400, detail="This PAN was not found in the invoice data.")
    picked = list(dict.fromkeys(c.strip() for c in requested if c and c.strip()))
    if not picked:
        raise HTTPException(status_code=400, detail="Pick at least one vendor code.")
    resolved = []
    for code in picked:
        spelling = entry["codes"].get(code.lower())
        if spelling is None:
            raise HTTPException(status_code=400, detail=f"Vendor code {code} does not belong to PAN {entry['pan']}.")
        owner = db.query(SupplierVendorCode).filter(SupplierVendorCode.vendor_code == spelling).first()
        if owner and owner.supplier_id != supplier_id:
            holder = db.get(Supplier, owner.supplier_id)
            raise HTTPException(
                status_code=400,
                detail=f"Vendor code {spelling} is already registered (PAN {holder.pan}, {holder.channel}).",
            )
        resolved.append(spelling)
    return resolved


def _with_link(db: Session, supplier: Supplier, actor: User) -> dict:
    body = serialize_supplier(supplier, actor.name)
    body["setupLink"] = issue_setup_link(db, supplier)
    return body


@router.get("/search-vendors")
def search_vendors(
    q: str = Query(default="", max_length=100),
    db: Session = Depends(get_db),
    _: User = Depends(manage_suppliers),
):
    found = vendor_directory.search_vendors(q)
    registered = (
        {pan for (pan,) in db.query(Supplier.pan).filter(Supplier.pan.in_([f["pan"] for f in found])).all()}
        if found else set()
    )
    return [{**f, "alreadyRegistered": f["pan"] in registered} for f in found]


@router.get("/list-suppliers")
def list_suppliers(
    status: Optional[str] = None,
    search: Optional[str] = None,
    channel: Optional[str] = None,
    db: Session = Depends(get_db),
    actor: User = Depends(manage_suppliers),
):
    query = _visible(db, actor)
    if status:
        query = query.filter(Supplier.status == status)
    if channel and _is_admin(actor):
        query = query.filter(Supplier.channel == channel)
    suppliers = query.order_by(Supplier.name, Supplier.pan).all()
    needle = (search or "").strip().lower()
    if needle:
        suppliers = [
            s for s in suppliers
            if needle in s.pan.lower() or needle in (s.name or "").lower()
            or any(needle in code.lower() for code in vendor_codes_of(s))
        ]
    names = _creator_names(db, suppliers)
    return [serialize_supplier(s, names.get(s.created_by)) for s in suppliers]


@router.post("/add-supplier")
def add_supplier(body: SupplierCreate, db: Session = Depends(get_db), actor: User = Depends(manage_suppliers)):
    channel = _resolve_channel(actor, body.channel)
    pan = body.pan.strip().upper()
    if not vendor_directory.PAN_REGEX.match(pan):
        raise HTTPException(status_code=400, detail="PAN must be 10 characters like ABCDE1234F.")
    existing = db.query(Supplier).filter(Supplier.pan == pan).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"PAN {pan} is already registered ({existing.channel}).")
    codes = _resolve_codes(db, pan, body.vendorCodes)
    entry = vendor_directory.get_vendor_by_pan(pan)

    supplier = Supplier(pan=pan, name=entry["name"], channel=channel, status="Invited", created_by=actor.id)
    supplier.vendor_codes = [SupplierVendorCode(vendor_code=c) for c in codes]
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    write_audit(db, actor, "Added supplier", f"{supplier.name} (PAN {pan}), codes {', '.join(codes)}, channel {channel}")
    return _with_link(db, supplier, actor)


@router.put("/{supplier_id}/update-supplier-vendor-codes")
def update_supplier_vendor_codes(
    supplier_id: int, body: VendorCodesUpdate,
    db: Session = Depends(get_db), actor: User = Depends(manage_suppliers),
):
    supplier = _get_or_404(db, actor, supplier_id)
    wanted = _resolve_codes(db, supplier.pan, body.vendorCodes, supplier_id=supplier.id)
    # Change only the difference: the table has a unique constraint on vendor_code.
    keep = {c.lower() for c in wanted}
    for row in list(supplier.vendor_codes):
        if row.vendor_code.lower() not in keep:
            supplier.vendor_codes.remove(row)
    db.flush()
    have = {c.lower() for c in vendor_codes_of(supplier)}
    for code in wanted:
        if code.lower() not in have:
            supplier.vendor_codes.append(SupplierVendorCode(vendor_code=code))
    db.commit()
    db.refresh(supplier)
    write_audit(db, actor, "Changed supplier vendor codes", f"{supplier.name} (PAN {supplier.pan}): {', '.join(wanted)}")
    return serialize_supplier(supplier, actor.name)


@router.post("/{supplier_id}/generate-setup-link")
def generate_setup_link(supplier_id: int, db: Session = Depends(get_db), actor: User = Depends(manage_suppliers)):
    supplier = _get_or_404(db, actor, supplier_id)
    if supplier.status != "Invited":
        raise HTTPException(
            status_code=400,
            detail="This supplier has already set a password or is inactive. Use reset password instead.",
        )
    write_audit(db, actor, "Issued supplier setup link", f"{supplier.name} (PAN {supplier.pan})")
    return _with_link(db, supplier, actor)


@router.post("/{supplier_id}/reset-supplier-password")
def reset_supplier_password(supplier_id: int, db: Session = Depends(get_db), actor: User = Depends(manage_suppliers)):
    supplier = _get_or_404(db, actor, supplier_id)
    if supplier.status == "Inactive":
        raise HTTPException(status_code=400, detail="Activate this supplier first.")
    supplier.password_hash, supplier.status = None, "Invited"
    supplier.failed_attempts, supplier.locked_until = 0, None
    db.commit()
    write_audit(db, actor, "Reset supplier password", f"{supplier.name} (PAN {supplier.pan}) - new setup link issued")
    return _with_link(db, supplier, actor)


@router.post("/{supplier_id}/deactivate-supplier")
def deactivate_supplier(supplier_id: int, db: Session = Depends(get_db), actor: User = Depends(manage_suppliers)):
    supplier = _get_or_404(db, actor, supplier_id)
    supplier.status = "Inactive"
    db.commit()
    write_audit(db, actor, "Deactivated supplier", f"{supplier.name} (PAN {supplier.pan})")
    return serialize_supplier(supplier, actor.name)


@router.post("/{supplier_id}/activate-supplier")
def activate_supplier(supplier_id: int, db: Session = Depends(get_db), actor: User = Depends(manage_suppliers)):
    supplier = _get_or_404(db, actor, supplier_id)
    supplier.status = "Active" if supplier.password_hash else "Invited"
    db.commit()
    write_audit(db, actor, "Activated supplier", f"{supplier.name} (PAN {supplier.pan})")
    return serialize_supplier(supplier, actor.name)


@router.delete("/{supplier_id}/delete-supplier")
def delete_supplier(supplier_id: int, db: Session = Depends(get_db), actor: User = Depends(manage_suppliers)):
    if not _is_admin(actor):
        raise HTTPException(status_code=403, detail="Only an Admin can delete a supplier.")
    supplier = _get_or_404(db, actor, supplier_id)
    label = f"{supplier.name} (PAN {supplier.pan})"
    db.delete(supplier)
    db.commit()
    write_audit(db, actor, "Deleted supplier", label)
    return {"msg": "Supplier deleted."}
