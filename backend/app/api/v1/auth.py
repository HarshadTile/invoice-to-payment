from datetime import datetime
import random
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.core.audit import write_audit
from app.core.database import get_db
from app.core.password_reset import issue_password_reset
from app.core.security import verify_password, create_access_token, get_password_hash
from app.models.user import User, OTPCode, PasswordResetToken
from app.repositories.gcp_invoice import get_all_cached_invoices
import jwt
from jwt.exceptions import InvalidTokenError as JWTError

router = APIRouter()

class SupplierLoginRequest(BaseModel):
    vcode: str
    company: Optional[str] = "Vendor"

@router.post("/supplier/login")
def supplier_login(request: SupplierLoginRequest, db: Session = Depends(get_db)):
    vcode = request.vcode.strip()
    # A supplier can only log in with a vendor code that actually has invoices on
    # file — any other string used to be accepted unconditionally (no check at
    # all), letting literally anyone in by typing anything into the field.
    match = next(
        (row for row in get_all_cached_invoices() if str(row.get("SUPPLIER", "")).strip().lower() == vcode.lower()),
        None,
    )
    if match is None:
        write_audit(db, f"Supplier {vcode}", "Failed login", "unknown vendor code")
        raise HTTPException(status_code=401, detail="Invalid vendor code. Please check and try again.")

    # Trust the real supplier name/PAN off record, not whatever the client sent.
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
        }
    }

VALID_CHANNEL_SCOPES = ["all", "msetuSrm", "poPortal", "mfoxPortal"]

class InternalLoginRequest(BaseModel):
    username: str
    password: str
    channelScope: Optional[str] = None

@router.post("/login")
def internal_login(request: InternalLoginRequest, db: Session = Depends(get_db)):
    login_id = request.username.strip().lower()
    print(f"[DEBUG LOGIN] Attempting login for username: {login_id}")
    
    user = db.query(User).filter(
        (User.username == login_id) | (User.email == login_id)
    ).first()
    
    if not user:
        print("[DEBUG LOGIN] User not found.")
        write_audit(db, login_id, "Failed login", "no account with that username/email")
        raise HTTPException(status_code=401, detail="Invalid username or password.")
        
    print(f"[DEBUG LOGIN] Found user: ID={user.id}, Role={user.role}")

    # Checked before the password: an invited account's password_hash is an unguessable
    # placeholder no one was ever given, so verifying it first would always say "invalid
    # username or password" instead of the actually useful "check your email" message.
    if user.status == "Invited":
        write_audit(db, user, "Failed login", "account not activated yet (invite pending)")
        raise HTTPException(status_code=403, detail="This account hasn't been activated yet. Check your email for the invite link, or ask an admin to resend it.")
    if user.status != "Active":
        write_audit(db, user, "Failed login", "account is deactivated")
        raise HTTPException(status_code=403, detail="This account has been deactivated. Contact an administrator.")

    is_valid = verify_password(request.password, user.password_hash)
    print(f"[DEBUG LOGIN] Password valid? {is_valid}")

    if not is_valid:
        write_audit(db, user, "Failed login", "wrong password")
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    # An account locked to one portal (Settings > Users) can never sign in anywhere else,
    # no matter what the login form sends. An "all"-access (Admin) account may still narrow
    # its own session to a single channel to preview that view — it already has the access,
    # this only changes what's shown, not what's permitted.
    requested = request.channelScope
    if user.channel_scope != "all":
        if requested and requested != user.channel_scope:
            write_audit(db, user, "Failed login", f"tried portal '{requested}' but is locked to '{user.channel_scope}'")
            raise HTTPException(status_code=403, detail="This account can only sign in to its assigned portal.")
        final_scope = user.channel_scope
    else:
        final_scope = requested if requested in VALID_CHANNEL_SCOPES else "all"

    login_by = "username" if user.username.lower() == login_id else "email"
    scope_data = {"channelScope": final_scope, "loginBy": login_by, "loginId": login_id}
    
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
            "channelScope": final_scope
        }
    }

from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()

def get_current_user_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from app.core.security import SECRET_KEY, ALGORITHM
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

@router.get("/me")
def get_me(payload: dict = Depends(get_current_user_token), db: Session = Depends(get_db)):
    auth_type = payload.get("auth_type")
    if auth_type == "supplier":
        return {
            "auth": {
                "authType": "supplier",
                "vcode": payload.get("sub"),
                "company": payload.get("scope", {}).get("company", "Vendor"),
                "pan": "-"
            }
        }
    else:
        user_id = int(payload.get("sub"))
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid session.")
        if user.status != "Active":
            raise HTTPException(status_code=403, detail="This account has been deactivated.")
        scope_data = payload.get("scope", {})
        return {
            "auth": {
                "authType": "internal",
                "id": user.id,
                "username": user.username,
                "name": user.name,
                "email": user.email,
                "role": user.role,
                "title": user.title,
                "dept": user.dept,
                "channelScope": scope_data.get("channelScope", "all")
            }
        }

class ForgotPasswordRequest(BaseModel):
    email: str

@router.post("/forgot-password")
def forgot_password(request: ForgotPasswordRequest, db: Session = Depends(get_db)):
    email = request.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()

    # Always the same response whether or not the email is registered, active, or a
    # supplier's — this endpoint must never let someone probe which emails have accounts.
    generic_response = {"msg": "If that email has an account, a reset link has been sent to it."}
    if not user or user.status != "Active":
        return generic_response

    issue_password_reset(db, user, admin_initiated=False)
    write_audit(db, user, "Requested password reset", f"({user.username}) via Forgot password")
    return generic_response


class ResetPasswordRequest(BaseModel):
    token: str
    password: str

@router.post("/reset-password")
def reset_password(request: ResetPasswordRequest, db: Session = Depends(get_db)):
    if len(request.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    record = db.query(PasswordResetToken).filter(PasswordResetToken.token == request.token).first()
    if not record or record.used or record.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired. Request a new one.")

    user = db.query(User).filter(User.id == record.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired. Request a new one.")

    was_invited = user.status == "Invited"
    user.password_hash = get_password_hash(request.password)
    if was_invited:
        user.status = "Active"  # completing the invite is what activates the account
    record.used = True
    db.commit()
    write_audit(db, user, "Activated invite" if was_invited else "Reset own password",
                f"({user.username}) via emailed link")
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
