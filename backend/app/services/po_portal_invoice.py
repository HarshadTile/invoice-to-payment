"""PO Portal business mapping; no dependency on SRM approval flags."""
from decimal import Decimal

from app.repositories.gcp_invoice import date_value, text_value
from app.repositories.po_portal_invoice import approval_stage, invoice_status, pending_hod2, upper
from app.schemas.invoice import (ApproversResponse, InvoiceResponse, POPortalResponse,
                                 PurchaseOrderResponse, SAPResponse, SupplierResponse, WorkflowResponse)


def map_po_portal_invoice_to_response(row):
    text = lambda key: text_value(row.get(key))
    date = lambda key: date_value(row.get(key))
    amount = Decimal(text('PAYABLE_AMOUNT')) if text('PAYABLE_AMOUNT') is not None else None
    status = invoice_status(row)
    return InvoiceResponse(
        channel='poPortal', source_id=row.get('__source_id'),
        invoice_number=text('Reference'), invoice_date=date('Invoice_Creation_Date'),
        invoice_upload_date=date('Invoice_Upload_Date'),
        invoice_uploaded=upper(row, 'Invoice_Uploaded') == 'YES',
        invoice_type='Service', product_type='S',
        filter_fiscal_year=int(text('FILTER_FISCAL_YEAR')) if text('FILTER_FISCAL_YEAR') else None,
        overall_status=status, status_label=approval_stage(row),
        purchase_order=PurchaseOrderResponse(po_number=text('Purchasing_Document'),
                                             po_item=int(text('Item')) if text('Item') else None),
        supplier=SupplierResponse(vendor_code=text('SUPPLIER'), supplier_name=text('SUPPLIER_NAME'), pan=text('PAN_NO')),
        workflow=WorkflowResponse(
            approvers=ApproversResponse(),
            pending_with=text('Created_by_HOD2') if pending_hod2(row) and status == 'Pending for Approval' else None,
            rejection_reason=text('Edit_Rejection_Comment')),
        sap=SAPResponse(
            amount=amount, payable_amount=amount, currency=text('CURRENCY'),
            miro_status=text('MIRO_BOOKED'), miro_booking_date=date('MIRO_POSTING_DATE'),
            posting_date=date('MIRO_POSTING_DATE'),
            net_due_date=date('NET_DUE_DATE') or date('Payment_Due_Date'),
            clearing_date=date('CLEARING_DATE'), utr_number=text('UTR_NUMBER'),
            utr_clearing_date_paid=date('UTR_CLEARING_DATE_PAID'), account_type=text('ACCOUNT_TYPE')),
        po_portal=POPortalResponse(**{
            key: text(source) for key, source in {
                'service': 'Service', 'line_number': 'Line_Number', 'entry_sheet': 'Entry_Sheet',
                'po_request_number': 'PO_Request_Number', 'po_type': 'PO_Type', 'po_activity': 'PO_activity',
                'cost_center': 'Cost_Center', 'source_approval_stage': 'Status_OF_HOD',
                'hod1': 'Created_by_HOD1', 'hod2': 'Created_by_HOD2', 'accounts_user': 'Created_by_ACCOUNTS',
                'hod1_status': 'HOD1_Status', 'hod2_status': 'HOD2_Status', 'accounts_status': 'Accounts_Status',
                'comments': 'Comments', 'edit_status': 'Edit_Status', 'edit_rejection_comment': 'Edit_Rejection_Comment',
                'miro_created_by': 'MIRO_Created_By', 'parking_user': 'Parking_UserName', 'posting_user': 'Posting_Name',
                'document_number': 'Document_Number', 'doc_number': 'Doc_Number', 'claim_number': 'Claim_Number',
            }.items()
        }, **{
            key: date(source) for key, source in {
                'entry_sheet_creation_date': 'Entry_Sheet_Creation_Date', 'miro_created_on': 'MIRO_Created_on',
                'miro_posting_date': 'MIRO_POSTING_DATE', 'parking_date': 'Parking_Date',
                'posting_date': 'Posting_Date', 'rseg_posting_date': 'RSEG_POSTING_DATE',
            }.items()
        }, approval_stage=approval_stage(row)),
    )
