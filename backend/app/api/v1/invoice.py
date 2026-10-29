from math import ceil
from datetime import date
from collections import Counter
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user_token
from app.core.database import get_db
from app.services.supplier_service import supplier_vendor_codes_from_token, is_managed_supplier_token, load_active_supplier
from app.schemas.invoice import ApproversResponse, InvoiceListResponse, InvoiceResponse
from app.services.invoice import (
    get_gcp_invoice_list,
    get_gcp_invoice_response,
    get_recent_gcp_invoices,
)
from app.repositories.gcp_invoice import filter_invoices, invoice_status


router = APIRouter(
    prefix="/invoices",
    tags=["Invoices"],
)


def _supplier_codes(user: dict, db: Session) -> list[str] | None:
    """Vendor codes a supplier token may see; None for internal users. A supplier created on the
    Suppliers screen is read from the database (so edits and deactivation apply at once); one
    from the original vendor-code login is locked to that single code, as before."""
    return supplier_vendor_codes_from_token(db, user)


def _narrow(allowed: list[str], requested: str | None) -> list[str]:
    """A supplier may narrow to one of its own codes; any other requested code is ignored."""
    if requested and requested.strip().lower() in {c.lower() for c in allowed}:
        return [requested.strip()]
    return allowed


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
    # PO Portal carries its own approval names and internal comments. Use an
    # allowlist so adding a new internal PO field cannot leak it to suppliers.
    portal = invoice.po_portal
    if portal is not None:
        from app.schemas.invoice import POPortalResponse
        portal = POPortalResponse(**{key: getattr(portal, key) for key in (
            'service', 'line_number', 'entry_sheet', 'entry_sheet_creation_date', 'po_request_number',
            'po_type', 'po_activity', 'miro_created_on', 'miro_posting_date',
        )})
    return invoice.model_copy(update={"workflow": workflow, "po_portal": portal})


def _channel_scope(filters, user, db):
    filters = dict(filters)
    scope = (user.get('scope') or {}).get('channelScope')
    if is_managed_supplier_token(user):
        scope = load_active_supplier(db, user).channel
    elif user.get('auth_type') == 'supplier':
        # Legacy vendor-code sessions predate PO Portal and retain SRM access.
        scope = 'msetuSrm'
    requested = filters.get('channel', 'msetuSrm')
    if scope and scope != 'all':
        if requested not in ('all', scope):
            raise HTTPException(status_code=403, detail='Invoice channel is outside your workspace')
        filters['channel'] = scope
    return filters


def invoice_filters(
    channel: Literal['msetuSrm', 'poPortal', 'all'] = 'msetuSrm',
    status: str | None = None,
    vendor_code: str | None = None,
    invoice_number: str | None = None,
    po_number: str | None = None,
    po_item: int | None = None,
    product_type: Literal["S", "M"] | None = None,
    plant: str | None = None,
    dv_type: str | None = None,
    upload_date_from: date | None = None,
    upload_date_to: date | None = None,
    filter_fiscal_year: int | None = None,
    date_type: Literal["invoice", "upload", "approval", "miro", "due", "payment", "posting", "accounts", "utr_clearing"] = "invoice",
    date_from: date | None = None,
    date_to: date | None = None,
    approver: str | None = None,
    pending_with: str | None = None,
    approved_by: str | None = None,
    miro_status: Literal["booked", "pending"] | None = None,
    payment_status: Literal["paid", "unpaid"] | None = None,
    hod1_status: Literal['APPROVED', 'REJECTED', '__blank__'] | None = None,
    hod2_status: Literal['APPROVED', 'REJECTED', '__blank__'] | None = None,
    accounts_status: Literal['APPROVED', 'REJECTED', '__blank__'] | None = None,
    approval_stage: Literal['SC', 'INFO', 'HOD1', 'HOD2'] | None = None,
    invoice_uploaded: bool | None = None,
    po_type: str | None = None,
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="Date from must not be after date to")
    if upload_date_from and upload_date_to and upload_date_from > upload_date_to:
        raise HTTPException(status_code=422, detail="Upload date from must not be after upload date to")
    return dict(channel=channel, status=status, vendor_code=vendor_code, invoice_number=invoice_number,
                po_number=po_number, po_item=po_item, product_type=product_type, plant=plant, dv_type=dv_type,
                upload_date_from=upload_date_from, upload_date_to=upload_date_to,
                filter_fiscal_year=filter_fiscal_year,
                date_type=date_type, date_from=date_from, date_to=date_to,
                approver=approver, pending_with=pending_with, approved_by=approved_by,
                miro_status=miro_status, payment_status=payment_status,
                hod1_status=hod1_status, hod2_status=hod2_status, accounts_status=accounts_status,
                approval_stage=approval_stage, invoice_uploaded=invoice_uploaded, po_type=po_type)


