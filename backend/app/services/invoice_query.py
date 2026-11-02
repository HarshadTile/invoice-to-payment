"""Server-side filtering, search, sorting and totals over the cached invoice rows.

Each function mirrors the frontend rule it replaces (named in its docstring), so the numbers on a
screen don't change when the work moves from the browser to here.
"""
from collections import Counter, OrderedDict
from datetime import date
from threading import Lock

from app.repositories import po_portal_invoice, srm_invoice
from app.repositories.srm_invoice import filter_invoices
from app.services.invoice_index import DATE_TYPES, PO_FACETS, SORT_FIELDS, index_of

# features/invoices/dashboardMetrics.js
STATUS_FLOW = ("Initial", "Push to PO Portal", "Invoice Uploaded", "Pending for Approval",
               "Action Required", "Level Approved", "Approved", "Miro Booked", "Payment Due", "Paid")
EXCEPTION_STATUSES = ("Rejected", "Entry Deleted", "Deleted")
# The one pending status the sources produce; the tile counts exactly what its click-through filters on.
PENDING = ("Pending for Approval",)
STAGE_GROUPS = (
    ("awaiting", "Awaiting approval", ("Initial", "Push to PO Portal", "Invoice Uploaded", "Pending for Approval",
                                       "Action Required", "Level Approved")),
    ("approved", "Approved", ("Approved",)),
    ("miro", "Miro Booked", ("Miro Booked",)),
    ("paid", "Paid", ("Paid",)),
    ("exception", "Rejected / deleted", EXCEPTION_STATUSES),
)
MONTH_NAMES = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
FACETS = ("status", "product", "product_name", "product_type", "plant", "dv_type", "fy", "channel", "po",
          *PO_FACETS, "po_approver")
INTERNAL_FACETS = {"hod1", "hod2", "accounts_user", "source_approval_stage", "po_approver"}

# Filters this module applies itself; everything else goes to the repository's filter_invoices.
OWN_FILTERS = ("q", "fy", "fy_strict", "statuses", "product_name", "invoice_numbers", "po_stage", "pan",
               "vendor_name", "sort")


# The data only changes when the process reloads it, so a repeated question (the same dashboard,
# the next page of the same search) reuses its answer. An entry keeps the source lists it was built
# from and is used only while they are still the loaded ones.
_CACHE_SIZE = 64
_rows_cache: OrderedDict = OrderedDict()
_metrics_cache: OrderedDict = OrderedDict()
_cache_lock = Lock()


def _sources():
    return srm_invoice._cached_invoices, po_portal_invoice._cached_invoices


def _freeze(value):
    if isinstance(value, dict):
        return tuple(sorted((key, _freeze(item)) for key, item in value.items()))
    if isinstance(value, (list, tuple, set)):
        return tuple(_freeze(item) for item in value)
    return value.isoformat() if isinstance(value, date) else value


def _cached(cache, key, build):
    sources = _sources()
    with _cache_lock:
        entry = cache.get(key)
        if entry and entry[0] is sources[0] and entry[1] is sources[1]:
            cache.move_to_end(key)
            return entry[2]
    value = build()
    with _cache_lock:
        cache[key] = (*_sources(), value)  # the sources as loaded by build(), if it loaded them
        cache.move_to_end(key)
        while len(cache) > _CACHE_SIZE:
            cache.popitem(last=False)
    return value


def clear_query_cache():
    with _cache_lock:
        _rows_cache.clear()
        _metrics_cache.clear()


def query_rows(filters: dict, *, internal: bool) -> list[dict]:
    """The rows matching `filters`, in the requested order. The list is shared: don't change it."""
    return _cached(_rows_cache, (internal, _freeze(filters)), lambda: _query_rows(filters, internal=internal))


