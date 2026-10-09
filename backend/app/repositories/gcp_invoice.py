from pathlib import Path
import os
from threading import Lock
from openpyxl import load_workbook

EXCEL_FILE = Path(os.getenv("SUPPLIER_INVOICE_EXCEL_FILE", "data/gcp_invoice_data.xlsx"))
SHEET_NAME = "in"

_cached_invoices = None
_cached_excel_signature = None
_excel_cache_lock = Lock()


def _excel_signature():
    path = EXCEL_FILE.resolve()
    stat = path.stat()
    return (str(path), SHEET_NAME, stat.st_mtime_ns, stat.st_size)

def _load_excel_data():
    global _cached_invoices, _cached_excel_signature
    with _excel_cache_lock:
        for _ in range(2):
            signature = _excel_signature()
            if _cached_invoices is not None and signature == _cached_excel_signature:
                return _cached_invoices
            records = _read_excel_data()
            if signature == _excel_signature():
                _cached_invoices = records
                _cached_excel_signature = signature
                return records
        # Do not publish a partial snapshot or send to a stale phone during a save.
        raise OSError("Invoice workbook changed while reading. Please try again.")


def _read_excel_data():
    workbook = load_workbook(
        EXCEL_FILE,
        read_only=True,
        data_only=True,
    )
    try:
        sheet = workbook[SHEET_NAME]
        rows = sheet.iter_rows(values_only=True)
        headers = next(rows)
        records = []
        for row in rows:
            record = dict(zip(headers, row))
            
            # Override Payable Amount with CD Base Amount if it exists
            cd_base = record.get("MIRO_CD_BASE")
            if cd_base is not None and str(cd_base).strip() != "":
                record["MIRO_AMOUNT"] = cd_base
                record["MIRO_AMOUNT_LC"] = cd_base
                
            # Override Status based on UTR and Due Date
            utr = record.get("UTR_NO")
            due_date = record.get("MIRO_NET_DUE_DATE")
            
            if utr is not None and str(utr).strip() not in ("", "-"):
                record["OVERALL_STATUS"] = "Paid"
            elif due_date is not None and str(due_date).strip() != "":
                record["OVERALL_STATUS"] = "Payment Due"
                
            records.append(record)
            
        return records
    finally:
        workbook.close()

def get_invoices(
    page: int = 1,
    page_size: int = 20,
    status: str | None = None,
    vendor_code: str | None = None,
    invoice_number: str | None = None,
    po_number: str | None = None,
    po_item: int | None = None,
):
    """Get paginated invoices from the in-memory cached Excel data."""
    all_records = _load_excel_data()
    records = []

    for record in all_records:
        if invoice_number:
            source_invoice_number = record.get("INV_NO")
            if source_invoice_number is None:
                continue
            if str(source_invoice_number).strip() != invoice_number.strip():
                continue

        if status:
            source_status = record.get("OVERALL_STATUS")
            if source_status is None:
                continue
            if str(source_status).strip().lower() != status.strip().lower():
                continue

        if vendor_code:
            source_vendor = record.get("SUPPLIER")
            if source_vendor is None:
                continue
            if str(source_vendor).strip().lower() != vendor_code.strip().lower():
                continue

        if po_number:
            source_po_number = record.get("PO_NO")
            if source_po_number is None:
                continue
            if str(source_po_number).strip() != po_number.strip():
                continue

        if po_item is not None:
            source_po_item = record.get("PO_ITEM")
            if source_po_item is None:
                continue
            try:
                if int(str(source_po_item).strip()) != po_item:
                    continue
            except (TypeError, ValueError):
                continue

        records.append(record)

    total = len(records)
    start = (page - 1) * page_size
    return records[start:start + page_size], total

def get_invoice_by_number(invoice_number: str, po_item: int | None = None) -> dict | None:
    """Find one invoice in the in-memory cached Excel data.

    INV_NO is NOT unique in the source data: the same invoice number can cover
    several PO line items, each a separate real row (e.g. one invoice number with
    6 rows for PO items 10/20/30/40/50). Without po_item this returns whichever
    matching row comes first in the file, same as before; pass po_item to get the
    exact line item.
    """
    all_records = _load_excel_data()
    matches = []

    for record in all_records:
        source_invoice_number = record.get("INV_NO")
        if source_invoice_number is None:
            continue
        if str(source_invoice_number).strip() == invoice_number.strip():
            matches.append(record)

    if not matches:
        return None

    if po_item is not None:
        for record in matches:
            source_po_item = record.get("PO_ITEM")
            if source_po_item is None:
                continue
            try:
                if int(str(source_po_item).strip()) == po_item:
                    return record
            except (TypeError, ValueError):
                continue

    return matches[0]

def get_all_cached_invoices():
    """Helper to return the full un-paginated list for fast aggregation."""
    return _load_excel_data()
