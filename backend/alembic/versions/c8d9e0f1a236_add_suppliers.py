"""Add suppliers, their vendor codes and setup tokens.

Revision ID: c8d9e0f1a236
Revises: b7d8e9f0a125
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c8d9e0f1a236"
down_revision: Union[str, Sequence[str], None] = "b7d8e9f0a125"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "suppliers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("pan", sa.String(10), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("channel", sa.String(32), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("failed_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("locked_until", sa.DateTime(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_suppliers_pan", "suppliers", ["pan"], unique=True)

    op.create_table(
        "supplier_vendor_codes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("supplier_id", sa.Integer(), nullable=False),
        sa.Column("vendor_code", sa.String(32), nullable=False),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("vendor_code", name="uq_supplier_vendor_codes_vendor_code"),
    )
    op.create_index("ix_supplier_vendor_codes_supplier_id", "supplier_vendor_codes", ["supplier_id"])

    op.create_table(
        "supplier_setup_tokens",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("token", sa.String(64), nullable=False),
        sa.Column("supplier_id", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_supplier_setup_tokens_token", "supplier_setup_tokens", ["token"], unique=True)
    op.create_index("ix_supplier_setup_tokens_supplier_id", "supplier_setup_tokens", ["supplier_id"])


def downgrade() -> None:
    op.drop_table("supplier_setup_tokens")
    op.drop_table("supplier_vendor_codes")
    op.drop_table("suppliers")
