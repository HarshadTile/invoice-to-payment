"""Preserve epoch timestamp precision for supplier OTP expiry and limits."""
import time

from alembic import op
import sqlalchemy as sa

revision = "d9f0a1b2c347"
down_revision = "c8e9f0a1b236"
branch_labels = None
depends_on = None


def _convert(old_type, new_type):
    with op.batch_alter_table("supplier_otp_states") as batch:
        for column in ("window_start", "last_send", "expires"):
            batch.alter_column(column, existing_type=old_type, type_=new_type, existing_nullable=False)


def _invalidate_pending():
    # Previously rounded timestamps cannot be repaired. Preserve quotas, start a
    # fresh rate-limit window, and require a new challenge after this migration.
    op.get_bind().execute(sa.text(
        "UPDATE supplier_otp_states SET challenge=NULL, digest=NULL, identity=NULL, "
        "expires=0, last_send=0, window_start=:now"
    ), {"now": time.time()})


def upgrade():
    _convert(sa.Float(), sa.Double())
    _invalidate_pending()


def downgrade():
    _convert(sa.Double(), sa.Float())
    _invalidate_pending()
