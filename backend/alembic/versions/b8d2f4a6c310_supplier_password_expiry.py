"""Supplier password expiry: when the password was set, and when the reminder / expiry email went out.

Suppliers that already have a password start their 90 days from this migration (release day).

Revision ID: b8d2f4a6c310
Revises: a7c9e1f3b215
"""
from alembic import op
import sqlalchemy as sa


revision = "b8d2f4a6c310"
down_revision = "a7c9e1f3b215"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("suppliers", sa.Column("password_changed_at", sa.DateTime(), nullable=True))
    op.add_column("suppliers", sa.Column("password_reminder_sent_at", sa.DateTime(), nullable=True))
    op.add_column("suppliers", sa.Column("password_expiry_notified_at", sa.DateTime(), nullable=True))
    op.execute("UPDATE suppliers SET password_changed_at = UTC_TIMESTAMP() WHERE password_hash IS NOT NULL")


def downgrade() -> None:
    op.drop_column("suppliers", "password_expiry_notified_at")
    op.drop_column("suppliers", "password_reminder_sent_at")
    op.drop_column("suppliers", "password_changed_at")
