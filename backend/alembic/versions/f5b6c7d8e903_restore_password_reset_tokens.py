"""Restore password reset tokens missing from legacy databases.

Revision ID: f5b6c7d8e903
Revises: e4a5b6c7d802
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f5b6c7d8e903"
down_revision: Union[str, Sequence[str], None] = "e4a5b6c7d802"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("password_reset_tokens"):
        return

    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("token", sa.String(64), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_password_reset_tokens_token",
        "password_reset_tokens",
        ["token"],
        unique=True,
    )
    op.create_index(
        "ix_password_reset_tokens_user_id",
        "password_reset_tokens",
        ["user_id"],
    )


def downgrade() -> None:
    # This revision repairs a table that canonical databases already had.
    # Do not remove account recovery support when stepping back one revision.
    pass
