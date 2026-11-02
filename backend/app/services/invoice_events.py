"""The Logs / History timeline, built on the server and paged: every dated invoice milestone in the
filtered invoices, merged with the ticket (query) activity on them.

Mirrors the browser rules it replaces: invoiceLogRows and staffQueryLogRows (utils/supplierLog.js) for
Logs, srmHistoryRows (utils/srmWorkspace.js) and poPortalHistoryRows (utils/poPortalWorkspace.js) for
the channel History tabs, and logRowFilter / logRowsToCsv for searching and exporting.
"""
from collections import OrderedDict
from collections.abc import Iterable, Iterator
from datetime import date, datetime, time
from threading import Lock

from app.repositories.srm_invoice import text_value
from app.services.invoice_export import display_date
from app.services.invoice_index import display_amount, index_of

KINDS = ("global", "srm", "po")
LOG_TYPES = ("Invoice", "Payment", "Query")
_cache: OrderedDict = OrderedDict()
_cache_lock = Lock()


def _day(value: str | None) -> datetime | None:
    try:
        return datetime.combine(date.fromisoformat(value[:10]), time()) if value else None
    except ValueError:
        return None


def _invoice_ref(ix, row):
    return {"no": ix.no, "poItem": ix.po_item, "vcode": ix.vcode, "po": ix.po, "channel": ix.channel,
            "sourceId": row.get("__source_id")}


def _event(row, ix, kind, event, when, detail="", performed_by="System", key=None):
    day = _day(when)
    if day is None:
        return None
    return {"key": key or f"{ix.no}|{ix.po_item}|{event}", "when": day, "hasTime": False, "type": kind, "event": event,
            "detail": detail, "invoiceNo": ix.no, "po": ix.po, "vcode": ix.vcode, "channel": ix.channel,
            "performedBy": performed_by, "invoice": _invoice_ref(ix, row)}


def _short_pay_reason(row, ix):
    # toWorkspaceInvoice: PO Portal rows carry no short-payment reason.
    return "" if ix.channel == "poPortal" else (text_value(row.get("REJ_REASON")) or "")


def _global_events(row, ix):
    """invoiceLogRows."""
    due = ix.date("due")
    events = [
        _event(row, ix, "Invoice", "Invoice uploaded", ix.date("upload")),
        _event(row, ix, "Invoice", "Invoice approved", ix.date("approval")),
        _event(row, ix, "Invoice", "Booked in SAP", ix.date("miro") or ix.sort_date("posting"),
               f"Payment due {display_date(due)}" if due else ""),
    ]
    if ix.status == "Paid":
        reason = _short_pay_reason(row, ix)
        parts = [f"UTR {ix.utr}" if ix.utr else "", display_amount(ix.amount, ix.currency) if ix.amount is not None else "",
                 f"Short payment: {reason}" if reason else ""]
        events.append(_event(row, ix, "Payment", "Payment completed", ix.sort_date("payment"), " · ".join(p for p in parts if p)))
    elif ix.channel != "poPortal" and ix.status in ("Rejected", "Deleted", "Entry Deleted"):
        events.append(_event(row, ix, "Payment", "Invoice rejected" if ix.status == "Rejected" else "Invoice deleted",
                             ix.date("invoice"), _short_pay_reason(row, ix)))
    return events


def _srm_events(row, ix, *, po_portal=False):
    """srmHistoryRows; for PO Portal, poPortalHistoryRows (no SAP document / posting dates, three PO steps)."""
    key = lambda event: f"{ix.vcode}|{ix.no}|{ix.po}|{ix.po_item}|{event}"  # noqa: E731
    approved_by = text_value(row.get("APPROVED_BY")) or "System"
    events = [
        _event(row, ix, "Invoice", "Invoice dated", ix.date("invoice"), key=key("Invoice dated")),
        _event(row, ix, "Invoice", "Invoice uploaded", ix.date("upload"), key=key("Invoice uploaded")),
        _event(row, ix, "Invoice", "Invoice approved", ix.date("approval"), performed_by=approved_by, key=key("Invoice approved")),
        _event(row, ix, "Invoice", "Sent to accounts", ix.sort_date("accounts"), key=key("Sent to accounts")),
    ]
    if not po_portal:
        events += [_event(row, ix, "Invoice", "MIRO document dated", ix.sort_date("miro_document"), key=key("MIRO document dated")),
                   _event(row, ix, "Invoice", "Posted in SAP", ix.sort_date("posting"), key=key("Posted in SAP"))]
    events.append(_event(row, ix, "Payment", "Payment cleared", ix.sort_date("payment"),
                         f"UTR {ix.utr}" if ix.utr else "", key=key("Payment cleared")))
    if po_portal:
        source = row.get("__source_id")
        for event, field in (("Service entry created", "po_entry"), ("MIRO created", "po_miro_created"),
                             ("MIRO posted", "po_miro_posting")):
            events.append(_event(row, ix, "Invoice", event, ix.sort_date(field), key=f"{source}|{event}"))
    return events


def invoice_events(rows: list[dict], kind: str) -> list[dict]:
    """Every dated milestone of `rows`, newest first (ties keep invoice order). Cached per row list."""
    key = (id(rows), kind)
    with _cache_lock:
        entry = _cache.get(key)
        if entry and entry[0] is rows:
            _cache.move_to_end(key)
            return entry[1]
    events = []
    for row in rows:
        ix = index_of(row)
        built = (_global_events(row, ix) if kind == "global"
                 else _srm_events(row, ix, po_portal=kind == "po" or ix.channel == "poPortal"))
        events.extend(event for event in built if event)
    events.sort(key=lambda event: event["when"], reverse=True)  # stable: same-day rows keep their order
    with _cache_lock:
        _cache[key] = (rows, events)  # holding `rows` keeps its id from being reused
        while len(_cache) > 16:
            _cache.popitem(last=False)
    return events


