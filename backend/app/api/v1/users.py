import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user_token
from app.core.audit import write_audit
from app.core.database import get_db
from app.core.password_reset import issue_invite, issue_password_reset
from app.core.security import get_password_hash
from app.models.settings import AppSettings
from app.models.user import PasswordResetToken, User, UserChannelAccess

router = APIRouter()

VALID_ROLES = ["Admin", "MDE Invoice Team", "Approver", "Accounts", "Viewer"]
VALID_STATUSES = ["Active", "Inactive", "Invited"]
CHANNEL_SCOPES = ["all", "msetuSrm", "poPortal", "mfoxPortal"]
TICKET_ROLES = ["CHANNEL_LEAD", "ASSIGNEE", "NO_ACCESS"]

DEFAULT_ROLE_MATRIX = {
    "Admin": {"importExport": True, "editRows": True, "createTrace": True, "manageUsers": True, "manageConfig": True},
    "MDE Invoice Team": {"importExport": True, "editRows": True, "createTrace": True, "manageUsers": False, "manageConfig": False},
    "Approver": {"importExport": False, "editRows": False, "createTrace": True, "manageUsers": False, "manageConfig": False},
    "Accounts": {"importExport": False, "editRows": True, "createTrace": True, "manageUsers": False, "manageConfig": False},
    "Viewer": {"importExport": False, "editRows": False, "createTrace": True, "manageUsers": False, "manageConfig": False},
}


def require_internal_user(
    payload: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db),
) -> User:
    if payload.get("auth_type") != "internal":
        raise HTTPException(status_code=403, detail="Internal users only.")
    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid session.")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid session.")
    if user.status != "Active":
        raise HTTPException(status_code=403, detail="This account has been deactivated.")
    return user


def require_manage_users(
    current: User = Depends(require_internal_user),
    db: Session = Depends(get_db),
) -> User:
    settings = db.query(AppSettings).filter(AppSettings.id == 1).first()
    role_matrix = (settings.role_matrix_json if settings else None) or DEFAULT_ROLE_MATRIX
    if not bool(role_matrix.get(current.role, {}).get("manageUsers")):
        raise HTTPException(status_code=403, detail="You don't have permission to manage users.")
    return current


def _effective_ticket_role(role: str, ticket_role: Optional[str]) -> str:
    if role == "Admin":
        return "ADMIN"
    if ticket_role is None:
        return "ASSIGNEE" if role == "MDE Invoice Team" else "NO_ACCESS"
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


def _sync_ticket_channels(user: User, channel_scope: str):
    user.ticket_channels.clear()
    if channel_scope != "all":
        user.ticket_channels.append(UserChannelAccess(channel=channel_scope))


class UserCreate(BaseModel):
    username: str
    name: str
    email: EmailStr
    role: str
    channelScope: str
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
    channelScope: Optional[str] = None
    ticketRole: Optional[str] = None


def _validate_role(role: Optional[str]):
    if role is not None and role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Unknown role. Use one of: {', '.join(VALID_ROLES)}")


def _validate_status(status: Optional[str]):
    if status is not None and status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Unknown status. Use one of: {', '.join(VALID_STATUSES)}")


def _resolve_channel_scope(role: str, channel_scope: Optional[str]) -> str:
    if role == "Admin":
        return "all"
    if channel_scope not in CHANNEL_SCOPES or channel_scope == "all":
        raise HTTPException(
            status_code=400,
            detail="Assign one specific portal (Msetu / SRM, PO Portal or MFOX Portal) for this role.",
        )
    return channel_scope


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
    existing = db.query(User).filter(
        (User.username == user_in.username) | (User.email == user_in.email)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already exists.")

    channel_scope = _resolve_channel_scope(user_in.role, user_in.channelScope)
    ticket_role = _effective_ticket_role(user_in.role, user_in.ticketRole)
    new_user = User(
        username=user_in.username,
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
    _sync_ticket_channels(new_user, channel_scope)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    issue_invite(db, new_user)
    write_audit(
        db,
        actor,
        "Invited user",
        f"{new_user.name} ({new_user.username}), role {new_user.role}, portal {channel_scope}",
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
    requested_scope = patch.channelScope if patch.channelScope is not None else user.channel_scope
    if patch.channelScope is not None and patch.channelScope not in CHANNEL_SCOPES:
        raise HTTPException(status_code=400, detail=f"Unknown portal. Use one of: {', '.join(CHANNEL_SCOPES)}")
    channel_scope = _resolve_channel_scope(effective_role, requested_scope)
    stored_ticket_role = user.ticket_role
    if user.role == "Admin" and effective_role != "Admin" and patch.ticketRole is None:
        stored_ticket_role = None
    ticket_role = _effective_ticket_role(
        effective_role,
        patch.ticketRole if patch.ticketRole is not None else stored_ticket_role,
    )

    changes = []
    for field in ("name", "email", "title", "dept", "role", "status"):
        value = getattr(patch, field)
        if value is not None and value != getattr(user, field):
            changes.append(f"{field} -> {value}")
            setattr(user, field, value)
    if channel_scope != user.channel_scope:
        changes.append(f"portal -> {channel_scope}")
        user.channel_scope = channel_scope
        _sync_ticket_channels(user, channel_scope)
    if ticket_role != user.ticket_role:
        changes.append(f"ticket role -> {ticket_role}")
        user.ticket_role = ticket_role

    db.commit()
    db.refresh(user)
    if changes:
        write_audit(db, actor, "Updated user", f"{user.name} ({user.username}): {', '.join(changes)}")
    return _serialize(user)


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
    name, username = user.name, user.username
    db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user_id).delete()
    db.delete(user)
    db.commit()
    write_audit(db, actor, "Removed user", f"{name} ({username})")
    return {"msg": "User removed."}
