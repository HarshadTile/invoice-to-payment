import logging
import re
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user_token
from app.core.audit import write_audit
from app.core.database import get_db
from app.core.permissions import require_capability, require_internal_user
from app.core.password_reset import issue_invite, issue_password_reset, notify_email_changed
from app.core.security import get_password_hash
from app.models.user import PasswordResetToken, User, UserChannelAccess

router = APIRouter()
logger = logging.getLogger(__name__)

VALID_ROLES = ["Admin", "Invoice Team", "Approver", "Accounts", "Viewer"]
VALID_STATUSES = ["Active", "Inactive", "Invited"]
CHANNEL_SCOPES = ["all", "msetuSrm", "poPortal", "mfoxPortal"]
TICKET_ROLES = ["CHANNEL_LEAD", "ASSIGNEE", "NO_ACCESS"]
# Channels a non-admin can be authorized for. "all" is Admin-only and never stored as a membership.
SPECIFIC_CHANNELS = [c for c in CHANNEL_SCOPES if c != "all"]

require_manage_users = require_capability("manageUsers", "You don't have permission to manage users.")


def _effective_ticket_role(role: str, ticket_role: Optional[str]) -> str:
    if role == "Admin":
        return "ADMIN"
    if ticket_role is None:
        # Application role says nothing about tickets: nobody becomes an assignee or lead
        # unless an admin grants it explicitly.
        return "NO_ACCESS"
    value = ticket_role.upper()
    if value not in TICKET_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown ticket role. Use one of: {', '.join(TICKET_ROLES)}",
        )
    return value


def _serialize(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "name": user.name,
        "email": user.email,
        "title": user.title,
        "dept": user.dept,
        "role": user.role,
        "status": user.status,
        "channelScope": user.channel_scope,
        "ticketRole": "ADMIN" if user.role == "Admin" else (user.ticket_role or "NO_ACCESS"),
        "channels": sorted(membership.channel for membership in user.ticket_channels),
    }


def _sync_ticket_channels(user: User, channels: list[str]):
    user.ticket_channels.clear()
    for channel in channels:
        user.ticket_channels.append(UserChannelAccess(channel=channel))


class UserCreate(BaseModel):
    username: Optional[str] = None  # optional: defaults to the email's local part
    name: str
    email: EmailStr
    role: str
    channelScope: Optional[str] = None  # legacy single-channel form of `channels`
    channels: Optional[list[str]] = None
    dept: Optional[str] = ""
    title: Optional[str] = ""
    ticketRole: Optional[str] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    title: Optional[str] = None
    dept: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    channelScope: Optional[str] = None  # legacy single-channel form of `channels`
    channels: Optional[list[str]] = None
    ticketRole: Optional[str] = None


def _ensure_another_active_admin(db: Session, user: User):
    """Block any change that would leave no active Admin able to manage users and settings."""
    others = db.query(User).filter(
        User.role == "Admin", User.status == "Active", User.id != user.id,
    ).count()
    if others == 0:
        raise HTTPException(
            status_code=400,
            detail="This is the only active Admin. Make another user an active Admin first.",
        )


def _username_from_email(db: Session, email: str) -> str:
    """A unique login name derived from the email, for accounts created without one. People
    sign in with their email, so the username is just an internal identifier."""
    base = re.sub(r"[^a-z0-9._-]", "", email.split("@")[0].lower()) or "user"
    candidate, suffix = base, 2
    while db.query(User).filter(User.username == candidate).first():
        candidate, suffix = f"{base}{suffix}", suffix + 1
    return candidate


def _validate_role(role: Optional[str]):
    if role is not None and role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Unknown role. Use one of: {', '.join(VALID_ROLES)}")


def _validate_status(status: Optional[str]):
    if status is not None and status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Unknown status. Use one of: {', '.join(VALID_STATUSES)}")


def _resolve_channels(role: str, requested: Optional[list[str]], single: bool = True) -> list[str]:
    """The channel an account is authorized for. Admin always has every channel (stored as
    scope "all", no per-channel rows); anyone else works in exactly one specific channel.
    `single=False` only for an edit that doesn't touch channels, so an older account that still
    has several can be updated (status, name...) without being forced to pick one."""
    if role == "Admin":
        return []
    picked = list(dict.fromkeys(requested or []))
    if not picked or any(c not in SPECIFIC_CHANNELS for c in picked):
        raise HTTPException(
            status_code=400,
            detail="Pick the authorized channel (Msetu / SRM, PO Portal or MFOX Portal) for this role.",
        )
    if single and len(picked) > 1:
        raise HTTPException(status_code=400, detail="A user can be authorized for only one channel.")
    return picked


def _primary_scope(role: str, channels: list[str], current: Optional[str] = None) -> str:
    """The single channel_scope kept on the account: "all" for Admin, otherwise the current
    one if it's still authorized, else the first authorized channel."""
    if role == "Admin":
        return "all"
    return current if current in channels else channels[0]


@router.get("/")
def get_users(db: Session = Depends(get_db), _: User = Depends(require_internal_user)):
    return [_serialize(user) for user in db.query(User).order_by(User.name).all()]


