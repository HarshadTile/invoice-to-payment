"""Request dependencies: who is calling, checked on every request.

`get_current_user` returns one canonical, server-verified identity (a dict) that the routes and
services use; `get_ticket_user` additionally requires Inquiry Desk access."""
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError as JWTError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import ALGORITHM, get_secret_key, token_session_version
from app.models.user import User
from app.services.auth_service import allowed_channels_of, ticket_role_of
from app.services.supplier_service import is_managed_supplier_token, load_active_supplier, vendor_codes_of

security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)

TICKET_ACCESS_ROLES = ("ADMIN", "CHANNEL_LEAD", "ASSIGNEE")


def decode_token(raw: str) -> dict:
    """The token's claims; raises JWTError when it is invalid, expired, or an old-style supplier
    token. The passwordless vendor-code login was removed, so a supplier token must be a managed
    one (email + password login); anything else is treated as an invalid session."""
    payload = jwt.decode(raw, get_secret_key(), algorithms=[ALGORITHM])
    if payload.get("auth_type") == "supplier" and not is_managed_supplier_token(payload):
        raise JWTError("Supplier token was not issued by the password login.")
    return payload


def load_active_internal_user(db: Session, payload: dict) -> User:
    """The staff account an internal token belongs to, re-checked on every request: it must still
    exist, be Active, and the session must not have been ended (logout / password reset)."""
    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid internal user identity.")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Internal account is unavailable.")
    if user.status != "Active":
        raise HTTPException(status_code=403, detail="This account has been deactivated.")
    if token_session_version(payload) != (user.session_version or 0):
        raise HTTPException(status_code=401, detail="Your session has ended. Please sign in again.")
    # The workspace the session was opened for must still be one this person may use, on every
    # route (invoices and exports included), so moving someone to another channel cuts the old
    # session off at once instead of when the token expires.
    requested_scope = (payload.get("scope") or {}).get("channelScope", "all")
    if ticket_role_of(user) != "ADMIN" and requested_scope not in allowed_channels_of(user):
        raise HTTPException(status_code=403, detail="Workspace access is no longer authorised.")
    return user


def get_current_user_token(credentials: HTTPAuthorizationCredentials = Depends(security),
                           db: Session = Depends(get_db)):
    """The token's claims, after checking that the account behind it is still allowed in. Every
    protected route depends on this, so a deactivated account or a signed-out session stops
    working at once everywhere, not only when the token expires."""
    try:
        payload = decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    if payload.get("auth_type") == "internal":
        load_active_internal_user(db, payload)
    elif payload.get("auth_type") == "supplier":
        load_active_supplier(db, payload)
    else:
        raise HTTPException(status_code=401, detail="Invalid authentication context.")
    return payload


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

    if auth_type != "internal":
        raise HTTPException(status_code=401, detail="Invalid authentication context.")
    user = load_active_internal_user(db, payload)  # also checks the workspace is still allowed

    ticket_role = ticket_role_of(user)
    allowed_channels = allowed_channels_of(user)
    requested_scope = (payload.get("scope") or {}).get("channelScope", "all")

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