def query_events(entries: Iterable[dict], rows: list[dict], *, strict: bool) -> list[dict]:
    """staffQueryLogRows: ticket activity on the invoices in `rows` (or on no invoice, unless `strict`,
    which also needs the same vendor code and channel, as the History tabs do)."""
    by_no: dict[str, list] = {}
    for row in rows:
        ix = index_of(row)
        by_no.setdefault(ix.no, []).append((ix, row))
    result = []
    for entry in entries:
        number = entry.get("invoice_no")
        matches = by_no.get(number or "", [])
        if strict:
            matches = [(ix, row) for ix, row in matches
                       if (not entry.get("vendor_code") or ix.vcode == entry["vendor_code"])
                       and (not entry.get("channel") or ix.channel == entry["channel"])]
            if not number or not matches:
                continue
        elif number and not matches:
            continue
        created = entry["created_at"]
        when = created.astimezone().replace(tzinfo=None) if created.tzinfo else created
        ix, row = matches[0] if matches else (None, None)
        result.append({
            "key": f"query|{entry['id']}", "when": when, "hasTime": True, "type": "Query", "event": entry["event"],
            "detail": " · ".join(part for part in (entry.get("ticket_no"), entry.get("subject"), entry.get("detail")) if part),
            "invoiceNo": number or "-", "po": ix.po if ix else "-",
            "vcode": entry.get("vendor_code") or (ix.vcode if ix else "-"), "channel": entry.get("channel") or (ix.channel if ix else None),
            "performedBy": entry.get("performed_by") or "-", "ticketId": entry.get("ticket_id"),
            "invoice": _invoice_ref(ix, row) if ix else None,
        })
    result.sort(key=lambda event: event["when"], reverse=True)
    return result


def merge_newest_first(invoice_rows: list[dict], query_rows: list[dict]) -> list[dict]:
    """mergeNewestFirst: on equal times the invoice row stays first."""
    merged, i, q = [], 0, 0
    while i < len(invoice_rows) and q < len(query_rows):
        if invoice_rows[i]["when"] >= query_rows[q]["when"]:
            merged.append(invoice_rows[i]); i += 1
        else:
            merged.append(query_rows[q]); q += 1
    return merged + invoice_rows[i:] + query_rows[q:]


def filter_events(events: list[dict], *, search=None, log_type=None, date_from: date | None = None,
                  date_to: date | None = None, oldest_first=False) -> list[dict]:
    """logRowFilter, then the Date column's order (newest first unless `oldest_first`)."""
    needle = (search or "").strip().lower()
    low = datetime.combine(date_from, time()) if date_from else None
    high = datetime.combine(date_to, time.max) if date_to else None
    if needle or (log_type and log_type != "all") or low or high:
        events = [e for e in events
                  if (not log_type or log_type == "all" or e["type"] == log_type)
                  and (not low or e["when"] >= low) and (not high or e["when"] <= high)
                  and (not needle or needle in " ".join(str(e[k] or "") for k in
                                                        ("invoiceNo", "po", "vcode", "event", "detail", "performedBy")).lower())]
    if oldest_first:  # oldestFirst: regroup by time, keeping each time's rows in their order
        events = sorted(events, key=lambda e: e["when"])
    return events


_timeline_cache: OrderedDict = OrderedDict()
CSV_BATCH = 2000


def timeline(rows: list[dict], kind: str, entries: list[dict], **filters) -> list[dict]:
    """The merged, filtered timeline. Paging through it (or re-filtering the same way) reuses the
    result while the rows and the query activity are unchanged."""
    activity = tuple((e.get("id"), e.get("created_at"), e.get("event")) for e in entries)
    key = (id(rows), kind, activity, tuple(sorted((k, str(v)) for k, v in filters.items())))
    with _cache_lock:
        entry = _timeline_cache.get(key)
        if entry and entry[0] is rows:
            _timeline_cache.move_to_end(key)
            return entry[1]
    merged = merge_newest_first(invoice_events(rows, kind), query_events(entries, rows, strict=kind != "global"))
    result = filter_events(merged, **filters)
    with _cache_lock:
        _timeline_cache[key] = (rows, result)  # holding `rows` keeps its id from being reused
        while len(_timeline_cache) > 16:
            _timeline_cache.popitem(last=False)
    return result


def csv_lines(events: Iterable[dict]) -> Iterator[str]:
    """logRowsToCsv (staff columns), streamed in blocks of rows (one write per row is very slow)."""
    def cell(value):
        return '"' + str(value if value is not None else "").replace('"', '""') + '"'
    days: dict = {}  # thousands of rows share a few hundred dates: format each once

    def shown(e):
        when = e["when"]
        if e["hasTime"]:
            return when.strftime("%d %b %Y, %I:%M %p").replace("AM", "am").replace("PM", "pm")
        text = days.get(when)
        if text is None:
            text = days[when] = display_date(when.date().isoformat())
        return text
    yield "﻿" + ",".join(cell(h) for h in ("Date", "Invoice No", "Vendor Code", "PO No", "Type", "Event", "Performed By", "Details"))
    block = []
    for e in events:
        block.append(",".join(cell(v) for v in (shown(e), e["invoiceNo"], e["vcode"], e["po"], e["type"], e["event"], e["performedBy"], e["detail"])))
        if len(block) == CSV_BATCH:
            yield "\r\n" + "\r\n".join(block)
            block = []
    if block:
        yield "\r\n" + "\r\n".join(block)
