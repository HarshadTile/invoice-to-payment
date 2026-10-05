"""Recognize the legacy Inquiry Desk production revision.

Revision ID: 8f31c2d4a901
Revises: bafc0b1c405c

Some existing databases were upgraded through an earlier Inquiry Desk migration
chain and are already stamped with this revision. The consolidated migration
that follows detects that completed schema and does not replay its DDL.
"""

from typing import Sequence, Union


revision: str = "8f31c2d4a901"
down_revision: Union[str, Sequence[str], None] = "bafc0b1c405c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
