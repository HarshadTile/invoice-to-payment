import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.audit import AUDIT_TABLE_KEY, write_audit
from app.core.database import get_db
from app.core.channels import channel_availability
from app.core.permissions import (
    ADMIN_LOCKED_CAPABILITIES,
    ADMIN_ROLE,
    CAPABILITIES,
    has_capability,
    load_role_matrix,
    require_capability,
    require_internal_user,
)
from app.models.settings import TableRow, AppSettings
from app.models.user import User
from app.schemas.settings import TableUpdate, SettingsUpdate
from app.services.ticket_permissions import permission_matrix

router = APIRouter(
    tags=["Settings"],
)

# The only grids the browser may overwrite. Every other table is either read-only in the UI
# (audit log), derived from system data (channel views) or managed through its own API (users).
WRITABLE_TABLES = {"settings-notifications"}


@router.get("/tables/{table_key}")
def get_table(
    table_key: str,
    user: User = Depends(require_internal_user),
    db: Session = Depends(get_db)
):
    """Current rows of one table — the Audit Logs screen polls this to stay live."""
    if table_key == AUDIT_TABLE_KEY and not has_capability(db, user, "viewAuditLog"):
        raise HTTPException(status_code=403, detail="You don't have permission to view the audit log.")
    rows = db.query(TableRow).filter(TableRow.table_key == table_key).order_by(TableRow.row_index).all()
    return {"rows": [r.cells_json for r in rows]}


@router.put("/tables/{table_key}")
def update_table(
    table_key: str,
    payload: TableUpdate,
    actor: User = Depends(require_capability("manageConfig", "You don't have permission to change configuration.")),
    db: Session = Depends(get_db)
):
    # The audit trail is append-only, written server-side by write_audit(); letting any
    # client replace it wholesale would let a user erase their own tracks.
    if table_key == AUDIT_TABLE_KEY:
        raise HTTPException(status_code=403, detail="The audit log is read-only.")
    if table_key not in WRITABLE_TABLES:
        raise HTTPException(status_code=403, detail="This table can't be edited here.")

    # Delete existing rows for this table_key
    db.query(TableRow).filter(TableRow.table_key == table_key).delete()

    # Insert new rows
    for idx, row in enumerate(payload.rows):
        db.add(TableRow(table_key=table_key, row_index=idx, cells_json=row))

    db.commit()
    write_audit(db, actor, "Updated notification rules", f"{len(payload.rows)} rule(s) saved")
    return {"msg": "Table updated"}


def _validate_role_matrix(new_matrix: dict, current_matrix: dict) -> dict:
    """A role matrix edit may toggle capabilities, but never add/remove roles or invent
    capabilities, and Admin must keep the ones that let someone fix a mistake."""
    if set(new_matrix) != set(current_matrix):
        raise HTTPException(status_code=400, detail="Roles can't be added or removed here, only their permissions changed.")
    cleaned = {}
    for role, caps in new_matrix.items():
        if set(caps) - set(CAPABILITIES):
            raise HTTPException(status_code=400, detail=f"Unknown permission for {role}.")
        # A capability missing from the request keeps its current value.
        cleaned[role] = {cap: bool(caps.get(cap, current_matrix[role].get(cap, False))) for cap in CAPABILITIES}
    for cap in ADMIN_LOCKED_CAPABILITIES:
        if not cleaned.get("Admin", {}).get(cap):
            raise HTTPException(status_code=400, detail="Admin must always keep user and configuration management.")
    return cleaned


def _matrix_diff(old: dict, new: dict) -> list[str]:
    changes = []
    for role, caps in new.items():
        for cap, value in caps.items():
            if bool(old.get(role, {}).get(cap)) != value:
                changes.append(f"{role}: {cap} {'granted' if value else 'revoked'}")
    return changes


