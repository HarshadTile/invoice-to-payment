"""Logs / History grouping: one row per invoice with its full trail; query rows untouched."""
from datetime import datetime

from app.services.invoice_events import filter_events, group_by_invoice


def _event(no, name, day, kind="Invoice", item=10):
    return {"key": f"{no}|{name}", "when": datetime(2026, 11, day), "type": kind, "event": name, "detail": "",
            "invoiceNo": no, "invoice": {"no": no, "poItem": item, "vcode": "V1", "channel": "msetuSrm", "sourceId": None}}


def _query(day, text):
    return {"key": f"q|{day}", "when": datetime(2026, 11, day, 12), "type": "Query", "event": text, "invoice": None}


# All milestones, newest first (as invoice_events returns them)
ALL = sorted([
    _event("A", "Invoice uploaded", 1), _event("A", "Booked in SAP", 4), _event("A", "Payment completed", 8, "Payment"),
    _event("B", "Invoice uploaded", 7), _event("B", "Booked in SAP", 9),
    _event("A", "Invoice uploaded", 2, item=20),  # same invoice number, another PO item: its own line
], key=lambda e: e["when"], reverse=True)


def test_each_invoice_appears_once_with_its_latest_event():
    rows = group_by_invoice(ALL, ALL)
    assert [(r["invoiceNo"], r["event"]) for r in rows] == [
        ("B", "Booked in SAP"), ("A", "Payment completed"), ("A", "Invoice uploaded")]


def test_the_trail_is_complete_and_oldest_first_even_outside_the_range():
    in_range = filter_events(ALL, date_from=datetime(2026, 11, 8).date(), date_to=datetime(2026, 11, 9).date())
    rows = group_by_invoice(in_range, ALL)
    a = next(r for r in rows if r["invoiceNo"] == "A")
    assert [step["event"] for step in a["trail"]] == ["Invoice uploaded", "Booked in SAP", "Payment completed"]
    assert a["milestones"] == 3
    assert {r["invoiceNo"] for r in rows} == {"A", "B"}  # A item 20 had nothing in range


def test_query_rows_are_kept_as_they_are():
    timeline = sorted(ALL + [_query(5, "Ticket created"), _query(3, "Reply")], key=lambda e: e["when"], reverse=True)
    rows = group_by_invoice(timeline, ALL)
    assert [r["event"] for r in rows if r["type"] == "Query"] == ["Ticket created", "Reply"]
    assert all("trail" not in r for r in rows if r["type"] == "Query")


def test_oldest_first_order_is_kept():
    oldest = sorted(ALL, key=lambda e: e["when"])
    rows = group_by_invoice(oldest, ALL, oldest_first=True)
    assert [r["when"] for r in rows] == sorted(r["when"] for r in rows)
    assert [r["event"] for r in rows if r["invoiceNo"] == "A" and r["invoice"]["poItem"] == 10] == ["Payment completed"]
