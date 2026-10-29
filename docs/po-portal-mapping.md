# PO Portal invoice mapping

The local source is `backend/data/tbl_dw_inv_paymt_PO_PORTAL.csv`. SRM continues
to use its existing workbook and mapping. No external GCP request is made yet.
The future GCP reader must provide the same original PO column names to the PO
adapter; approval logic is independent of the file transport.

## Agreed status priority

Evaluate in order, trimming whitespace and comparing status text without case:

1. Non-placeholder `UTR_NUMBER` or a valid `CLEARING_DATE`: **Paid**.
2. `MIRO_BOOKED = MIRO BOOKED`: **Miro Booked**.
3. Any HOD1, HOD2 or Accounts status is `REJECTED`: **Rejected**.
4. `Status_OF_HOD = INFO`: **Action Required**.
5. `HOD2_Status = APPROVED`: **Approved**.
6. `HOD1_Status = APPROVED`: **Pending for Approval** when
   `Created_by_HOD2` is populated and HOD2 is not approved; otherwise **Approved**.
7. `Invoice_Uploaded = YES`: **Invoice Uploaded**.
8. Otherwise: **Initial**.

Rule 6 is the agreed provisional assignment rule. A populated `Created_by_HOD2`
does not independently prove current ownership. `pending_with` is populated only
when this rule actually yields Pending for Approval. HOD names are kept in PO
fields rather than copied into SRM's Approvers 1–7 or guessed Approved By values.
`SC` is preserved verbatim: its expansion has not been established from source
documentation. `STATUS`, `Flag` and unconfirmed `Edit_Status` codes do not drive
the main status. Blank approval statuses mean **not recorded**, never rejected.

Main status and recorded approval evidence are separate. A paid or MIRO-booked
row can still retain a rejection status/comment. `Edit_Rejection_Comment` is
shown as a review/rejection comment, not a short-payment reason. INFO alone is
not treated as an explicit rejection.

## Common response fields

| Response | Source / rule |
|---|---|
| `channel` | `poPortal` |
| `invoice_number` | `Reference` (confirmed) |
| `invoice_type`, `product_type` | `Service`, `S` (confirmed for all PO rows) |
| `invoice_date` | `Invoice_Creation_Date`: portal creation date; no separate supplier invoice-issued date is supplied |
| `invoice_upload_date` | `Invoice_Upload_Date` |
| `purchase_order.po_number`, `po_item` | `Purchasing_Document`, `Item` |
| `supplier` | `SUPPLIER`, `SUPPLIER_NAME`, `PAN_NO` |
| `sap.payable_amount`, `amount`, `currency` | `PAYABLE_AMOUNT`, `CURRENCY` |
| `sap.net_due_date` | Valid `NET_DUE_DATE`, otherwise `Payment_Due_Date` |
| `sap.miro_booking_date`, `posting_date` | `MIRO_POSTING_DATE` (explicit posting-date basis) |
| `sap.clearing_date`, `utr_number` | `CLEARING_DATE`, `UTR_NUMBER` |
| `sap.utr_clearing_date_paid` | `UTR_CLEARING_DATE_PAID` |
| `filter_fiscal_year` | `FILTER_FISCAL_YEAR` |

No PO plant, division, final approval timestamp, MIRO document date or confirmed
MIRO document-number mapping is invented. The `po_portal` object keeps service
lines, entry sheets, HOD/Accounts values, cost centre, PO type/activity, original
document identifiers and separate creation, parking and posting dates. Distinct
source date fields are not collapsed into one supposed event date.

## API and row identity

List, summary and recent endpoints accept `channel=msetuSrm|poPortal|all`.
The API default remains SRM for compatibility. Frontend loading explicitly asks
for `all`; the server restricts this to the signed-in workspace and vendor codes.
Managed supplier access also follows the supplier's saved channel; legacy
vendor-code sessions retain SRM access. PO internal names, statuses and comments
are redacted from supplier PO details using an explicit allowlist.

PO filters include `hod1_status`, `hod2_status`, `accounts_status` with values
`APPROVED`, `REJECTED`, or `__blank__` (not recorded); `approval_stage` for the
original `SC|INFO|HOD1|HOD2`; `invoice_uploaded` (boolean); `po_type`; and the
common vendor/PO, date, MIRO and payment filters. Internal approval filters are
unavailable to suppliers. An approver search covers the PO HOD1/HOD2/Accounts
names. `approved_by` is not fabricated from a populated creator field.

PO `date_type=miro` and `posting` use `MIRO_POSTING_DATE`. Approval and sent-to-
accounts date filters match no PO rows because those timestamps are unavailable.

Every source row gets a `source_id` from its source-content hash and duplicate
occurrence. It identifies the row in the current source snapshot, not a permanent
GCP business key. No rows are deduplicated or merged across channels. Pass
`channel=poPortal&source_id=...` to the invoice-details endpoint. If several
service lines match without sufficient identity, the API returns **409**, rather
than an arbitrary row. Vendor code and PO number can also narrow the lookup.

PO query creation accepts `invoice_channel=poPortal` and `invoice_source_id`.
The server validates vendor/channel ownership and routes to the PO team. Tickets
remain invoice-level records; their summaries omit ambiguous line amounts.

## Validation against the supplied snapshot

All 5,000 **source rows** mapped successfully; these are not necessarily 5,000
distinct invoices. Status counts using the agreed rules:

| Status | Rows |
|---|---:|
| Paid | 4,006 |
| Initial | 459 |
| Approved | 355 |
| Invoice Uploaded | 106 |
| Miro Booked | 34 |
| Rejected | 32 |
| Pending for Approval | 7 |
| Action Required | 1 |

Eight paid rows report upload NO; one paid row retains an Accounts rejection.
The adapter preserves these conflicts and applies the agreed payment priority.
It does not overwrite original source approvals or add missing event dates.
