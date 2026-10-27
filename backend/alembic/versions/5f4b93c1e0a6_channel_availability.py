"""Add configurable portal availability; MFOX starts disabled."""
from alembic import op
import sqlalchemy as sa

revision = '5f4b93c1e0a6'
down_revision = '4e3a82b0d9f5'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('settings', sa.Column('channel_availability', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('settings', 'channel_availability')
