"""Shared supplier logic: setup links, lock-out, and the supplier's session token.

A supplier token is issued only by the email + password login: `sub` is the supplier id and
`scope.stamp` is present. It is re-checked against the database on every request. (The old
passwordless vendor-code login and its tokens were removed; such a token is rejected.)
"""
import hashlib
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.email import is_configured as smtp_is_configured, send_email
from app.core.email_templates import supplier_access_email
from app.core.password_reset import FRONTEND_URL, link_expiry_settings
from app.core.security import create_access_token
from app.models.supplier import Supplier, SupplierSetupToken, SupplierVendorCode
from app.services import vendor_directory
from app.services.notification_service import add_for_supplier_account

logger = logging.getLogger(__name__)

MAX_FAILED_ATTEMPTS = 5
LOCK_MINUTES = 15
GENERIC_LOGIN_ERROR = "Email or password is incorrect, or the account is inactive."


def vendor_codes_of(supplier: Supplier) -> list[str]:
    return sorted(code.vendor_code for code in supplier.vendor_codes)


CHANNEL_ORDER = ("msetuSrm", "poPortal", "mfoxPortal")
CHANNEL_LABEL = {"msetuSrm": "Msetu / SRM", "poPortal": "PO Portal", "mfoxPortal": "MFOX Portal"}


def code_channels(code: str) -> list[str]:
    """The channels one vendor code appears in (empty when the data doesn't know it)."""
    known = vendor_directory.get_vendor_code(code)
    return [c for c in CHANNEL_ORDER if known and c in known["channels"]]


def code_channel_map(codes) -> dict[str, list[str]]:
    return {code: code_channels(code) for code in codes}


def channels_for_codes(codes) -> list[str]:
    """The channels these vendor codes appear in, in the invoice data (in a fixed order)."""
    found = set()
    for code in codes:
        known = vendor_directory.get_vendor_code(code)
        if known:
            found |= known["channels"]
    return [c for c in CHANNEL_ORDER if c in found]


def supplier_channels(supplier: Supplier) -> list[str]:
    """A supplier's channels come from its vendor codes; the stored value is only a fallback
    for codes the invoice data no longer has."""
    return channels_for_codes(vendor_codes_of(supplier)) or ([supplier.channel] if supplier.channel else [])


def supplier_label(supplier: Supplier) -> str:
    """How audit entries name an account: "Acme Tools (acme@x.com, PAN ABCDE1234F)"."""
    parts = [p for p in (supplier.email, f"PAN {supplier.pan}" if supplier.pan else None) if p]
    return f"{supplier.name} ({', '.join(parts)})" if parts else supplier.name


def normalize_email(email) -> str:
    return str(email or "").strip().lower()


def normalize_pan(pan) -> str | None:
    """Upper-cased PAN, or None when blank. A PAN that is given must look like ABCDE1234F."""
    value = str(pan or "").strip().upper()
    if not value:
        return None
    if not vendor_directory.PAN_REGEX.match(value):
        raise HTTPException(status_code=400, detail="PAN must be 10 characters like ABCDE1234F.")
    return value


def split_codes(codes) -> list[str]:
    """Codes from a list or a comma / space separated string, trimmed and de-duplicated."""
    if isinstance(codes, str):
        codes = re.split(r"[,;\s]+", codes)
    seen, result = set(), []
    for code in codes or []:
        code = str(code or "").strip()
        if code and code.lower() not in seen:
            seen.add(code.lower())
            result.append(code)
    return result


def resolve_codes(pan: str | None, requested) -> list[str]:
    """The data's spelling of each requested vendor code. With a PAN, every code must belong to
    that PAN; without one (blank in the data), each code only has to exist in the data.
    A code may already be on another account: several accounts of one company can share it."""
    picked = split_codes(requested)
    if not picked:
        raise HTTPException(status_code=400, detail="Pick at least one vendor code.")
    resolved = []
    if pan:
        entry = vendor_directory.get_vendor_by_pan(pan)
        if entry is None:
            raise HTTPException(status_code=400, detail="This PAN was not found in the invoice data.")
        for code in picked:
            spelling = entry["codes"].get(code.lower())
            if spelling is None:
                raise HTTPException(status_code=400, detail=f"Vendor code {code} does not belong to PAN {entry['pan']}.")
            resolved.append(spelling)
        return resolved
    for code in picked:
        known = vendor_directory.get_vendor_code(code)
        if known is None:
            raise HTTPException(status_code=400, detail=f"Vendor code {code} was not found in the invoice data.")
        resolved.append(known["code"])
    return resolved


