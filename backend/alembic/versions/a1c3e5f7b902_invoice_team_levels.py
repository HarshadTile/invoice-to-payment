"""Roles: Invoice Team L1 / L2 / L3 replace Invoice Team, Approver, Accounts and Viewer.

"Invoice Team" becomes "Invoice Team L1"; Approver, Accounts and Viewer are removed and their
users move to L1. L2 and L3 are new. Admin keeps whatever it had. Roles can be created, renamed
and deleted from Settings > Roles & Permissions after this.
"""

import json

from alembic import op
import sqlalchemy as sa


revision = "a1c3e5f7b902"
down_revision = "9b2c4d6e8f10"
branch_labels = None
depends_on = None

CAPABILITIES = ("importExport", "createTrace", "manageConfig", "manageUsers", "manageRoles", "viewAuditLog", "manageSuppliers")
OLD_ROLES = ("Invoice Team", "Approver", "Accounts", "Viewer")


def _caps(*allowed):
    return {cap: cap in allowed for cap in CAPABILITIES}


LEVELS = {
    "Invoice Team L1": _caps("createTrace", "importExport"),
    "Invoice Team L2": _caps("createTrace", "importExport", "manageSuppliers"),
    "Invoice Team L3": _caps("createTrace", "importExport", "manageSuppliers", "viewAuditLog"),
}


def _load(bind):
    row = bind.execute(sa.text("SELECT role_matrix_json FROM settings WHERE id = 1")).first()
    if not row or row[0] is None:
        return None
    return row[0] if isinstance(row[0], dict) else json.loads(row[0])


def _save(bind, matrix):
    bind.execute(sa.text("UPDATE settings SET role_matrix_json = :m WHERE id = 1"), {"m": json.dumps(matrix)})


def upgrade():
    bind = op.get_bind()
    matrix = _load(bind)
    if matrix is not None:
        admin = matrix.get("Admin") or _caps(*CAPABILITIES)
        _save(bind, {"Admin": admin, **LEVELS})
    bind.execute(
        sa.text("UPDATE users SET role = 'Invoice Team L1' WHERE role IN :old").bindparams(sa.bindparam("old", expanding=True)),
        {"old": list(OLD_ROLES)},
    )


def downgrade():
    bind = op.get_bind()
    matrix = _load(bind)
    if matrix is not None:
        admin = matrix.get("Admin") or _caps(*CAPABILITIES)
        _save(bind, {
            "Admin": admin,
            "Invoice Team": _caps("createTrace", "importExport", "manageSuppliers"),
            "Approver": _caps("createTrace"),
            "Accounts": _caps("createTrace"),
            "Viewer": _caps("createTrace"),
        })
    bind.execute(
        sa.text("UPDATE users SET role = 'Invoice Team' WHERE role IN :levels").bindparams(sa.bindparam("levels", expanding=True)),
        {"levels": list(LEVELS)},
    )