@router.put("/settings")
def update_settings(
    payload: SettingsUpdate,
    actor: User = Depends(require_internal_user),
    db: Session = Depends(get_db)
):
    wants_matrix = payload.roleMatrix is not None
    wants_expiry = payload.inviteLinkExpiryMinutes is not None or payload.resetLinkExpiryMinutes is not None
    if wants_expiry and not has_capability(db, actor, "manageUsers"):
        raise HTTPException(status_code=403, detail="You don't have permission to manage password link expiry.")
    wants_supplier_expiry = payload.supplierInviteLinkExpiryMinutes is not None or payload.supplierResetLinkExpiryMinutes is not None
    if wants_supplier_expiry and not has_capability(db, actor, "manageSuppliers"):
        raise HTTPException(status_code=403, detail="You don't have permission to manage supplier password link expiry.")
    wants_config = payload.senderEmail is not None or payload.twoFactorOn is not None or payload.channelAvailability is not None
    if wants_matrix and not has_capability(db, actor, "manageRoles"):
        raise HTTPException(status_code=403, detail="You don't have permission to change roles and permissions.")
    if wants_config and not has_capability(db, actor, "manageConfig"):
        raise HTTPException(status_code=403, detail="You don't have permission to change configuration.")

    settings = db.query(AppSettings).filter(AppSettings.id == 1).first()
    if not settings:
        settings = AppSettings(
            id=1,
            role_matrix_json=load_role_matrix(db),
            two_factor=False,
            sender_email="i2ptracker@company.com",
            invite_link_expiry_minutes=10080,
            reset_link_expiry_minutes=1440,
            supplier_invite_link_expiry_minutes=10080,
            supplier_reset_link_expiry_minutes=1440,
        )
        db.add(settings)

    audit_entries = []
    if payload.channelAvailability is not None:
        previous = channel_availability(db)
        updated = {**previous, **payload.channelAvailability}
        settings.channel_availability = updated
        changes = [f"{key}: {'enabled' if value else 'disabled'}" for key, value in updated.items() if previous[key] != value]
        if changes:
            audit_entries.append(("Changed portal availability", "; ".join(changes)))
    for field, attr, default in (
        ("inviteLinkExpiryMinutes", "invite_link_expiry_minutes", 10080),
        ("resetLinkExpiryMinutes", "reset_link_expiry_minutes", 1440),
        ("supplierInviteLinkExpiryMinutes", "supplier_invite_link_expiry_minutes", 10080),
        ("supplierResetLinkExpiryMinutes", "supplier_reset_link_expiry_minutes", 1440),
    ):
        value = getattr(payload, field)
        previous = getattr(settings, attr) or default
        if value is not None and value != previous:
            setattr(settings, attr, value)
            audit_entries.append(("Changed password link expiry", f"{field}: {previous} -> {value} minutes"))
    if wants_matrix:
        current = load_role_matrix(db)
        cleaned = _validate_role_matrix(payload.roleMatrix, current)
        changes = _matrix_diff(current, cleaned)
        settings.role_matrix_json = cleaned
        if changes:
            audit_entries.append(("Changed role permissions", "; ".join(changes)))
    if payload.senderEmail is not None and payload.senderEmail != settings.sender_email:
        audit_entries.append(("Changed sender email", f"{settings.sender_email} -> {payload.senderEmail}"))
        settings.sender_email = payload.senderEmail
    if payload.twoFactorOn is not None and payload.twoFactorOn != settings.two_factor:
        audit_entries.append(("Changed two-factor setting", "on" if payload.twoFactorOn else "off"))
        settings.two_factor = payload.twoFactorOn

    db.commit()
    for action, detail in audit_entries:
        write_audit(db, actor, action, detail)
    return {"msg": "Settings updated"}


@router.get("/ticket-permissions")
def get_ticket_permissions(_: User = Depends(require_internal_user)):
    """What each ticket role may do, generated from the same rules the ticket endpoints
    enforce, for the read-only reference on the Roles & Permissions page."""
    return permission_matrix()


# ── Roles: create, rename, delete ──────────────────────────────────────────────
# Which roles exist is the saved role matrix. Admin is fixed: it can't be renamed, deleted or
# lose the capabilities that let someone fix a mistake. Every change keeps users.role in step.

ROLE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 &.()\-]{1,39}$")
manage_roles = require_capability("manageRoles", "You don't have permission to change roles and permissions.")


class RoleCreate(BaseModel):
    name: str
    copyFrom: Optional[str] = None


class RoleRename(BaseModel):
    newName: str


def _settings_row(db: Session) -> AppSettings:
    settings = db.query(AppSettings).filter(AppSettings.id == 1).first()
    if not settings:
        settings = AppSettings(
            id=1, role_matrix_json=load_role_matrix(db), two_factor=False, sender_email="i2ptracker@company.com",
            invite_link_expiry_minutes=10080, reset_link_expiry_minutes=1440,
            supplier_invite_link_expiry_minutes=10080, supplier_reset_link_expiry_minutes=1440,
        )
        db.add(settings)
    return settings