def _scoped_filters(filters, supplier_codes):
    filters = dict(filters)
    if supplier_codes is not None:
        if any(filters.get(key) for key in ("approver", "pending_with", "approved_by", "hod1_status", "hod2_status", "accounts_status", "approval_stage")):
            raise HTTPException(status_code=403, detail="Internal approval filters are unavailable to suppliers")
        if filters.get("date_type") == "accounts":
            raise HTTPException(status_code=403, detail="Internal account dates are unavailable to suppliers")
        filters["vendor_codes"] = _narrow(supplier_codes, filters.pop("vendor_code", None))
    return filters


@router.get("", response_model=InvoiceListResponse, include_in_schema=False)
@router.get("/list-invoices", response_model=InvoiceListResponse,
            operation_id="listInvoices", summary="List invoices")
def get_all_invoices(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=1000),
    filters: dict = Depends(invoice_filters),
    user: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db),
):
    supplier_codes = _supplier_codes(user, db)
    invoices, total = get_gcp_invoice_list(
        page=page, page_size=page_size, **_scoped_filters(_channel_scope(filters, user, db), supplier_codes))
    if supplier_codes is not None:
        invoices = [_redact_for_supplier(i) for i in invoices]
    return InvoiceListResponse(items=invoices, total=total, page=page, page_size=page_size,
                               total_pages=ceil(total / page_size) if total else 0)


@router.get("/summary", include_in_schema=False)
@router.get("/invoice-summary", operation_id="getInvoiceSummary", summary="Get invoice summary")
def get_invoice_summary(
    filters: dict = Depends(invoice_filters),
    user: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db),
):
    rows = filter_invoices(**_scoped_filters(_channel_scope(filters, user, db), _supplier_codes(user, db)))
    counts = Counter(invoice_status(row) for row in rows)
    return {
        "total": len(rows),
        "kpi": {"pendingApproval": counts["Pending for Approval"], "approved": counts["Approved"],
                "miroBooked": counts["Miro Booked"], "paid": counts["Paid"], "paymentDue": 0},
        "byChannel": [{"key": key, "value": count} for key, count in Counter(row.get('__channel', 'msetuSrm') for row in rows).items()],
        "byStatus": [{"key": status, "value": count} for status, count in counts.items()],
    }


@router.get("/recent", include_in_schema=False)
@router.get("/recent-invoices", response_model=list[InvoiceResponse],
            operation_id="listRecentInvoices", summary="List recent invoices")
def get_recent_invoices(
    limit: int = Query(default=5, ge=1, le=1000),
    filters: dict = Depends(invoice_filters),
    user: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db),
):
    supplier_codes = _supplier_codes(user, db)
    invoices = get_recent_gcp_invoices(limit=limit, **_scoped_filters(_channel_scope(filters, user, db), supplier_codes))
    return [_redact_for_supplier(i) for i in invoices] if supplier_codes is not None else invoices


@router.get("/{invoice_number:path}", response_model=InvoiceResponse, include_in_schema=False)
@router.get("/invoice-details/{invoice_number:path}", response_model=InvoiceResponse,
            operation_id="getInvoiceDetails", summary="Get invoice details")
def get_invoice_by_number(
    invoice_number: str,
    po_item: int | None = None,
    channel: Literal['msetuSrm', 'poPortal', 'all'] = 'msetuSrm',
    source_id: str | None = None,
    vendor_code: str | None = None,
    po_number: str | None = None,
    user: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db),
):
    supplier_codes = _supplier_codes(user, db)
    filters = _scoped_filters(_channel_scope(dict(channel=channel, vendor_code=vendor_code), user, db), supplier_codes)
    try:
        invoice = get_gcp_invoice_response(invoice_number, po_item=po_item, source_id=source_id, po_number=po_number, **filters)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return _redact_for_supplier(invoice) if supplier_codes is not None else invoice
