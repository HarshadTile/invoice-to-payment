"""Single sign-on (CC Services): one row per SSO round trip (one-time code + replay block).

Revision ID: a7c9e1f3b215
Revises: c3e5a7b9d024
"""
from alembic import op
import sqlalchemy as sa


revision = "a7c9e1f3b215"
down_revision = "c3e5a7b9d024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sso_logins",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("channel_scope", sa.String(32), nullable=True),
        sa.Column("remember", sa.Boolean(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sso_logins_code_hash", "sso_logins", ["code_hash"], unique=True)
    op.create_index("ix_sso_logins_token_hash", "sso_logins", ["token_hash"])
    op.create_index("ix_sso_logins_user_id", "sso_logins", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_sso_logins_user_id", table_name="sso_logins")
    op.drop_index("ix_sso_logins_token_hash", table_name="sso_logins")
    op.drop_index("ix_sso_logins_code_hash", table_name="sso_logins")
    op.drop_table("sso_logins")
