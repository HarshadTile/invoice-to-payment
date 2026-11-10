"""Login lockout for staff accounts and server-side session ending for everyone.

users.failed_attempts / users.locked_until: the same 5-strikes / 15-minute lock suppliers have.
users.session_version / suppliers.session_version: copied into every login token; raising it
(logout, password reset) ends every session issued before.
"""

from alembic import op
import sqlalchemy as sa


revision = "b2d4f6a8c013"
down_revision = "a1c3e5f7b902"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("failed_attempts", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("locked_until", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("session_version", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("suppliers", sa.Column("session_version", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("suppliers", "session_version")
    op.drop_column("users", "session_version")
    op.drop_column("users", "locked_until")
    op.drop_column("users", "failed_attempts")
