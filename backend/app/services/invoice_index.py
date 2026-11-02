"""Per-row values the list, search and dashboard read, computed once per cached source row.

The browser used to derive these from every invoice it downloaded (toWorkspaceInvoice,
invoiceSearchDocument, invoiceFiscalYear, invoiceFilterDate in the frontend). They are built here
from the same mapped InvoiceResponse, so the server's answers match what the screens showed.
"""
import re
import sys
from dataclasses import dataclass

from app.services.invoice_service import map_invoice_to_response

INDEX_KEY = "__ix"
# The frontend's date types (utils/invoiceDates.js); a missing date never falls back to another.
DATE_TYPES = ("invoice", "upload", "approval", "miro", "due", "utr_clearing")
# Further date columns the channel registers sort by (SRM / PO Portal column definitions).
EXTRA_SORT_DATES = {
    "accounts": ("workflow", "document_sent_to_accounts_date"), "miro_document": ("sap", "document_date"),
    "posting": ("sap", "posting_date"), "payment": ("sap", "clearing_date"),
    "po_entry": ("po_portal", "entry_sheet_creation_date"), "po_miro_created": ("po_portal", "miro_created_on"),
    "po_miro_posting": ("po_portal", "miro_posting_date"), "po_parking": ("po_portal", "parking_date"),
    "po_posting": ("po_portal", "posting_date"), "po_rseg_posting": ("po_portal", "rseg_posting_date"),
}
CHANNEL_LABEL = {"msetuSrm": "Msetu / SRM", "poPortal": "PO Portal", "manual": "Manual", "mfoxPortal": "MFOX Portal"}
PRODUCT_LABEL = {"S": "Service", "M": "Material"}
# Values suppliers never receive (_redact_for_supplier); they are searchable for internal users only.
INTERNAL_WORKFLOW = {"approved_by", "pending_with", "approvers", "workflow_steps", "accountant",
                     "document_sent_to_accounts_date", "approver_remarks"}
SUPPLIER_PO_PORTAL = {"service", "line_number", "entry_sheet", "entry_sheet_creation_date", "po_request_number",
                      "po_type", "po_activity", "miro_created_on", "miro_posting_date"}
MONTHS = ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec")
# As Intl.NumberFormat("en-IN") prints them in the browser; other codes print as "AED 1,234.50".
CURRENCY_SYMBOL = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£", "JPY": "JP¥"}
SEPARATOR = "\x1f"  # between values, so a search can't match across two fields
_ISO_DATE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")


@dataclass(slots=True)
class InvoiceIndex:
    no: str
    po: str
    po_item: str
    vcode: str
    vendor: str
    pan: str
    channel: str
    status: str
    product: str          # Service / Material / Other (the dashboard's product bucket)
    product_name: str     # invoiceProductType: Service / Material / the invoice type / '-'
    product_type: str     # S / M / ''
    plant: str
    dv_type: str
    fy: str               # "2026-27", or "" when no year can be derived
    currency: str | None  # ISO code; None when the invoice has no amount
    amount: float | None
    utr: str
    dates: tuple          # "YYYY-MM-DD" or None per DATE_TYPES entry
    sort_dates: tuple     # the same per EXTRA_SORT_DATES entry
    status_date: str | None
    po_portal: tuple | None  # PO_FACETS values, PO Portal rows only
    search_public: str
    search_internal: str

    def date(self, date_type: str) -> str | None:
        return self.dates[_DATE_POSITION[date_type]]

    def sort_date(self, field: str) -> str | None:
        """Any sortable date: a date type, "status" (the Status Date column) or an EXTRA_SORT_DATES field."""
        if field == "status":
            return self.status_date
        if field in _DATE_POSITION:
            return self.dates[_DATE_POSITION[field]]
        return self.sort_dates[_SORT_POSITION[field]]

    def approvers(self) -> set:
        """The PO Portal people (HOD1, HOD2, accounts), each counted once."""
        return {name for name in (self.po_value("hod1"), self.po_value("hod2"), self.po_value("accounts_user")) if name}

    def po_value(self, facet: str) -> str:
        return self.po_portal[_PO_POSITION[facet]] if self.po_portal else ""


