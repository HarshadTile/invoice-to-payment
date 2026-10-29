from datetime import date, datetime
from decimal import Decimal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.auth import get_current_user_token
from app.api.v1.invoice import router
from app.core.database import get_db
from app.repositories import gcp_invoice as source
from app.services.invoice import map_gcp_invoice_to_response


def row(**changes):
    return {
        "VENDOR_INVOICE_NO": "INV/1", "INVOICE_DATE": date(2025, 12, 31),
        "INVOICE_UPLOAD_DATE": date(2026, 10, 1), "PRODUCT_TYPE": "S", "PLANT": "H001",
        "PURCHASING_DOCUMENT": "650001", "ITEM": 10, "SUPPLIER": "V1",
        "SUPPLIER_NAME": "Supplier One", "PAN_NO": "ABCDE1234F", "STATUS_FLAG": "A",
        "Invoice_Uploaded": "YES", "MIRO_BOOKED": "PENDING FOR MIRO",
        "PAYABLE_AMOUNT": 1234.5, "CURRENCY": "INR", "FILTER_FISCAL_YEAR": 2027,
        "FINAL_APPRPVAL_DATE": date(2026, 10, 2), "APPROVED_BY": "Approver",
        "PENDING_WITH": "Reviewer", "APPROVER1": "First Approver",
        "Approver_Remarks": "Internal remarks", **changes,
    }


@pytest.mark.parametrize("flag,label", list(source.STATUS_LABELS.items()))
def test_all_status_flags(flag, label):
    assert source.invoice_status(row(STATUS_FLAG=flag, Invoice_Uploaded="NO")) == label


@pytest.mark.parametrize("changes,label", [
    ({"STATUS_FLAG": "I", "Invoice_Uploaded": "YES"}, "Invoice Uploaded"),
    ({"STATUS_FLAG": "P", "Invoice_Uploaded": "NO"}, "Pending for Approval"),
    ({"MIRO_BOOKED": "MIRO BOOKED", "NET_DUE_DATE": date(2026, 11, 1)}, "Miro Booked"),
    ({"Payment_Due_Date": date(2026, 11, 1)}, "Approved"),
    ({"UTR_NUMBER": " UTR123 "}, "Paid"),
    ({"CLEARING_DATE": datetime(2026, 10, 3)}, "Paid"),
    ({"UTR_NUMBER": "-", "CLEARING_DATE": None}, "Approved"),
    ({"UTR_CLEARING_DATE_PAID": "2026-10-03"}, "Approved"),
    ({"STATUS_FLAG": "D", "UTR_NUMBER": "UTR123", "MIRO_BOOKED": "MIRO BOOKED"}, "Paid"),
])
def test_status_precedence(changes, label):
    assert source.invoice_status(row(**changes)) == label


def test_exact_srm_mapping():
    mapped = map_gcp_invoice_to_response(row(
        PRODUCT_TYPE="M", MIRO_DOCUMENT_DATE=date(2026, 10, 4),
        DOC_SENT_ACCOUNT_DATE=date(2026, 10, 2), UTR_CLEARING_DATE_PAID=" 2026-10-05 ",
        CLEARING_DATE=date(2026, 10, 6), FISCAL_YEAR=1999, MIRO_CD_BASE=999,
        Payment_Due_Date=date(2026, 11, 1), POSTING_DATE=date(2026, 10, 3),
    ))
    assert mapped.invoice_type == "Material"
    assert mapped.product_type == "M"
    assert mapped.invoice_upload_date == date(2026, 10, 1)
    assert mapped.filter_fiscal_year == 2027
    assert mapped.sap.fiscal_year is None
    assert mapped.sap.payable_amount == mapped.sap.amount == Decimal("1234.5")
    assert mapped.sap.cash_discount_base is None
    assert mapped.sap.amount_local_currency is None
    assert mapped.sap.document_date == date(2026, 10, 4)
    assert mapped.sap.clearing_date == date(2026, 10, 6)
    assert mapped.sap.utr_clearing_date_paid == date(2026, 10, 5)
    assert mapped.workflow.final_approval_date == date(2026, 10, 2)
    assert mapped.workflow.document_sent_to_accounts_date == date(2026, 10, 2)
    assert mapped.workflow.approver_remarks == "Internal remarks"
    assert mapped.workflow.workflow_levels is None
    assert mapped.sap.miro_document is None


