"""Create suppliers from invoice data and manage their accounts through SMTP."""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.services.auth_service import allowed_channels_of
from app.core.audit import write_audit
from app.core.database import get_db
from app.core.permissions import require_capability
from app.models.supplier import Supplier
from app.models.user import User
from app.services import vendor_directory
from app.services.notification_service import delete_for_supplier_account
from app.services.supplier_service import (
    CHANNEL_LABEL, channels_for_codes, code_channel_map, code_channels, supplier_channels,
    create_supplier, ensure_email_free, normalize_email, normalize_pan, resolve_codes,
    send_access_email, serialize_supplier, set_vendor_codes, supplier_label, vendor_codes_of,
)

logger = logging.getLogger(__name__)
router = APIRouter()

SUPPLIER_CHANNELS = ("msetuSrm", "poPortal", "mfoxPortal")
manage_suppliers = require_capability("manageSuppliers", "You don't have permission to manage suppliers.")


class SupplierCreate(BaseModel):
    pan: Optional[str] = None
    email: EmailStr
    vendorCodes: list[str]
    channel: Optional[str] = None


class VendorCodesUpdate(BaseModel):
    vendorCodes: list[str]


class SupplierEmailUpdate(BaseModel):
    email: EmailStr


def _is_admin(actor: User) -> bool:
    return actor.role == "Admin"


def _resolve_channel(actor: User, requested: Optional[str]) -> str:
    if _is_admin(actor):
        if requested is None:
            return SUPPLIER_CHANNELS[0]
        if requested not in SUPPLIER_CHANNELS:
            raise HTTPException(status_code=400, detail="Pick the channel this supplier belongs to.")
        return requested
    channels = [c for c in allowed_channels_of(actor) if c in SUPPLIER_CHANNELS]
    if not channels:
        raise HTTPException(status_code=400, detail="Your account isn't assigned to a channel.")
    if len(channels) == 1:
        return channels[0]
    if requested is None:
        return channels[0]
    if requested in channels:
        return requested
    raise HTTPException(status_code=400, detail="Pick the channel this supplier belongs to.")


def _visible_ids(db: Session, actor: User) -> Optional[set[int]]:
    """The supplier ids a channel team may manage (None = all, for Admin): those with a vendor
    code in one of the team's channels."""
    if _is_admin(actor):
        return None
    allowed = set(allowed_channels_of(actor))
    return {s.id for s in db.query(Supplier).all() if allowed & _team_channels_of(s)}


def _team_channels_of(supplier: Supplier) -> set[str]:
    """Channels whose team may manage this account: those of its codes, and of any other code
    its PAN has in the invoice data (so the PO Portal team can add its code to an account that
    so far only has Msetu / SRM codes)."""
    channels = set(supplier_channels(supplier))
    entry = vendor_directory.get_vendor_by_pan(supplier.pan) if supplier.pan else None
    if entry:
        channels |= set(channels_for_codes(entry["codes"].values()))
    return channels


def _visible(db: Session, actor: User):
    query = db.query(Supplier)
    ids = _visible_ids(db, actor)
    return query if ids is None else query.filter(Supplier.id.in_(ids or {-1}))


def _team_owns(actor: User, code: str) -> bool:
    """May this team tick / untick the code? Admins: any code. A channel team: codes in its own
    channels (a code in both channels belongs to both teams), and codes the data doesn't know."""
    if _is_admin(actor):
        return True
    channels = code_channels(code)
    return not channels or bool(set(allowed_channels_of(actor)) & set(channels))


def merge_team_codes(actor: User, current: list[str], wanted: list[str]) -> list[str]:
    """The account's new codes when this person saves `wanted`. An Admin's list is taken as is.
    A channel team changes only its own channel's codes: another team's codes stay exactly as
    they are, whatever the request says, so two teams can never overwrite each other."""
    if _is_admin(actor):
        return wanted
    have = {c.lower() for c in current}
    foreign = [c for c in wanted if c.lower() not in have and not _team_owns(actor, c)]
    if foreign:
        owners = sorted({CHANNEL_LABEL.get(ch, ch) for c in foreign for ch in code_channels(c)})
        raise HTTPException(
            status_code=400,
            detail=f"{', '.join(foreign)} {'is' if len(foreign) == 1 else 'are'} managed by the {' / '.join(owners)} team. Ask them or an Admin to add {'it' if len(foreign) == 1 else 'them'}.",
        )
    kept = [c for c in current if not _team_owns(actor, c)]
    mine = [c for c in wanted if _team_owns(actor, c)]
    seen, merged = set(), []
    for code in kept + mine:
        if code.lower() not in seen:
            seen.add(code.lower())
            merged.append(code)
    return merged


def _get_or_404(db: Session, actor: User, supplier_id: int) -> Supplier:
    supplier = _visible(db, actor).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found.")
    return supplier


def _creator_names(db: Session, suppliers: list[Supplier]) -> dict[int, str]:
    ids = {s.created_by for s in suppliers if s.created_by}
    return {u.id: u.name for u in db.query(User).filter(User.id.in_(ids)).all()} if ids else {}