PO_FACETS = ("source_approval_stage", "po_type", "hod1", "hod2", "accounts_user")
_DATE_POSITION = {name: position for position, name in enumerate(DATE_TYPES)}
_SORT_POSITION = {name: position for position, name in enumerate(EXTRA_SORT_DATES)}
SORT_FIELDS = (*DATE_TYPES, "status", *EXTRA_SORT_DATES)
_PO_POSITION = {name: position for position, name in enumerate(PO_FACETS)}


def _shared(value):
    """One copy of a repeated string (dates, statuses, vendors) for all 141k rows, not one each."""
    return sys.intern(value) if isinstance(value, str) else value


def index_of(row: dict) -> InvoiceIndex:
    """The row's index, built on first use. Rows are cached per process, so this runs once each."""
    index = row.get(INDEX_KEY)
    if index is None:
        index = row[INDEX_KEY] = build_index(row)
    return index


_FIELDS = None
_SHARED_FIELDS = {"po", "po_item", "vcode", "vendor", "pan", "channel", "status", "product", "product_name",
                  "product_type", "plant", "dv_type", "fy", "currency", "status_date"}


def index_to_json(index: InvoiceIndex) -> list:
    """The index as plain JSON values, in field order, for the on-disk snapshot."""
    return [getattr(index, name) for name in _field_names()]


def index_from_json(values: list) -> InvoiceIndex:
    """An index saved by index_to_json, with repeated strings shared again (as build_index does)."""
    data = dict(zip(_field_names(), values))
    for name in _SHARED_FIELDS:
        data[name] = _shared(data[name])
    data["dates"] = tuple(_shared(value) for value in data["dates"])
    data["sort_dates"] = tuple(_shared(value) for value in data["sort_dates"])
    data["po_portal"] = tuple(_shared(value) for value in data["po_portal"]) if data["po_portal"] is not None else None
    return InvoiceIndex(**data)


def _field_names():
    global _FIELDS
    if _FIELDS is None:
        from dataclasses import fields
        _FIELDS = tuple(field.name for field in fields(InvoiceIndex))
    return _FIELDS


def fiscal_year_label(end_year: int) -> str:
    return f"{end_year - 1}-{str(end_year)[-2:]}"


def _fiscal_year(invoice) -> str:
    if invoice.get("filter_fiscal_year"):
        return fiscal_year_label(int(invoice["filter_fiscal_year"]))
    match = _ISO_DATE.match(invoice.get("invoice_date") or "")
    if not match:
        return ""
    year, month = int(match.group(1)), int(match.group(2))
    start = year - 1 if month < 4 else year
    return f"{start}-{str(start + 1)[2:]}"


def _status_date(invoice, status):
    """The date the "Status Date" column shows (getDynamicDate in api/invoiceApi.js)."""
    sap, workflow = invoice["sap"], invoice["workflow"]
    return {
        "Invoice Uploaded": invoice.get("invoice_upload_date"),
        "Approved": workflow.get("final_approval_date"),
        "Miro Booked": sap.get("miro_booking_date") or sap.get("document_date"),
        "Payment Due": sap.get("net_due_date") or invoice.get("invoice_date"),
        "Paid": sap.get("clearing_date"),
    }.get(status, invoice.get("invoice_date"))


