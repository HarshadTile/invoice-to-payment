"""PO Portal source adapter. Keep original columns alongside shared filter aliases."""
import csv
import hashlib
import json
from pathlib import Path

from app.repositories.gcp_invoice import date_value, text_value

CSV_FILE = Path(__file__).resolve().parents[2] / 'data' / 'tbl_dw_inv_paymt_PO_PORTAL.csv'
_cached_invoices = None


def upper(row, key):
    return (text_value(row.get(key)) or '').upper()


def approval_stage(row):
    """Recorded facts only; SC is deliberately not expanded to a guessed label."""
    if any(upper(row, key) == 'REJECTED' for key in ('HOD1_Status', 'HOD2_Status', 'Accounts_Status')):
        return 'Rejected'
    if upper(row, 'Status_OF_HOD') == 'INFO':
        return 'Action Required'
    if upper(row, 'HOD2_Status') == 'APPROVED':
        return 'HOD2 Approved'
    if upper(row, 'HOD1_Status') == 'APPROVED':
        return 'HOD1 Approved'
    return text_value(row.get('Status_OF_HOD'))


def pending_hod2(row):
    # Agreed provisional rule: a named HOD2 with a blank status is awaiting approval.
    # An unfamiliar nonblank status must not silently become Approved.
    return (upper(row, 'HOD1_Status') == 'APPROVED'
            and text_value(row.get('Created_by_HOD2')) is not None
            and upper(row, 'HOD2_Status') != 'APPROVED')


def invoice_status(row):
    if text_value(row.get('UTR_NUMBER')) or date_value(row.get('CLEARING_DATE')):
        return 'Paid'
    if upper(row, 'MIRO_BOOKED') == 'MIRO BOOKED':
        return 'Miro Booked'
    stage = approval_stage(row)
    if stage in ('Rejected', 'Action Required'):
        return stage
    if upper(row, 'HOD2_Status') == 'APPROVED':
        return 'Approved'
    if upper(row, 'HOD1_Status') == 'APPROVED':
        return 'Pending for Approval' if pending_hod2(row) else 'Approved'
    return 'Invoice Uploaded' if upper(row, 'Invoice_Uploaded') == 'YES' else 'Initial'


def normalize_row(raw, source_id=None):
    row = dict(raw)
    row.update({
        '__channel': 'poPortal', '__source_id': source_id,
        'VENDOR_INVOICE_NO': raw.get('Reference'),
        'PURCHASING_DOCUMENT': raw.get('Purchasing_Document'), 'ITEM': raw.get('Item'),
        'PRODUCT_TYPE': 'S', 'INVOICE_DATE': raw.get('Invoice_Creation_Date'),
        'INVOICE_UPLOAD_DATE': raw.get('Invoice_Upload_Date'),
        # This is a posting date, not an invented MIRO document date.
        'POSTING_DATE': raw.get('MIRO_POSTING_DATE'),
        'PENDING_WITH': raw.get('Created_by_HOD2') if pending_hod2(raw) and invoice_status(raw) == 'Pending for Approval' else None,
    })
    return row


def get_all_cached_invoices():
    global _cached_invoices
    if _cached_invoices is None:
        with CSV_FILE.open(encoding='utf-8-sig', newline='') as file:
            reader = csv.DictReader(file)
            required = {'Reference', 'Purchasing_Document', 'Item', 'SUPPLIER', 'MIRO_BOOKED',
                        'Invoice_Uploaded', 'HOD1_Status', 'HOD2_Status', 'Accounts_Status',
                        'Status_OF_HOD', 'Created_by_HOD2', 'UTR_NUMBER', 'CLEARING_DATE'}
            missing = required - set(reader.fieldnames or [])
            if missing:
                raise ValueError(f'PO Portal source is missing columns: {sorted(missing)}')
            records, occurrences = [], {}
            for raw in reader:
                if not any(text_value(value) for value in raw.values()):
                    continue
                if not text_value(raw.get('Reference')):
                    raise ValueError('PO Portal source contains an invoice without Reference')
                fingerprint = hashlib.sha256(json.dumps(raw, sort_keys=True).encode()).hexdigest()
                occurrences[fingerprint] = occurrences.get(fingerprint, 0) + 1
                records.append(normalize_row(raw, f'poPortal:{fingerprint}:{occurrences[fingerprint]}'))
            _cached_invoices = records
    return _cached_invoices
