from pathlib import Path
from openpyxl import load_workbook

EXCEL_FILE = Path("data/gcp_invoice_data.xlsx")
SHEET_NAME = "in"

_cached_invoices = None

def _load_excel_data():
    global _cached_invoices
    if _cached_invoices is not None:
        return _cached_invoices
        
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
            
        _cached_invoices = records
        return _cached_invoices
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

def get_invoice_by_number(invoice_number: str) -> dict | None:
    """Find one invoice in the in-memory cached Excel data."""
    all_records = _load_excel_data()

    for record in all_records:
        source_invoice_number = record.get("INV_NO")
        if source_invoice_number is None:
            continue
        if str(source_invoice_number).strip() == invoice_number.strip():
            return record

    return None

def get_all_cached_invoices():
    """Helper to return the full un-paginated list for fast aggregation."""
    return _load_excel_data()