@pytest.fixture
def api(monkeypatch):
    rows = [row(), row(VENDOR_INVOICE_NO="INV/2", ITEM=20, PRODUCT_TYPE="M", PLANT="AMKT",
                       MIRO_BOOKED="MIRO BOOKED", INVOICE_UPLOAD_DATE=date(2026, 10, 10)),
            row(VENDOR_INVOICE_NO="INV/3", SUPPLIER="V2", UTR_NUMBER="UTR3",
                INVOICE_UPLOAD_DATE=date(2026, 10, 20)),
            row(VENDOR_INVOICE_NO="INV/4", STATUS_FLAG="I", Invoice_Uploaded="NO", INVOICE_UPLOAD_DATE=None)]
    monkeypatch.setattr(source, "_cached_invoices", rows)
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_current_user_token] = lambda: {"auth_type": "internal"}
    app.dependency_overrides[get_db] = lambda: None
    return TestClient(app), app


def test_list_summary_recent_use_same_source_and_filters(api):
    client, _ = api
    params = {"product_type": "M", "plant": "AMKT", "filter_fiscal_year": 2027,
              "upload_date_from": "2026-10-10", "upload_date_to": "2026-10-10"}
    listed = client.get("/api/v1/invoices/list-invoices", params=params).json()
    summary = client.get("/api/v1/invoices/invoice-summary", params=params).json()
    recent = client.get("/api/v1/invoices/recent-invoices", params=params).json()
    assert listed["total"] == summary["total"] == len(recent) == 1
    assert listed["items"][0] == recent[0]
    assert recent[0]["overall_status"] == "Miro Booked"
    assert summary["kpi"]["miroBooked"] == 1
    assert summary["kpi"]["paymentDue"] == 0
    assert client.get("/api/v1/invoices/invoice-details/INV/2?po_item=20").json() == recent[0]
    assert client.get("/api/v1/invoices/invoice-details/INV/2?po_item=999").status_code == 404


def test_recent_sorts_entire_source_before_limiting(api):
    client, _ = api
    recent = client.get("/api/v1/invoices/recent-invoices?limit=1").json()
    assert recent[0]["invoice_number"] == "INV/3"


def test_division_and_plant_filters_match_across_endpoints(api, monkeypatch):
    client, _ = api
    monkeypatch.setattr(source, "_cached_invoices", [
        row(DV_TYPE="AUTO DV", PLANT="H001"),
        row(DV_TYPE="CORPORATE DV", PLANT="H001", VENDOR_INVOICE_NO="OTHER-DIVISION"),
        row(DV_TYPE="AUTO DV", PLANT="AMKT", VENDOR_INVOICE_NO="OTHER-PLANT"),
    ])
    params = {"plant": "H001", "dv_type": "AUTO DV"}
    for endpoint in ["list-invoices", "invoice-summary", "recent-invoices"]:
        response = client.get(f"/api/v1/invoices/{endpoint}", params=params)
        assert response.status_code == 200
        body = response.json()
        assert (len(body) if isinstance(body, list) else body["total"]) == 1


def test_shared_approval_miro_payment_filters(api, monkeypatch):
    client, _ = api
    monkeypatch.setattr(source, "_cached_invoices", [
        row(APPROVER7="Last Approver", PENDING_WITH="Reviewer", APPROVED_BY="Manager"),
        row(VENDOR_INVOICE_NO="OTHER", APPROVER1="Someone Else", MIRO_BOOKED="MIRO BOOKED", UTR_NUMBER="UTR1"),
    ])
    params = {"approver": " last ", "pending_with": "review", "approved_by": "MANAGER",
              "miro_status": "pending", "payment_status": "unpaid"}
    for endpoint in ["list-invoices", "invoice-summary", "recent-invoices"]:
        response = client.get(f"/api/v1/invoices/{endpoint}", params=params)
        assert response.status_code == 200
        body = response.json()
        assert (len(body) if isinstance(body, list) else body["total"]) == 1
    assert client.get("/api/v1/invoices/list-invoices?payment_status=paid").json()["items"][0]["invoice_number"] == "OTHER"


@pytest.mark.parametrize("query", ["approver=First", "pending_with=Reviewer", "approved_by=Manager"])
def test_supplier_cannot_filter_internal_approval_names(api, query):
    client, app = api
    app.dependency_overrides[get_current_user_token] = lambda: {"auth_type": "supplier", "sub": "V1"}
    for endpoint in ["list-invoices", "invoice-summary", "recent-invoices"]:
        assert client.get(f"/api/v1/invoices/{endpoint}?{query}").status_code == 403


@pytest.mark.parametrize("query", ["miro_status=unknown", "payment_status=unknown"])
def test_invalid_workflow_filters(api, query):
    client, _ = api
    assert client.get(f"/api/v1/invoices/list-invoices?{query}").status_code == 422


