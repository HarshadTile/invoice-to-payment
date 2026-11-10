"""Server-side search, filters, sorting, dashboard totals, facets, vendors and export."""
import csv
import io

import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token
from app.main import app
from tests.helpers.suppliers import supplier_headers_for_code
from tests.helpers.users import internal_user_id


def _client(auth_type, subject, scope=None):
    if auth_type == "supplier":
        return TestClient(app, headers=supplier_headers_for_code(subject, (scope or {}).get("company", "Vendor")))
    token = create_access_token(subject=subject, auth_type=auth_type, scope=scope)
    return TestClient(app, headers={"Authorization": f"Bearer {token}"})


internal = _client("internal", internal_user_id(), {"channelScope": "all"})
supplier = _client("supplier", "V1", {"company": "Supplier One"})  # managed supplier owning vendor V1 only


def srm(no, **changes):
    return {"VENDOR_INVOICE_NO": no, "SUPPLIER": "V1", "SUPPLIER_NAME": "Supplier One", "PAN_NO": "ABCDE1234F",
            "PURCHASING_DOCUMENT": "650001", "ITEM": 10, "PRODUCT_TYPE": "S", "STATUS_FLAG": "P",
            "Invoice_Uploaded": "YES", "MIRO_BOOKED": "PENDING FOR MIRO", "FILTER_FISCAL_YEAR": 2027,
            "INVOICE_DATE": "2026-05-10", "INVOICE_UPLOAD_DATE": "2026-05-12", "PAYABLE_AMOUNT": "1000",
            "CURRENCY": "INR", "APPROVER1": "Asha Rao", **changes}


@pytest.fixture(autouse=True)
def invoices(monkeypatch):
    from app.repositories import po_portal_invoice as po, srm_invoice
    rows = [
        srm("INV-1"),
        srm("INV-2", STATUS_FLAG="A", INVOICE_DATE="2026-06-02", PAYABLE_AMOUNT="2500.50"),
        srm("INV-3", UTR_NUMBER="UTR777", CLEARING_DATE="2026-07-01", INVOICE_DATE=None, PAYABLE_AMOUNT=None),
        srm("INV-4", SUPPLIER="V2", SUPPLIER_NAME="Tata Steel", PAN_NO="ZZZZZ9999Z", PRODUCT_TYPE="M",
            STATUS_FLAG="D", FILTER_FISCAL_YEAR=2026, INVOICE_DATE="2025-04-20", CURRENCY="USD", PAYABLE_AMOUNT="40"),
        srm("INV-5", FILTER_FISCAL_YEAR=None, INVOICE_DATE=None),  # no fiscal year can be derived
    ]
    po_row = po.normalize_row({"Reference": "PO-INV-9", "Purchasing_Document": "340001", "Item": "10",
                               "SUPPLIER": "V3", "SUPPLIER_NAME": "Portal Vendor", "Invoice_Uploaded": "YES",
                               "HOD1_Status": "APPROVED", "HOD2_Status": "APPROVED", "MIRO_BOOKED": "",
                               "Invoice_Creation_Date": "2026-06-15", "PAYABLE_AMOUNT": "500", "CURRENCY": "INR",
                               "Created_by_HOD1": "Hod One", "FILTER_FISCAL_YEAR": "2027"}, "poPortal:x:1")
    monkeypatch.setattr(srm_invoice, "_cached_invoices", rows)
    monkeypatch.setattr(po, "_cached_invoices", [po_row])


def numbers(response):
    assert response.status_code == 200, response.text
    return [item["invoice_number"] for item in response.json()["items"]]


def test_one_term_searches_every_shown_field():
    assert numbers(internal.get("/api/v1/invoices/list-invoices?channel=all&q=tata")) == ["INV-4"]
    assert numbers(internal.get("/api/v1/invoices/list-invoices?channel=all&q=utr777")) == ["INV-3"]
    # dates match the way they are shown, not only ISO
    assert numbers(internal.get("/api/v1/invoices/list-invoices?channel=all&q=02 jun 2026")) == ["INV-2"]