@router.post("/")
def create_user(
    user_in: UserCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manage_users),
):
    _validate_role(user_in.role)
    username = (user_in.username or "").strip().lower() or _username_from_email(db, user_in.email)
    existing = db.query(User).filter(
        (User.username == username) | (User.email == user_in.email)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already exists.")

    requested = user_in.channels if user_in.channels is not None else (
        [user_in.channelScope] if user_in.channelScope else []
    )
    channels = _resolve_channels(user_in.role, requested)
    channel_scope = _primary_scope(user_in.role, channels)
    ticket_role = _effective_ticket_role(user_in.role, user_in.ticketRole)
    new_user = User(
        username=username,
        password_hash=get_password_hash(secrets.token_urlsafe(32)),
        name=user_in.name,
        email=user_in.email,
        role=user_in.role,
        channel_scope=channel_scope,
        ticket_role=ticket_role,
        dept=user_in.dept or "",
        title=user_in.title or "",
        status="Invited",
    )
    _sync_ticket_channels(new_user, channels)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    issue_invite(db, new_user)
    write_audit(
        db,
        actor,
        "Invited user",
        f"{new_user.name} ({new_user.username}), role {new_user.role}, "
        f"channels {', '.join(channels) if channels else 'all'}, ticket role {ticket_role}",
    )
    return _serialize(new_user)


@router.patch("/{user_id}")
def update_user(
    user_id: int,
    patch: UserUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manage_users),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    _validate_role(patch.role)
    _validate_status(patch.status)
    if patch.email and patch.email != user.email:
        if db.query(User).filter(User.email == patch.email, User.id != user_id).first():
            raise HTTPException(status_code=400, detail="That email is already in use.")

    effective_role = patch.role if patch.role is not None else user.role
    effective_status = patch.status if patch.status is not None else user.status
    if user.role == "Admin" and user.status == "Active" and (effective_role != "Admin" or effective_status != "Active"):
        _ensure_another_active_admin(db, user)
    if patch.channelScope is not None and patch.channelScope not in CHANNEL_SCOPES:
        raise HTTPException(status_code=400, detail=f"Unknown portal. Use one of: {', '.join(CHANNEL_SCOPES)}")
    current_channels = sorted(m.channel for m in user.ticket_channels)
    if patch.channels is not None:
        requested = patch.channels
    elif patch.channelScope is not None:
        requested = [patch.channelScope]
    else:
        requested = current_channels or ([user.channel_scope] if user.channel_scope != "all" else [])
    channels_given = patch.channels is not None or patch.channelScope is not None
    channels = _resolve_channels(effective_role, requested, single=channels_given or effective_role != user.role)
    channel_scope = _primary_scope(effective_role, channels, user.channel_scope)
    stored_ticket_role = user.ticket_role
    if user.role == "Admin" and effective_role != "Admin" and patch.ticketRole is None:
        stored_ticket_role = None
    ticket_role = _effective_ticket_role(
        effective_role,
        patch.ticketRole if patch.ticketRole is not None else stored_ticket_role,
    )

    old_email = user.email
    changes = []
    for field in ("name", "email", "title", "dept", "role", "status"):
        value = getattr(patch, field)
        if value is not None and value != getattr(user, field):
            changes.append(f"{field} -> {value}")
            setattr(user, field, value)
    if channel_scope != user.channel_scope or sorted(channels) != current_channels:
        changes.append(f"channels -> {', '.join(channels) if channels else 'all'}")
        user.channel_scope = channel_scope
        _sync_ticket_channels(user, channels)
    if ticket_role != user.ticket_role:
        changes.append(f"ticket role -> {ticket_role}")
        user.ticket_role = ticket_role

    db.commit()
    db.refresh(user)
    if changes:
        write_audit(db, actor, "Updated user", f"{user.name} ({user.username}): {', '.join(changes)}")
    result = _serialize(user)
    if user.email != old_email:
        # "sent" / "failed" / None (nothing to send, e.g. an Inactive account) — lets the UI
        # tell the admin whether the new address actually got a link.
        result["emailLink"] = _handle_email_change(db, user, old_email)
    return result


def _handle_email_change(db: Session, user: User, old_email: str) -> Optional[str]:
    """A link already emailed to the old address must not keep working once the account
    moves to a new one, and the new address should immediately get a working link — which
    also proves it's a real inbox. Never fails the edit itself: the new email is already
    saved, and an admin can resend from the key icon if the mail doesn't go out. An Active
    account's old address also gets a heads-up that it moved."""
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id, PasswordResetToken.used == False,  # noqa: E712
    ).update({"used": True})
    db.commit()
    if user.status not in ("Invited", "Active"):
        return None
    try:
        if user.status == "Invited":
            issue_invite(db, user)
        else:
            issue_password_reset(db, user, admin_initiated=True)
        outcome = "sent"
    except Exception:  # noqa: BLE001 — SMTP can fail in many ways; see docstring
        logger.exception("Couldn't email a link to the new address for user %s", user.username)
        outcome = "failed"
    if user.status == "Active":
        try:
            notify_email_changed(user, old_email)
        except Exception:  # noqa: BLE001
            logger.exception("Couldn't notify the old address for user %s", user.username)
    return outcome


@router.post("/{user_id}/reset-password")
def reset_password(
    user_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manage_users),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.status == "Invited":
        issue_invite(db, user)
        write_audit(db, actor, "Resent invite", f"{user.name} ({user.username})")
    else:
        issue_password_reset(db, user, admin_initiated=True)
        write_audit(db, actor, "Requested password reset", f"{user.name} ({user.username}) - reset link emailed")
    return {"msg": f"A link has been emailed to {user.email}."}


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manage_users),
):
    if user_id == actor.id:
        raise HTTPException(status_code=400, detail="You can't remove your own account.")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.role == "Admin" and user.status == "Active":
        _ensure_another_active_admin(db, user)
    name, username = user.name, user.username
    db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user_id).delete()
    db.delete(user)
    db.commit()
    write_audit(db, actor, "Removed user", f"{name} ({username})")
    return {"msg": "User removed."}
