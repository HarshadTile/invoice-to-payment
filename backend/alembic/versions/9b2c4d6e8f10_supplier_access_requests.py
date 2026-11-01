"""Supplier self-service: email sign-in, several accounts per PAN, access requests.

- suppliers.pan is no longer unique and may be blank (some vendors have no PAN in the data);
  suppliers.email is unique and is now the sign-in name.
- A vendor code may be given to more than one account (another location of the same
  company), but only once per account.
- supplier_access_requests holds requests for a new account or for a change of vendor codes.
"""

from alembic import op
import sqlalchemy as sa


revision = "9b2c4d6e8f10"
down_revision = "7a81c5d9e204"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_index("ix_suppliers_pan", table_name="suppliers")
    op.alter_column("suppliers", "pan", existing_type=sa.String(10), nullable=True)
    op.create_index("ix_suppliers_pan", "suppliers", ["pan"], unique=False)
    op.execute("UPDATE suppliers SET email = LOWER(TRIM(email)) WHERE email IS NOT NULL")
    op.execute("UPDATE suppliers SET email = NULL WHERE email = ''")
    op.create_index("ix_suppliers_email", "suppliers", ["email"], unique=True)

    op.drop_constraint("uq_supplier_vendor_codes_vendor_code", "supplier_vendor_codes", type_="unique")
    op.create_unique_constraint(
        "uq_supplier_vendor_codes_supplier_code", "supplier_vendor_codes", ["supplier_id", "vendor_code"],
    )
    op.create_index("ix_supplier_vendor_codes_vendor_code", "supplier_vendor_codes", ["vendor_code"])

    op.create_table(
        "supplier_access_requests",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("supplier_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(255), nullable=False, server_default=""),
        sa.Column("email", sa.String(191), nullable=False),
        sa.Column("pan", sa.String(10), nullable=True),
        sa.Column("requested_codes", sa.JSON(), nullable=True),
        sa.Column("add_codes", sa.JSON(), nullable=True),
        sa.Column("remove_codes", sa.JSON(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="Pending"),
        sa.Column("channel", sa.String(32), nullable=True),
        sa.Column("decision_reason", sa.String(32), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("decided_by", sa.Integer(), nullable=True),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.Column("requester_ip", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["decided_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_supplier_access_requests_status", "supplier_access_requests", ["status"])
    op.create_index("ix_supplier_access_requests_email", "supplier_access_requests", ["email"])


def downgrade():
    op.drop_table("supplier_access_requests")
    op.drop_index("ix_supplier_vendor_codes_vendor_code", table_name="supplier_vendor_codes")
    op.drop_constraint("uq_supplier_vendor_codes_supplier_code", "supplier_vendor_codes", type_="unique")
    op.create_unique_constraint("uq_supplier_vendor_codes_vendor_code", "supplier_vendor_codes", ["vendor_code"])
    op.drop_index("ix_suppliers_email", table_name="suppliers")
    op.drop_index("ix_suppliers_pan", table_name="suppliers")
    op.alter_column("suppliers", "pan", existing_type=sa.String(10), nullable=False)
    op.create_index("ix_suppliers_pan", "suppliers", ["pan"], unique=True)