def test_commas_search_by_position():
    assert numbers(internal.get("/api/v1/invoices/list-invoices?channel=all&q=, 340001")) == ["PO-INV-9"]
    assert numbers(internal.get("/api/v1/invoices/list-invoices?q=INV-1, 650001, 10")) == ["INV-1"]


def test_suppliers_cannot_find_invoices_by_internal_fields():
    assert numbers(internal.get("/api/v1/invoices/list-invoices?q=asha rao")) == ["INV-1", "INV-2", "INV-3", "INV-4", "INV-5"]
    assert numbers(supplier.get("/api/v1/invoices/list-invoices?q=asha rao")) == []


def test_fiscal_year_keeps_undated_invoices_for_internal_users_only():
    assert numbers(internal.get("/api/v1/invoices/list-invoices?fy=2026-27")) == ["INV-1", "INV-2", "INV-3", "INV-5"]
    assert numbers(supplier.get("/api/v1/invoices/list-invoices?fy=2026-27")) == ["INV-1", "INV-2", "INV-3"]
    assert numbers(internal.get("/api/v1/invoices/list-invoices?fy=2025-26")) == ["INV-4", "INV-5"]


def test_several_statuses_and_product():
    assert numbers(internal.get("/api/v1/invoices/list-invoices?statuses=Approved&statuses=Paid")) == ["INV-2", "INV-3"]
    assert numbers(internal.get("/api/v1/invoices/list-invoices?product_name=Material")) == ["INV-4"]


def test_date_sort_puts_undated_rows_last():
    assert numbers(internal.get("/api/v1/invoices/list-invoices?sort=invoice:desc")) == ["INV-2", "INV-1", "INV-4", "INV-3", "INV-5"]
    assert numbers(internal.get("/api/v1/invoices/list-invoices?sort=invoice:asc")) == ["INV-4", "INV-1", "INV-2", "INV-3", "INV-5"]
    assert internal.get("/api/v1/invoices/list-invoices?sort=amount:desc").status_code == 422


def test_date_range_uses_the_chosen_date_type_without_fallback():
    assert numbers(internal.get("/api/v1/invoices/list-invoices?date_type=invoice&date_from=2026-05-01&date_to=2026-05-31")) == ["INV-1"]
    assert numbers(internal.get("/api/v1/invoices/list-invoices?date_type=utr_clearing&date_from=2026-01-01")) == []


def test_dashboard_matches_the_browser_metrics():
    data = internal.get("/api/v1/invoices/dashboard?channel=all").json()
    assert data["total"]["count"] == 6
    assert data["currency"] == "INR" and data["otherCurrencies"] == {"USD": 40.0}
    assert data["kpi"]["pendingApproval"]["count"] == 2  # INV-1, INV-5
    assert data["kpi"]["approved"]["count"] == 2 and data["kpi"]["approved"]["value"] == 3000.5  # INV-2 + PO row
    assert data["kpi"]["paid"] == {"count": 1, "value": 0.0, "valued": 0}  # paid, but no amount on record
    assert [s["key"] for s in data["statuses"]] == ["Pending for Approval", "Approved", "Paid", "Rejected"]
    assert data["statuses"][-1]["exception"] is True
    assert {c["key"]: c["count"] for c in data["channels"]} == {"msetuSrm": 5, "poPortal": 1}
    assert [p["count"] for p in data["product"]] == [5, 1, 0]
    assert data["months"][-1]["key"] == "2026-06" and len(data["months"]) == 12
    # Jul 2025 - Jun 2026: INV-4 (Apr 2025) is dated but outside the window
    assert data["monthsCoverage"] == {"inWindow": 3, "withoutDate": 2}


def test_dashboard_months_follow_the_date_type():
    data = internal.get("/api/v1/invoices/dashboard?date_type=upload").json()
    assert data["months"][-1]["key"] == "2026-05" and data["monthsCoverage"]["withoutDate"] == 0


