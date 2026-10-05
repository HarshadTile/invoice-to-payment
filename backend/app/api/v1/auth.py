from datetime import datetime
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError as JWTError
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.database import get_db
from app.core.password_reset import issue_password_reset
from app.core.security import create_access_token, get_password_hash, verify_password
from app.models.user import PasswordResetToken, User
from app.repositories.gcp_invoice import get_all_cached_invoices

router = APIRouter()
security = HTTPBearer()

VALID_CHANNEL_SCOPES = {"all", "msetuSrm", "poPortal", "manual", "mfoxPortal"}


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
def supplier_login(request: SupplierLoginRequest):
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
        raise HTTPException(status_code=401, detail="Invalid vendor code. Please check and try again.")

    company = str(match.get("SUPPLIER_NAME") or request.company or "Vendor").strip()
    pan = str(match.get("PAN_NO") or "-").strip() or "-"
    supplier_info = {"company": company, "pan": pan, "vcode": vcode}
    token = create_access_token(subject=vcode, auth_type="supplier", scope=supplier_info)
    return {
        "token": token,
        "auth": {
            "authType": "supplier",
            "vcode": vcode,
            "company": company,
            "pan": pan,
        },
    }


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
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    if user.status == "Invited":
        raise HTTPException(
            status_code=403,
            detail="This account hasn't been activated yet. Check your email for the invite link, or ask an admin to resend it.",
        )
    if user.status != "Active":
        raise HTTPException(
            status_code=403,
            detail="This account has been deactivated. Contact an administrator.",
        )
    if not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    requested_scope = request.channelScope
    if requested_scope and requested_scope not in VALID_CHANNEL_SCOPES:
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
            raise HTTPException(
                status_code=403,
                detail="This account can only sign in to its assigned portal.",
            )

    login_by = "username" if user.username.lower() == login_id else "email"
    scope_data = {
        "channelScope": final_scope,
        "loginBy": login_by,
        "loginId": login_id,
    }
    token = create_access_token(subject=user.id, auth_type="internal", scope=scope_data)
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
    if auth_type == "supplier":
        vendor_code = str(payload.get("sub") or "").strip()
        if not vendor_code:
            raise HTTPException(status_code=401, detail="Supplier session is missing a vendor code.")
        scope = payload.get("scope") or {}
        company = scope.get("company") or "Vendor"
        return {
            "auth_type": "supplier",
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


@router.get("/me")
def get_me(user: dict = Depends(get_current_user)):
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
    email = request.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    response = {"msg": "If that email has an account, a reset link has been sent to it."}
    if not user or user.status != "Active":
        return response
    issue_password_reset(db, user, admin_initiated=False)
    return response


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


@router.post("/reset-password")
def reset_password(request: ResetPasswordRequest, db: Session = Depends(get_db)):
    if len(request.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    record = db.query(PasswordResetToken).filter(
        PasswordResetToken.token == request.token
    ).first()
    if not record or record.used or record.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=400,
            detail="This reset link is invalid or has expired. Request a new one.",
        )
    user = db.query(User).filter(User.id == record.user_id).first()
    if not user:
        raise HTTPException(
            status_code=400,
            detail="This reset link is invalid or has expired. Request a new one.",
        )

    was_invited = user.status == "Invited"
    user.password_hash = get_password_hash(request.password)
    if was_invited:
        user.status = "Active"
    record.used = True
    db.commit()
    write_audit(
        db,
        user,
        "Activated invite" if was_invited else "Reset own password",
        f"({user.username}) via emailed link",
    )
    return {"msg": "Password updated. You can now sign in with your new password."}


@router.post("/logout")
def logout():
    return {"msg": "Logged out successfully"}
