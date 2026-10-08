"""Refresh the saved role matrix to the current capability list.

Revision ID: b7d8e9f0a125
Revises: a6c7d8e9f014

Retires "editRows" (manual row entry no longer exists) and adds "manageRoles" and
"viewAuditLog". The app already treats a missing capability as its default, so this only
tidies the stored JSON; it changes nobody's effective access.
"""

import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7d8e9f0a125"
down_revision: Union[str, Sequence[str], None] = "a6c7d8e9f014"
branch_labels = None
depends_on = None


def _rewrite(transform) -> None:
    connection = op.get_bind()
    for settings_id, matrix in connection.execute(sa.text("SELECT id, role_matrix_json FROM settings")).fetchall():
        if isinstance(matrix, str):
            matrix = json.loads(matrix)
        if not isinstance(matrix, dict):
            continue
        connection.execute(
            sa.text("UPDATE settings SET role_matrix_json = :matrix WHERE id = :id"),
            {"matrix": json.dumps({role: transform(role, dict(caps)) for role, caps in matrix.items()}), "id": settings_id},
        )


def _upgrade_role(role: str, caps: dict) -> dict:
    caps.pop("editRows", None)
    caps.setdefault("manageRoles", role == "Admin")
    caps.setdefault("viewAuditLog", role == "Admin")
    return caps


def _downgrade_role(role: str, caps: dict) -> dict:
    caps.pop("manageRoles", None)
    caps.pop("viewAuditLog", None)
    caps.setdefault("editRows", role in ("Admin", "Invoice Team", "MDE Invoice Team", "Accounts"))
    return caps


def upgrade() -> None:
    _rewrite(_upgrade_role)


def downgrade() -> None:
    _rewrite(_downgrade_role)