def test_facets_ignore_their_own_selection():
    data = internal.get("/api/v1/invoices/facets?fields=status&fields=product_name&statuses=Approved").json()
    assert data["status"] == {"Pending for Approval": 2, "Approved": 1, "Paid": 1, "Rejected": 1}
    assert data["product_name"] == {"Service": 1}
    assert internal.get("/api/v1/invoices/facets?fields=nope").status_code == 422
    assert supplier.get("/api/v1/invoices/facets?fields=hod1").status_code == 403


def test_vendor_list_is_scoped_and_searchable():
    vendors = internal.get("/api/v1/invoices/vendors?channel=all").json()
    assert [(v["code"], v["count"]) for v in vendors] == [("V1", 4), ("V2", 1), ("V3", 1)]
    assert [v["code"] for v in internal.get("/api/v1/invoices/vendors?vendor_q=tata").json()] == ["V2"]
    assert [v["code"] for v in supplier.get("/api/v1/invoices/vendors").json()] == ["V1"]


def test_export_streams_the_filtered_rows_as_excel_friendly_csv():
    response = internal.get("/api/v1/invoices/export?statuses=Approved&statuses=Rejected")
    assert response.status_code == 200 and response.text.startswith("﻿Invoice No,Vendor")
    rows = list(csv.reader(io.StringIO(response.text.lstrip("﻿"))))
    assert [row[0] for row in rows[1:]] == ["INV-2", "INV-4"]
    assert rows[1][9] == "02 Jun 2026" and rows[1][12] == "₹2,500.50"
    assert rows[2][-1] == "Not provided"  # rejected without a reason
    assert supplier.get("/api/v1/invoices/export").status_code == 403


def test_new_routes_are_not_taken_for_invoice_numbers():
    for path in ("dashboard", "facets?fields=fy", "vendors", "export"):
        response = internal.get(f"/api/v1/invoices/{path}")
        assert response.status_code == 200, (path, response.text)


def test_strict_fiscal_year_drops_undated_invoices_for_search():
    assert numbers(internal.get("/api/v1/invoices/list-invoices?fy=2026-27&fy_strict=true")) == ["INV-1", "INV-2", "INV-3"]


def test_po_facet_counts_purchase_orders_per_vendor():
    data = internal.get("/api/v1/invoices/facets?fields=po&channel=all&vendor_code=V1").json()
    assert data["po"] == {"650001": 4}


def test_channel_register_filters_and_sorts():
    assert numbers(internal.get("/api/v1/invoices/list-invoices?product_type=M")) == ["INV-4"]
    assert numbers(internal.get("/api/v1/invoices/list-invoices?channel=all&sort=payment:desc")) == [
        "INV-3", "INV-1", "INV-2", "INV-4", "INV-5", "PO-INV-9"]  # only INV-3 has a clearing date
    assert internal.get("/api/v1/invoices/list-invoices?sort=nonsense:asc").status_code == 422
    data = internal.get("/api/v1/invoices/facets?channel=poPortal&fields=po_approver&fields=source_approval_stage").json()
    assert data["po_approver"] == {"Hod One": 1}


def test_pan_and_supplier_name_filters():
    assert numbers(internal.get("/api/v1/invoices/list-invoices?pan=zzzzz9999z")) == ["INV-4"]
    assert numbers(internal.get("/api/v1/invoices/list-invoices?vendor_name=Tata Steel")) == ["INV-4"]


def test_dashboard_reports_every_currency():
    data = internal.get("/api/v1/invoices/dashboard").json()
    assert data["totalsByCurrency"] == {"INR": 4500.5, "USD": 40.0} and data["amountCount"] == 4  # INV-1, 2, 4, 5


def test_pan_directory_groups_codes_and_names():
    pans = internal.get("/api/v1/invoices/pans?channel=all").json()
    assert [(p["pan"], p["name"], p["codes"], p["count"]) for p in pans] == [
        ("ABCDE1234F", "Supplier One", ["V1"], 4), ("ZZZZZ9999Z", "Tata Steel", ["V2"], 1)]
    assert [p["pan"] for p in internal.get("/api/v1/invoices/pans?pan_q=tata").json()] == ["ZZZZZ9999Z"]
    assert supplier.get("/api/v1/invoices/pans").status_code == 403


