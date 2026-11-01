"""Sign-in endpoints. The rules live in app/services/auth_service.py; the "who is calling"
dependencies other routers use live in app/api/deps.py."""
from fastapi import APIRouter, Depends, Request, Response
from fastapi.security import HTTPAuthorizationCredentials
from jwt.exceptions import InvalidTokenError as JWTError
from sqlalchemy.orm import Session

from app.api.deps import decode_token, get_current_user, optional_security
from app.core.channels import channel_availability
from app.core.database import get_db
from app.core.rate_limit import client_ip, rate_limit
from app.models.supplier import Supplier
from app.schemas.auth import (
    EmailRequest,
    InternalLoginRequest,
    ResetPasswordRequest,
    SupplierLoginRequest,
    SupplierPasswordLoginRequest,
    SupplierSetupRequest,
    TokenRequest,
)
from app.services import auth_service
from app.services.supplier_service import normalize_email

router = APIRouter()


def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"


@router.get('/portal-availability')
def public_portal_availability(response: Response, db: Session = Depends(get_db)):
    response.headers['Cache-Control'] = 'no-store'
    return {'channelAvailability': channel_availability(db)}


@router.post("/login")
def internal_login(request: InternalLoginRequest, db: Session = Depends(get_db)):
    return auth_service.login_internal(db, request.username, request.password, request.channelScope)


@router.get("/me")
def get_me(user: dict = Depends(get_current_user)):
    return {"auth": auth_service.session_auth(user)}


@router.post("/logout")
def logout(credentials: HTTPAuthorizationCredentials | None = Depends(optional_security), db: Session = Depends(get_db)):
    # Logging out must never fail (the client clears its token regardless), so a missing
    # or already-expired token just means there's nothing to attribute the event to.
    if credentials:
        try:
            auth_service.record_logout(db, decode_token(credentials.credentials))
        except (JWTError, ValueError, TypeError):
            pass
    return {"msg": "Logged out successfully"}


@router.post("/forgot-password")
def forgot_password(request: EmailRequest, response: Response, db: Session = Depends(get_db)):
    """Send reset instructions without revealing whether an account exists."""
    _no_store(response)
    auth_service.forgot_password(db, str(request.email))
    return {"msg": "If an active account matches that email, password reset instructions will be sent."}


@router.post("/password-link-info")
def password_link_info(request: TokenRequest, response: Response, db: Session = Depends(get_db)):
    _no_store(response)
    return auth_service.password_link_info(db, request.token)


@router.post("/reset-password")
def reset_password(request: ResetPasswordRequest, response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    auth_service.reset_password(db, request.token, request.password)
    return {"msg": "Password updated. You can now sign in with your new password."}


# ---------- suppliers ----------

@router.post("/supplier/login")
def supplier_login(request: SupplierLoginRequest, db: Session = Depends(get_db)):
    return auth_service.login_supplier_vendor_code(db, request.vcode, request.company)


@router.post("/supplier/login-with-password")
def supplier_login_with_password(request: SupplierPasswordLoginRequest, db: Session = Depends(get_db)):
    return auth_service.login_supplier_password(db, request.email, request.password)


@router.get("/supplier/check-setup-link")
def check_setup_link(token: str, db: Session = Depends(get_db)):
    record = auth_service.valid_setup_record(db, token)
    return {"valid": True, "name": db.get(Supplier, record.supplier_id).name, "linkType": record.link_type}


@router.post("/supplier/complete-supplier-setup")
def complete_supplier_setup(request: SupplierSetupRequest, db: Session = Depends(get_db)):
    auth_service.complete_supplier_setup(db, request.token, request.email, request.password)
    return {"msg": "Password set. You can now sign in with your email and password."}


@router.post("/supplier/forgot-password")
def supplier_forgot_password(request: EmailRequest, response: Response, http: Request, db: Session = Depends(get_db)):
    """Email a reset link to an active supplier account, without revealing whether one exists."""
    response.headers["Cache-Control"] = "no-store"
    rate_limit("supplier-forgot", f"{client_ip(http)}|{normalize_email(request.email)}", limit=5, window_seconds=900)
    auth_service.supplier_forgot_password(db, str(request.email))
    return {"msg": "If an active supplier account matches that email, a password reset link will be sent."}
