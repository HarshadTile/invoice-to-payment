"""Add contact email for managed supplier accounts."""

from alembic import op
import sqlalchemy as sa


revision = "7a81c5d9e204"
down_revision = "5f4b93c1e0a6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("suppliers", sa.Column("email", sa.String(length=191), nullable=True))


def downgrade():
    op.drop_column("suppliers", "email")