def test_vendor_report_counts_paid_invoices_per_supplier():
    report = internal.get("/api/v1/invoices/vendor-report?channel=all").json()
    assert report["completed"] == 1 and report["suppliers"] == [{"name": "Supplier One", "count": 1, "value": 0.0, "valued": 0}]
    assert supplier.get("/api/v1/invoices/vendor-report").status_code == 403


# --- Logs / History timeline ---

from datetime import datetime, timezone  # noqa: E402

from app.api.deps import get_current_user  # noqa: E402


@pytest.fixture
def staff_activity(monkeypatch):
    from app.services import ticket_service
    entries = [
        {"id": 1, "ticket_id": "t1", "ticket_no": "TKT-1", "invoice_no": "INV-2", "vendor_code": "V1", "channel": "msetuSrm",
         "subject": "Where is my payment", "event": "Ticket created", "detail": "", "performed_by": "Supplier",
         "created_at": datetime(2026, 6, 5, 9, 30, tzinfo=timezone.utc)},
        {"id": 2, "ticket_id": "t2", "ticket_no": "TKT-2", "invoice_no": "INV-2", "vendor_code": "OTHER", "channel": "msetuSrm",
         "subject": "Wrong vendor", "event": "Ticket created", "detail": "", "performed_by": "Supplier",
         "created_at": datetime(2026, 6, 6, 9, 30, tzinfo=timezone.utc)},
        {"id": 3, "ticket_id": "t3", "ticket_no": "TKT-3", "invoice_no": None, "vendor_code": None, "channel": None,
         "subject": "General", "event": "Ticket created", "detail": "", "performed_by": "Asha",
         "created_at": datetime(2026, 1, 1, 9, 30, tzinfo=timezone.utc)},
    ]
    monkeypatch.setattr(ticket_service, "staff_activity_log", lambda db, user: entries)
    app.dependency_overrides[get_current_user] = lambda: {"auth_type": "internal", "ticket_role": "ADMIN"}
    yield entries
    app.dependency_overrides.pop(get_current_user, None)


def events(path):
    response = internal.get(path)
    assert response.status_code == 200, response.text
    return response.json()


def test_logs_list_invoice_milestones_and_query_activity_newest_first(staff_activity):
    data = events("/api/v1/invoices/events?kind=global&invoice_number=INV-2")
    assert [(e["event"], e["when"][:10]) for e in data["items"]] == [
        ("Ticket created", "2026-06-06"), ("Ticket created", "2026-06-05"), ("Invoice uploaded", "2026-05-12"),
        ("Ticket created", "2026-01-01")]  # Logs keep query rows with no invoice, and match by invoice number only
    assert data["items"][0]["invoice"] is None or data["items"][0]["invoiceNo"] == "INV-2"
    assert data["queryError"] is False


def test_history_needs_vendor_and_channel_to_match_and_has_its_own_milestones(staff_activity):
    data = events("/api/v1/invoices/events?kind=srm&invoice_number=INV-3")
    assert [e["event"] for e in data["items"]] == ["Payment cleared", "Invoice uploaded"]
    assert data["items"][0]["detail"] == "UTR UTR777"
    data = events("/api/v1/invoices/events?kind=srm&invoice_number=INV-2")
    assert [e["detail"] for e in data["items"] if e["type"] == "Query"] == ["TKT-1 · Where is my payment"]


def test_paid_invoice_logs_payment_with_utr(staff_activity):
    data = events("/api/v1/invoices/events?kind=global&invoice_number=INV-3&log_type=Payment")
    assert [(e["event"], e["detail"]) for e in data["items"]] == [("Payment completed", "UTR UTR777")]