def indian_grouping(value: float) -> str:
    """339136.5 -> "3,39,136.50" (en-IN digit grouping, as the screens show amounts)."""
    whole, fraction = f"{abs(value):.2f}".split(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        head = ",".join(head[max(i - 2, 0):i] for i in range(len(head), 0, -2)[::-1])
        whole = f"{head},{tail}"
    return f"{'-' if value < 0 else ''}{whole}.{fraction}"


def display_amount(amount, currency) -> str:
    if amount is None:
        return "-"
    return f"{CURRENCY_SYMBOL.get(currency, currency + ' ')}{indian_grouping(amount)}"


def _add(parts, value):
    """invoiceSearchDocument's addValue: the value, plus the other ways a person might type it."""
    if value is None or value in ("", "-") or isinstance(value, (dict, list)):
        return
    if isinstance(value, bool):
        parts.extend(("true" if value else "false", "yes" if value else "no"))
        return
    text = str(value).lower()
    parts.append(text)
    if re.search(r"\d,\d", text):
        parts.append(text.replace(",", ""))
    match = _ISO_DATE.match(text)
    if match and 1 <= int(match.group(2)) <= 12:
        year, month, day = match.groups()
        name = MONTHS[int(month) - 1]
        parts.extend((f"{day} {name} {year}", f"{day}-{month}-{year}", f"{day}/{month}/{year}"))
        if name == "sep":
            parts.append(f"{day} sept {year}")


def _walk(parts, value):
    if isinstance(value, dict):
        for item in value.values():
            _walk(parts, item)
    elif isinstance(value, list):
        for item in value:
            _walk(parts, item)
    else:
        _add(parts, value)


def build_index(row: dict) -> InvoiceIndex:
    invoice = map_invoice_to_response(row).model_dump(mode="json")
    sap, workflow, supplier = invoice["sap"], invoice["workflow"], invoice["supplier"]
    order, portal = invoice["purchase_order"], invoice.get("po_portal") or {}
    status = invoice.get("overall_status") or "Invoice Uploaded"
    product_type = invoice.get("product_type") or ""
    product_name = PRODUCT_LABEL.get(product_type) or invoice.get("invoice_type") or "-"
    raw_amount = sap.get("payable_amount") if sap.get("payable_amount") is not None else sap.get("amount")
    amount = float(raw_amount) if raw_amount is not None else None
    currency = (sap.get("currency") or "INR") if amount is not None else None
    dates = {
        "invoice": invoice.get("invoice_date"),
        "upload": invoice.get("invoice_upload_date"),
        "approval": workflow.get("final_approval_date"),
        "miro": sap.get("miro_booking_date") or sap.get("document_date"),
        "due": sap.get("net_due_date"),
        "utr_clearing": sap.get("utr_clearing_date_paid"),
    }
    dates = tuple(_shared(dates[name][:10]) if dates[name] else None for name in DATE_TYPES)
    sections = {"workflow": workflow, "sap": sap, "po_portal": portal}
    sort_dates = tuple(_shared((sections[section].get(key) or "")[:10] or None) for section, key in EXTRA_SORT_DATES.values())
    fy = _fiscal_year(invoice)

    public, internal = [], []
    for key, value in invoice.items():
        if key in ("source_id", "workflow", "po_portal"):
            continue
        _walk(public, value)
    for key, value in workflow.items():
        _walk(internal if key in INTERNAL_WORKFLOW else public, value)
    for key, value in portal.items():
        _walk(public if key in SUPPLIER_PO_PORTAL else internal, value)
    shown_amount = display_amount(amount, currency)
    for extra in (product_name, CHANNEL_LABEL.get(invoice["channel"]), fy, status,
                  _status_date(invoice, status), shown_amount):
        _add(public, extra)

    return InvoiceIndex(
        no=invoice["invoice_number"] or "", po=_shared(order.get("po_number") or "-"),
        po_item="" if order.get("po_item") is None else _shared(str(order["po_item"])),
        vcode=_shared(supplier.get("vendor_code") or "-"), vendor=_shared(supplier.get("supplier_name") or "-"),
        pan=_shared(supplier.get("pan") or ""), channel=_shared(invoice.get("channel") or "msetuSrm"),
        status=_shared(status), product=product_name if product_name in ("Service", "Material") else "Other",
        product_name=_shared(product_name),
        product_type=_shared(product_type), plant=_shared(invoice.get("plant") or ""),
        dv_type=_shared(invoice.get("dv_type") or ""), fy=_shared(fy), currency=_shared(currency), amount=amount,
        utr=sap.get("utr_number") or "", dates=dates, sort_dates=sort_dates,
        status_date=_shared((_status_date(invoice, status) or "")[:10] or None),
        po_portal=tuple(_shared(portal.get(key) or "") for key in PO_FACETS) if portal else None,
        search_public=SEPARATOR.join(public), search_internal=SEPARATOR.join(internal),
    )
