from math import ceil
from datetime import date
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Query
from app.api.v1.auth import get_current_user_token
from app.schemas.invoice import ApproversResponse, InvoiceListResponse, InvoiceResponse
from app.services.invoice import (
    get_gcp_invoice_list,
    get_gcp_invoice_response,
)
from app.repositories.gcp_invoice import get_all_cached_invoices


router = APIRouter(
    prefix="/invoices",
    tags=["Invoices"],
)


def _supplier_vendor_code(user: dict) -> str | None:
    """Vendor code a supplier token is locked to; None for internal users."""
    if user.get("auth_type") == "supplier":
        return str(user.get("sub"))
    return None


def _redact_for_supplier(invoice: InvoiceResponse) -> InvoiceResponse:
    """Drop internal approval details that suppliers must never receive."""
    no_approvers = ApproversResponse(**{f"approver_{i}": None for i in range(1, 8)})
    workflow = invoice.workflow.model_copy(update={
        "approved_by": None,
        "pending_with": None,
        "approvers": no_approvers,
        "workflow_steps": None,
        "accountant": None,
        "document_sent_to_accounts_date": None,
        "approver_remarks": None,
    })
    return invoice.model_copy(update={"workflow": workflow})


@router.get("", response_model=InvoiceListResponse)
def get_all_invoices(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=1000),
    status: str | None = None,
    vendor_code: str | None = None,
    invoice_number: str | None = None,
    po_number: str | None = None,
    po_item: int | None = None,
    user: dict = Depends(get_current_user_token),
):
    supplier_code = _supplier_vendor_code(user)
    if supplier_code:
        vendor_code = supplier_code  # a supplier can only ever see its own code

    invoices, total = get_gcp_invoice_list(
        page=page,
        page_size=page_size,
        status=status,
        vendor_code=vendor_code,
        invoice_number=invoice_number,
        po_number=po_number,
        po_item=po_item,
    )

    if supplier_code:
        invoices = [_redact_for_supplier(i) for i in invoices]

    total_pages = ceil(total / page_size) if total else 0

    return InvoiceListResponse(
        items=invoices,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )

@router.get("/summary")
def get_invoice_summary(
    vendor_code: str | None = None,
    user: dict = Depends(get_current_user_token),
):
    vendor_code = _supplier_vendor_code(user) or vendor_code
    all_rows = get_all_cached_invoices()
    
    if vendor_code:
        target_vendor = vendor_code.strip().lower()
        all_rows = [r for r in all_rows if str(r.get("SUPPLIER", "")).strip().lower() == target_vendor]
        
    status_counts = defaultdict(int)
    for row in all_rows:
        st = row.get("OVERALL_STATUS")
        if not st:
            st = "Uploaded"
        status_counts[st] += 1
        
    # Hardcoding the channels for Msetu/SRM for this mockup
    channel_counts = [{"key": "msetuSrm", "value": len(all_rows)}]
    by_status = [{"key": s, "value": c} for s, c in status_counts.items()]
    
    pending_approval = sum(1 for r in all_rows if str(r.get("OVERALL_STATUS", "")).strip().lower() == 'pending approval')
    approved = sum(1 for r in all_rows if str(r.get("OVERALL_STATUS", "")).strip().lower() == 'approved')
    payment_due = sum(1 for r in all_rows if str(r.get("OVERALL_STATUS", "")).strip().lower() == 'payment due')
    paid = sum(1 for r in all_rows if str(r.get("OVERALL_STATUS", "")).strip().lower() == 'paid')
    
    return {
        "total": len(all_rows),
        "kpi": {
            "pendingApproval": pending_approval,
            "approved": approved,
            "paymentDue": payment_due,
            "paid": paid
        },
        "byChannel": channel_counts,
        "byStatus": by_status
    }

@router.get("/recent")
def get_recent_invoices(
    limit: int = 5,
    vendor_code: str | None = None,
    user: dict = Depends(get_current_user_token),
):
    supplier_code = _supplier_vendor_code(user)
    vendor_code = supplier_code or vendor_code
    invoices, _ = get_gcp_invoice_list(
        page=1,
        page_size=limit,
        vendor_code=vendor_code,
    )
    
    # Sort them by date descending (get_gcp_invoice_list doesn't support sorting yet)
    invoices.sort(key=lambda x: x.invoice_date or date.min, reverse=True)
    invoices = invoices[:limit]
    return [_redact_for_supplier(i) for i in invoices] if supplier_code else invoices

@router.get("/{invoice_number:path}", response_model=InvoiceResponse)
def get_invoice_by_number(invoice_number: str, user: dict = Depends(get_current_user_token)):
    invoice = get_gcp_invoice_response(invoice_number)
    supplier_code = _supplier_vendor_code(user)

    # 404 (not 403) for other suppliers' invoices so their existence isn't revealed
    if invoice is None or (supplier_code and invoice.supplier.vendor_code != supplier_code):
        raise HTTPException(status_code=404, detail="Invoice not found")

    return _redact_for_supplier(invoice) if supplier_code else invoice