@router.get("/search-vendors")
def search_vendors(
    q: str = Query(default="", max_length=100),
    db: Session = Depends(get_db),
    _: User = Depends(manage_suppliers),
):
    found = [{**f, "codeChannels": code_channel_map(f["vendorCodes"])} for f in vendor_directory.search_vendors(q)]
    # A PAN may have several accounts (one per location), so a registered PAN can still be
    # picked; the count lets the screen say so.
    counts: dict[str, int] = {}
    if found:
        for (pan,) in db.query(Supplier.pan).filter(Supplier.pan.in_([f["pan"] for f in found])).all():
            counts[pan] = counts.get(pan, 0) + 1
    return [{**f, "accounts": counts.get(f["pan"], 0)} for f in found]


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
    suppliers = query.order_by(Supplier.name, Supplier.pan).all()
    if channel:
        suppliers = [s for s in suppliers if channel in supplier_channels(s)]
    needle = (search or "").strip().lower()
    if needle:
        suppliers = [
            s for s in suppliers
            if needle in (s.pan or "").lower() or needle in (s.name or "").lower()
            or needle in (s.email or "").lower()
            or any(needle in code.lower() for code in vendor_codes_of(s))
        ]
    names = _creator_names(db, suppliers)
    return [serialize_supplier(s, names.get(s.created_by)) for s in suppliers]


@router.post("/add-supplier")
def add_supplier(body: SupplierCreate, db: Session = Depends(get_db), actor: User = Depends(manage_suppliers)):
    pan = normalize_pan(body.pan)
    codes = merge_team_codes(actor, [], resolve_codes(pan, body.vendorCodes))
    supplier = create_supplier(db, actor, email=body.email, pan=pan, codes=codes)
    write_audit(db, actor, "Added supplier", f"{supplier_label(supplier)}, codes {', '.join(codes)}")
    email_sent = send_access_email(db, supplier)
    return {**serialize_supplier(supplier, actor.name), "emailSent": email_sent}


@router.put("/{supplier_id}/update-supplier-email")
def update_supplier_email(
    supplier_id: int, body: SupplierEmailUpdate,
    db: Session = Depends(get_db), actor: User = Depends(manage_suppliers),
):
    supplier = _get_or_404(db, actor, supplier_id)
    previous_email = supplier.email
    email = normalize_email(body.email)
    ensure_email_free(db, email, supplier.id)
    supplier.email = email
    db.commit()
    write_audit(db, actor, "Changed supplier email", f"{supplier_label(supplier)}: {previous_email or '(none)'} -> {supplier.email}")
    return serialize_supplier(supplier, actor.name)


@router.put("/{supplier_id}/update-supplier-vendor-codes")
def update_supplier_vendor_codes(
    supplier_id: int, body: VendorCodesUpdate,
    db: Session = Depends(get_db), actor: User = Depends(manage_suppliers),
):
    supplier = _get_or_404(db, actor, supplier_id)
    # One save at a time per supplier, so two teams editing together can't lose each other's codes.
    db.query(Supplier).filter(Supplier.id == supplier.id).with_for_update().one()
    db.refresh(supplier)
    wanted = merge_team_codes(actor, vendor_codes_of(supplier), resolve_codes(supplier.pan, body.vendorCodes))
    if not wanted:
        raise HTTPException(status_code=400, detail="Pick at least one vendor code.")
    set_vendor_codes(db, supplier, wanted)
    write_audit(db, actor, "Changed supplier vendor codes", f"{supplier_label(supplier)}: {', '.join(wanted)}")
    return serialize_supplier(supplier, actor.name)


@router.post("/{supplier_id}/generate-setup-link")
def generate_setup_link(supplier_id: int, db: Session = Depends(get_db), actor: User = Depends(manage_suppliers)):
    supplier = _get_or_404(db, actor, supplier_id)
    if supplier.status != "Invited":
        raise HTTPException(
            status_code=400,
            detail="This supplier has already set a password or is inactive. Use reset password instead.",
        )
    write_audit(db, actor, "Issued supplier setup link", f"{supplier_label(supplier)}")
    return {**serialize_supplier(supplier, actor.name), "emailSent": send_access_email(db, supplier)}


@router.post("/{supplier_id}/reset-supplier-password")
def reset_supplier_password(supplier_id: int, db: Session = Depends(get_db), actor: User = Depends(manage_suppliers)):
    supplier = _get_or_404(db, actor, supplier_id)
    if supplier.status == "Inactive":
        raise HTTPException(status_code=400, detail="Activate this supplier first.")
    supplier.password_hash, supplier.status = None, "Invited"
    supplier.failed_attempts, supplier.locked_until = 0, None
    db.commit()
    write_audit(db, actor, "Reset supplier password", f"{supplier_label(supplier)} - new setup link issued")
    return {**serialize_supplier(supplier, actor.name), "emailSent": send_access_email(db, supplier, "reset")}


@router.post("/{supplier_id}/deactivate-supplier")
def deactivate_supplier(supplier_id: int, db: Session = Depends(get_db), actor: User = Depends(manage_suppliers)):
    supplier = _get_or_404(db, actor, supplier_id)
    supplier.status = "Inactive"
    db.commit()
    write_audit(db, actor, "Deactivated supplier", f"{supplier_label(supplier)}")
    return serialize_supplier(supplier, actor.name)


@router.post("/{supplier_id}/activate-supplier")
def activate_supplier(supplier_id: int, db: Session = Depends(get_db), actor: User = Depends(manage_suppliers)):
    supplier = _get_or_404(db, actor, supplier_id)
    supplier.status = "Active" if supplier.password_hash else "Invited"
    db.commit()
    write_audit(db, actor, "Activated supplier", f"{supplier_label(supplier)}")
    return serialize_supplier(supplier, actor.name)


@router.delete("/{supplier_id}/delete-supplier")
def delete_supplier(supplier_id: int, db: Session = Depends(get_db), actor: User = Depends(manage_suppliers)):
    if not _is_admin(actor):
        raise HTTPException(status_code=403, detail="Only an Admin can delete a supplier.")
    supplier = _get_or_404(db, actor, supplier_id)
    label = supplier_label(supplier)
    delete_for_supplier_account(db, supplier.id)
    db.delete(supplier)
    db.commit()
    write_audit(db, actor, "Deleted supplier", label)
    return {"msg": "Supplier deleted."}
