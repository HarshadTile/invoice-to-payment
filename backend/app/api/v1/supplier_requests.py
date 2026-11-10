"""Supplier access requests.

A supplier asks for an account from the sign-in page (NEW_ACCOUNT, public), or an existing
supplier asks to add / remove vendor codes from their profile (CHANGE_ACCESS). The supplier
management team is notified, reviews the request with a match report against the invoice
data, corrects it if needed, and approves (the account is created / changed and the supplier
is emailed) or rejects it with a reason that is emailed to the supplier.
"""
from datetime import datetime
from typing import Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import false, func, or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.services.auth_service import allowed_channels_of
from app.api.v1.suppliers import _get_or_404, _is_admin, manage_suppliers, merge_team_codes
from app.core.audit import write_audit
from app.core.database import get_db
from app.core.email_templates import (
    supplier_access_changed_email, supplier_request_received_email, supplier_request_rejected_email,
)
from app.core.rate_limit import client_ip, rate_limit
from app.models.supplier import Supplier, SupplierAccessRequest, SupplierVendorCode
from app.models.user import User
from app.services import vendor_directory
from app.services.notification_service import add_for_supplier_account, add_for_supplier_managers
from app.services.supplier_service import (
    CHANNEL_LABEL, channels_for_codes, code_channel_map, create_supplier, normalize_email, supplier_channels, normalize_pan, resolve_codes, send_access_email, send_notice,
    serialize_supplier, set_vendor_codes, split_codes, supplier_label, vendor_codes_of,
)

router = APIRouter()

MAX_CODES = 50
REJECT_REASONS = {
    "mismatch": "the details don't match our records",
    "incomplete": "the information provided is incomplete",
    "not_in_system": "this vendor is not in our system yet",
    "other": "please see the note below",
}
CodeList = Union[list[str], str]


class AccessRequestIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    pan: str  # compulsory on a request; only the note is optional
    vendorCodes: CodeList
    note: Optional[str] = Field(default=None, max_length=1000)


class ChangeAccessIn(BaseModel):
    addCodes: CodeList = []
    removeCodes: CodeList = []
    note: str = Field(min_length=3, max_length=1000)


class ApproveIn(BaseModel):
    email: Optional[EmailStr] = None
    pan: Optional[str] = None
    vendorCodes: CodeList
    channel: Optional[str] = None
    # Added to the supplier's email, e.g. which requested codes couldn't be found.
    note: Optional[str] = Field(default=None, max_length=1000)


class RejectIn(BaseModel):
    reason: str
    message: Optional[str] = Field(default=None, max_length=1000)


def _codes_or_400(codes: CodeList, *, required: bool = True) -> list[str]:
    picked = split_codes(codes)
    if required and not picked:
        raise HTTPException(status_code=400, detail="Enter at least one vendor code.")
    if len(picked) > MAX_CODES:
        raise HTTPException(status_code=400, detail=f"Enter at most {MAX_CODES} vendor codes.")
    if any(len(code) > 32 for code in picked):
        raise HTTPException(status_code=400, detail="A vendor code is at most 32 characters.")
    return picked


def _channel_of(codes: list[str]) -> Optional[str]:
    """The channel the codes come from, when the data names exactly one."""
    channels = set()
    for code in codes:
        known = vendor_directory.get_vendor_code(code)
        if known:
            channels |= known["channels"]
    return next(iter(channels)) if len(channels) == 1 else None


def _serialize(req: SupplierAccessRequest, decided_by: Optional[str] = None) -> dict:
    return {
        "id": req.id,
        "kind": req.kind,
        "supplierId": req.supplier_id,
        "name": req.name,
        "email": req.email,
        "pan": req.pan,
        "vendorCodes": req.requested_codes or [],
        "addCodes": req.add_codes or [],
        "removeCodes": req.remove_codes or [],
        "note": req.note,
        "status": req.status,
        "channel": req.channel,
        "decisionReason": req.decision_reason,
        "decisionNote": req.decision_note,
        "decidedBy": decided_by,
        "decidedAt": req.decided_at.isoformat() if req.decided_at else None,
        "createdAt": req.created_at.isoformat() if req.created_at else None,
    }


def _request_channels(req: SupplierAccessRequest) -> list[str]:
    """The channels a request's vendor codes appear in (a vendor may be in more than one)."""
    return channels_for_codes(list(req.requested_codes or []) + list(req.add_codes or [])) or ([req.channel] if req.channel else [])


