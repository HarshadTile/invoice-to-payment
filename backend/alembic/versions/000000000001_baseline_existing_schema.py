"""Baseline the schema that predates the Inquiry Desk migrations.

Revision ID: 000000000001
Revises:
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision: str = "000000000001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("username", sa.String(64), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("email", sa.String(191), nullable=False),
        sa.Column("role", sa.String(64), nullable=False),
        sa.Column("dept", sa.String(64), server_default="", nullable=False),
        sa.Column("title", sa.String(128), server_default="", nullable=False),
        sa.Column("status", sa.String(32), server_default="Active", nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username", name="uq_users_username"),
    )
    op.create_table(
        "otp_codes",
        sa.Column("vcode", sa.String(32), nullable=False),
        sa.Column("mobile", sa.String(20), nullable=False),
        sa.Column("code", sa.String(6), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("vcode"),
    )
    op.create_table(
        "invoices",
        sa.Column("no", sa.String(32), nullable=False),
        sa.Column("vcode", sa.String(32), nullable=False),
        sa.Column("vendor", sa.String(128), nullable=False),
        sa.Column("channel", sa.String(32), nullable=False),
        sa.Column("po", sa.String(64), nullable=False),
        sa.Column("amount", sa.String(32), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("utr", sa.String(32), server_default="-", nullable=False),
        sa.Column("date", sa.String(32), nullable=False),
        sa.Column("short_pay_reason", sa.Text(), nullable=True),
        sa.Column("stage_index", sa.Integer(), server_default="0", nullable=False),
        sa.PrimaryKeyConstraint("no"),
    )
    op.create_table(
        "integrations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(96), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("last_sync", sa.String(48), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "settings",
        sa.Column("id", mysql.TINYINT(), nullable=False),
        sa.Column("role_matrix_json", sa.JSON(), nullable=False),
        sa.Column("two_factor", sa.Boolean(), server_default="0", nullable=False),
        sa.Column("sender_email", sa.String(191), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "table_rows",
        sa.Column("table_key", sa.String(64), nullable=False),
        sa.Column("row_index", sa.Integer(), nullable=False),
        sa.Column("cells_json", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("table_key", "row_index"),
    )
    op.create_table(
        "sync_log",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("channel", sa.String(64), nullable=False),
        sa.Column("time", sa.String(48), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("records", sa.Integer(), server_default="0", nullable=False),
        sa.Column("msg", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "sessions",
        sa.Column("token", sa.CHAR(36), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("auth_type", sa.Enum("internal", "supplier"), nullable=False),
        sa.Column("scope_json", sa.JSON(), nullable=True),
        sa.Column("supplier_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("token"),
    )
    op.create_table(
        "tickets",
        sa.Column("id", sa.String(16), nullable=False),
        sa.Column("no", sa.String(32), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("priority", sa.String(16), nullable=False),
        sa.Column("assignee", sa.String(64), nullable=False),
        sa.Column("raised_by", sa.String(32), nullable=False),
        sa.Column("raised_date", sa.String(32), nullable=False),
        sa.Column("sla_hours", sa.Integer(), server_default="24", nullable=False),
        sa.Column("resolved_date", sa.String(32), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "ticket_comments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("ticket_id", sa.String(16), nullable=False),
        sa.Column("author", sa.String(64), nullable=False),
        sa.Column("role", sa.String(64), server_default="", nullable=False),
        sa.Column("date", sa.String(32), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["ticket_id"], ["tickets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("ticket_comments")
    op.drop_table("tickets")
    op.drop_table("sessions")
    op.drop_table("sync_log")
    op.drop_table("table_rows")
    op.drop_table("settings")
    op.drop_table("integrations")
    op.drop_table("invoices")
    op.drop_table("otp_codes")
    op.drop_table("users")
