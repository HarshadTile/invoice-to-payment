"""Reconcile legacy Inquiry Desk databases with the canonical schema.

Revision ID: e4a5b6c7d802
Revises: d3f4a1b2c901
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e4a5b6c7d802"
down_revision: Union[str, Sequence[str], None] = "d3f4a1b2c901"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "channel_scope" not in user_columns:
        op.add_column(
            "users",
            sa.Column(
                "channel_scope",
                sa.String(32),
                server_default="all",
                nullable=False,
            ),
        )

    notification_indexes = {
        index["name"] for index in inspector.get_indexes("notifications")
    }
    if "ix_notifications_recipient_key" not in notification_indexes:
        op.create_index(
            "ix_notifications_recipient_key",
            "notifications",
            ["recipient_key"],
        )

    op.execute("UPDATE users SET ticket_role = 'ADMIN' WHERE UPPER(role) = 'ADMIN'")
    op.execute(
        "UPDATE users SET ticket_role = 'ASSIGNEE' "
        "WHERE role = 'MDE Invoice Team' AND (ticket_role IS NULL OR ticket_role = '')"
    )
    op.execute(
        "UPDATE users SET ticket_role = 'NO_ACCESS' "
        "WHERE ticket_role IS NULL OR ticket_role = ''"
    )
    op.execute(
        "INSERT IGNORE INTO user_channel_access (user_id, channel) "
        "SELECT id, channel_scope FROM users "
        "WHERE channel_scope IS NOT NULL AND channel_scope <> 'all'"
    )
    op.execute(
        "INSERT INTO sla_policies (channel, priority, response_minutes, business_hours, active) "
        "SELECT NULL, 'HIGH', 240, 0, 1 WHERE NOT EXISTS "
        "(SELECT 1 FROM sla_policies WHERE channel IS NULL AND priority = 'HIGH')"
    )
    op.execute(
        "INSERT INTO sla_policies (channel, priority, response_minutes, business_hours, active) "
        "SELECT NULL, 'MEDIUM', 1440, 0, 1 WHERE NOT EXISTS "
        "(SELECT 1 FROM sla_policies WHERE channel IS NULL AND priority = 'MEDIUM')"
    )
    op.execute(
        "INSERT INTO sla_policies (channel, priority, response_minutes, business_hours, active) "
        "SELECT NULL, 'LOW', 2880, 0, 1 WHERE NOT EXISTS "
        "(SELECT 1 FROM sla_policies WHERE channel IS NULL AND priority = 'LOW')"
    )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    notification_indexes = {
        index["name"] for index in inspector.get_indexes("notifications")
    }
    if "ix_notifications_recipient_key" in notification_indexes:
        op.drop_index("ix_notifications_recipient_key", table_name="notifications")
