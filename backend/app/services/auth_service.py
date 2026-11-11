"""Sign-in rules: staff and supplier login, supplier account setup, forgot/reset password and
logout. The routes in app/api/v1/auth.py only translate HTTP to these calls."""
from datetime import datetime, timedelta
import logging

from fastapi import HTTPException
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.channels import channel_availability, require_enabled_channel
from app.core.email import is_configured as smtp_is_configured, send_email
from app.core.email_templates import password_reset_email
from app.core import password_policy
from app.core.password_reset import issue_password_reset, token_digest
from app.core.security import create_access_token, get_password_hash, token_session_version, verify_password
from app.models.supplier import Supplier, SupplierSetupToken
from app.models.user import PasswordResetToken, User
from app.services.supplier_service import (
    GENERIC_LOGIN_ERROR,
    build_session,
    clear_failures,
    is_locked,
    normalize_email,
    register_failure,
    send_access_email,
    supplier_channels,
)

logger = logging.getLogger(__name__)

VALID_CHANNEL_SCOPES = {"all", "msetuSrm", "poPortal", "manual", "mfoxPortal"}
INVALID_RESET_LINK = "This reset link is invalid or has expired. Request a new one."
INVALID_SETUP_LINK = "This link is invalid or has expired. Ask the team for a new one."
MAX_FAILED_LOGINS = 5
LOGIN_LOCK_MINUTES = 15
# One message for every failed staff sign-in, so the reply never reveals whether an account
# exists, is locked, or which part was wrong.
INTERNAL_LOGIN_FAILED = "Invalid username or password."
# Checked against when the username is unknown, so that reply takes as long as a wrong password.
_DUMMY_HASH = get_password_hash("dummy-password-for-timing")


def _fail(status: int, detail: str):
    raise HTTPException(status_code=status, detail=detail)


def _require_strong_password(password: str, personal: list[str | None] = ()) -> None:
    """The rules in app/core/password_policy.py; every broken rule is listed for the person."""
    broken = password_policy.problems(password, personal)
    if broken:
        _fail(400, " ".join(broken))


# ---------- identity ----------

def ticket_role_of(user: User) -> str:
    if user.role.upper() == "ADMIN" or (user.ticket_role or "").upper() == "ADMIN":
        return "ADMIN"
    return (user.ticket_role or "NO_ACCESS").upper()


def allowed_channels_of(user: User) -> list[str]:
    channels = {membership.channel for membership in user.ticket_channels}
    if user.channel_scope and user.channel_scope != "all":
        channels.add(user.channel_scope)
    return sorted(channels)


def session_auth(identity: dict) -> dict:
    """The `auth` block the app keeps for the signed-in person (login and /me)."""
    if identity["auth_type"] == "supplier" and identity.get("supplier_id"):
        return {"authType": "supplier", "pan": identity["pan"], "email": identity.get("email"),
                "company": identity["company"], "vcodes": identity["vendor_codes"], "vcode": identity["vendor_code"]}
    if identity["auth_type"] == "supplier":
        return {"authType": "supplier", "vcode": identity["vendor_code"], "company": identity["company"], "pan": identity["pan"]}
    return {
        "authType": "internal",
        "id": identity["user_id"],
        "username": identity["username"],
        "name": identity["name"],
        "email": identity["email"],
        "role": identity["role"],
        "title": identity["title"],
        "dept": identity["dept"],
        "channelScope": identity["channel_scope"],
        "ticketRole": identity["ticket_role"],
        "allowedChannels": identity["allowed_channels"],
    }


# ---------- staff ----------

def _user_is_locked(user: User) -> bool:
    return bool(user.locked_until and user.locked_until > datetime.utcnow())


def _register_user_failure(db: Session, user: User) -> None:
    user.failed_attempts = (user.failed_attempts or 0) + 1
    if user.failed_attempts >= MAX_FAILED_LOGINS:
        user.locked_until = datetime.utcnow() + timedelta(minutes=LOGIN_LOCK_MINUTES)
        user.failed_attempts = 0
        write_audit(db, user, "Account locked",
                    f"{MAX_FAILED_LOGINS} wrong passwords; locked for {LOGIN_LOCK_MINUTES} minutes")
    db.commit()


