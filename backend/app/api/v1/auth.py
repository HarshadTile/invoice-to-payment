from datetime import datetime
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import and_, func, or_
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError as JWTError
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.database import get_db
from app.core.channels import channel_availability, require_enabled_channel
from app.core.password_reset import token_digest
from app.core.security import create_access_token, get_password_hash, verify_password
from app.models.supplier import Supplier, SupplierSetupToken
from app.models.user import PasswordResetToken, User
from app.repositories.gcp_invoice import get_all_cached_invoices
from app.services.supplier_service import (
    GENERIC_LOGIN_ERROR,
    build_session,
    clear_failures,
    is_locked,
    is_managed_supplier_token,
    load_active_supplier,
    register_failure,
    vendor_codes_of,
)

router = APIRouter()
security = HTTPBearer()

VALID_CHANNEL_SCOPES = {"all", "msetuSrm", "poPortal", "manual", "mfoxPortal"}


@router.get('/portal-availability')
def public_portal_availability(response: Response, db: Session = Depends(get_db)):
    response.headers['Cache-Control'] = 'no-store'
    return {'channelAvailability': channel_availability(db)}


def _ticket_role(user: User) -> str:
    if user.role.upper() == "ADMIN" or (user.ticket_role or "").upper() == "ADMIN":
        return "ADMIN"
    return (user.ticket_role or "NO_ACCESS").upper()


def _allowed_channels(user: User) -> list[str]:
    channels = {membership.channel for membership in user.ticket_channels}
    if user.channel_scope and user.channel_scope != "all":
        channels.add(user.channel_scope)
    return sorted(channels)


class SupplierLoginRequest(BaseModel):
    vcode: str
    company: Optional[str] = "Vendor"


@router.post("/supplier/login")
def supplier_login(request: SupplierLoginRequest, db: Session = Depends(get_db)):
    vcode = request.vcode.strip()
    match = next(
        (
            row
            for row in get_all_cached_invoices()
            if str(row.get("SUPPLIER", "")).strip().lower() == vcode.lower()
        ),
        None,
    )
    if match is None:
        write_audit(db, f"Supplier {vcode}", "Failed login", "unknown vendor code")
        raise HTTPException(status_code=401, detail="Invalid vendor code. Please check and try again.")

    company = str(match.get("SUPPLIER_NAME") or request.company or "Vendor").strip()
    pan = str(match.get("PAN_NO") or "-").strip() or "-"
    supplier_info = {"company": company, "pan": pan, "vcode": vcode}
    token = create_access_token(subject=vcode, auth_type="supplier", scope=supplier_info)
    write_audit(db, f"Supplier {vcode}", "Logged in", f"{company}, supplier portal")
    return {
        "token": token,
        "auth": {
            "authType": "supplier",
            "vcode": vcode,
            "company": company,
            "pan": pan,
        },
    }


class SupplierPasswordLoginRequest(BaseModel):
    pan: str
    password: str


@router.post("/supplier/login-with-password")
def supplier_login_with_password(request: SupplierPasswordLoginRequest, db: Session = Depends(get_db)):
    """PAN + password sign-in for suppliers created on the Suppliers screen. The original
    vendor-code login above is unchanged and keeps working alongside this one."""
    pan = request.pan.strip().upper()
    actor = f"Supplier {pan}"
    supplier = db.query(Supplier).filter(Supplier.pan == pan).first()
    if not supplier or supplier.status != "Active" or not supplier.password_hash:
        write_audit(db, actor, "Failed login", "unknown PAN, not active, or no password set")
        raise HTTPException(status_code=401, detail=GENERIC_LOGIN_ERROR)
    if is_locked(supplier):
        write_audit(db, actor, "Failed login", "PAN is locked after too many wrong attempts")
        raise HTTPException(status_code=401, detail=GENERIC_LOGIN_ERROR)
    if not verify_password(request.password, supplier.password_hash):
        register_failure(db, supplier)
        write_audit(db, actor, "Failed login", "wrong password")
        raise HTTPException(status_code=401, detail=GENERIC_LOGIN_ERROR)

    require_enabled_channel(db, supplier.channel)
    clear_failures(db, supplier)
    session = build_session(supplier)
    write_audit(db, actor, "Logged in", f"{supplier.name}, supplier portal")
    return session


def _valid_setup_record(db: Session, token: str) -> SupplierSetupToken:
    invalid = HTTPException(
        status_code=400,
        detail="This link is invalid or has expired. Ask the team for a new one.",
    )
    record = db.query(SupplierSetupToken).filter(SupplierSetupToken.token == token).first()
    if not record or record.used or record.expires_at < datetime.utcnow():
        raise invalid
    supplier = db.get(Supplier, record.supplier_id)
    if not supplier or supplier.status != "Invited":
        raise invalid
    return record


