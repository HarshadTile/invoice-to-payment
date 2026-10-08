from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.audit import AUDIT_TABLE_KEY, write_audit
from app.core.database import get_db
from app.core.permissions import (
    ADMIN_LOCKED_CAPABILITIES,
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
    wants_config = payload.senderEmail is not None or payload.twoFactorOn is not None
    if wants_matrix and not has_capability(db, actor, "manageRoles"):
        raise HTTPException(status_code=403, detail="You don't have permission to change roles and permissions.")
    if wants_config and not has_capability(db, actor, "manageConfig"):
        raise HTTPException(status_code=403, detail="You don't have permission to change configuration.")

    settings = db.query(AppSettings).filter(AppSettings.id == 1).first()
    if not settings:
        settings = AppSettings(id=1, two_factor=False, sender_email="i2ptracker@company.com")
        db.add(settings)

    audit_entries = []
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
