"""Rename the "MDE Invoice Team" application role to "Invoice Team".

Revision ID: a6c7d8e9f014
Revises: f5b6c7d8e903

MDE is a team/channel context, not an authorization role. The role name is stored in
users.role and as a key of settings.role_matrix_json, so both are renamed.
"""

import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a6c7d8e9f014"
down_revision: Union[str, Sequence[str], None] = "f5b6c7d8e903"
branch_labels = None
depends_on = None


def _rename_role(old: str, new: str) -> None:
    connection = op.get_bind()
    connection.execute(
        sa.text("UPDATE users SET role = :new WHERE role = :old"), {"new": new, "old": old}
    )

    row = connection.execute(sa.text("SELECT id, role_matrix_json FROM settings")).fetchall()
    for settings_id, matrix in row:
        if isinstance(matrix, str):
            matrix = json.loads(matrix)
        if isinstance(matrix, dict) and old in matrix:
            renamed = {(new if key == old else key): value for key, value in matrix.items()}
            connection.execute(
                sa.text("UPDATE settings SET role_matrix_json = :matrix WHERE id = :id"),
                {"matrix": json.dumps(renamed), "id": settings_id},
            )


def upgrade() -> None:
    _rename_role("MDE Invoice Team", "Invoice Team")


def downgrade() -> None:
    _rename_role("Invoice Team", "MDE Invoice Team")