def _query_rows(filters: dict, *, internal: bool) -> list[dict]:
    """The cached rows matching `filters`, in the requested order.

    `internal` decides two rules the browser applied per login: internal users keep invoices with no
    fiscal year under every year and can search internal-only fields; suppliers do neither.
    `fy_strict` drops undated invoices for internal users too, as Search Invoice(s) does.
    """
    filters = dict(filters)
    own = {key: filters.pop(key, None) for key in OWN_FILTERS}
    date_type = filters.get("date_type") or "invoice"
    date_from = date_to = None
    if date_type in DATE_TYPES:  # these match the screens' date types exactly, with no fallback
        date_from, date_to = filters.pop("date_from", None), filters.pop("date_to", None)
    rows = filter_invoices(**filters)

    checks = []
    if own["fy"] and own["fy"] != "all":
        fy = own["fy"]
        keep_undated = internal and not own["fy_strict"]
        checks.append((lambda ix: ix.fy == fy or not ix.fy) if keep_undated else (lambda ix: ix.fy == fy))
    if own["statuses"]:
        wanted = set(own["statuses"])
        checks.append(lambda ix: ix.status in wanted)
    if own["product_name"]:
        product = own["product_name"]
        checks.append(lambda ix: ix.product_name == product)
    if own["pan"]:
        pan = own["pan"].strip().upper()
        checks.append(lambda ix: ix.pan.strip().upper() == pan)
    if own["vendor_name"]:
        vendor_name = own["vendor_name"]
        checks.append(lambda ix: ix.vendor == vendor_name)
    if own["po_stage"]:
        stage = own["po_stage"]
        checks.append(lambda ix: bool(ix.po_portal) and ix.po_value("source_approval_stage") == stage)
    if own["invoice_numbers"]:
        numbers = set(own["invoice_numbers"])
        checks.append(lambda ix: ix.no in numbers)
    if date_from or date_to:
        low, high = (date_from.isoformat() if date_from else None), (date_to.isoformat() if date_to else None)

        def in_range(ix, kind=date_type):
            value = ix.date(kind)
            return bool(value) and (not low or value >= low) and (not high or value <= high)
        checks.append(in_range)
    search = compile_search(own["q"], internal=internal)
    if search:
        checks.append(search)
    if checks:
        rows = [row for row in rows if all(check(index_of(row)) for check in checks)]
    if own["sort"]:
        rows = sort_rows(rows, own["sort"])
    return rows


def compile_search(raw: str | None, *, internal: bool):
    """utils/invoiceQuery.js: one term searches every shown field; commas mean invoice, PO, item, UTR."""
    text = raw or ""
    if "," not in text:
        term = text.strip()
        if not term:
            return None
        needle = term.lower()
        if internal:
            return lambda ix: ix.po_item == term or needle in ix.search_public or needle in ix.search_internal
        return lambda ix: ix.po_item == term or needle in ix.search_public
    parts = [part.strip() for part in text.split(",")] + ["", "", "", ""]
    invoice, po, item, utr = parts[0].lower(), parts[1].lower(), parts[2], parts[3].lower()

    def contains(value, needle):
        return value != "-" and needle in value.lower()
    return lambda ix: ((not invoice or contains(ix.no, invoice)) and (not po or contains(ix.po, po))
                       and (not item or ix.po_item == item) and (not utr or contains(ix.utr, utr)))


def sort_rows(rows: list[dict], sort: str) -> list[dict]:
    """utils/dateSort.js: newest or oldest first by one date column; rows without that date go last."""
    key, _, direction = sort.partition(":")
    if key not in SORT_FIELDS:
        raise ValueError(f"Unknown sort column: {key}")

    def read(ix):
        return ix.sort_date(key)
    dated = [row for row in rows if read(index_of(row))]
    undated = [row for row in rows if not read(index_of(row))]
    dated.sort(key=lambda row: read(index_of(row)), reverse=direction == "desc")  # sort is stable
    return dated + undated


def _bucket():
    return {"count": 0, "value": 0.0, "valued": 0}


def main_currency(rows) -> str:
    """The currency most invoices are in (by count, not value); INR when none has an amount."""
    counts = Counter(index_of(row).currency for row in rows if index_of(row).currency)
    return counts.most_common(1)[0][0] if counts else "INR"


