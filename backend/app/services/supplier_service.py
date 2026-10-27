"""Shared supplier logic: setup links, lock-out, and the supplier's session token.

Two kinds of supplier token exist side by side:
  * managed   - issued by the PAN + password login; `sub` is the supplier id and `scope.stamp`
                is present. Re-checked against the database on every request.
  * legacy    - issued by the original vendor-code login; `sub` is the vendor code itself and
                there is no `stamp`. Behaves exactly as it always did.
"""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.password_reset import FRONTEND_URL, link_expiry_settings
from app.core.security import create_access_token
from app.models.supplier import Supplier, SupplierSetupToken

MAX_FAILED_ATTEMPTS = 5
LOCK_MINUTES = 15
GENERIC_LOGIN_ERROR = "PAN or password is incorrect, or the account is inactive."


def vendor_codes_of(supplier: Supplier) -> list[str]:
    return sorted(code.vendor_code for code in supplier.vendor_codes)


def serialize_supplier(supplier: Supplier, created_by_name: str | None = None) -> dict:
    return {
        "id": supplier.id,
        "pan": supplier.pan,
        "name": supplier.name,
        "channel": supplier.channel,
        "status": supplier.status,
        "vendorCodes": vendor_codes_of(supplier),
        "createdBy": created_by_name,
        "createdAt": supplier.created_at.isoformat() if supplier.created_at else None,
        "locked": is_locked(supplier),
    }


def issue_setup_link(db: Session, supplier: Supplier, kind: str | None = None) -> dict:
    """Issue a single-use link with the saved duration; preserve reset type on replacement."""
    db.query(Supplier).filter(Supplier.id == supplier.id).with_for_update().one()
    previous = db.query(SupplierSetupToken).filter_by(supplier_id=supplier.id).order_by(SupplierSetupToken.id.desc()).first()
    kind = kind or (previous.link_type if previous else "invite")
    if kind not in ("invite", "reset"):
        raise HTTPException(status_code=400, detail="Invalid supplier link type.")
    field = "supplierResetLinkExpiryMinutes" if kind == "reset" else "supplierInviteLinkExpiryMinutes"
    minutes = link_expiry_settings(db)[field]
    if type(minutes) is not int or minutes not in (30, 60, 240, 720, 1440, 2880, 4320, 10080):
        raise HTTPException(status_code=400, detail="Choose an allowed link expiry between 30 minutes and 7 days.")
    db.query(SupplierSetupToken).filter(
        SupplierSetupToken.supplier_id == supplier.id, SupplierSetupToken.used == False,  # noqa: E712
    ).update({"used": True})
    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(minutes=minutes)
    db.add(SupplierSetupToken(
        token=token, supplier_id=supplier.id,
        expires_at=expires, link_type=kind,
    ))
    db.commit()
    return {
        "setupLink": f"{FRONTEND_URL}/supplier/setup?token={token}",
        "expiresAt": expires.replace(tzinfo=timezone.utc).isoformat(),
        "expiryMinutes": minutes,
        "linkType": kind,
    }


def is_locked(supplier: Supplier) -> bool:
    return bool(supplier.locked_until and supplier.locked_until > datetime.utcnow())


def register_failure(db: Session, supplier: Supplier) -> None:
    supplier.failed_attempts = (supplier.failed_attempts or 0) + 1
    if supplier.failed_attempts >= MAX_FAILED_ATTEMPTS:
        supplier.locked_until = datetime.utcnow() + timedelta(minutes=LOCK_MINUTES)
        supplier.failed_attempts = 0
    db.commit()


def clear_failures(db: Session, supplier: Supplier) -> None:
    if supplier.failed_attempts or supplier.locked_until:
        supplier.failed_attempts, supplier.locked_until = 0, None
        db.commit()


def session_stamp(supplier: Supplier) -> str:
    """Changes whenever the password does, so a reset ends every older session."""
    return hashlib.sha256((supplier.password_hash or "").encode()).hexdigest()[:16]


def build_session(supplier: Supplier) -> dict:
    codes = vendor_codes_of(supplier)
    token = create_access_token(
        subject=str(supplier.id),
        auth_type="supplier",
        scope={"pan": supplier.pan, "company": supplier.name, "stamp": session_stamp(supplier)},
    )
    return {
        "token": token,
        "auth": {
            "authType": "supplier",
            "pan": supplier.pan,
            "company": supplier.name,
            "vcodes": codes,
            "vcode": codes[0] if codes else "",
        },
    }


def is_managed_supplier_token(payload: dict) -> bool:
    return payload.get("auth_type") == "supplier" and "stamp" in (payload.get("scope") or {})


def load_active_supplier(db: Session, payload: dict) -> Supplier:
    """The supplier a managed JWT belongs to, re-checked against the database on every request."""
    try:
        supplier_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid supplier session.")
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(status_code=401, detail="Supplier account is unavailable.")
    if supplier.status != "Active":
        raise HTTPException(status_code=403, detail="This account has been deactivated.")
    if (payload.get("scope") or {}).get("stamp") != session_stamp(supplier):
        raise HTTPException(status_code=401, detail="Your session has ended. Please sign in again.")
    return supplier


def supplier_vendor_codes_from_token(db: Session, payload: dict) -> list[str] | None:
    """The vendor codes a supplier token may see, or None when the token is not a supplier's.
    A legacy token (vendor-code login) is limited to its own single vendor code, as before."""
    if payload.get("auth_type") != "supplier":
        return None
    if not is_managed_supplier_token(payload):
        return [str(payload.get("sub") or "").strip()]
    return vendor_codes_of(load_active_supplier(db, payload))
