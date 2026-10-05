from datetime import datetime, timedelta
import random
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.security import verify_password, create_access_token
from app.models.user import User, OTPCode
import jwt
from jwt.exceptions import InvalidTokenError as JWTError

router = APIRouter()

class SupplierLoginRequest(BaseModel):
    vcode: str
    company: Optional[str] = "Vendor"

@router.post("/supplier/login")
def supplier_login(request: SupplierLoginRequest, db: Session = Depends(get_db)):
    # Bypassing real vendor check for now as requested
    supplier_info = {"company": request.company, "pan": "-", "vcode": request.vcode}
    token = create_access_token(subject=request.vcode, auth_type="supplier", scope=supplier_info)
    
    return {
        "token": token,
        "auth": {
            "authType": "supplier",
            "vcode": request.vcode,
            "company": request.company,
            "pan": "-"
        }
    }

class InternalLoginRequest(BaseModel):
    username: str
    password: str
    channelScope: Optional[str] = "all"

@router.post("/login")
def internal_login(request: InternalLoginRequest, db: Session = Depends(get_db)):
    login_id = request.username.strip().lower()
    print(f"[DEBUG LOGIN] Attempting login for username: {login_id}")
    
    user = db.query(User).filter(
        (User.username == login_id) | (User.email == login_id)
    ).first()
    
    if not user:
        print("[DEBUG LOGIN] User not found.")
        raise HTTPException(status_code=401, detail="Invalid username or password.")
        
    print(f"[DEBUG LOGIN] Found user: ID={user.id}, Role={user.role}")
    
    is_valid = verify_password(request.password, user.password_hash)
    print(f"[DEBUG LOGIN] Password valid? {is_valid}")
    
    if not is_valid:
        raise HTTPException(status_code=401, detail="Invalid username or password.")
          
    requested_scope = request.channelScope or "all"
    valid_scopes = {"all", "msetuSrm", "poPortal", "manual", "mfoxPortal"}
    if requested_scope not in valid_scopes:
        raise HTTPException(status_code=403, detail="Unknown workspace.")

    is_admin = (user.ticket_role or "").upper() == "ADMIN" or user.role.upper() == "ADMIN"
    allowed_channels = {membership.channel for membership in user.ticket_channels}
    if not is_admin and (requested_scope == "all" or requested_scope not in allowed_channels):
        raise HTTPException(status_code=403, detail="This account is not authorised for that workspace.")

    final_scope = requested_scope
    
    login_by = "username" if user.username.lower() == login_id else "email"
    scope_data = {"channelScope": final_scope, "loginBy": login_by, "loginId": login_id}
    
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
            "ticketRole": "ADMIN" if is_admin else (user.ticket_role or "ASSIGNEE"),
            "allowedChannels": sorted(allowed_channels),
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
        return {
            "auth_type": "supplier",
            "vendor_code": vendor_code,
            "vendor_codes": [vendor_code],
            "company": scope.get("company") or "Vendor",
            "user_id": None,
            "name": scope.get("company") or "Supplier",
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

    user = db.query(User).filter(User.id == user_id, User.status == "Active").first()
    if not user:
        raise HTTPException(status_code=401, detail="Internal account is unavailable.")

    ticket_role = (user.ticket_role or ("ADMIN" if user.role.upper() == "ADMIN" else "ASSIGNEE")).upper()
    allowed_channels = sorted({membership.channel for membership in user.ticket_channels})
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
                "pan": "-",
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

@router.post("/logout")
def logout():
    return {"msg": "Logged out successfully"}
