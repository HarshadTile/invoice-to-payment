"""Sign-in endpoints. The rules live in app/services/auth_service.py; the "who is calling"
dependencies other routers use live in app/api/deps.py."""
import os

from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from starlette.concurrency import run_in_threadpool
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
    SsoExchangeRequest,
    SupplierPasswordLoginRequest,
    SupplierSetupRequest,
    TokenRequest,
)
from app.services import auth_service, sso_service
from app.services.supplier_service import normalize_email

router = APIRouter()

# Sign-in attempts per caller address per 5 minutes (all accounts together). Each account also
# locks after 5 wrong passwords; this stops one address from spraying passwords across accounts.
LOGIN_ATTEMPTS_PER_IP = int(os.getenv("LOGIN_ATTEMPTS_PER_IP", "30"))
LOGIN_WINDOW_SECONDS = 300


def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"


@router.get('/portal-availability')
def public_portal_availability(response: Response, db: Session = Depends(get_db)):
    response.headers['Cache-Control'] = 'no-store'
    return {'channelAvailability': channel_availability(db)}


@router.post("/login")
def internal_login(request: InternalLoginRequest, http: Request, db: Session = Depends(get_db)):
    rate_limit("staff-login", client_ip(http), limit=LOGIN_ATTEMPTS_PER_IP, window_seconds=LOGIN_WINDOW_SECONDS)
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


# ---------- single sign-on (staff, CC Services); the steps are explained in sso_service.py ----------

@router.get("/sso/status")
def sso_status(response: Response):
    _no_store(response)
    return {"enabled": sso_service.is_enabled()}


@router.get("/sso/login")
def sso_login(http: Request, scope: str | None = None, remember: bool = False):
    """Step 1: the browser is sent here (a page navigation, not a fetch) and on to CC Services."""
    if not sso_service.is_enabled():
        raise HTTPException(status_code=404, detail="Single sign-on is not enabled.")
    rate_limit("sso-login", client_ip(http), limit=LOGIN_ATTEMPTS_PER_IP, window_seconds=LOGIN_WINDOW_SECONDS)
    if scope and scope not in auth_service.VALID_CHANNEL_SCOPES:
        scope = None
    cookie, nonce = sso_service.new_state(scope, remember)
    response = RedirectResponse(sso_service.provider_redirect_url(nonce), status_code=302)
    _no_store(response)
    response.set_cookie(sso_service.STATE_COOKIE, cookie, max_age=sso_service.STATE_MINUTES * 60, path="/",
                        httponly=True, secure=sso_service.cookie_secure(), samesite=sso_service.cookie_samesite())
    return response


async def sso_callback(http: Request, db: Session = Depends(get_db)):
    """Steps 2-3: CC Services sends the browser back here. Registered in app/main.py at
    SSO_CALLBACK_PATH. Always ends in a redirect to the frontend, never shows an error page."""
    params = dict(http.query_params)
    if http.method == "POST":
        params.update({key: value for key, value in (await http.form()).items() if isinstance(value, str)})
    frontend = sso_service.frontend_url()
    try:
        if not sso_service.is_enabled():
            raise sso_service.SsoError("disabled", "SSO is not enabled")
        rate_limit("sso-callback", client_ip(http), limit=LOGIN_ATTEMPTS_PER_IP, window_seconds=LOGIN_WINDOW_SECONDS)
        state = sso_service.read_state(http.cookies.get(sso_service.STATE_COOKIE),
                                       params.get(sso_service.state_param()) if sso_service.state_param() else None)
        code = await run_in_threadpool(sso_service.complete_callback, db, sso_service.pick_token(params), state,
                                       f"{http.method}, parameters: {', '.join(sorted(params)) or 'none'}")
        target = f"{frontend}/sso/callback?{urlencode({'code': code})}"
    except sso_service.SsoError as error:
        target = f"{frontend}/login?{urlencode({'account': 'internal', 'sso_error': error.code})}"
    except HTTPException as error:  # the rate limit
        target = f"{frontend}/login?{urlencode({'account': 'internal', 'sso_error': 'busy' if error.status_code == 429 else 'failed'})}"
    response = RedirectResponse(target, status_code=302)
    _no_store(response)
    response.headers["Referrer-Policy"] = "no-referrer"
    response.delete_cookie(sso_service.STATE_COOKIE, path="/", httponly=True, secure=sso_service.cookie_secure(),
                           samesite=sso_service.cookie_samesite())
    return response


@router.post("/sso/exchange")
def sso_exchange(request: SsoExchangeRequest, response: Response, http: Request, db: Session = Depends(get_db)):
    """Step 4: the one-time code becomes the normal login reply ({token, auth}, plus remember)."""
    _no_store(response)
    rate_limit("sso-exchange", client_ip(http), limit=LOGIN_ATTEMPTS_PER_IP, window_seconds=LOGIN_WINDOW_SECONDS)
    try:
        user, row = sso_service.redeem_code(db, request.code)
    except sso_service.SsoError as error:
        raise HTTPException(status_code=401, detail="This sign-in link is invalid or has expired. Sign in again.") from error
    result = auth_service.issue_internal_session(db, user, row.channel_scope, login_by="sso",
                                                 login_id=user.username, via=" (SSO)")
    return {**result, "remember": row.remember}


# ---------- suppliers ----------

@router.post("/supplier/login-with-password")
def supplier_login_with_password(request: SupplierPasswordLoginRequest, http: Request, db: Session = Depends(get_db)):
    rate_limit("supplier-login", client_ip(http), limit=LOGIN_ATTEMPTS_PER_IP, window_seconds=LOGIN_WINDOW_SECONDS)
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
