import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional

from app.api.v1.auth import get_current_user_token
from app.core.audit import write_audit
from app.core.database import get_db
from app.core.password_reset import issue_invite, issue_password_reset
from app.core.security import get_password_hash
from app.models.user import PasswordResetToken, User
from app.models.settings import AppSettings

router = APIRouter()

# Mirrors frontend/src/data/constants.js ROLE_MATRIX — the roles the app actually knows
# permissions for. Kept in sync manually since the capability matrix itself lives in
# per-tenant settings, not in the database.
VALID_ROLES = ["Admin", "MDE Invoice Team", "Approver", "Accounts", "Viewer"]
# "Invited" is system-assigned only (set at creation, cleared when the invite is accepted) —
# never something an admin picks directly via PATCH; kept here so it round-trips cleanly.
VALID_STATUSES = ["Active", "Inactive", "Invited"]

# Mirrors the frontend's channel keys (data/constants.js CHANNELS). "all" — every channel,
# the HQ view — may only ever be assigned to an Admin; everyone else is locked to exactly
# one of the specific portals below.
CHANNEL_SCOPES = ["all", "msetuSrm", "poPortal", "mfoxPortal"]

# Same defaults as frontend/src/data/constants.js ROLE_MATRIX — used until an admin edits
# Settings > Roles & Permissions and a role matrix is actually saved to the database.
DEFAULT_ROLE_MATRIX = {
    "Admin": {"importExport": True, "editRows": True, "createTrace": True, "manageUsers": True, "manageConfig": True},
    "MDE Invoice Team": {"importExport": True, "editRows": True, "createTrace": True, "manageUsers": False, "manageConfig": False},
    "Approver": {"importExport": False, "editRows": False, "createTrace": True, "manageUsers": False, "manageConfig": False},
    "Accounts": {"importExport": False, "editRows": True, "createTrace": True, "manageUsers": False, "manageConfig": False},
    "Viewer": {"importExport": False, "editRows": False, "createTrace": True, "manageUsers": False, "manageConfig": False},
}


def require_internal_user(payload: dict = Depends(get_current_user_token), db: Session = Depends(get_db)) -> User:
    """Any signed-in internal user (not a supplier token)."""
    if payload.get("auth_type") != "internal":
        raise HTTPException(status_code=403, detail="Internal users only.")
    user = db.query(User).filter(User.id == int(payload.get("sub"))).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid session.")
    return user


def require_manage_users(current: User = Depends(require_internal_user), db: Session = Depends(get_db)) -> User:
    """Only a role with the manageUsers capability may create, edit or remove accounts."""
    settings = db.query(AppSettings).filter(AppSettings.id == 1).first()
    role_matrix = (settings.role_matrix_json if settings else None) or DEFAULT_ROLE_MATRIX
    can_manage = bool(role_matrix.get(current.role, {}).get("manageUsers"))
    if not can_manage:
        raise HTTPException(status_code=403, detail="You don't have permission to manage users.")
    return current


def _serialize(u: User) -> dict:
    return {
        "id": u.id, "username": u.username, "name": u.name, "email": u.email,
        "title": u.title, "dept": u.dept, "role": u.role, "status": u.status,
        "channelScope": u.channel_scope,
    }


class UserCreate(BaseModel):
    """No password field on purpose: whoever creates the account never sets or sees its
    password. The new account is emailed an invite link and sets its own on first use."""
    username: str
    name: str
    email: EmailStr
    role: str
    channelScope: str
    dept: Optional[str] = ""
    title: Optional[str] = ""


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    title: Optional[str] = None
    dept: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    channelScope: Optional[str] = None


def _validate_role(role: Optional[str]):
    if role is not None and role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Unknown role. Use one of: {', '.join(VALID_ROLES)}")


def _validate_status(status: Optional[str]):
    if status is not None and status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Unknown status. Use one of: {', '.join(VALID_STATUSES)}")


def _resolve_channel_scope(role: str, channel_scope: Optional[str]) -> str:
    """Validate the (role, portal) pair and return the scope that should actually be stored.
    Admin is always "all"; every other role must be locked to one specific portal."""
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
    return [_serialize(u) for u in db.query(User).order_by(User.name).all()]


