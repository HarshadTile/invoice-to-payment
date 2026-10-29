from datetime import date
from decimal import Decimal

from app.repositories.gcp_invoice import (
    STATUS_LABELS, date_value, filter_invoices,
    get_invoices, invoice_status, text_value,
)
from app.schemas.invoice import (
    ApproversResponse, InvoiceResponse, PurchaseOrderResponse, SAPResponse,
    SupplierResponse, WorkflowResponse,
)


def _integer(value):
    return int(value) if text_value(value) is not None else None


def map_gcp_invoice_to_response(row: dict) -> InvoiceResponse:
    """Map actual SRM columns without inventing values absent from the source."""
    if row.get('__channel') == 'poPortal':
        from app.services.po_portal_invoice import map_po_portal_invoice_to_response
        return map_po_portal_invoice_to_response(row)
    flag = (text_value(row.get("STATUS_FLAG")) or "").upper()
    product = text_value(row.get("PRODUCT_TYPE"))
    amount = text_value(row.get("PAYABLE_AMOUNT"))
    return InvoiceResponse(
        invoice_number=text_value(row.get("VENDOR_INVOICE_NO")),
        invoice_date=date_value(row.get("INVOICE_DATE")),
        invoice_upload_date=date_value(row.get("INVOICE_UPLOAD_DATE")),
        invoice_uploaded=(text_value(row.get("Invoice_Uploaded")) or "").upper() == "YES",
        invoice_type={"S": "Service", "M": "Material"}.get(product, product),
        product_type=product,
        plant=text_value(row.get("PLANT")),
        filter_fiscal_year=_integer(row.get("FILTER_FISCAL_YEAR")),
        dv_type=text_value(row.get("DV_TYPE")),
        status_flag=flag,
        status_label=STATUS_LABELS.get(flag, flag or "Unknown"),
        overall_status=invoice_status(row),
        purchase_order=PurchaseOrderResponse(
            po_number=text_value(row.get("PURCHASING_DOCUMENT")), po_item=_integer(row.get("ITEM"))),
        supplier=SupplierResponse(
            vendor_code=text_value(row.get("SUPPLIER")),
            supplier_name=text_value(row.get("SUPPLIER_NAME")), pan=text_value(row.get("PAN_NO"))),
        workflow=WorkflowResponse(
            approved_by=text_value(row.get("APPROVED_BY")),
            pending_with=text_value(row.get("PENDING_WITH")),
            approvers=ApproversResponse(**{
                f"approver_{i}": text_value(row.get(f"APPROVER{i}")) for i in range(1, 8)}),
            document_sent_to_accounts_date=date_value(row.get("DOC_SENT_ACCOUNT_DATE")),
            final_approval_date=date_value(row.get("FINAL_APPRPVAL_DATE")),
            approver_remarks=text_value(row.get("Approver_Remarks")),
            rejection_reason=text_value(row.get("REJ_REASON"))),
        sap=SAPResponse(
            document_date=date_value(row.get("MIRO_DOCUMENT_DATE")),
            posting_date=date_value(row.get("POSTING_DATE")),
            currency=text_value(row.get("CURRENCY")),
            amount=Decimal(amount) if amount is not None else None,
            payable_amount=Decimal(amount) if amount is not None else None,
            net_due_date=(date_value(row.get("NETDT")) or date_value(row.get("NET_DUE_DATE"))
                          or date_value(row.get("Payment_Due_Date"))),
            account_type=text_value(row.get("ACCOUNT_TYPE")),
            clearing_date=date_value(row.get("CLEARING_DATE")),
            utr_number=text_value(row.get("UTR_NUMBER")),
            miro_status=text_value(row.get("MIRO_BOOKED")),
            utr_clearing_date_paid=date_value(row.get("UTR_CLEARING_DATE_PAID"))),
    )


def get_gcp_invoice_response(invoice_number: str, po_item: int | None = None, *, vendor_codes=None,
                             channel='msetuSrm', source_id=None, vendor_code=None, po_number=None):
    records = filter_invoices(invoice_number=invoice_number, po_item=po_item, vendor_codes=vendor_codes,
                              channel=channel, source_id=source_id, vendor_code=vendor_code, po_number=po_number)
    if len(records) > 1 and any(row.get('__channel') == 'poPortal' for row in records):
        raise ValueError('Multiple source rows match; supply source_id from the invoice list')
    row = records[0] if records else None
    return map_gcp_invoice_to_response(row) if row is not None else None


def get_gcp_invoice_list(page=1, page_size=20, **filters):
    rows, total = get_invoices(page=page, page_size=page_size, **filters)
    return [map_gcp_invoice_to_response(row) for row in rows], total


def get_recent_gcp_invoices(limit=5, **filters):
    rows = filter_invoices(**filters)
    rows.sort(key=lambda row: date_value(row.get("INVOICE_UPLOAD_DATE")) or date.min, reverse=True)
    return [map_gcp_invoice_to_response(row) for row in rows[:limit]]