def _role_counts(db: Session) -> dict[str, int]:
    return {role: count for role, count in db.query(User.role, func.count(User.id)).group_by(User.role).all()}


def _roles_response(db: Session, matrix: dict) -> dict:
    counts = _role_counts(db)
    return {"roleMatrix": matrix, "counts": {role: counts.get(role, 0) for role in matrix}}


def _clean_name(name: str, matrix: dict, ignore: Optional[str] = None) -> str:
    cleaned = " ".join(str(name or "").split())
    if not ROLE_NAME.match(cleaned):
        raise HTTPException(
            status_code=400,
            detail="A role name is 2 to 40 characters: letters, numbers, spaces and - & . ( ).",
        )
    if cleaned.lower() == ADMIN_ROLE.lower() and ignore != ADMIN_ROLE:
        raise HTTPException(status_code=400, detail="Admin is a reserved role name.")
    if any(existing.lower() == cleaned.lower() and existing != ignore for existing in matrix):
        raise HTTPException(status_code=400, detail=f"A role named {cleaned} already exists.")
    return cleaned


def _existing_role(matrix: dict, name: str) -> str:
    if name not in matrix:
        raise HTTPException(status_code=404, detail="Role not found.")
    if name == ADMIN_ROLE:
        raise HTTPException(status_code=400, detail="The Admin role can't be renamed or deleted.")
    return name


@router.get("/settings/role-summary")
def role_summary(db: Session = Depends(get_db), _: User = Depends(require_internal_user)):
    """How many users each role has, for the Roles & Permissions page."""
    return _roles_response(db, load_role_matrix(db))


@router.post("/settings/roles")
def create_role(body: RoleCreate, db: Session = Depends(get_db), actor: User = Depends(manage_roles)):
    matrix = load_role_matrix(db)
    name = _clean_name(body.name, matrix)
    if body.copyFrom and body.copyFrom not in matrix:
        raise HTTPException(status_code=400, detail="The role to copy from was not found.")
    base = matrix[body.copyFrom] if body.copyFrom else {}
    # A copy of Admin is an ordinary role: it starts with Admin's switches but can lose any of them.
    matrix = {**matrix, name: {cap: bool(base.get(cap, False)) for cap in CAPABILITIES}}
    _settings_row(db).role_matrix_json = matrix
    db.commit()
    write_audit(db, actor, "Created role", f"{name}{f' (copied from {body.copyFrom})' if body.copyFrom else ''}")
    return _roles_response(db, matrix)


@router.put("/settings/roles/{name}")
def rename_role(name: str, body: RoleRename, db: Session = Depends(get_db), actor: User = Depends(manage_roles)):
    matrix = load_role_matrix(db)
    old = _existing_role(matrix, name)
    new = _clean_name(body.newName, matrix, ignore=old)
    if new == old:
        return _roles_response(db, matrix)
    # Keep the order of the roles; only the key changes.
    matrix = {(new if role == old else role): caps for role, caps in matrix.items()}
    _settings_row(db).role_matrix_json = matrix
    moved = db.query(User).filter(User.role == old).update({"role": new}, synchronize_session=False)
    db.commit()
    write_audit(db, actor, "Renamed role", f"{old} -> {new} ({moved} user{'s' if moved != 1 else ''})")
    return _roles_response(db, matrix)


@router.delete("/settings/roles/{name}")
def delete_role(
    name: str,
    moveTo: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    actor: User = Depends(manage_roles),
):
    matrix = load_role_matrix(db)
    role = _existing_role(matrix, name)
    if len([r for r in matrix if r != ADMIN_ROLE]) <= 1:
        raise HTTPException(status_code=400, detail="Keep at least one role besides Admin.")
    users = db.query(User).filter(User.role == role).count()
    if users:
        if not moveTo or moveTo not in matrix or moveTo == role:
            raise HTTPException(status_code=400, detail=f"{role} has {users} user{'s' if users != 1 else ''}. Pick the role to move them to.")
        if moveTo == ADMIN_ROLE:
            raise HTTPException(status_code=400, detail="Users can't be moved to Admin in bulk. Pick another role.")
        db.query(User).filter(User.role == role).update({"role": moveTo}, synchronize_session=False)
    matrix = {r: caps for r, caps in matrix.items() if r != role}
    _settings_row(db).role_matrix_json = matrix
    db.commit()
    write_audit(db, actor, "Deleted role", f"{role}{f'; {users} user(s) moved to {moveTo}' if users else ''}")
    return _roles_response(db, matrix)
