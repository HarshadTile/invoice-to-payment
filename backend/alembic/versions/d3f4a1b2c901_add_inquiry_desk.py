"""Add the production Inquiry Desk schema.

Revision ID: d3f4a1b2c901
Revises: 8f31c2d4a901
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision: str = "d3f4a1b2c901"
down_revision: Union[str, Sequence[str], None] = "8f31c2d4a901"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    ticket_columns = {column["name"] for column in inspector.get_columns("tickets")}
    legacy_schema_complete = (
        "ticket_role" in user_columns
        and "ticket_no" in ticket_columns
        and inspector.has_table("user_channel_access")
        and inspector.has_table("ticket_idempotency")
        and inspector.has_table("ticket_job_runs")
    )
    if legacy_schema_complete:
        return

    op.add_column("users", sa.Column("ticket_role", sa.String(24), nullable=True))
    op.execute("UPDATE users SET ticket_role = 'ADMIN' WHERE UPPER(role) = 'ADMIN'")
    op.execute("UPDATE users SET ticket_role = 'ASSIGNEE' WHERE role = 'MDE Invoice Team'")
    op.execute("UPDATE users SET ticket_role = 'NO_ACCESS' WHERE ticket_role IS NULL")

    op.create_table(
        "user_channel_access",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("channel", sa.String(32), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "channel"),
    )
    op.execute(
        "INSERT INTO user_channel_access (user_id, channel) "
        "SELECT id, channel_scope FROM users "
        "WHERE channel_scope IS NOT NULL AND channel_scope <> 'all'"
    )

    op.add_column("tickets", sa.Column("subject", sa.String(150), nullable=True))
    op.add_column("tickets", sa.Column("channel", sa.String(32), nullable=True))
    op.add_column("tickets", sa.Column("fy", sa.String(9), nullable=True))
    op.add_column("tickets", sa.Column("vendor_code", sa.String(32), nullable=True))
    op.add_column("tickets", sa.Column("invoice_id", sa.Integer(), nullable=True))
    op.add_column("tickets", sa.Column("awaiting", sa.String(32), server_default="STAFF", nullable=False))
    op.add_column("tickets", sa.Column("source", sa.String(32), server_default="SUPPLIER", nullable=False))
    op.add_column("tickets", sa.Column("assignee_id", sa.Integer(), nullable=True))
    op.add_column("tickets", sa.Column("response_due_at", sa.DateTime(), nullable=True))
    op.add_column("tickets", sa.Column("first_response_at", sa.DateTime(), nullable=True))
    op.add_column("tickets", sa.Column("sla_started_at", sa.DateTime(), nullable=True))
    op.add_column("tickets", sa.Column("resolved_at", sa.DateTime(), nullable=True))
    op.add_column("tickets", sa.Column("closed_at", sa.DateTime(), nullable=True))
    op.add_column("tickets", sa.Column("reopen_count", sa.Integer(), server_default="0", nullable=False))
    op.add_column("tickets", sa.Column("row_version", sa.Integer(), server_default="1", nullable=False))
    op.add_column("tickets", sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False))
    op.add_column("tickets", sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False))
    op.add_column("tickets", sa.Column("ticket_sequence", mysql.BIGINT(unsigned=True), nullable=True))
    op.create_index("uq_tickets_ticket_sequence", "tickets", ["ticket_sequence"], unique=True)
    op.execute("SET @ticket_seq := 0")
    op.execute("UPDATE tickets SET ticket_sequence = (@ticket_seq := @ticket_seq + 1) ORDER BY created_at, id")
    op.alter_column(
        "tickets",
        "ticket_sequence",
        existing_type=mysql.BIGINT(unsigned=True),
        nullable=False,
        autoincrement=True,
    )
    op.add_column("tickets", sa.Column("ticket_no", sa.String(20), nullable=True))
    op.add_column("tickets", sa.Column("invoice_no", sa.String(64), nullable=True))
    op.add_column("tickets", sa.Column("legacy_unlinked", sa.Boolean(), server_default=sa.text("0"), nullable=False))
    op.execute("UPDATE tickets SET ticket_no = no WHERE no LIKE 'QRY-%'")
    op.execute("UPDATE tickets SET invoice_no = no WHERE no NOT LIKE 'QRY-%'")
    op.execute("UPDATE tickets SET ticket_no = CONCAT('QRY-', LPAD(ticket_sequence, 6, '0')) WHERE ticket_no IS NULL")
    op.execute("UPDATE tickets SET legacy_unlinked = 1 WHERE invoice_no IS NULL OR channel IS NULL OR channel = 'UNKNOWN'")
    op.create_index("uq_tickets_ticket_no", "tickets", ["ticket_no"], unique=True)
    op.create_index("ix_tickets_invoice_no", "tickets", ["invoice_no"])
    op.create_index("ix_tickets_vendor_status_created", "tickets", ["vendor_code", "status", "created_at"])
    op.create_index("ix_tickets_assignee_status", "tickets", ["assignee_id", "status"])
    op.create_index("ix_tickets_channel_fy_status_created", "tickets", ["channel", "fy", "status", "created_at"])
    op.create_index("ix_tickets_sla", "tickets", ["awaiting", "status", "response_due_at"])

    op.add_column("ticket_comments", sa.Column("author_id", sa.Integer(), nullable=True))
    op.add_column("ticket_comments", sa.Column("visibility", sa.String(16), server_default="PUBLIC", nullable=False))
    op.add_column("ticket_comments", sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False))
    op.create_index("ix_ticket_comments_ticket_created", "ticket_comments", ["ticket_id", "created_at"])
    existing_comment_indexes = {
        index["name"] for index in sa.inspect(op.get_bind()).get_indexes("ticket_comments")
    }
    if "ix_ticket_comments_ticket_id_downgrade" in existing_comment_indexes:
        op.drop_index("ix_ticket_comments_ticket_id_downgrade", table_name="ticket_comments")

    op.create_table(
        "sla_policies",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("channel", sa.String(20), nullable=True),
        sa.Column("priority", sa.String(16), nullable=False),
        sa.Column("response_minutes", sa.Integer(), nullable=False),
        sa.Column("business_hours", sa.Boolean(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("channel", "priority", name="uq_sla_policy_channel_priority"),
    )
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("recipient_key", sa.String(96), nullable=True),
        sa.Column("ticket_id", sa.String(16), nullable=True),
        sa.Column("type", sa.String(40), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("read_at", sa.DateTime(), nullable=True),
        sa.Column("emailed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["ticket_id"], ["tickets.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
    op.create_index("ix_notifications_recipient_read_created", "notifications", ["recipient_key", "read_at", "created_at"])
    op.create_index("ix_notifications_user_read_created", "notifications", ["user_id", "read_at", "created_at"])
    op.create_table(
        "ticket_reads",
        sa.Column("ticket_id", sa.String(16), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("last_read_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["ticket_id"], ["tickets.id"]),
        sa.PrimaryKeyConstraint("ticket_id", "user_id"),
    )
    op.create_table(
        "ticket_attachments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("ticket_id", sa.String(16), nullable=False),
        sa.Column("comment_id", sa.Integer(), nullable=True),
        sa.Column("uploaded_by", sa.Integer(), nullable=True),
        sa.Column("uploader_key", sa.String(96), nullable=True),
        sa.Column("original_name", sa.String(255), nullable=False),
        sa.Column("stored_key", sa.String(255), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("visibility", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["comment_id"], ["ticket_comments.id"]),
        sa.ForeignKeyConstraint(["ticket_id"], ["tickets.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ticket_attachments_ticket_id", "ticket_attachments", ["ticket_id"])
    op.create_table(
        "ticket_activity",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("ticket_id", sa.String(16), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.Column("event", sa.String(40), nullable=False),
        sa.Column("meta_data", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["ticket_id"], ["tickets.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ticket_activity_ticket_id", "ticket_activity", ["ticket_id"])
    op.create_index("ix_ticket_activity_created_at", "ticket_activity", ["created_at"])
    op.create_table(
        "ticket_idempotency",
        sa.Column("actor_key", sa.String(96), nullable=False),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("ticket_id", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["ticket_id"], ["tickets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("actor_key", "idempotency_key"),
    )
    op.create_table(
        "ticket_job_runs",
        sa.Column("ticket_id", sa.String(16), nullable=False),
        sa.Column("event", sa.String(40), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["ticket_id"], ["tickets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("ticket_id", "event"),
    )
    op.execute(
        "INSERT INTO sla_policies (channel, priority, response_minutes, business_hours, active) "
        "VALUES (NULL, 'HIGH', 240, 0, 1), (NULL, 'MEDIUM', 1440, 0, 1), (NULL, 'LOW', 2880, 0, 1)"
    )


def downgrade() -> None:
    op.drop_table("ticket_job_runs")
    op.drop_table("ticket_idempotency")
    op.drop_table("ticket_activity")
    op.drop_table("ticket_attachments")
    op.drop_table("ticket_reads")
    op.drop_index("ix_notifications_user_read_created", table_name="notifications")
    op.drop_index("ix_notifications_recipient_read_created", table_name="notifications")
    op.drop_index("ix_notifications_user_id", table_name="notifications")
    op.drop_table("notifications")
    op.drop_table("sla_policies")

    op.create_index("ix_ticket_comments_ticket_id_downgrade", "ticket_comments", ["ticket_id"])
    op.drop_index("ix_ticket_comments_ticket_created", table_name="ticket_comments")
    op.drop_column("ticket_comments", "created_at")
    op.drop_column("ticket_comments", "visibility")
    op.drop_column("ticket_comments", "author_id")

    op.drop_index("ix_tickets_sla", table_name="tickets")
    op.drop_index("ix_tickets_channel_fy_status_created", table_name="tickets")
    op.drop_index("ix_tickets_assignee_status", table_name="tickets")
    op.drop_index("ix_tickets_vendor_status_created", table_name="tickets")
    op.drop_index("ix_tickets_invoice_no", table_name="tickets")
    op.drop_index("uq_tickets_ticket_no", table_name="tickets")
    op.drop_column("tickets", "legacy_unlinked")
    op.drop_column("tickets", "invoice_no")
    op.drop_column("tickets", "ticket_no")
    op.alter_column("tickets", "ticket_sequence", existing_type=mysql.BIGINT(unsigned=True), nullable=False, autoincrement=False)
    op.drop_index("uq_tickets_ticket_sequence", table_name="tickets")
    op.drop_column("tickets", "ticket_sequence")
    for column in (
        "updated_at", "created_at", "row_version", "reopen_count", "closed_at",
        "resolved_at", "sla_started_at", "first_response_at", "response_due_at",
        "assignee_id", "source", "awaiting", "invoice_id", "vendor_code", "fy",
        "channel", "subject",
    ):
        op.drop_column("tickets", column)

    op.drop_table("user_channel_access")
    op.drop_column("users", "ticket_role")
