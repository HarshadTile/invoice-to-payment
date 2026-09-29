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
        raise HTTPException(status_code=401, detail="Invalid username or password.")
        
    print(f"[DEBUG LOGIN] Found user: ID={user.id}, Role={user.role}")
    
    is_valid = verify_password(request.password, user.password_hash)
    print(f"[DEBUG LOGIN] Password valid? {is_valid}")
    
    if not is_valid:
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    if user.status != "Active":
        raise HTTPException(status_code=403, detail="This account has been deactivated. Contact an administrator.")

    # An account locked to one portal (Settings > Users) can never sign in anywhere else,
    # no matter what the login form sends. An "all"-access (Admin) account may still narrow
    # its own session to a single channel to preview that view — it already has the access,
    # this only changes what's shown, not what's permitted.
    requested = request.channelScope
    if user.channel_scope != "all":
        if requested and requested != user.channel_scope:
            raise HTTPException(status_code=403, detail="This account can only sign in to its assigned portal.")
        final_scope = user.channel_scope
    else:
        final_scope = requested if requested in VALID_CHANNEL_SCOPES else "all"

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

@router.post("/logout")
def logout():
    return {"msg": "Logged out successfully"}