def name_from_data(pan: str | None, codes: list[str], fallback: str = "") -> str:
    entry = vendor_directory.get_vendor_by_pan(pan) if pan else None
    if entry and entry["name"]:
        return entry["name"]
    for code in codes:
        known = vendor_directory.get_vendor_code(code)
        if known and known["name"]:
            return known["name"]
    return fallback


def ensure_email_free(db: Session, email: str, supplier_id: int | None = None) -> None:
    other = db.query(Supplier).filter(func.lower(Supplier.email) == email).first()
    if other and other.id != supplier_id:
        raise HTTPException(status_code=400, detail=f"{email} already has a supplier account. Each account needs its own email.")


def create_supplier(db: Session, actor, *, email: str, pan: str | None, codes: list[str], channel: str | None = None, name: str = "") -> Supplier:
    """A new Invited account (the setup email is sent separately). Shared by Add supplier and
    by approving an access request, so both follow the same rules."""
    email = normalize_email(email)
    ensure_email_free(db, email)
    supplier = Supplier(
        pan=pan, name=name_from_data(pan, codes, name) or email, email=email,
        # Kept for older code paths; what matters is the channels of the vendor codes.
        channel=channel or (channels_for_codes(codes) or [CHANNEL_ORDER[0]])[0],
        status="Invited", created_by=getattr(actor, "id", None),
    )
    supplier.vendor_codes = [SupplierVendorCode(vendor_code=c) for c in codes]
    db.add(supplier)
    db.flush()
    add_for_supplier_account(db, supplier.id, "SUPPLIER_ACCOUNT_CREATED", {"vendor_codes": list(codes)})
    db.commit()
    db.refresh(supplier)
    return supplier


def set_vendor_codes(db: Session, supplier: Supplier, wanted: list[str]) -> tuple[list[str], list[str]]:
    """Replace the account's codes with `wanted`, changing only the difference.
    Returns (added, removed)."""
    keep = {c.lower() for c in wanted}
    removed = []
    for row in list(supplier.vendor_codes):
        if row.vendor_code.lower() not in keep:
            removed.append(row.vendor_code)
            supplier.vendor_codes.remove(row)
    db.flush()
    have = {c.lower() for c in vendor_codes_of(supplier)}
    added = []
    for code in wanted:
        if code.lower() not in have:
            added.append(code)
            supplier.vendor_codes.append(SupplierVendorCode(vendor_code=code))
    db.commit()
    db.refresh(supplier)
    return added, removed


def send_access_email(db: Session, supplier: Supplier, kind: str | None = None, note: str = "") -> bool:
    """Issue a setup / reset link and email it to the supplier (with an optional note from the
    team). False when it couldn't be sent."""
    link = issue_setup_link(db, supplier, kind)
    if not supplier.email or not smtp_is_configured():
        return False
    try:
        text, html = supplier_access_email(
            supplier.name, supplier.email, link["setupLink"], link["expiryMinutes"],
            reset=link["linkType"] == "reset", note=note,
        )
        subject = "Reset your supplier portal password" if link["linkType"] == "reset" else "Set up your supplier portal access"
        send_email(supplier.email, subject, text, html)
        return True
    except Exception:
        logger.exception("Could not send supplier access email for supplier id %s", supplier.id)
        return False


def send_notice(to: str, subject: str, content: tuple[str, str]) -> bool:
    """Send an informational email; never fails the caller."""
    if not to or not smtp_is_configured():
        return False
    try:
        send_email(to, subject, *content)
        return True
    except Exception:
        logger.exception("Could not send supplier notice email")
        return False


def serialize_supplier(supplier: Supplier, created_by_name: str | None = None) -> dict:
    return {
        "id": supplier.id,
        "pan": supplier.pan,
        "name": supplier.name,
        "email": supplier.email,
        "channel": supplier.channel,
        "channels": supplier_channels(supplier),
        "codeChannels": code_channel_map(vendor_codes_of(supplier)),
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
            "email": supplier.email,
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
    """The vendor codes a supplier token may see, or None when the token is not a supplier's."""
    if payload.get("auth_type") != "supplier":
        return None
    return vendor_codes_of(load_active_supplier(db, payload))