def _can_review(actor: User, req: SupplierAccessRequest) -> bool:
    """Admins review everything; a channel team reviews requests with a code in its channels,
    and requests whose codes aren't in the data at all."""
    if _is_admin(actor):
        return True
    channels = _request_channels(req)
    return not channels or bool(set(allowed_channels_of(actor)) & set(channels))


def _get_request(db: Session, actor: User, request_id: int) -> SupplierAccessRequest:
    req = db.get(SupplierAccessRequest, request_id)
    if not req or not _can_review(actor, req):
        raise HTTPException(status_code=404, detail="Request not found.")
    return req


def _pending_or_400(db: Session, req: SupplierAccessRequest) -> None:
    """A request is decided once. When two teams act together, the second is told who decided it."""
    if req.status == "Pending":
        return
    who = db.get(User, req.decided_by) if req.decided_by else None
    if who:
        where = "HQ" if who.role == "Admin" or who.channel_scope == "all" else CHANNEL_LABEL.get(who.channel_scope, who.channel_scope)
        by = f" by {who.name} ({where})"
    else:
        by = ""
    tail = " Use Edit supplier to add your codes." if req.status == "Approved" else ""
    raise HTTPException(status_code=400, detail=f"Already {req.status.lower()}{by}.{tail}")


def _lock_request(db: Session, actor: User, request_id: int) -> SupplierAccessRequest:
    """The request, locked until this decision is saved, so only one approval goes through."""
    req = _get_request(db, actor, request_id)
    db.query(SupplierAccessRequest).filter(SupplierAccessRequest.id == req.id).with_for_update().one()
    db.refresh(req)
    _pending_or_400(db, req)
    return req


def _notification_payload(req: SupplierAccessRequest) -> dict:
    return {"request_id": req.id, "name": req.name, "email": req.email, "pan": req.pan}


# ── Supplier side ──────────────────────────────────────────────────────────────

@router.post("/submit-request")
def submit_request(body: AccessRequestIn, http: Request, db: Session = Depends(get_db)):
    """Public: ask for a supplier account. The reply never says whether the PAN or codes exist
    in the data; the team sees that in its review."""
    ip = client_ip(http)
    rate_limit("supplier-request", ip, limit=5, window_seconds=3600)
    email = normalize_email(body.email)
    pan = normalize_pan(body.pan)
    if not pan:
        raise HTTPException(status_code=400, detail="Enter your PAN.")
    codes = _codes_or_400(body.vendorCodes)
    if db.query(Supplier).filter(func.lower(Supplier.email) == email).first():
        raise HTTPException(
            status_code=400,
            detail="This email already has a supplier account. Sign in, or use Forgot password.",
        )
    if db.query(SupplierAccessRequest).filter(
        SupplierAccessRequest.email == email, SupplierAccessRequest.status == "Pending",
    ).first():
        raise HTTPException(status_code=400, detail="A request from this email is already waiting for review.")

    req = SupplierAccessRequest(
        kind="NEW_ACCOUNT", name=body.name.strip(), email=email, pan=pan,
        requested_codes=codes, note=(body.note or "").strip() or None,
        status="Pending", channel=_channel_of(codes), requester_ip=ip,
    )
    db.add(req)
    db.flush()
    add_for_supplier_managers(db, channels_for_codes(codes), "SUPPLIER_ACCESS_REQUEST", _notification_payload(req))
    db.commit()
    write_audit(db, f"Supplier {email}", "Requested supplier account", f"PAN {pan or '(blank)'}, codes {', '.join(codes)}")
    send_notice(email, "We received your supplier portal access request", supplier_request_received_email(req.name, codes))
    return {"msg": "Request submitted. You'll receive an email once the Mahindra team has reviewed it."}


def _current_supplier(user: dict, db: Session) -> Supplier:
    if user["auth_type"] != "supplier" or not user.get("supplier_id"):
        raise HTTPException(status_code=403, detail="Only signed-in supplier accounts can request access changes.")
    return db.get(Supplier, user["supplier_id"])


