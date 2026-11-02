from math import ceil
from datetime import date, datetime
from collections import Counter
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import ensure_ticket_access, get_current_user, get_current_user_token
from app.core.database import get_db
from app.services.supplier_service import supplier_vendor_codes_from_token, is_managed_supplier_token, load_active_supplier
from app.schemas.invoice import ApproversResponse, InvoiceListResponse, InvoiceResponse
from app.services import invoice_events, ticket_service
from app.services.invoice_export import csv_lines
from app.services.invoice_index import CHANNEL_LABEL, SORT_FIELDS
from app.services.invoice_query import (FACETS, INTERNAL_FACETS, dashboard_metrics, facet_counts, pan_directory,
                                        query_rows, vendor_list, vendor_report)
from app.services.invoice_service import get_invoice_response, map_invoice_to_response
from app.repositories.srm_invoice import invoice_status


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
        # Scoped by vendor codes, not by channel: a vendor in both Msetu / SRM and PO Portal
        # sees its invoices from both.
        load_active_supplier(db, user)
        scope = 'all'
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
    q: str | None = Query(default=None, description="Search text: one term searches every field; "
                                                    "commas mean invoice, PO, item, UTR"),
    fy: str | None = Query(default=None, pattern=r"^(all|\d{4}-\d{2})$", description='"2026-27" or "all"'),
    fy_strict: bool = Query(default=False, description="Also drop invoices with no fiscal year"),
    statuses: list[str] | None = Query(default=None, description="Any of these statuses (repeatable)"),
    product_name: str | None = Query(default=None, description="Service, Material or the invoice type"),
    invoice_numbers: list[str] | None = Query(default=None, description="Only these invoice numbers (repeatable)"),
    po_stage: str | None = Query(default=None, description="PO Portal source approval stage"),
    pan: str | None = Query(default=None, description="Supplier PAN"),
    vendor_name: str | None = Query(default=None, description="Exact supplier name"),
    sort: str | None = Query(default=None, pattern=r"^[a-z_]+:(asc|desc)$",
                             description="<date column>:asc|desc, e.g. invoice:desc or payment:asc"),
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="Date from must not be after date to")
    if upload_date_from and upload_date_to and upload_date_from > upload_date_to:
        raise HTTPException(status_code=422, detail="Upload date from must not be after upload date to")
    if sort and sort.split(":")[0] not in SORT_FIELDS:
        raise HTTPException(status_code=422, detail=f"Unknown sort column: {sort.split(':')[0]}")
    return dict(q=q, fy=fy, fy_strict=fy_strict, po_stage=po_stage, pan=pan, vendor_name=vendor_name, statuses=statuses, product_name=product_name, invoice_numbers=invoice_numbers,
                sort=sort, channel=channel, status=status, vendor_code=vendor_code, invoice_number=invoice_number,
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
        filters['exclude_deleted'] = True
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
    rows, supplier_codes = _query(filters, user, db)
    start = (page - 1) * page_size
    invoices = [map_invoice_to_response(row) for row in rows[start:start + page_size]]  # map the page only
    if supplier_codes is not None:
        invoices = [_redact_for_supplier(i) for i in invoices]
    return InvoiceListResponse(items=invoices, total=len(rows), page=page, page_size=page_size,
                               total_pages=ceil(len(rows) / page_size) if rows else 0)


def _query(filters, user, db, **changes):
    """Rows in the caller's scope matching `filters` (with `changes` applied), and their supplier codes."""
    supplier_codes = _supplier_codes(user, db)
    scoped = _scoped_filters(_channel_scope({**filters, **changes}, user, db), supplier_codes)
    return query_rows(scoped, internal=supplier_codes is None), supplier_codes


@router.get("/dashboard", operation_id="getInvoiceDashboard", summary="Dashboard totals for the filtered invoices")
def get_invoice_dashboard(
    filters: dict = Depends(invoice_filters),
    user: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db),
):
    """Everything the Invoice Tracking dashboard shows, in the shape of the frontend's dashboardMetrics()."""
    rows, _ = _query(filters, user, db, sort=None)
    return dashboard_metrics(rows, filters.get("date_type") or "invoice", channel_order=tuple(CHANNEL_LABEL))


@router.get("/facets", operation_id="getInvoiceFacets", summary="Value counts for filter dropdowns")
def get_invoice_facets(
    fields: list[str] = Query(..., description=f"Any of: {', '.join(FACETS)}"),
    filters: dict = Depends(invoice_filters),
    user: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db),
):
    """Counts per value. Each dropdown ignores its own selection, so its other options stay visible."""
    unknown = [field for field in fields if field not in FACETS]
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown facet: {', '.join(unknown)}")
    own_filter = {"status": {"statuses": None, "status": None}, "product_name": {"product_name": None},
                  "fy": {"fy": None}, "plant": {"plant": None}, "dv_type": {"dv_type": None},
                  "product_type": {"product_type": None}, "po_type": {"po_type": None},
                  "source_approval_stage": {"po_stage": None}, "po_approver": {"approver": None}}
    result = {}
    for field in fields:
        rows, supplier_codes = _query(filters, user, db, sort=None, **own_filter.get(field, {}))
        if supplier_codes is not None and field in INTERNAL_FACETS:
            raise HTTPException(status_code=403, detail="Internal approval fields are unavailable to suppliers")
        result[field] = facet_counts(rows, field)
    return result