@router.get("/supplier/check-setup-link")
def check_setup_link(token: str, db: Session = Depends(get_db)):
    record = _valid_setup_record(db, token)
    return {"valid": True, "name": db.get(Supplier, record.supplier_id).name}


class SupplierSetupRequest(BaseModel):
    token: str
    pan: str
    password: str


@router.post("/supplier/complete-supplier-setup")
def complete_supplier_setup(request: SupplierSetupRequest, db: Session = Depends(get_db)):
    if len(request.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    record = _valid_setup_record(db, request.token)
    supplier = db.get(Supplier, record.supplier_id)
    actor = f"Supplier {supplier.pan}"
    if is_locked(supplier):
        raise HTTPException(status_code=400, detail="Too many wrong attempts. Try again in 15 minutes.")
    if request.pan.strip().upper() != supplier.pan:
        register_failure(db, supplier)
        write_audit(db, actor, "Failed setup", "PAN did not match the setup link")
        raise HTTPException(status_code=400, detail="That PAN doesn't match this link.")

    supplier.password_hash = get_password_hash(request.password)
    supplier.status = "Active"
    supplier.failed_attempts, supplier.locked_until = 0, None
    record.used = True
    db.commit()
    write_audit(db, actor, "Completed setup", f"{supplier.name} set a password")
    return {"msg": "Password set. You can now sign in with your PAN and password."}


class InternalLoginRequest(BaseModel):
    username: str
    password: str
    channelScope: Optional[str] = None


@router.post("/login")
def internal_login(request: InternalLoginRequest, db: Session = Depends(get_db)):
    login_id = request.username.strip().lower()
    user = db.query(User).filter(
        (User.username == login_id) | (User.email == login_id)
    ).first()
    if not user:
        write_audit(db, login_id, "Failed login", "no account with that username/email")
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    if user.status == "Invited":
        write_audit(db, user, "Failed login", "account not activated yet (invite pending)")
        raise HTTPException(
            status_code=403,
            detail="This account hasn't been activated yet. Use your password setup link, or ask an administrator for a new one.",
        )
    if user.status != "Active":
        write_audit(db, user, "Failed login", "account is deactivated")
        raise HTTPException(
            status_code=403,
            detail="This account has been deactivated. Contact an administrator.",
        )
    if not verify_password(request.password, user.password_hash):
        write_audit(db, user, "Failed login", "wrong password")
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    requested_scope = request.channelScope
    if requested_scope and requested_scope not in VALID_CHANNEL_SCOPES:
        write_audit(db, user, "Failed login", f"requested unknown workspace '{requested_scope}'")
        raise HTTPException(status_code=403, detail="Unknown workspace.")

    ticket_role = _ticket_role(user)
    allowed_channels = _allowed_channels(user)
    is_admin = ticket_role == "ADMIN"
    if is_admin:
        final_scope = requested_scope or "all"
    else:
        assigned_scope = user.channel_scope
        final_scope = requested_scope or assigned_scope
        if final_scope == "all" or final_scope not in allowed_channels:
            write_audit(
                db,
                user,
                "Failed login",
                f"tried workspace '{final_scope}' outside assigned ticket channels",
            )
            raise HTTPException(
                status_code=403,
                detail="This account can only sign in to its assigned portal.",
            )

    require_enabled_channel(db, final_scope)
    login_by = "username" if user.username.lower() == login_id else "email"
    scope_data = {
        "channelScope": final_scope,
        "loginBy": login_by,
        "loginId": login_id,
    }
    token = create_access_token(subject=user.id, auth_type="internal", scope=scope_data)
    write_audit(db, user, "Logged in", f"{user.role}, portal {final_scope}")
    return {
        "token": token,
        "auth": {
            "authType": "internal",
            "id": user.id,
            "username": user.username,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "title": user.title,
            "dept": user.dept,
            "channelScope": final_scope,
            "ticketRole": ticket_role,
            "allowedChannels": allowed_channels,
        },
    }


def get_current_user_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    from app.core.security import ALGORITHM, SECRET_KEY

    try:
        return jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")


def get_current_user(
    payload: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db),
):
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
            "user_id": None,
            "name": supplier.name or "Vendor",
            "ticket_role": "SUPPLIER",
            "channel_scope": None,
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

    ticket_role = _ticket_role(user)
    allowed_channels = _allowed_channels(user)
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


TICKET_ACCESS_ROLES = ("ADMIN", "CHANNEL_LEAD", "ASSIGNEE")


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


