"""Add subject

Revision ID: 5b8632a7faee
Revises: 55962e8bc706
Create Date: 2026-09-30 10:33:06.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = '5b8632a7faee'
down_revision: Union[str, Sequence[str], None] = '55962e8bc706'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tickets', sa.Column('subject', sa.String(length=150), nullable=True))


def downgrade() -> None:
    op.drop_column('tickets', 'subject')
