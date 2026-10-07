"""Shared logic for issuing a password-set/reset token and emailing it — used by the
self-service /auth/forgot-password flow, an admin's "reset password" action in Settings >
Users, and inviting a newly-created account. None of these paths ever set or reveal the
actual password; only the account holder, by following the emailed link, ever knows it.

All three funnel through the same /auth/reset-password endpoint to actually consume the
token — completing an invite is just a reset that also flips status Invited -> Active."""
import os
import secrets
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.email import send_email
from app.core.email_templates import email_changed_email, invite_email, password_reset_email
from app.models.user import PasswordResetToken, User

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
RESET_TOKEN_LIFETIME_MINUTES = 30
INVITE_TOKEN_LIFETIME_MINUTES = 60 * 24 * 7  # 7 days — an invite sits unread longer than a reset should


def _issue_token(db: Session, user: User, lifetime_minutes: int) -> str:
    # A fresh request supersedes any earlier one still outstanding for this account.
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id, PasswordResetToken.used == False,  # noqa: E712
    ).update({"used": True})

    token = secrets.token_urlsafe(32)
    db.add(PasswordResetToken(
        token=token, user_id=user.id,
        expires_at=datetime.utcnow() + timedelta(minutes=lifetime_minutes),
    ))
    db.commit()
    return token


def issue_password_reset(db: Session, user: User, admin_initiated: bool = False) -> None:
    """For an existing, active account that wants/needs a new password."""
    token = _issue_token(db, user, RESET_TOKEN_LIFETIME_MINUTES)
    link = f"{FRONTEND_URL}/reset-password?token={token}"
    text, html = password_reset_email(user.name, link, RESET_TOKEN_LIFETIME_MINUTES, admin_initiated=admin_initiated)
    send_email(to=user.email, subject="Reset your Invoice to Payment Tracker password", text=text, html=html)


def issue_invite(db: Session, user: User) -> None:
    """For a brand-new (status="Invited") account — longer-lived link, welcome copy."""
    token = _issue_token(db, user, INVITE_TOKEN_LIFETIME_MINUTES)
    link = f"{FRONTEND_URL}/reset-password?token={token}"
    text, html = invite_email(user.name, user.role, link, INVITE_TOKEN_LIFETIME_MINUTES)
    send_email(to=user.email, subject="You've been added to Invoice to Payment Tracker", text=text, html=html)


def notify_email_changed(user: User, old_email: str) -> None:
    """Heads-up to the address an account just moved away from."""
    text, html = email_changed_email(user.name, user.email)
    send_email(to=old_email, subject="Your Invoice to Payment Tracker email was changed", text=text, html=html)