@router.post("/request-access-change")
def request_access_change(body: ChangeAccessIn, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    supplier = _current_supplier(user, db)
    if db.query(SupplierAccessRequest).filter(
        SupplierAccessRequest.supplier_id == supplier.id, SupplierAccessRequest.status == "Pending",
    ).first():
        raise HTTPException(status_code=400, detail="You already have a request waiting for review.")
    current = vendor_codes_of(supplier)
    have = {c.lower() for c in current}
    add = [c for c in _codes_or_400(body.addCodes, required=False) if c.lower() not in have]
    remove = [c for c in current if c.lower() in {r.lower() for r in _codes_or_400(body.removeCodes, required=False)}]
    if not add and not remove:
        raise HTTPException(status_code=400, detail="Enter a vendor code to add or pick one to remove.")
    removing = {c.lower() for c in remove}
    wanted = [c for c in current if c.lower() not in removing] + add

    req = SupplierAccessRequest(
        kind="CHANGE_ACCESS", supplier_id=supplier.id, name=supplier.name, email=supplier.email or "",
        pan=supplier.pan, requested_codes=wanted, add_codes=add, remove_codes=remove,
        note=body.note.strip(), status="Pending", channel=supplier.channel,
    )
    db.add(req)
    db.flush()
    add_for_supplier_managers(db, channels_for_codes(current + add) or supplier_channels(supplier), "SUPPLIER_ACCESS_CHANGE", _notification_payload(req))
    db.commit()
    write_audit(db, f"Supplier {supplier.email}", "Requested vendor code change",
                f"add {', '.join(add) or '-'}; remove {', '.join(remove) or '-'}")
    return _serialize(req)


@router.get("/my-latest-request")
def my_latest_request(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    supplier = _current_supplier(user, db)
    req = (db.query(SupplierAccessRequest)
           .filter(SupplierAccessRequest.supplier_id == supplier.id, SupplierAccessRequest.kind == "CHANGE_ACCESS")
           .order_by(SupplierAccessRequest.id.desc()).first())
    return {"request": _serialize(req) if req else None}


# ── Supplier management team ───────────────────────────────────────────────────

@router.get("/list-requests")
def list_requests(
    status: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    actor: User = Depends(manage_suppliers),
):
    visible = [r for r in db.query(SupplierAccessRequest)
               .order_by(SupplierAccessRequest.created_at.desc(), SupplierAccessRequest.id.desc()).limit(1000).all()
               if _can_review(actor, r)]
    pending = sum(1 for r in visible if r.status == "Pending")
    rows = [r for r in visible if not status or r.status == status][:300]
    names = _user_names(db, rows)
    return {"items": [_serialize(r, names.get(r.decided_by)) for r in rows], "pendingCount": pending}


def _user_names(db: Session, rows: list[SupplierAccessRequest]) -> dict[int, str]:
    ids = {r.decided_by for r in rows if r.decided_by}
    return {u.id: u.name for u in db.query(User).filter(User.id.in_(ids)).all()} if ids else {}


@router.get("/{request_id}/request-details")
def request_details(request_id: int, db: Session = Depends(get_db), actor: User = Depends(manage_suppliers)):
    """The request plus what the invoice data says about it, for the reviewer."""
    req = _get_request(db, actor, request_id)
    checked = req.add_codes if req.kind == "CHANGE_ACCESS" else (req.requested_codes or [])
    codes = []
    for code in checked:
        known = vendor_directory.get_vendor_code(code)
        codes.append({
            "code": known["code"] if known else code,
            "found": bool(known),
            "name": known["name"] if known else "",
            "pan": known["pan"] if known else "",
            "panMatches": bool(known) and (not req.pan or not known["pan"] or known["pan"] == req.pan),
        })
    data_pans = {c["pan"] for c in codes if c["pan"]}
    pan = req.pan or (next(iter(data_pans)) if len(data_pans) == 1 else None)
    entry = vendor_directory.get_vendor_by_pan(pan) if pan else None

    code_values = [c["code"] for c in codes] + list(req.requested_codes or [])
    others = db.query(Supplier).filter(or_(
        Supplier.pan == pan if pan else false(),
        Supplier.id.in_(db.query(SupplierVendorCode.supplier_id).filter(SupplierVendorCode.vendor_code.in_(code_values))),
    )).all() if (pan or code_values) else []
    supplier = db.get(Supplier, req.supplier_id) if req.supplier_id else None
    names = _user_names(db, [req])
    return {
        "request": _serialize(req, names.get(req.decided_by)),
        "codeChecks": codes,
        "panInData": bool(entry) if req.pan else None,
        "suggestedPan": pan,
        "dataName": (entry or {}).get("name") or next((c["name"] for c in codes if c["name"]), ""),
        "panCodes": sorted(entry["codes"].values()) if entry else [],
        "existingAccounts": [serialize_supplier(s) for s in others if not supplier or s.id != supplier.id],
        "supplier": serialize_supplier(supplier) if supplier else None,
        "channels": _request_channels(req),
        # Which channel each code shown in the review belongs to, so a team sees what it may change.
        "codeChannels": code_channel_map(set(
            [c["code"] for c in codes] + (list(entry["codes"].values()) if entry else [])
            + (vendor_codes_of(supplier) if supplier else []) + list(req.requested_codes or [])
        )),
    }


@router.post("/{request_id}/approve-request")
def approve_request(request_id: int, body: ApproveIn, db: Session = Depends(get_db), actor: User = Depends(manage_suppliers)):
    req = _lock_request(db, actor, request_id)
    note = (body.note or "").strip()
    if req.kind == "CHANGE_ACCESS":
        supplier = _get_or_404(db, actor, req.supplier_id) if req.supplier_id else None
        if not supplier:
            raise HTTPException(status_code=400, detail="The supplier account for this request no longer exists.")
        db.query(Supplier).filter(Supplier.id == supplier.id).with_for_update().one()
        db.refresh(supplier)
        wanted = merge_team_codes(actor, vendor_codes_of(supplier), resolve_codes(supplier.pan, _codes_or_400(body.vendorCodes)))
        added, removed = set_vendor_codes(db, supplier, wanted)
        # No request_id in supplier payloads: the frontend opens those on the internal review page.
        add_for_supplier_account(db, supplier.id, "SUPPLIER_CODES_APPROVED", {"added": added, "removed": removed, "note": note or None})
        email_sent = send_notice(
            supplier.email, "Your vendor code access changed",
            supplier_access_changed_email(supplier.name, added, removed, vendor_codes_of(supplier), note),
        )
        detail = f"{supplier_label(supplier)}: add {', '.join(added) or '-'}; remove {', '.join(removed) or '-'}"
    else:
        pan = normalize_pan(body.pan if body.pan is not None else req.pan)
        codes = merge_team_codes(actor, [], resolve_codes(pan, _codes_or_400(body.vendorCodes)))
        supplier = create_supplier(db, actor, email=body.email or req.email, pan=pan, codes=codes, name=req.name)
        email_sent = send_access_email(db, supplier, note=note)
        detail = f"{supplier_label(supplier)}, codes {', '.join(codes)}"

    req.status, req.supplier_id = "Approved", supplier.id
    req.decision_note = note or None
    req.decided_by, req.decided_at = actor.id, datetime.utcnow()
    db.commit()
    write_audit(db, actor, "Approved supplier access request", detail)
    return {"request": _serialize(req, actor.name), "supplier": serialize_supplier(supplier, actor.name), "emailSent": email_sent}


@router.post("/{request_id}/reject-request")
def reject_request(request_id: int, body: RejectIn, db: Session = Depends(get_db), actor: User = Depends(manage_suppliers)):
    req = _lock_request(db, actor, request_id)
    if body.reason not in REJECT_REASONS:
        raise HTTPException(status_code=400, detail="Pick a reason.")
    message = (body.message or "").strip()
    if body.reason == "other" and not message:
        raise HTTPException(status_code=400, detail="Write a note for the supplier.")
    req.status, req.decision_reason, req.decision_note = "Rejected", body.reason, message or None
    req.decided_by, req.decided_at = actor.id, datetime.utcnow()
    if req.kind == "CHANGE_ACCESS" and req.supplier_id:
        add_for_supplier_account(db, req.supplier_id, "SUPPLIER_CODES_REJECTED", {
            "reason": None if body.reason == "other" else REJECT_REASONS[body.reason],
            "note": message or None,
        })
    db.commit()
    email_sent = send_notice(
        req.email, "Your supplier portal access request",
        supplier_request_rejected_email(req.name, REJECT_REASONS[body.reason], message),
    )
    write_audit(db, actor, "Rejected supplier access request", f"{req.name} ({req.email}): {body.reason}")
    return {"request": _serialize(req, actor.name), "emailSent": email_sent}
