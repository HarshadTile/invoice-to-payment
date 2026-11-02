"""PO Portal source adapter. Keep original columns alongside shared filter aliases."""
import csv
import hashlib
import json
from pathlib import Path
from threading import Lock

from app.core.bigquery_api import fetch_columns, use_api
from app.repositories import api_snapshot
from app.repositories.srm_invoice import date_value, text_value

CSV_FILE = Path(__file__).resolve().parents[2] / 'data' / 'tbl_dw_inv_paymt_PO_PORTAL.csv'
BIGQUERY_TABLE = 'tbl_dw_inv_paymt_PO_PORTAL'
REQUIRED_COLUMNS = {'Reference', 'Purchasing_Document', 'Item', 'SUPPLIER', 'MIRO_BOOKED',
                    'Invoice_Uploaded', 'HOD1_Status', 'HOD2_Status', 'Accounts_Status',
                    'Status_OF_HOD', 'Created_by_HOD2', 'UTR_NUMBER', 'CLEARING_DATE'}
# The 48 of the table's 70 columns that status, filters and the invoice response read. A column
# used in code but missing here would silently read as blank in api mode; a test guards this.
PO_PORTAL_COLUMNS = (
    'Reference', 'Purchasing_Document', 'Item', 'Service', 'Line_Number', 'Entry_Sheet',
    'Entry_Sheet_Creation_Date', 'PO_Request_Number', 'PO_Type', 'PO_activity', 'Cost_Center',
    'SUPPLIER', 'SUPPLIER_NAME', 'PAN_NO', 'Comments', 'Edit_Status', 'Edit_Rejection_Comment',
    'Invoice_Creation_Date', 'Invoice_Upload_Date', 'Invoice_Uploaded', 'Parking_Date', 'Posting_Date',
    'Parking_UserName', 'Posting_Name', 'Claim_Number', 'Document_Number', 'Doc_Number',
    'MIRO_Created_on', 'MIRO_Created_By', 'Created_by_HOD1', 'Created_by_HOD2', 'Created_by_ACCOUNTS',
    'Status_OF_HOD', 'HOD1_Status', 'HOD2_Status', 'Accounts_Status', 'MIRO_BOOKED', 'MIRO_POSTING_DATE',
    'Payment_Due_Date', 'UTR_CLEARING_DATE_PAID', 'CLEARING_DATE', 'ACCOUNT_TYPE', 'CURRENCY',
    'NET_DUE_DATE', 'UTR_NUMBER', 'PAYABLE_AMOUNT', 'RSEG_POSTING_DATE', 'FILTER_FISCAL_YEAR',
)
_cached_invoices = None
_load_lock = Lock()
SNAPSHOT_NAME = 'po-portal'
loaded_from_snapshot = False  # the cache holds the last snapshot; invoice_refresh fetches fresh data


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


def _read_csv_rows():
    with CSV_FILE.open(encoding='utf-8-sig', newline='') as file:
        reader = csv.DictReader(file)
        return reader.fieldnames or [], list(reader)


def get_all_cached_invoices():
    """PO Portal rows from BigQuery (INVOICE_SOURCE=api) or the CSV, loaded once per process. With the
    API, the last on-disk snapshot is used when there is one, so a restart serves data at once."""
    global _cached_invoices, loaded_from_snapshot
    if _cached_invoices is not None:
        return _cached_invoices
    with _load_lock:
        if _cached_invoices is None:
            if use_api():
                records = api_snapshot.load(SNAPSHOT_NAME)
                loaded_from_snapshot = records is not None
                if records is None:
                    records = _records_from_api()
            else:
                records = _normalize(*_read_csv_rows())
            _cached_invoices = records
    return _cached_invoices


def _normalize(columns, raw_rows):
    missing = REQUIRED_COLUMNS - set(columns)
    if missing:
        raise ValueError(f'PO Portal source is missing columns: {sorted(missing)}')
    records, occurrences = [], {}
    for raw in raw_rows:
        if not any(text_value(value) for value in raw.values()):
            continue
        if not text_value(raw.get('Reference')):
            raise ValueError('PO Portal source contains an invoice without Reference')
        fingerprint = hashlib.sha256(json.dumps(raw, sort_keys=True).encode()).hexdigest()
        occurrences[fingerprint] = occurrences.get(fingerprint, 0) + 1
        records.append(normalize_row(raw, f'poPortal:{fingerprint}:{occurrences[fingerprint]}'))
    return records


def _records_from_api():
    return _normalize(PO_PORTAL_COLUMNS, fetch_columns(BIGQUERY_TABLE, PO_PORTAL_COLUMNS))


def refresh_from_api(prepare=lambda rows: None):
    """Fetches fresh rows and swaps them in at once; `prepare` (e.g. indexing) runs before the swap,
    so no request ever waits on it. Requests already running finish on the old rows."""
    global _cached_invoices, loaded_from_snapshot
    records = _records_from_api()
    prepare(records)
    with _load_lock:
        _cached_invoices, loaded_from_snapshot = records, False
    return records