def login_internal(db: Session, username: str, password: str, requested_scope: str | None) -> dict:
    login_id = username.strip().lower()
    user = db.query(User).filter((User.username == login_id) | (User.email == login_id)).first()
    if not user:
        verify_password(password, _DUMMY_HASH)  # same timing as a wrong password
        write_audit(db, login_id, "Failed login", "no account with that username/email")
        _fail(401, INTERNAL_LOGIN_FAILED)
    if _user_is_locked(user):
        write_audit(db, user, "Failed login", "account is locked after too many wrong passwords")
        _fail(401, INTERNAL_LOGIN_FAILED)
    if not verify_password(password, user.password_hash):
        _register_user_failure(db, user)
        write_audit(db, user, "Failed login", "wrong password")
        _fail(401, INTERNAL_LOGIN_FAILED)
    # The account's state is only revealed to someone who knows its password.
    if user.status == "Invited":
        write_audit(db, user, "Failed login", "account not activated yet (invite pending)")
        _fail(403, "This account hasn't been activated yet. Use your password setup link, or ask an administrator for a new one.")
    if user.status != "Active":
        write_audit(db, user, "Failed login", "account is deactivated")
        _fail(403, "This account has been deactivated. Contact an administrator.")
    if user.failed_attempts or user.locked_until:
        user.failed_attempts, user.locked_until = 0, None
        db.commit()

    if requested_scope and requested_scope not in VALID_CHANNEL_SCOPES:
        write_audit(db, user, "Failed login", f"requested unknown workspace '{requested_scope}'")
        _fail(403, "Unknown workspace.")

    ticket_role = ticket_role_of(user)
    allowed_channels = allowed_channels_of(user)
    if ticket_role == "ADMIN":
        final_scope = requested_scope or "all"
    else:
        final_scope = requested_scope or user.channel_scope
        if final_scope == "all" or final_scope not in allowed_channels:
            write_audit(db, user, "Failed login", f"tried workspace '{final_scope}' outside assigned ticket channels")
            _fail(403, "This account can only sign in to its assigned portal.")

    require_enabled_channel(db, final_scope)
    login_by = "username" if user.username.lower() == login_id else "email"
    token = create_access_token(subject=user.id, auth_type="internal",
                                scope={"channelScope": final_scope, "loginBy": login_by, "loginId": login_id,
                                       "sv": user.session_version or 0})
    write_audit(db, user, "Logged in", f"{user.role}, portal {final_scope}")
    identity = {"auth_type": "internal", "user_id": user.id, "username": user.username, "name": user.name,
                "email": user.email, "role": user.role, "title": user.title, "dept": user.dept,
                "channel_scope": final_scope, "ticket_role": ticket_role, "allowed_channels": allowed_channels}
    return {"token": token, "auth": session_auth(identity)}


def forgot_password(db: Session, email: str) -> None:
    """Email reset instructions to an active account; says nothing either way."""
    user = db.query(User).filter(func.lower(User.email) == email.strip().lower(), User.status == "Active").first()
    if not user or not smtp_is_configured():
        return
    try:
        link = issue_password_reset(db, user, admin_initiated=False)
        db.commit()
        text, html = password_reset_email(user.name, link["setupLink"], link["expiryMinutes"], admin_initiated=False)
        send_email(user.email, "Reset your Invoice to Payment Tracker password", text, html)
    except Exception:
        db.rollback()
        logger.exception("Forgot-password email delivery failed")


def _reset_token_query(db: Session, token: str):
    # Links are stored hashed; short legacy rows were stored as issued.
    return db.query(PasswordResetToken).filter(or_(
        PasswordResetToken.token == token_digest(token),
        and_(func.length(PasswordResetToken.token) < 64, PasswordResetToken.token == token),
    ))


def password_link_info(db: Session, token: str) -> dict:
    """Reveal the sign-in identity only to the holder of a valid, unused link."""
    record = _reset_token_query(db, token).filter(
        PasswordResetToken.used.is_(False), PasswordResetToken.expires_at > datetime.utcnow(),
    ).first()
    user = db.get(User, record.user_id) if record else None
    if not user or user.status not in ("Invited", "Active"):
        _fail(400, INVALID_RESET_LINK)
    return {"email": user.email, "name": user.name, "linkType": "invite" if user.status == "Invited" else "reset"}


def reset_password(db: Session, token: str, password: str) -> None:
    _require_strong_password(password)
    record = _reset_token_query(db, token).first()
    if not record:
        _fail(400, INVALID_RESET_LINK)
    # Lock user first (the same order as link issuance), then refresh the token.
    user = db.query(User).filter(User.id == record.user_id).populate_existing().with_for_update().first()
    record = db.query(PasswordResetToken).filter(PasswordResetToken.id == record.id).populate_existing().with_for_update().first()
    if (not user or user.status not in ("Invited", "Active") or not record
            or record.used or record.expires_at <= datetime.utcnow()):
        _fail(400, INVALID_RESET_LINK)

    _require_strong_password(password, [user.username, user.email, user.name])
    was_invited = user.status == "Invited"
    claimed = db.query(PasswordResetToken).filter(
        PasswordResetToken.id == record.id, PasswordResetToken.used.is_(False),
        PasswordResetToken.expires_at > datetime.utcnow(),
    ).update({"used": True}, synchronize_session=False)
    if claimed != 1:
        db.rollback()
        _fail(400, INVALID_RESET_LINK)
    user.password_hash = get_password_hash(password)
    user.session_version = (user.session_version or 0) + 1  # sign out every existing session
    user.failed_attempts, user.locked_until = 0, None
    if was_invited:
        user.status = "Active"
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id, PasswordResetToken.used.is_(False),
    ).update({"used": True}, synchronize_session=False)
    write_audit(db, user, "Activated invite" if was_invited else "Reset own password",
                f"({user.email}) via one-time password link")


