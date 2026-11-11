"""Audit log: its own indexed table instead of rows in the generic settings table.

Existing entries (table_rows, table_key 'settings-audit', cells [time text, who, action, detail])
are copied across with their time converted from the server's local time to UTC, then removed
from table_rows. Downgrade copies them back.
"""
import json
import re
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


revision = "c3e5a7b9d024"
down_revision = "b2d4f6a8c013"
branch_labels = None
depends_on = None

OLD_KEY = "settings-audit"
OLD_FORMAT = "%d %b %Y, %I:%M:%S %p"


def _category(action: str) -> str:
    # The same rules as app/core/audit.py (copied: migrations must not depend on app code).
    text = (action or "").lower()
    if "fail" in text:
        return "failed"
    if re.search(r"logged (in|out)|login|logout|sign", text):
        return "signin"
    if re.search(r"supplier|vendor", text):
        return "suppliers"
    if re.search(r"user|password|setup link|reset link", text):
        return "users"
    if re.search(r"setting|role|permission|notification|expiry|channel|portal", text):
        return "settings"
    return "other"


def _to_utc(text: str) -> datetime:
    try:
        local = datetime.strptime((text or "").strip(), OLD_FORMAT)
    except ValueError:
        return datetime.now(timezone.utc).replace(tzinfo=None)
    return local.astimezone().astimezone(timezone.utc).replace(tzinfo=None)


def upgrade() -> None:
    audit = op.create_table(
        "audit_log",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer, "sqlite"), primary_key=True, autoincrement=True),
        sa.Column("occurred_at", sa.DateTime(), nullable=False),
        sa.Column("category", sa.String(16), nullable=False),
        sa.Column("action", sa.String(120), nullable=False),
        sa.Column("actor", sa.String(191), nullable=False),
        sa.Column("actor_type", sa.String(16), nullable=False),
        sa.Column("actor_id", sa.String(64), nullable=True),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("ip", sa.String(64), nullable=True),
    )
    op.create_index("ix_audit_log_occurred_at", "audit_log", ["occurred_at"])
    op.create_index("ix_audit_log_category_time", "audit_log", ["category", "occurred_at"])

    bind = op.get_bind()
    old = bind.execute(sa.text(
        "SELECT cells_json FROM table_rows WHERE table_key = :key ORDER BY row_index"), {"key": OLD_KEY}).fetchall()
    rows = []
    for (cells,) in old:
        if isinstance(cells, str):
            cells = json.loads(cells)
        when, who, action, detail = (list(cells) + ["", "", "", ""])[:4]
        who = str(who or "Unknown")
        rows.append({
            "occurred_at": _to_utc(when), "category": _category(action), "action": str(action or "")[:120],
            "actor": who[:191], "actor_type": "supplier" if who.startswith("Supplier ") else "user",
            "actor_id": None, "detail": str(detail or ""), "ip": None,
        })
    if rows:
        op.bulk_insert(audit, rows)
    bind.execute(sa.text("DELETE FROM table_rows WHERE table_key = :key"), {"key": OLD_KEY})


def downgrade() -> None:
    bind = op.get_bind()
    old = bind.execute(sa.text("SELECT occurred_at, actor, action, detail FROM audit_log ORDER BY id")).fetchall()
    table_rows = sa.table("table_rows", sa.column("table_key", sa.String), sa.column("row_index", sa.Integer),
                          sa.column("cells_json", sa.JSON))
    op.bulk_insert(table_rows, [
        {"table_key": OLD_KEY, "row_index": index,
         "cells_json": [occurred.replace(tzinfo=timezone.utc).astimezone().strftime(OLD_FORMAT), actor, action, detail or ""]}
        for index, (occurred, actor, action, detail) in enumerate(old)
    ])
    op.drop_index("ix_audit_log_category_time", table_name="audit_log")
    op.drop_index("ix_audit_log_occurred_at", table_name="audit_log")
    op.drop_table("audit_log")