def dashboard_metrics(rows: list[dict], date_type: str = "invoice", channel_order: tuple = ()) -> dict:
    """features/invoices/dashboardMetrics.js, in the same shape. Currencies are ISO codes here."""
    key = (id(rows), date_type, tuple(channel_order))
    with _cache_lock:
        entry = _metrics_cache.get(key)
        if entry and entry[0] is rows:
            return entry[1]
    metrics = _dashboard_metrics(rows, date_type, channel_order)
    with _cache_lock:
        _metrics_cache[key] = (rows, metrics)  # holding `rows` keeps its id from being reused
        while len(_metrics_cache) > _CACHE_SIZE:
            _metrics_cache.popitem(last=False)
    return metrics


def _dashboard_metrics(rows: list[dict], date_type: str, channel_order: tuple) -> dict:
    currency = main_currency(rows)
    other_currencies: dict[str, float] = {}
    totals_by_currency: dict[str, float] = {}
    amount_count = 0
    total, by_status, by_channel = _bucket(), {}, {}
    product = {"Service": _bucket(), "Material": _bucket(), "Other": _bucket()}
    groups = {key: _bucket() for key, _, _ in STAGE_GROUPS} | {"other": _bucket()}
    group_of = {status: key for key, _, statuses in STAGE_GROUPS for status in statuses}
    monthly: dict[str, dict] = {}
    without_date = 0

    def add(target, ix):
        target["count"] += 1
        if ix.currency == currency and ix.amount is not None:
            target["value"] += ix.amount
            target["valued"] += 1

    for row in rows:
        ix = index_of(row)
        if ix.currency and ix.amount is not None:
            amount_count += 1
            totals_by_currency[ix.currency] = totals_by_currency.get(ix.currency, 0) + ix.amount
            if ix.currency != currency:
                other_currencies[ix.currency] = other_currencies.get(ix.currency, 0) + ix.amount
        add(total, ix)
        add(by_status.setdefault(ix.status, _bucket()), ix)
        add(groups[group_of.get(ix.status, "other")], ix)
        add(product[ix.product], ix)
        add(by_channel.setdefault(ix.channel or "unknown", _bucket()), ix)
        day = ix.date(date_type)
        if not day:
            without_date += 1
        else:
            monthly.setdefault(day[:7], {"Service": 0, "Material": 0, "Other": 0})[ix.product] += 1

    months = last_twelve_months(monthly)
    known = {*STATUS_FLOW, *EXCEPTION_STATUSES}
    ordered = ([s for s in STATUS_FLOW if s in by_status] + sorted(s for s in by_status if s not in known)
               + [s for s in EXCEPTION_STATUSES if s in by_status])

    def sum_of(names):
        result = _bucket()
        for name in names:
            for field in result:
                result[field] += by_status.get(name, {}).get(field, 0)
        return result

    position = {key: i for i, key in enumerate(channel_order)}
    return {
        "currency": currency,
        "otherCurrencies": other_currencies,
        "totalsByCurrency": totals_by_currency,  # every currency, never converted (utils/amounts.js)
        "amountCount": amount_count,  # invoices with an amount on record, in any currency
        "total": total,
        "kpi": {"pendingApproval": sum_of(PENDING), "approved": sum_of(["Approved"]),
                "miroBooked": sum_of(["Miro Booked"]), "paid": sum_of(["Paid"])},
        "groups": [{"key": key, "label": label, **groups[key]} for key, label, _ in STAGE_GROUPS]
                  + ([{"key": "other", "label": "Other status", **groups["other"]}] if groups["other"]["count"] else []),
        "statuses": [{"key": s, **by_status[s], "exception": s in EXCEPTION_STATUSES} for s in ordered],
        "product": [{"key": key, "label": "Not specified" if key == "Other" else key, **product[key]}
                    for key in ("Service", "Material", "Other")],
        "channels": sorted(({"key": key, **bucket} for key, bucket in by_channel.items()),
                           key=lambda c: (-c["count"], position.get(c["key"], -1))),
        "months": months,
        "monthsCoverage": {"inWindow": sum(m["Service"] + m["Material"] + m["Other"] for m in months),
                           "withoutDate": without_date},
    }


