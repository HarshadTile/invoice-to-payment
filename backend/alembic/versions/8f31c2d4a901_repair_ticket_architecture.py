"""Repair and complete the Inquiry Desk schema.

Revision ID: 8f31c2d4a901
Revises: 5b8632a7faee
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision: str = "8f31c2d4a901"
down_revision: Union[str, Sequence[str], None] = "5b8632a7faee"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("ticket_role", sa.String(24), nullable=True))
    op.execute("UPDATE users SET ticket_role = 'ADMIN' WHERE UPPER(role) = 'ADMIN'")

    op.create_table(
        "user_channel_access",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("channel", sa.String(32), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "channel"),
    )

    op.add_column("tickets", sa.Column("ticket_sequence", mysql.BIGINT(unsigned=True), nullable=True))
    op.create_index("uq_tickets_ticket_sequence", "tickets", ["ticket_sequence"], unique=True)
    op.execute("SET @ticket_seq := 0")
    op.execute("UPDATE tickets SET ticket_sequence = (@ticket_seq := @ticket_seq + 1) ORDER BY created_at, id")
    op.alter_column("tickets", "ticket_sequence", nullable=False, autoincrement=True,
                    existing_type=mysql.BIGINT(unsigned=True))
    op.add_column("tickets", sa.Column("ticket_no", sa.String(20), nullable=True))
    op.add_column("tickets", sa.Column("invoice_no", sa.String(64), nullable=True))
    op.add_column("tickets", sa.Column("resolved_at", sa.DateTime(), nullable=True))
    op.add_column("tickets", sa.Column("sla_started_at", sa.DateTime(), nullable=True))
    op.add_column("tickets", sa.Column("legacy_unlinked", sa.Boolean(), server_default=sa.text("0"), nullable=False))
    op.execute("UPDATE tickets SET ticket_no = no WHERE no LIKE 'QRY-%'")
    op.execute("UPDATE tickets SET invoice_no = no WHERE no NOT LIKE 'QRY-%'")
    op.execute("UPDATE tickets SET ticket_no = CONCAT('QRY-', LPAD(ticket_sequence, 6, '0')) WHERE ticket_no IS NULL")
    op.execute("UPDATE tickets SET legacy_unlinked = 1 WHERE invoice_no IS NULL OR channel IS NULL OR channel = 'UNKNOWN'")
    op.create_index("uq_tickets_ticket_no", "tickets", ["ticket_no"], unique=True)
    op.create_index("ix_tickets_vendor_status_created", "tickets", ["vendor_code", "status", "created_at"])
    op.create_index("ix_tickets_assignee_status", "tickets", ["assignee_id", "status"])
    op.create_index("ix_tickets_channel_fy_status_created", "tickets", ["channel", "fy", "status", "created_at"])
    op.create_index("ix_tickets_sla", "tickets", ["awaiting", "status", "response_due_at"])
    op.create_index("ix_tickets_invoice_no", "tickets", ["invoice_no"])
    op.create_index("ix_ticket_comments_ticket_created", "ticket_comments", ["ticket_id", "created_at"])
    op.alter_column("ticket_attachments", "uploaded_by", existing_type=sa.Integer(), nullable=True)
    op.add_column("ticket_attachments", sa.Column("uploader_key", sa.String(96), nullable=True))

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
    op.alter_column("notifications", "user_id", existing_type=sa.Integer(), nullable=True)
    op.add_column("notifications", sa.Column("recipient_key", sa.String(96), nullable=True))
    op.create_index("ix_notifications_recipient_read_created", "notifications", ["recipient_key", "read_at", "created_at"])
    op.create_index("ix_notifications_user_read_created", "notifications", ["user_id", "read_at", "created_at"])
    op.create_unique_constraint("uq_sla_policy_channel_priority", "sla_policies", ["channel", "priority"])
    op.execute(
        "INSERT IGNORE INTO sla_policies (channel, priority, response_minutes, business_hours, active) "
        "VALUES (NULL, 'HIGH', 240, 0, 1), (NULL, 'MEDIUM', 1440, 0, 1), (NULL, 'LOW', 2880, 0, 1)"
    )


def downgrade() -> None:
    op.drop_constraint("uq_sla_policy_channel_priority", "sla_policies", type_="unique")
    op.drop_index("ix_notifications_user_read_created", table_name="notifications")
    op.drop_index("ix_notifications_recipient_read_created", table_name="notifications")
    op.drop_column("notifications", "recipient_key")
    op.alter_column("notifications", "user_id", existing_type=sa.Integer(), nullable=False)
    op.drop_table("ticket_job_runs")
    op.drop_table("ticket_idempotency")
    op.drop_column("ticket_attachments", "uploader_key")
    op.alter_column("ticket_attachments", "uploaded_by", existing_type=sa.Integer(), nullable=False)
    op.drop_index("ix_ticket_comments_ticket_created", table_name="ticket_comments")
    op.drop_index("ix_tickets_invoice_no", table_name="tickets")
    op.drop_index("ix_tickets_sla", table_name="tickets")
    op.drop_index("ix_tickets_channel_fy_status_created", table_name="tickets")
    op.drop_index("ix_tickets_assignee_status", table_name="tickets")
    op.drop_index("ix_tickets_vendor_status_created", table_name="tickets")
    op.drop_index("uq_tickets_ticket_no", table_name="tickets")
    op.drop_column("tickets", "legacy_unlinked")
    op.drop_column("tickets", "sla_started_at")
    op.drop_column("tickets", "resolved_at")
    op.drop_column("tickets", "invoice_no")
    op.drop_column("tickets", "ticket_no")
    op.alter_column(
        "tickets",
        "ticket_sequence",
        existing_type=mysql.BIGINT(unsigned=True),
        nullable=False,
        autoincrement=False,
    )
    op.drop_index("uq_tickets_ticket_sequence", table_name="tickets")
    op.drop_column("tickets", "ticket_sequence")
    op.drop_table("user_channel_access")
    op.drop_column("users", "ticket_role")
