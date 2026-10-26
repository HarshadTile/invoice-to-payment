"""Configure supplier password link expiry independently from internal accounts."""
from alembic import op
import sqlalchemy as sa

revision = '4e3a82b0d9f5'
down_revision = '3d2f71a9c8e4'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('settings', sa.Column('supplier_invite_link_expiry_minutes', sa.Integer(), nullable=False, server_default='10080'))
    op.add_column('settings', sa.Column('supplier_reset_link_expiry_minutes', sa.Integer(), nullable=False, server_default='1440'))
    op.add_column('supplier_setup_tokens', sa.Column('link_type', sa.String(16), nullable=False, server_default='invite'))


def downgrade():
    op.drop_column('supplier_setup_tokens', 'link_type')
    op.drop_column('settings', 'supplier_reset_link_expiry_minutes')
    op.drop_column('settings', 'supplier_invite_link_expiry_minutes')
