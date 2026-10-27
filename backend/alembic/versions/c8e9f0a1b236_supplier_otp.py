"""Shared supplier OTP challenges and rate limits."""
from alembic import op
import sqlalchemy as sa

revision = "c8e9f0a1b236"
down_revision = "b7d8e9f0a125"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "supplier_otp_states",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("window_start", sa.Float(), nullable=False),
        sa.Column("sends", sa.Integer(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("last_send", sa.Float(), nullable=False),
        sa.Column("challenge", sa.String(64), unique=True),
        sa.Column("digest", sa.String(64)),
        sa.Column("expires", sa.Float(), nullable=False),
        sa.Column("identity", sa.JSON()),
    )


def downgrade():
    op.drop_table("supplier_otp_states")
