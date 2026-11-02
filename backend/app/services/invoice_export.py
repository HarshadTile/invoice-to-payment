"""CSV export of a filtered invoice list, matching the browser export in InvoiceTable.jsx."""
from collections.abc import Iterable, Iterator
from datetime import date

from app.services.invoice_index import CHANNEL_LABEL, display_amount, index_of
from app.services.invoice_service import map_invoice_to_response

COLUMNS = ("Invoice No", "Vendor", "Vendor Code", "Channel", "PO No", "PO Item", "Product Type", "Plant Code",
           "Division", "Invoice Date", "Upload Date", "Payment Due Date", "Amount", "Status", "Pending With",
           "UTR No", "Status Date", "Rejection Reason")
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def display_date(value: str | None) -> str:
    """"2026-10-05" -> "05 Oct 2026" (formatInvoiceDate); missing -> "-"."""
    try:
        day = date.fromisoformat(value[:10]) if value else None
    except ValueError:
        day = None
    return f"{day.day:02d} {MONTHS[day.month - 1]} {day.year}" if day else "-"


def _cell(value) -> str:
    return '"' + str(value).replace('"', '""') + '"'


def export_row(row: dict) -> list:
    ix = index_of(row)
    workflow = map_invoice_to_response(row).workflow
    rejection = (workflow.rejection_reason or "Not provided") if ix.status == "Rejected" else "-"
    return [ix.no, ix.vendor, ix.vcode, CHANNEL_LABEL.get(ix.channel, ix.channel), ix.po, ix.po_item or "-",
            ix.product_name, ix.plant or "-", ix.dv_type or "-", display_date(ix.date("invoice")),
            display_date(ix.date("upload")), display_date(ix.date("due")), display_amount(ix.amount, ix.currency),
            ix.status, workflow.pending_with or "-", ix.utr or "-", display_date(ix.status_date), rejection]


def csv_lines(rows: Iterable[dict]) -> Iterator[str]:
    """Streamed in blocks of rows: a 100k-row export never sits in memory as one string, and isn't
    sent as one tiny write per row either."""
    yield "﻿" + ",".join(COLUMNS)  # the BOM makes Excel open the rupee sign correctly
    block = []
    for row in rows:
        block.append(",".join(_cell(value) for value in export_row(row)))
        if len(block) == 2000:
            yield "\n" + "\n".join(block)
            block = []
    if block:
        yield "\n" + "\n".join(block)