@router.get("/me")
def get_me(user: dict = Depends(get_current_user)):
    if user["auth_type"] == "supplier" and user.get("supplier_id"):
        return {
            "auth": {
                "authType": "supplier",
                "pan": user["pan"],
                "company": user["company"],
                "vcodes": user["vendor_codes"],
                "vcode": user["vendor_code"],
            }
        }
    if user["auth_type"] == "supplier":
        return {
            "auth": {
                "authType": "supplier",
                "vcode": user["vendor_code"],
                "company": user["company"],
                "pan": user["pan"],
            }
        }
    return {
        "auth": {
            "authType": "internal",
            "id": user["user_id"],
            "username": user["username"],
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
            "title": user["title"],
            "dept": user["dept"],
            "channelScope": user["channel_scope"],
            "ticketRole": user["ticket_role"],
            "allowedChannels": user["allowed_channels"],
        }
    }


class ForgotPasswordRequest(BaseModel):
    email: str


@router.post("/forgot-password")
def forgot_password(request: ForgotPasswordRequest, db: Session = Depends(get_db)):
    return {"msg": "Contact your administrator to request a password reset link."}


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


class PasswordLinkInfoRequest(BaseModel):
    token: str


@router.post("/password-link-info")
def password_link_info(request: PasswordLinkInfoRequest, response: Response, db: Session = Depends(get_db)):
    """Reveal the sign-in identity only to the holder of a valid, unused link."""
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    record = db.query(PasswordResetToken).filter(
        or_(PasswordResetToken.token == token_digest(request.token), and_(
            func.length(PasswordResetToken.token) < 64, PasswordResetToken.token == request.token,
        )),
        PasswordResetToken.used.is_(False),
        PasswordResetToken.expires_at > datetime.utcnow(),
    ).first()
    user = db.get(User, record.user_id) if record else None
    if not user or user.status not in ("Invited", "Active"):
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired. Request a new one.")
    return {"email": user.email, "name": user.name, "linkType": "invite" if user.status == "Invited" else "reset"}


@router.post("/reset-password")
def reset_password(request: ResetPasswordRequest, response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    if len(request.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    record = db.query(PasswordResetToken).filter(
        or_(PasswordResetToken.token == token_digest(request.token), and_(
            func.length(PasswordResetToken.token) < 64, PasswordResetToken.token == request.token,
        ))
    ).first()
    if not record:
        raise HTTPException(
            status_code=400,
            detail="This reset link is invalid or has expired. Request a new one.",
        )
    # Lock user first (the same order as link issuance), then refresh the token.
    user = db.query(User).filter(User.id == record.user_id).populate_existing().with_for_update().first()
    record = db.query(PasswordResetToken).filter(PasswordResetToken.id == record.id).populate_existing().with_for_update().first()
    if (not user or user.status not in ("Invited", "Active") or not record
            or record.used or record.expires_at <= datetime.utcnow()):
        raise HTTPException(
            status_code=400,
            detail="This reset link is invalid or has expired. Request a new one.",
        )

    was_invited = user.status == "Invited"
    claimed = db.query(PasswordResetToken).filter(
        PasswordResetToken.id == record.id, PasswordResetToken.used.is_(False),
        PasswordResetToken.expires_at > datetime.utcnow(),
    ).update({"used": True}, synchronize_session=False)
    if claimed != 1:
        db.rollback()
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired. Request a new one.")
    user.password_hash = get_password_hash(request.password)
    if was_invited:
        user.status = "Active"
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id, PasswordResetToken.used.is_(False),
    ).update({"used": True}, synchronize_session=False)
    write_audit(
        db,
        user,
        "Activated invite" if was_invited else "Reset own password",
        f"({user.email}) via one-time password link",
    )
    return {"msg": "Password updated. You can now sign in with your new password."}


optional_security = HTTPBearer(auto_error=False)

@router.post("/logout")
def logout(credentials: HTTPAuthorizationCredentials | None = Depends(optional_security), db: Session = Depends(get_db)):
    # Logging out must never fail (the client clears its token regardless), so a missing
    # or already-expired token just means there's nothing to attribute the event to.
    if credentials:
        from app.core.security import SECRET_KEY, ALGORITHM
        try:
            payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
            if payload.get("auth_type") == "supplier":
                who = (payload.get("scope") or {}).get("pan") if is_managed_supplier_token(payload) else payload.get("sub")
                write_audit(db, f"Supplier {who}", "Logged out", "supplier portal")
            else:
                user = db.query(User).filter(User.id == int(payload.get("sub"))).first()
                if user:
                    write_audit(db, user, "Logged out", "")
        except (JWTError, ValueError, TypeError):
            pass
    return {"msg": "Logged out successfully"}

