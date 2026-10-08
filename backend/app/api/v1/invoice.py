from math import ceil
from datetime import date
from collections import defaultdict
from fastapi import APIRouter, HTTPException, Query
from app.schemas.invoice import InvoiceListResponse, InvoiceResponse
from app.services.invoice import (
    get_gcp_invoice_list,
    get_gcp_invoice_response,
)
from app.repositories.gcp_invoice import get_all_cached_invoices


router = APIRouter(
    prefix="/invoices",
    tags=["Invoices"],
)


@router.get("", response_model=InvoiceListResponse)
def get_all_invoices(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=1000),
    status: str | None = None,
    vendor_code: str | None = None,
    invoice_number: str | None = None,
    po_number: str | None = None,
    po_item: int | None = None,
):
    invoices, total = get_gcp_invoice_list(
        page=page,
        page_size=page_size,
        status=status,
        vendor_code=vendor_code,
        invoice_number=invoice_number,
        po_number=po_number,
        po_item=po_item,
    )

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
):
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
):
    invoices, _ = get_gcp_invoice_list(
        page=1,
        page_size=limit,
        vendor_code=vendor_code,
    )
    
    # Sort them by date descending (get_gcp_invoice_list doesn't support sorting yet)
    invoices.sort(key=lambda x: x.invoice_date or date.min, reverse=True)
    return invoices[:limit]

@router.get("/{invoice_number:path}", response_model=InvoiceResponse)
def get_invoice_by_number(invoice_number: str):
    invoice = get_gcp_invoice_response(invoice_number)

    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")

    return invoice