@router.get("/vendors", operation_id="listInvoiceVendors", summary="Vendor codes in the current scope")
def get_invoice_vendors(
    vendor_q: str | None = Query(default=None, alias="vendor_q", description="Part of a code, name or PAN"),
    pan: str | None = None,
    limit: int = Query(default=50, ge=1, le=5000),
    filters: dict = Depends(invoice_filters),
    user: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db),
):
    rows, _ = _query(filters, user, db, sort=None, vendor_code=None)
    return vendor_list(rows, q=vendor_q, pan=pan, limit=limit)


@router.get("/pans", operation_id="listInvoicePans", summary="Supplier PANs in the current scope")
def get_invoice_pans(
    pan_q: str | None = Query(default=None, description="Part of a PAN or supplier name"),
    limit: int = Query(default=5000, ge=1, le=10000),
    filters: dict = Depends(invoice_filters),
    user: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db),
):
    rows, supplier_codes = _query(filters, user, db, sort=None, vendor_code=None, pan=None)
    if supplier_codes is not None:
        raise HTTPException(status_code=403, detail="The PAN directory is for internal users")
    return pan_directory(rows, q=pan_q, limit=limit)


@router.get("/vendor-report", operation_id="getVendorReport", summary="Completed invoices per supplier")
def get_vendor_report(
    filters: dict = Depends(invoice_filters),
    user: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db),
):
    rows, supplier_codes = _query(filters, user, db, sort=None, vendor_name=None)
    if supplier_codes is not None:
        raise HTTPException(status_code=403, detail="Reports are for internal users")
    return vendor_report(rows)


def _timeline(filters, token, staff, db, kind, log_q, log_type, log_from, log_to, order):
    """The Logs / History rows for the filtered invoices, merged with the ticket activity on them."""
    rows, supplier_codes = _query(filters, token, db, sort=None)
    if supplier_codes is not None:
        raise HTTPException(status_code=403, detail="This log is for internal users")
    try:  # query activity needs Inquiry Desk access; invoice activity is shown either way
        entries, query_error = ticket_service.staff_activity_log(db, ensure_ticket_access(staff)), False
    except HTTPException:
        entries, query_error = [], True
    return invoice_events.timeline(rows, kind, entries, search=log_q, log_type=log_type, date_from=log_from,
                                   date_to=log_to, oldest_first=order == "asc"), query_error


@router.get("/events", operation_id="listInvoiceEvents", summary="Logs / History: invoice milestones and query activity")
def get_invoice_events(
    kind: Literal["global", "srm", "po"] = "global",
    log_q: str | None = None,
    log_type: Literal["all", "Invoice", "Payment", "Query"] = "all",
    log_from: date | None = None,
    log_to: date | None = None,
    order: Literal["desc", "asc"] = "desc",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=500),
    filters: dict = Depends(invoice_filters),
    token: dict = Depends(get_current_user_token),
    staff: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """`kind`: "global" for Logs, "srm" / "po" for the channel History tabs (which also need a ticket's
    vendor code and channel to match the invoice). Newest first unless order=asc."""
    events, query_error = _timeline(filters, token, staff, db, kind, log_q, log_type, log_from, log_to, order)
    start = (page - 1) * page_size
    items = [{**event, "when": event["when"].isoformat()} for event in events[start:start + page_size]]
    return {"items": items, "total": len(events), "page": page, "page_size": page_size, "queryError": query_error}


@router.get("/events/export", operation_id="exportInvoiceEvents", summary="Download the Logs / History rows as CSV")
def export_invoice_events(
    kind: Literal["global", "srm", "po"] = "global",
    log_q: str | None = None,
    log_type: Literal["all", "Invoice", "Payment", "Query"] = "all",
    log_from: date | None = None,
    log_to: date | None = None,
    order: Literal["desc", "asc"] = "desc",
    filters: dict = Depends(invoice_filters),
    token: dict = Depends(get_current_user_token),
    staff: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    events, _ = _timeline(filters, token, staff, db, kind, log_q, log_type, log_from, log_to, order)
    stamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
    return StreamingResponse(invoice_events.csv_lines(events), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="Logs_{stamp}.csv"'})


@router.get("/export", operation_id="exportInvoices", summary="Download the filtered invoices as CSV")
def export_invoices(
    filters: dict = Depends(invoice_filters),
    user: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db),
):
    rows, supplier_codes = _query(filters, user, db)
    if supplier_codes is not None:  # the supplier export has its own columns (Phase 2)
        raise HTTPException(status_code=403, detail="Export is available on the supplier invoice pages")
    stamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
    return StreamingResponse(csv_lines(rows), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="Invoices_{stamp}.csv"'})


@router.get("/summary", include_in_schema=False)
@router.get("/invoice-summary", operation_id="getInvoiceSummary", summary="Get invoice summary")
def get_invoice_summary(
    filters: dict = Depends(invoice_filters),
    user: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db),
):
    rows, _ = _query(filters, user, db, sort=None)
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
    rows, supplier_codes = _query(filters, user, db, sort="upload:desc")
    invoices = [map_invoice_to_response(row) for row in rows[:limit]]
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
        invoice = get_invoice_response(invoice_number, po_item=po_item, source_id=source_id, po_number=po_number, **filters)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return _redact_for_supplier(invoice) if supplier_codes is not None else invoice
