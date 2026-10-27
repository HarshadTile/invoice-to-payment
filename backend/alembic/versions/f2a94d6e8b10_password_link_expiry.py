"""Add configurable password link expiry.

Revision ID: f2a94d6e8b10
Revises: d9f0a1b2c347
"""
from alembic import op
import sqlalchemy as sa

revision = 'f2a94d6e8b10'
down_revision = 'd9f0a1b2c347'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('settings', sa.Column('invite_link_expiry_minutes', sa.Integer(), nullable=False, server_default='10080'))
    op.add_column('settings', sa.Column('reset_link_expiry_minutes', sa.Integer(), nullable=False, server_default='1440'))


def downgrade():
    op.drop_column('settings', 'reset_link_expiry_minutes')
    op.drop_column('settings', 'invite_link_expiry_minutes')
