from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class PurchaseOrderResponse(BaseModel):
    po_number: str | None = None
    po_item: int | None = None


class SupplierResponse(BaseModel):
    vendor_code: str | None = None
    supplier_name: str | None = None
    pan: str | None = None


class ApproversResponse(BaseModel):
    approver_1: str | None = None
    approver_2: str | None = None
    approver_3: str | None = None
    approver_4: str | None = None
    approver_5: str | None = None
    approver_6: str | None = None
    approver_7: str | None = None


class WorkflowResponse(BaseModel):
    approved_by: str | None = None
    pending_with: str | None = None
    approvers: ApproversResponse
    workflow_levels: int | None = None
    current_workflow_level: int | None = None
    workflow_steps: str | None = None
    rejection_reason: str | None = None
    accountant: str | None = None
    document_sent_to_accounts_date: date | None = None
    final_approval_date: date | None = None
    approver_remarks: str | None = None


class SAPResponse(BaseModel):
    miro_booking_date: date | None = None
    payable_amount: Decimal | None = None
    miro_status: str | None = None
    utr_clearing_date_paid: date | None = None
    miro_document: str | None = None
    company_code: str | None = None
    fiscal_year: int | None = None
    document_type: str | None = None
    document_date: date | None = None
    posting_date: date | None = None
    reference: str | None = None
    currency: str | None = None
    amount: Decimal | None = None
    amount_local_currency: Decimal | None = None
    cash_discount_base: Decimal | None = None
    po_number: str | None = None
    po_item: int | None = None
    net_due_date: date | None = None
    baseline_date: date | None = None
    account_type: str | None = None
    posting_key: str | None = None
    clearing_date: date | None = None
    clearing_document: str | None = None
    clearing_fiscal_year: int | None = None
    clearing_status: str | None = None
    utr_number: str | None = None


class POPortalResponse(BaseModel):
    service: str | None = None
    line_number: str | None = None
    entry_sheet: str | None = None
    entry_sheet_creation_date: date | None = None
    po_request_number: str | None = None
    po_type: str | None = None
    po_activity: str | None = None
    cost_center: str | None = None
    source_approval_stage: str | None = None
    approval_stage: str | None = None
    hod1: str | None = None
    hod2: str | None = None
    accounts_user: str | None = None
    hod1_status: str | None = None
    hod2_status: str | None = None
    accounts_status: str | None = None
    comments: str | None = None
    edit_status: str | None = None
    edit_rejection_comment: str | None = None
    miro_created_on: date | None = None
    miro_posting_date: date | None = None
    parking_date: date | None = None
    posting_date: date | None = None
    rseg_posting_date: date | None = None
    miro_created_by: str | None = None
    parking_user: str | None = None
    posting_user: str | None = None
    document_number: str | None = None
    doc_number: str | None = None
    claim_number: str | None = None


class InvoiceResponse(BaseModel):
    channel: str = 'msetuSrm'
    source_id: str | None = None
    po_portal: POPortalResponse | None = None
    product_type: str | None = None
    plant: str | None = None
    invoice_upload_date: date | None = None
    invoice_uploaded: bool | None = None
    filter_fiscal_year: int | None = None
    dv_type: str | None = None
    status_label: str | None = None
    invoice_number: str
    invoice_date: date | None = None
    invoice_type: str | None = None
    status_flag: str | None = None
    overall_status: str | None = None
    purchase_order: PurchaseOrderResponse
    supplier: SupplierResponse
    workflow: WorkflowResponse
    sap: SAPResponse


class InvoiceListResponse(BaseModel):
    items: list[InvoiceResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
