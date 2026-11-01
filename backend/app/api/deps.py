"""Request dependencies: who is calling, checked on every request.

`get_current_user` returns one canonical, server-verified identity (a dict) that the routes and
services use; `get_ticket_user` additionally requires Inquiry Desk access."""
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError as JWTError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import ALGORITHM, SECRET_KEY
from app.models.user import User
from app.services.auth_service import allowed_channels_of, ticket_role_of
from app.services.supplier_service import is_managed_supplier_token, load_active_supplier, vendor_codes_of

security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)

TICKET_ACCESS_ROLES = ("ADMIN", "CHANNEL_LEAD", "ASSIGNEE")


def decode_token(raw: str) -> dict:
    """The token's claims; raises JWTError when it is invalid or expired."""
    return jwt.decode(raw, SECRET_KEY, algorithms=[ALGORITHM])


def get_current_user_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        return decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")


def get_current_user(payload: dict = Depends(get_current_user_token), db: Session = Depends(get_db)):
    """Return one canonical, server-verified identity for service-layer use."""
    auth_type = payload.get("auth_type")
    if auth_type == "supplier" and is_managed_supplier_token(payload):
        supplier = load_active_supplier(db, payload)
        codes = vendor_codes_of(supplier)
        return {
            "auth_type": "supplier",
            "supplier_id": supplier.id,
            "vendor_code": codes[0] if codes else "",
            "vendor_codes": codes,
            "company": supplier.name or "Vendor",
            "pan": supplier.pan,
            "email": supplier.email,
            "user_id": None,
            "name": supplier.name or "Vendor",
            "ticket_role": "SUPPLIER",
            "channel_scope": "all",  # vendor codes scope a supplier, not a channel
            "allowed_channels": [],
        }

    if auth_type == "supplier":
        vendor_code = str(payload.get("sub") or "").strip()
        if not vendor_code:
            raise HTTPException(status_code=401, detail="Supplier session is missing a vendor code.")
        scope = payload.get("scope") or {}
        company = scope.get("company") or "Vendor"
        return {
            "auth_type": "supplier",
            "supplier_id": None,
            "vendor_code": vendor_code,
            "vendor_codes": [vendor_code],
            "company": company,
            "pan": scope.get("pan") or "-",
            "user_id": None,
            "name": company,
            "ticket_role": "SUPPLIER",
            "channel_scope": None,
            "allowed_channels": [],
        }

    if auth_type != "internal":
        raise HTTPException(status_code=401, detail="Invalid authentication context.")
    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid internal user identity.")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Internal account is unavailable.")
    if user.status != "Active":
        raise HTTPException(status_code=403, detail="This account has been deactivated.")

    ticket_role = ticket_role_of(user)
    allowed_channels = allowed_channels_of(user)
    requested_scope = (payload.get("scope") or {}).get("channelScope", "all")
    if ticket_role != "ADMIN" and requested_scope not in allowed_channels:
        raise HTTPException(status_code=403, detail="Workspace access is no longer authorised.")

    return {
        "auth_type": "internal",
        "user_id": user.id,
        "username": user.username,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "title": user.title,
        "dept": user.dept,
        "ticket_role": ticket_role,
        "channel_scope": requested_scope,
        "allowed_channels": allowed_channels,
        "vendor_code": None,
        "vendor_codes": [],
    }


def ensure_ticket_access(user: dict) -> dict:
    """Inquiry Desk (tickets and notifications) is for suppliers and for staff who were given a
    ticket role. A staff account with 'No Ticket Access' is turned away, whatever its application role."""
    if user["auth_type"] == "internal" and user["ticket_role"] not in TICKET_ACCESS_ROLES:
        raise HTTPException(
            status_code=403,
            detail={"error": {"code": "FORBIDDEN", "message": "Your account has no Inquiry Desk access."}},
        )
    return user


def get_ticket_user(user: dict = Depends(get_current_user)) -> dict:
    return ensure_ticket_access(user)