def last_twelve_months(by_month: dict) -> list[dict]:
    """The 12 calendar months up to the latest month that has data (not up to today)."""
    if not by_month:
        return []
    year, month = map(int, max(by_month).split("-"))
    months = []
    for _ in range(12):
        key = f"{year}-{month:02d}"
        months.insert(0, {"key": key, "label": f"{MONTH_NAMES[month - 1]} {str(year)[2:]}",
                          **by_month.get(key, {"Service": 0, "Material": 0, "Other": 0})})
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    return months


def pan_directory(rows: list[dict], *, q: str | None = None, limit: int = 5000) -> list[dict]:
    """Supplier Visibility's PAN list: one PAN can carry several vendor codes and spellings of the name.
    `name` is the spelling most of its invoices use."""
    pans: dict[str, dict] = {}
    for row in rows:
        ix = index_of(row)
        pan = ix.pan.strip()
        if not pan:
            continue
        entry = pans.setdefault(pan, {"names": Counter(), "codes": set(), "count": 0})
        entry["names"][ix.vendor] += 1
        entry["codes"].add(ix.vcode)
        entry["count"] += 1
    result = []
    for pan, entry in pans.items():
        names = [name for name, _ in entry["names"].most_common()]
        result.append({"pan": pan, "name": names[0], "names": names, "codes": sorted(entry["codes"]), "count": entry["count"]})
    if q:
        needle = q.strip().lower()
        result = [p for p in result if needle in p["pan"].lower() or any(needle in name.lower() for name in p["names"])]
    return sorted(result, key=lambda p: p["name"])[:limit]


def vendor_report(rows: list[dict]) -> dict:
    """Vendor Status Reports: completed (paid) invoices per supplier name, valued in the main currency."""
    paid = [row for row in rows if index_of(row).status == "Paid"]
    currency = main_currency(paid)
    suppliers: dict[str, dict] = {}
    for row in paid:
        ix = index_of(row)
        entry = suppliers.setdefault(ix.vendor, {"name": ix.vendor, "count": 0, "value": 0.0, "valued": 0})
        entry["count"] += 1
        if ix.currency == currency and ix.amount is not None:
            entry["value"] += ix.amount
            entry["valued"] += 1
    return {"currency": currency, "completed": len(paid),
            "suppliers": sorted(suppliers.values(), key=lambda s: (-s["count"], s["name"]))}


def facet_counts(rows: list[dict], field: str) -> dict[str, int]:
    """Value -> count for one dropdown (InvoiceFilterBar, the SRM / PO Portal facets, the year list)."""
    if field == "po_approver":  # an invoice counts once under each of its approvers
        return dict(Counter(name for row in rows for name in index_of(row).approvers()))
    if field in PO_FACETS:
        return dict(Counter(index_of(row).po_value(field) for row in rows if index_of(row).po_portal))
    return dict(Counter(getattr(index_of(row), field) for row in rows))


def vendor_list(rows: list[dict], *, q: str | None = None, pan: str | None = None, limit: int = 50) -> list[dict]:
    """Vendor codes in the user's scope with name, PAN and invoice count, busiest first."""
    vendors: dict[str, dict] = {}
    for row in rows:
        ix = index_of(row)
        if ix.vcode == "-":
            continue
        entry = vendors.get(ix.vcode)
        if entry is None:
            entry = vendors[ix.vcode] = {"code": ix.vcode, "name": "", "pan": "", "count": 0, "channels": set()}
        entry["count"] += 1
        entry["name"] = entry["name"] or (ix.vendor if ix.vendor != "-" else "")
        entry["pan"] = entry["pan"] or ix.pan
        entry["channels"].add(ix.channel)
    found = vendors.values()
    if pan:
        found = [v for v in found if v["pan"].upper() == pan.strip().upper()]
    if q:
        needle = q.strip().lower()
        found = [v for v in found if needle in v["code"].lower() or needle in v["name"].lower() or needle in v["pan"].lower()]
    ordered = sorted(found, key=lambda v: (-v["count"], v["code"]))
    return [{**v, "channels": sorted(v["channels"])} for v in ordered[:limit]]