@router.post("/")
def create_user(user_in: UserCreate, db: Session = Depends(get_db), actor: User = Depends(require_manage_users)):
    _validate_role(user_in.role)
    existing = db.query(User).filter(
        (User.username == user_in.username) | (User.email == user_in.email)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already exists.")
    channel_scope = _resolve_channel_scope(user_in.role, user_in.channelScope)

    new_user = User(
        username=user_in.username,
        # An unguessable placeholder no one is ever given — login is blocked by
        # status="Invited" anyway, but this also means the hash itself is never a real,
        # usable password even if that check were ever bypassed.
        password_hash=get_password_hash(secrets.token_urlsafe(32)),
        name=user_in.name,
        email=user_in.email,
        role=user_in.role,
        channel_scope=channel_scope,
        dept=user_in.dept or "",
        title=user_in.title or "",
        status="Invited",
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    issue_invite(db, new_user)
    write_audit(db, actor, "Invited user", f"{new_user.name} ({new_user.username}), role {new_user.role}, portal {channel_scope}")
    return _serialize(new_user)


@router.patch("/{user_id}")
def update_user(user_id: int, patch: UserUpdate, db: Session = Depends(get_db), actor: User = Depends(require_manage_users)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    _validate_role(patch.role)
    _validate_status(patch.status)
    if patch.email and patch.email != user.email:
        if db.query(User).filter(User.email == patch.email, User.id != user_id).first():
            raise HTTPException(status_code=400, detail="That email is already in use.")

    # Role and portal are validated together: changing either one re-checks the pair, so a
    # role change (e.g. Admin → Viewer) can't silently leave an invalid "all" scope in place.
    new_channel_scope = None
    if patch.role is not None or patch.channelScope is not None:
        effective_role = patch.role if patch.role is not None else user.role
        requested_scope = patch.channelScope if patch.channelScope is not None else user.channel_scope
        if patch.channelScope is not None and patch.channelScope not in CHANNEL_SCOPES:
            raise HTTPException(status_code=400, detail=f"Unknown portal. Use one of: {', '.join(CHANNEL_SCOPES)}")
        new_channel_scope = _resolve_channel_scope(effective_role, requested_scope)

    changes = []
    for field in ("name", "email", "title", "dept", "role", "status"):
        value = getattr(patch, field)
        if value is not None and value != getattr(user, field):
            changes.append(f"{field} → {value}")
            setattr(user, field, value)
    if new_channel_scope is not None and new_channel_scope != user.channel_scope:
        changes.append(f"portal → {new_channel_scope}")
        user.channel_scope = new_channel_scope

    db.commit()
    db.refresh(user)
    if changes:
        write_audit(db, actor, "Updated user", f"{user.name} ({user.username}): {', '.join(changes)}")
    return _serialize(user)


@router.post("/{user_id}/reset-password")
def reset_password(user_id: int, db: Session = Depends(get_db), actor: User = Depends(require_manage_users)):
    """Emails the account holder a reset link — the admin triggering this never sets or
    sees the new password; only the account holder does, by following the link. For an
    account that never accepted its invite, this resends that invite instead."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if user.status == "Invited":
        issue_invite(db, user)
        write_audit(db, actor, "Resent invite", f"{user.name} ({user.username})")
    else:
        issue_password_reset(db, user, admin_initiated=True)
        write_audit(db, actor, "Requested password reset", f"{user.name} ({user.username}) — reset link emailed")
    return {"msg": f"A link has been emailed to {user.email}."}


@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), actor: User = Depends(require_manage_users)):
    if user_id == actor.id:
        raise HTTPException(status_code=400, detail="You can't remove your own account.")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    name, username = user.name, user.username
    # Any invite/reset tokens for this account would otherwise block the delete outright
    # (foreign key on user_id) — there's nothing left to protect once the account is gone.
    db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user_id).delete()
    db.delete(user)
    db.commit()
    write_audit(db, actor, "Removed user", f"{name} ({username})")
    return {"msg": "User removed."}
