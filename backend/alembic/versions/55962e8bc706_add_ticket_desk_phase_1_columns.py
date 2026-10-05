"""Add ticket desk phase 1 columns

Revision ID: 55962e8bc706
Revises: 
Create Date: 2026-09-30 10:27:19.286147

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = '55962e8bc706'
down_revision: Union[str, Sequence[str], None] = '000000000001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. New Tables
    op.create_table('sla_policies',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('channel', sa.String(length=20), nullable=True),
        sa.Column('priority', sa.String(length=16), nullable=False),
        sa.Column('response_minutes', sa.Integer(), nullable=False),
        sa.Column('business_hours', sa.Boolean(), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_table('notifications',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('ticket_id', sa.String(length=16), nullable=True),
        sa.Column('type', sa.String(length=40), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=True),
        sa.Column('read_at', sa.DateTime(), nullable=True),
        sa.Column('emailed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['ticket_id'], ['tickets.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_notifications_user_id'), 'notifications', ['user_id'], unique=False)
    
    op.create_table('ticket_reads',
        sa.Column('ticket_id', sa.String(length=16), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('last_read_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['ticket_id'], ['tickets.id'], ),
        sa.PrimaryKeyConstraint('ticket_id', 'user_id')
    )
    
    op.create_table('ticket_attachments',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('ticket_id', sa.String(length=16), nullable=False),
        sa.Column('comment_id', sa.Integer(), nullable=True),
        sa.Column('uploaded_by', sa.Integer(), nullable=False),
        sa.Column('original_name', sa.String(length=255), nullable=False),
        sa.Column('stored_key', sa.String(length=255), nullable=False),
        sa.Column('mime_type', sa.String(length=100), nullable=False),
        sa.Column('size_bytes', sa.Integer(), nullable=False),
        sa.Column('visibility', sa.String(length=16), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['comment_id'], ['ticket_comments.id'], ),
        sa.ForeignKeyConstraint(['ticket_id'], ['tickets.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_ticket_attachments_ticket_id'), 'ticket_attachments', ['ticket_id'], unique=False)
    
    op.create_table('ticket_activity',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('ticket_id', sa.String(length=16), nullable=False),
        sa.Column('actor_id', sa.Integer(), nullable=True),
        sa.Column('event', sa.String(length=40), nullable=False),
        sa.Column('meta_data', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['ticket_id'], ['tickets.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_ticket_activity_ticket_id'), 'ticket_activity', ['ticket_id'], unique=False)
    op.create_index(op.f('ix_ticket_activity_created_at'), 'ticket_activity', ['created_at'], unique=False)

    # 2. Add columns to ticket_comments
    op.add_column('ticket_comments', sa.Column('author_id', sa.Integer(), nullable=True))
    op.add_column('ticket_comments', sa.Column('visibility', sa.String(length=16), nullable=False, server_default='PUBLIC'))
    op.add_column('ticket_comments', sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')))

    # 3. Add columns to tickets
    op.add_column('tickets', sa.Column('channel', sa.String(length=32), nullable=True))
    op.add_column('tickets', sa.Column('fy', sa.String(length=9), nullable=True))
    op.add_column('tickets', sa.Column('vendor_code', sa.String(length=32), nullable=True))
    op.add_column('tickets', sa.Column('invoice_id', sa.Integer(), nullable=True))
    op.add_column('tickets', sa.Column('awaiting', sa.String(length=32), nullable=False, server_default='STAFF'))
    op.add_column('tickets', sa.Column('source', sa.String(length=32), nullable=False, server_default='SUPPLIER'))
    op.add_column('tickets', sa.Column('assignee_id', sa.Integer(), nullable=True))
    op.add_column('tickets', sa.Column('response_due_at', sa.DateTime(), nullable=True))
    op.add_column('tickets', sa.Column('first_response_at', sa.DateTime(), nullable=True))
    op.add_column('tickets', sa.Column('closed_at', sa.DateTime(), nullable=True))
    op.add_column('tickets', sa.Column('reopen_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('tickets', sa.Column('row_version', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('tickets', sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')))
    op.add_column('tickets', sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')))

def downgrade() -> None:
    op.drop_column('tickets', 'updated_at')
    op.drop_column('tickets', 'created_at')
    op.drop_column('tickets', 'row_version')
    op.drop_column('tickets', 'reopen_count')
    op.drop_column('tickets', 'closed_at')
    op.drop_column('tickets', 'first_response_at')
    op.drop_column('tickets', 'response_due_at')
    op.drop_column('tickets', 'assignee_id')
    op.drop_column('tickets', 'source')
    op.drop_column('tickets', 'awaiting')
    op.drop_column('tickets', 'invoice_id')
    op.drop_column('tickets', 'vendor_code')
    op.drop_column('tickets', 'fy')
    op.drop_column('tickets', 'channel')

    op.drop_column('ticket_comments', 'created_at')
    op.drop_column('ticket_comments', 'visibility')
    op.drop_column('ticket_comments', 'author_id')
    
    op.drop_index(op.f('ix_ticket_activity_created_at'), table_name='ticket_activity')
    op.drop_index(op.f('ix_ticket_activity_ticket_id'), table_name='ticket_activity')
    op.drop_table('ticket_activity')

    op.drop_index(op.f('ix_ticket_attachments_ticket_id'), table_name='ticket_attachments')
    op.drop_table('ticket_attachments')

    op.drop_table('ticket_reads')

    op.drop_index(op.f('ix_notifications_user_id'), table_name='notifications')
    op.drop_table('notifications')

    op.drop_table('sla_policies')
