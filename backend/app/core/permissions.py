"""Server-side permission checks for the internal (HQ / Internal Team) side of the app.

The role -> capability matrix is editable in Settings > Roles & Permissions and stored in
the settings table. Whatever the browser hides or shows, every protected endpoint must
check it here: the frontend is a convenience, not the enforcement point.
"""
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user_token
from app.core.database import get_db
from app.models.settings import AppSettings
from app.models.user import User

# What each key means (labels live in the frontend's Roles & Permissions page):
#   importExport  export tables to Excel          createTrace   search invoices
#   manageConfig  integration + notification settings, sender email, 2FA
#   manageUsers   invite, edit, deactivate and remove users
#   manageRoles   change what each role may do (this matrix)
#   viewAuditLog  read the audit log
CAPABILITIES = ("importExport", "createTrace", "manageConfig", "manageUsers", "manageRoles", "viewAuditLog")

DEFAULT_ROLE_MATRIX = {
    "Admin": {"importExport": True, "createTrace": True, "manageConfig": True, "manageUsers": True, "manageRoles": True, "viewAuditLog": True},
    "Invoice Team": {"importExport": True, "createTrace": True, "manageConfig": False, "manageUsers": False, "manageRoles": False, "viewAuditLog": False},
    "Approver": {"importExport": False, "createTrace": True, "manageConfig": False, "manageUsers": False, "manageRoles": False, "viewAuditLog": False},
    "Accounts": {"importExport": False, "createTrace": True, "manageConfig": False, "manageUsers": False, "manageRoles": False, "viewAuditLog": False},
    "Viewer": {"importExport": False, "createTrace": True, "manageConfig": False, "manageUsers": False, "manageRoles": False, "viewAuditLog": False},
}

# Capabilities the Admin role must always keep, so a bad edit can never lock every admin
# out of fixing it.
ADMIN_LOCKED_CAPABILITIES = ("manageUsers", "manageConfig", "manageRoles")


def normalize_matrix(matrix: dict | None) -> dict:
    """The saved matrix reduced to the current capability list: capabilities it doesn't have
    yet (added in a later release) take their default, and retired ones are dropped. This
    keeps an older saved matrix working before, and regardless of, any data migration."""
    cleaned = {}
    for role, caps in (matrix or DEFAULT_ROLE_MATRIX).items():
        defaults = DEFAULT_ROLE_MATRIX.get(role, {})
        cleaned[role] = {cap: bool(caps.get(cap, defaults.get(cap, False))) for cap in CAPABILITIES}
    return cleaned


def load_role_matrix(db: Session) -> dict:
    settings = db.query(AppSettings).filter(AppSettings.id == 1).first()
    return normalize_matrix(settings.role_matrix_json if settings else None)


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


def has_capability(db: Session, user: User, capability: str) -> bool:
    return bool(load_role_matrix(db).get(user.role, {}).get(capability))


def require_capability(capability: str, message: str):
    """A FastAPI dependency: the caller must be an active internal user whose role has
    `capability` in the saved role matrix."""
    def dependency(
        current: User = Depends(require_internal_user),
        db: Session = Depends(get_db),
    ) -> User:
        if not has_capability(db, current, capability):
            raise HTTPException(status_code=403, detail=message)
        return current
    return dependency