# ---------- suppliers ----------

def login_supplier_password(db: Session, email: str, password: str) -> dict:
    """Email + password sign-in for managed supplier accounts (the email is unique; a PAN may
    have several accounts and is sometimes blank)."""
    email = normalize_email(email)
    actor = f"Supplier {email}"
    supplier = db.query(Supplier).filter(func.lower(Supplier.email) == email).first() if email else None
    if not supplier or supplier.status != "Active" or not supplier.password_hash:
        write_audit(db, actor, "Failed login", "unknown email, not active, or no password set")
        _fail(401, GENERIC_LOGIN_ERROR)
    if is_locked(supplier):
        write_audit(db, actor, "Failed login", "account is locked after too many wrong attempts")
        _fail(401, GENERIC_LOGIN_ERROR)
    if not verify_password(password, supplier.password_hash):
        register_failure(db, supplier)
        write_audit(db, actor, "Failed login", "wrong password")
        _fail(401, GENERIC_LOGIN_ERROR)

    channels = supplier_channels(supplier)
    available = channel_availability(db)
    if channels and not any(available.get(c, True) for c in channels):
        require_enabled_channel(db, channels[0])  # raises the usual "channel switched off" error
    clear_failures(db, supplier)
    session = build_session(supplier)
    write_audit(db, actor, "Logged in", f"{supplier.name}, supplier portal")
    return session


def valid_setup_record(db: Session, token: str) -> SupplierSetupToken:
    record = db.query(SupplierSetupToken).filter(SupplierSetupToken.token == token).first()
    if not record or record.used or record.expires_at < datetime.utcnow():
        _fail(400, INVALID_SETUP_LINK)
    supplier = db.get(Supplier, record.supplier_id)
    # A setup link is for an account that has no password yet; a reset link (forgot password)
    # may also be used by an active account.
    allowed = ("Invited", "Active") if record.link_type == "reset" else ("Invited",)
    if not supplier or supplier.status not in allowed:
        _fail(400, INVALID_SETUP_LINK)
    return record


def complete_supplier_setup(db: Session, token: str, email: str, password: str) -> None:
    _require_strong_password(password)
    record = valid_setup_record(db, token)
    supplier = db.get(Supplier, record.supplier_id)
    actor = f"Supplier {supplier.email}"
    if is_locked(supplier):
        _fail(400, "Too many wrong attempts. Try again in 15 minutes.")
    if normalize_email(email) != normalize_email(supplier.email):
        register_failure(db, supplier)
        write_audit(db, actor, "Failed setup", "email did not match the setup link")
        _fail(400, "That email doesn't match this link.")

    _require_strong_password(password, [supplier.email, supplier.name])
    supplier.password_hash = get_password_hash(password)
    supplier.status = "Active"
    supplier.failed_attempts, supplier.locked_until = 0, None
    record.used = True
    db.commit()
    write_audit(db, actor, "Completed setup", f"{supplier.name} set a password")


def supplier_forgot_password(db: Session, email: str) -> None:
    """Email a reset link to an active supplier account; says nothing either way."""
    email = normalize_email(email)
    supplier = db.query(Supplier).filter(func.lower(Supplier.email) == email).first()
    if supplier and supplier.status == "Active":
        send_access_email(db, supplier, "reset")
        write_audit(db, f"Supplier {email}", "Requested password reset", supplier.name)


# ---------- sign-out ----------

def record_logout(db: Session, payload: dict) -> None:
    """Sign-out ends the session on the server too: the account's session version goes up, so
    this token (and any other session of the same account) stops working at once."""
    if payload.get("auth_type") == "supplier":
        supplier = db.get(Supplier, int(payload.get("sub")))
        if supplier and token_session_version(payload) == (supplier.session_version or 0):
            supplier.session_version = (supplier.session_version or 0) + 1
            db.commit()
        who = (payload.get("scope") or {}).get("pan") or (supplier.email if supplier else payload.get("sub"))
        write_audit(db, f"Supplier {who}", "Logged out", "supplier portal")
        return
    user = db.query(User).filter(User.id == int(payload.get("sub"))).first()
    if user:
        if token_session_version(payload) == (user.session_version or 0):
            user.session_version = (user.session_version or 0) + 1
            db.commit()
        write_audit(db, user, "Logged out", "")
