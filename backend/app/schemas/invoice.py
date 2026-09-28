from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class PurchaseOrderResponse(BaseModel):
    po_number: str | None
    po_item: int | None


class SupplierResponse(BaseModel):
    vendor_code: str | None
    supplier_name: str | None
    pan: str | None


class ApproversResponse(BaseModel):
    approver_1: str | None
    approver_2: str | None
    approver_3: str | None
    approver_4: str | None
    approver_5: str | None
    approver_6: str | None
    approver_7: str | None


class WorkflowResponse(BaseModel):
    approved_by: str | None
    pending_with: str | None
    approvers: ApproversResponse
    workflow_levels: int | None
    current_workflow_level: int | None
    workflow_steps: str | None
    rejection_reason: str | None
    accountant: str | None
    document_sent_to_accounts_date: date | None
    final_approval_date: date | None
    approver_remarks: str | None


class SAPResponse(BaseModel):
    miro_document: str | None
    company_code: str | None
    fiscal_year: int | None
    document_type: str | None
    document_date: date | None
    posting_date: date | None
    reference: str | None
    currency: str | None
    amount: Decimal | None
    amount_local_currency: Decimal | None
    cash_discount_base: Decimal | None
    po_number: str | None
    po_item: int | None
    net_due_date: date | None
    baseline_date: date | None
    account_type: str | None
    posting_key: str | None
    clearing_date: date | None
    clearing_document: str | None
    clearing_fiscal_year: int | None
    clearing_status: str | None
    utr_number: str | None


class InvoiceResponse(BaseModel):
    invoice_number: str
    invoice_date: date | None
    invoice_type: str | None
    status_flag: str | None
    overall_status: str | None
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