def test_log_filters_order_paging_and_export(staff_activity):
    assert events("/api/v1/invoices/events?kind=global&log_q=where is my")["total"] == 1
    assert events("/api/v1/invoices/events?kind=global&log_from=2026-06-01&log_to=2026-06-30")["total"] == 2
    oldest = events("/api/v1/invoices/events?kind=global&order=asc&page_size=1")
    assert oldest["items"][0]["event"] == "Invoice rejected" and oldest["total"] > 1  # INV-4, dated Apr 2025
    csv_text = internal.get("/api/v1/invoices/events/export?kind=global&log_type=Query").text
    assert csv_text.startswith('﻿"Date","Invoice No"') and "TKT-1 · Where is my payment" in csv_text


def test_logs_without_inquiry_desk_access_still_show_invoice_activity(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: {"auth_type": "internal", "ticket_role": "NONE"}
    try:
        data = events("/api/v1/invoices/events?kind=global&invoice_number=INV-1")
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert data["queryError"] is True and [e["event"] for e in data["items"]] == ["Invoice uploaded"]


def test_invoice_details_find_zero_padded_po_items(monkeypatch):
    """BigQuery sends ITEM as "00010"; screens (and the details link) say 10."""
    from app.repositories import srm_invoice
    monkeypatch.setattr(srm_invoice, "_cached_invoices", [srm("4889", ITEM="00010", PURCHASING_DOCUMENT="3400886208")])
    response = internal.get("/api/v1/invoices/invoice-details/4889?po_item=10&channel=msetuSrm&vendor_code=V1&po_number=3400886208")
    assert response.status_code == 200, response.text
    assert response.json()["purchase_order"]["po_item"] == 10
    assert internal.get("/api/v1/invoices/invoice-details/4889?po_item=20&channel=msetuSrm").status_code == 404


# --- who sees what on the new endpoints ---

channel_locked = _client("internal", internal_user_id(), {"channelScope": "msetuSrm"})


def test_supplier_totals_cover_only_their_own_vendor_code():
    assert supplier.get("/api/v1/invoices/dashboard").json()["total"]["count"] == 4  # V1's SRM invoices
    # with a year chosen, suppliers don't see invoices that have none (INV-5)
    assert supplier.get("/api/v1/invoices/dashboard?fy=2026-27").json()["total"]["count"] == 3
    assert supplier.get("/api/v1/invoices/dashboard?vendor_code=V2").json()["total"]["count"] == 4  # not theirs: ignored


def test_suppliers_cannot_use_internal_approval_filters_on_new_endpoints():
    assert supplier.get("/api/v1/invoices/dashboard?approver=asha").status_code == 403
    assert supplier.get("/api/v1/invoices/list-invoices?approver=asha").status_code == 403


def test_supplier_list_rows_are_redacted():
    item = supplier.get("/api/v1/invoices/list-invoices").json()["items"][0]
    assert item["workflow"]["approvers"]["approver_1"] is None and item["workflow"]["approved_by"] is None


def test_channel_locked_users_stay_in_their_channel():
    data = channel_locked.get("/api/v1/invoices/dashboard?channel=all").json()
    assert {c["key"] for c in data["channels"]} == {"msetuSrm"}
    assert channel_locked.get("/api/v1/invoices/list-invoices?channel=poPortal").status_code == 403


def test_export_of_selected_invoices_has_only_those():
    response = internal.get("/api/v1/invoices/export?invoice_numbers=INV-1&invoice_numbers=INV-4")
    rows = list(csv.reader(io.StringIO(response.text.lstrip("﻿"))))
    assert [row[0] for row in rows[1:]] == ["INV-1", "INV-4"]


def test_po_portal_rows_export_with_their_channel_and_item():
    rows = list(csv.reader(io.StringIO(internal.get("/api/v1/invoices/export?channel=poPortal").text.lstrip("﻿"))))
    assert rows[1][:6] == ["PO-INV-9", "Portal Vendor", "V3", "PO Portal", "340001", "10"]


# --- more log events ---

def test_logs_show_rejections_and_when_payment_is_due(staff_activity, monkeypatch):
    from app.repositories import srm_invoice
    monkeypatch.setattr(srm_invoice, "_cached_invoices", [
        srm("INV-R", STATUS_FLAG="D", REJ_REASON="PO amount mismatch"),
        srm("INV-B", MIRO_DOCUMENT_DATE="2026-06-10", NET_DUE_DATE="2026-07-10"),
    ])
    items = events("/api/v1/invoices/events?kind=global&log_type=all")["items"]
    rejected = next(e for e in items if e["invoiceNo"] == "INV-R" and e["type"] == "Payment")
    assert (rejected["event"], rejected["detail"]) == ("Invoice rejected", "PO amount mismatch")
    booked = next(e for e in items if e["event"] == "Booked in SAP")
    assert booked["detail"] == "Payment due 10 Jul 2026"


def test_po_portal_history_has_its_own_milestones(staff_activity, monkeypatch):
    from app.repositories import po_portal_invoice as po
    monkeypatch.setattr(po, "_cached_invoices", [po.normalize_row({
        "Reference": "PO-H", "Purchasing_Document": "340002", "Item": "00010", "SUPPLIER": "V3", "Invoice_Uploaded": "YES",
        "Entry_Sheet_Creation_Date": "2026-04-01", "MIRO_Created_on": "2026-04-05", "MIRO_POSTING_DATE": "2026-04-06",
        "Invoice_Creation_Date": "2026-03-30"}, "poPortal:h:1")])
    names = [e["event"] for e in events("/api/v1/invoices/events?kind=po&channel=poPortal")["items"]]
    assert names == ["MIRO posted", "MIRO created", "Service entry created", "Invoice dated"]


def test_suppliers_cannot_read_the_staff_log(staff_activity):
    app.dependency_overrides[get_current_user] = lambda: {"auth_type": "supplier", "ticket_role": None}
    assert supplier.get("/api/v1/invoices/events").status_code == 403


# --- errors and caching ---

def test_an_unreachable_invoice_source_answers_503(monkeypatch):
    from app.api.v1 import invoice as api
    from app.core.bigquery_api import InvoiceSourceError

    def fail(*args, **kwargs):
        raise InvoiceSourceError("BigQuery API returned HTTP 403: Invalid API Token")
    monkeypatch.setattr(api, "query_rows", fail)
    response = internal.get("/api/v1/invoices/list-invoices")
    assert response.status_code == 503
    assert response.json() == {"error": {"code": "SOURCE_UNAVAILABLE", "message": "Invoice data source is unavailable. Try again shortly."}}


def test_new_data_is_never_answered_from_the_cache(monkeypatch):
    from app.repositories import srm_invoice
    assert numbers(internal.get("/api/v1/invoices/list-invoices?q=inv-1")) == ["INV-1"]
    assert internal.get("/api/v1/invoices/dashboard").json()["total"]["count"] == 5
    monkeypatch.setattr(srm_invoice, "_cached_invoices", [srm("INV-NEW")])  # a reload replaces the rows
    assert numbers(internal.get("/api/v1/invoices/list-invoices?q=inv-1")) == []
    assert internal.get("/api/v1/invoices/dashboard").json()["total"]["count"] == 1


def test_pending_tile_counts_exactly_what_its_search_returns(monkeypatch):
    from app.repositories import srm_invoice
    from app.services import invoice_service
    legacy = srm("INV-LEGACY")
    monkeypatch.setattr(srm_invoice, "_cached_invoices", [srm("INV-P"), legacy])
    original = invoice_service.invoice_status
    monkeypatch.setattr(invoice_service, "invoice_status",  # a row carrying the old prototype spelling
                        lambda row: "Pending Approval" if row is legacy else original(row))
    tile = internal.get("/api/v1/invoices/dashboard").json()["kpi"]["pendingApproval"]["count"]
    search = internal.get("/api/v1/invoices/list-invoices?statuses=Pending for Approval").json()["total"]
    assert tile == search == 1