@pytest.mark.parametrize("date_type,columns", list(source.DATE_FIELDS.items()))
def test_selected_date_range_is_inclusive_and_excludes_missing_dates(api, monkeypatch, date_type, columns):
    client, _ = api
    blank_dates = {column: None for group in source.DATE_FIELDS.values() for column in group}
    monkeypatch.setattr(source, "_cached_invoices", [
        row(**{**blank_dates, columns[0]: date(2026, 10, 10)}),
        row(**{**blank_dates, columns[0]: date(2026, 10, 11), "VENDOR_INVOICE_NO": "OUTSIDE"}),
        row(**{**blank_dates, "VENDOR_INVOICE_NO": "MISSING"}),
    ])
    params = {"date_type": date_type, "date_from": "2026-10-10", "date_to": "2026-10-10"}
    for endpoint in ["list-invoices", "invoice-summary", "recent-invoices"]:
        response = client.get(f"/api/v1/invoices/{endpoint}", params=params)
        assert response.status_code == 200
        result = response.json()
        assert (len(result) if isinstance(result, list) else result["total"]) == 1


def test_due_date_filter_uses_net_due_date_fallback(api, monkeypatch):
    client, _ = api
    monkeypatch.setattr(source, "_cached_invoices", [row(NET_DUE_DATE=date(2026, 11, 1))])
    response = client.get("/api/v1/invoices/list-invoices?date_type=due&date_from=2026-11-01")
    assert response.json()["total"] == 1


@pytest.mark.parametrize("column", ["NETDT", "NET_DUE_DATE"])
def test_net_due_date_is_used_in_response_and_filter(api, monkeypatch, column):
    client, _ = api
    raw = row(**{column: date(2026, 11, 1), "Payment_Due_Date": date(2026, 12, 1),
                 "CLEARING_DATE": date(2026, 10, 15)})
    monkeypatch.setattr(source, "_cached_invoices", [raw])
    assert map_gcp_invoice_to_response(raw).sap.net_due_date == date(2026, 11, 1)
    response = client.get("/api/v1/invoices/list-invoices?date_type=due&date_from=2026-11-01&date_to=2026-11-01")
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["sap"]["clearing_date"] == "2026-10-15"


@pytest.mark.parametrize("query", ["date_type=unknown", "date_from=bad", "date_from=2026-10-20&date_to=2026-10-01"])
def test_invalid_selected_dates(api, query):
    client, _ = api
    assert client.get(f"/api/v1/invoices/list-invoices?{query}").status_code == 422


def test_supplier_cannot_filter_redacted_internal_date(api):
    client, app = api
    app.dependency_overrides[get_current_user_token] = lambda: {"auth_type": "supplier", "sub": "V1"}
    assert client.get("/api/v1/invoices/list-invoices?date_type=accounts").status_code == 403


@pytest.mark.parametrize("query", ["product_type=Q", "upload_date_from=bad", "limit=0",
                                   "upload_date_from=2026-10-20&upload_date_to=2026-10-01"])
def test_invalid_filters(api, query):
    client, _ = api
    assert client.get(f"/api/v1/invoices/recent-invoices?{query}").status_code == 422


def test_supplier_scope_and_redaction(api):
    client, app = api
    app.dependency_overrides[get_current_user_token] = lambda: {"auth_type": "supplier", "sub": "V1"}
    listed = client.get("/api/v1/invoices/list-invoices?vendor_code=V2").json()
    assert listed["total"] == 3
    assert {item["supplier"]["vendor_code"] for item in listed["items"]} == {"V1"}
    assert listed["items"][0]["workflow"]["approved_by"] is None
    assert listed["items"][0]["workflow"]["approver_remarks"] is None
    assert client.get("/api/v1/invoices/invoice-summary?vendor_code=V2").json()["total"] == 3
    assert len(client.get("/api/v1/invoices/recent-invoices?vendor_code=V2").json()) == 3
    assert client.get("/api/v1/invoices/invoice-details/INV/3").status_code == 404


def test_supplier_detail_matches_own_duplicate_invoice_number(api, monkeypatch):
    client, app = api
    monkeypatch.setattr(source, "_cached_invoices", [row(SUPPLIER="V2"), row()])
    app.dependency_overrides[get_current_user_token] = lambda: {"auth_type": "supplier", "sub": "V1"}
    assert client.get("/api/v1/invoices/invoice-details/INV/1").json()["supplier"]["vendor_code"] == "V1"


def test_real_srm_workbook_maps_every_row(monkeypatch):
    monkeypatch.setattr(source, "_cached_invoices", None)
    rows = source.get_all_cached_invoices()
    assert len(rows) == 39279
    for raw in rows:
        invoice = map_gcp_invoice_to_response(raw)
        assert invoice.invoice_number
        assert invoice.filter_fiscal_year == 2027
        assert invoice.overall_status != "Payment Due"
