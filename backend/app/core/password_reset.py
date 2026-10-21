"""Issue one-time password links for administrators to share manually.

Raw tokens are returned once to the authorized caller; only their SHA-256 digest
is stored. Callers commit account changes, token issuance and audit together.
"""
import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.user import PasswordResetToken, User
from app.models.settings import AppSettings

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
RESET_TOKEN_LIFETIME_MINUTES = 1440
INVITE_TOKEN_LIFETIME_MINUTES = 60 * 24 * 7


def link_expiry_settings(db: Session) -> dict:
    settings = db.get(AppSettings, 1)
    return {
        "inviteLinkExpiryMinutes": (settings.invite_link_expiry_minutes if settings else None) or INVITE_TOKEN_LIFETIME_MINUTES,
        "resetLinkExpiryMinutes": (settings.reset_link_expiry_minutes if settings else None) or RESET_TOKEN_LIFETIME_MINUTES,
    }


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _issue_token(db: Session, user: User, lifetime_minutes: int, kind: str) -> dict:
    if type(lifetime_minutes) is not int or lifetime_minutes not in (30, 60, 240, 720, 1440, 2880, 4320, 10080):
        raise HTTPException(status_code=400, detail="Choose an allowed link expiry between 30 minutes and 7 days.")
    parsed = urlsplit(FRONTEND_URL)
    if (parsed.scheme not in ("http", "https") or not parsed.hostname
            or parsed.username or parsed.password or parsed.query or parsed.fragment):
        raise HTTPException(status_code=503, detail="The frontend URL is not configured correctly.")
    # Serialize issuance and consumption for this user, including multiple requests.
    locked = db.query(User).filter(User.id == user.id).populate_existing().with_for_update().one()
    if locked.status not in ("Invited", "Active"):
        raise HTTPException(status_code=400, detail="Inactive accounts cannot receive password links.")
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id, PasswordResetToken.used.is_(False),
    ).update({"used": True}, synchronize_session=False)
    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(minutes=lifetime_minutes)
    db.add(PasswordResetToken(
        token=token_digest(token), user_id=user.id, expires_at=expires,
    ))
    db.flush()
    return {
        "setupLink": f"{FRONTEND_URL}/reset-password?token={token}",
        "expiresAt": expires.replace(tzinfo=timezone.utc).isoformat(),
        "linkType": kind,
        "expiryMinutes": lifetime_minutes,
    }


def issue_invite(db: Session, user: User) -> dict:
    return _issue_token(db, user, link_expiry_settings(db)["inviteLinkExpiryMinutes"], "invite")


def issue_password_reset(db: Session, user: User, admin_initiated: bool = False) -> dict:
    return _issue_token(db, user, link_expiry_settings(db)["resetLinkExpiryMinutes"], "reset")
