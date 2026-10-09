from datetime import datetime
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError as JWTError
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.database import get_db
from app.core.password_reset import issue_password_reset
from app.core.security import create_access_token, get_password_hash, verify_password
from app.models.user import PasswordResetToken, User
from app.repositories.gcp_invoice import get_all_cached_invoices
from app.services.supplier_mobile import registered_mobile
from app.services import supplier_otp

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
def supplier_login(request: SupplierLoginRequest, http_request: Request, db: Session = Depends(get_db)):
    enabled = supplier_otp.mobile_auth_enabled()
    vcode = request.vcode.strip()
    rows = get_all_cached_invoices()
    match = next(
        (
            row
            for row in rows
            if str(row.get("SUPPLIER", "")).strip().lower() == vcode.lower()
        ),
        None,
    )
    if match is None:
        write_audit(db, f"Supplier {vcode}", "Failed login", "unknown vendor code")
        raise HTTPException(status_code=401, detail="Invalid vendor code. Please check and try again.")

    company = str(match.get("SUPPLIER_NAME") or request.company or "Vendor").strip()
    pan = str(match.get("PAN_NO") or "-").strip() or "-"
    # Use the source's canonical code for invoice/ticket access scope.
    vcode = str(match["SUPPLIER"]).strip()
    supplier_info = {"company": company, "pan": pan, "vcode": vcode}
    if enabled:
        phone = registered_mobile(vcode, rows)
        return supplier_otp.send_code(db, supplier_info, phone, _client_ip(http_request))
    return _supplier_session(db, supplier_info)


def _client_ip(request: Request):
    # Do not trust user-supplied forwarding headers. Configure trusted proxy IPs in Uvicorn.
    return request.client.host if request.client else "unknown"


def _supplier_session(db, supplier_info, otp_verified=False):
    vcode = supplier_info["vcode"]
    company = supplier_info["company"]
    pan = supplier_info["pan"]
    supplier_info = {**supplier_info, "mobile_otp_verified": otp_verified}
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


class SupplierOtpRequest(BaseModel):
    challenge_id: str = Field(min_length=1, max_length=64)


class SupplierOtpVerifyRequest(SupplierOtpRequest):
    code: str = Field(max_length=6)


def _require_mobile_auth():
    if not supplier_otp.mobile_auth_enabled():
        raise HTTPException(400, "Mobile authentication is disabled. Please start login again.")


@router.post("/supplier/otp/verify")
def supplier_otp_verify(request: SupplierOtpVerifyRequest, http_request: Request, db: Session = Depends(get_db)):
    _require_mobile_auth()
    identity = supplier_otp.challenge_identity(db, request.challenge_id)
    phone = registered_mobile(identity["vcode"], get_all_cached_invoices())
    identity = supplier_otp.verify_code(db, request.challenge_id, request.code, _client_ip(http_request), phone)
    return _supplier_session(db, identity, otp_verified=True)


@router.post("/supplier/otp/resend")
def supplier_otp_resend(request: SupplierOtpRequest, http_request: Request, db: Session = Depends(get_db)):
    _require_mobile_auth()
    identity = supplier_otp.challenge_identity(db, request.challenge_id)
    phone = registered_mobile(identity["vcode"], get_all_cached_invoices())
    return supplier_otp.send_code(db, identity, phone, _client_ip(http_request), previous=request.challenge_id)


@router.post("/supplier/otp/cancel")
def supplier_otp_cancel(request: SupplierOtpRequest, db: Session = Depends(get_db)):
    from app.models.supplier_otp import SupplierOtpState
    from sqlalchemy import update
    db.execute(update(SupplierOtpState).where(SupplierOtpState.challenge == request.challenge_id).values(digest=None))
    db.commit()
    return {"msg": "Login cancelled"}


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
            detail="This account hasn't been activated yet. Check your email for the invite link, or ask an admin to resend it.",
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
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    if payload.get("auth_type") == "supplier" and supplier_otp.mobile_auth_enabled():
        if (payload.get("scope") or {}).get("mobile_otp_verified") is not True:
            raise HTTPException(401, "Please sign in again using mobile verification.")
    return payload


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
    write_audit(db, user, "Requested password reset", f"({user.username}) via Forgot password")
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
                write_audit(db, f"Supplier {payload.get('sub')}", "Logged out", "supplier portal")
            else:
                user = db.query(User).filter(User.id == int(payload.get("sub"))).first()
                if user:
                    write_audit(db, user, "Logged out", "")
        except (JWTError, ValueError, TypeError):
            pass
    return {"msg": "Logged out successfully"}

