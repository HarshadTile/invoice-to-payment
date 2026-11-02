"""The per-invoice values the server lists, searches and totals by (app/services/invoice_index.py)."""
import pytest

from app.repositories import po_portal_invoice as po
from app.services.invoice_index import build_index, display_amount, indian_grouping


def srm(**changes):
    return {"VENDOR_INVOICE_NO": "INV-1", "SUPPLIER": "V1", "SUPPLIER_NAME": "Supplier One", "PAN_NO": "ABCDE1234F",
            "PURCHASING_DOCUMENT": "650001", "ITEM": "00010", "PRODUCT_TYPE": "S", "STATUS_FLAG": "A",
            "INVOICE_DATE": "2026-05-10", "PAYABLE_AMOUNT": "1000", "CURRENCY": "INR", "APPROVER1": "Asha Rao", **changes}


@pytest.mark.parametrize("value,shown", [
    (339136.5, "3,39,136.50"), (1000, "1,000.00"), (999, "999.00"), (12345678.9, "1,23,45,678.90"), (-2500, "-2,500.00"),
])
def test_amounts_use_indian_digit_grouping(value, shown):
    assert indian_grouping(value) == shown


def test_amounts_print_like_the_browser_does():
    assert display_amount(1234.5, "INR") == "₹1,234.50"
    assert display_amount(1234.5, "USD") == "$1,234.50"
    assert display_amount(1234.5, "JPY") == "JP¥1,234.50"
    assert display_amount(1234.5, "AED") == "AED 1,234.50"
    assert display_amount(None, "INR") == "-"


@pytest.mark.parametrize("invoice_date,fy", [("2026-03-31", "2025-26"), ("2026-04-01", "2026-27"), (None, "")])
def test_fiscal_year_comes_from_the_invoice_date_when_not_recorded(invoice_date, fy):
    assert build_index(srm(INVOICE_DATE=invoice_date, FILTER_FISCAL_YEAR=None)).fy == fy


def test_recorded_fiscal_year_wins():
    assert build_index(srm(FILTER_FISCAL_YEAR=2027, INVOICE_DATE="2024-01-01")).fy == "2026-27"


def test_po_item_is_a_number_and_amount_keeps_its_currency():
    ix = build_index(srm(PAYABLE_AMOUNT="2500.50", CURRENCY="USD"))
    assert (ix.po_item, ix.amount, ix.currency) == ("10", 2500.5, "USD")
    assert build_index(srm(PAYABLE_AMOUNT=None)).currency is None  # no amount, no currency


def test_status_date_follows_the_status():
    paid = build_index(srm(UTR_NUMBER="UTR1", CLEARING_DATE="2026-07-01"))
    assert (paid.status, paid.status_date) == ("Paid", "2026-07-01")
    approved = build_index(srm(FINAL_APPRPVAL_DATE="2026-06-01"))
    assert (approved.status, approved.status_date) == ("Approved", "2026-06-01")


def test_dates_never_fall_back_to_another_date():
    ix = build_index(srm(INVOICE_UPLOAD_DATE=None))
    assert ix.date("invoice") == "2026-05-10" and ix.date("upload") is None and ix.sort_date("payment") is None


def test_search_text_has_the_ways_people_type_dates_and_amounts():
    text = build_index(srm()).search_public
    for typed in ("10 may 2026", "10-05-2026", "10/05/2026", "₹1,000.00", "₹1000.00", "service", "msetu / srm"):
        assert typed in text, typed


def test_approval_details_are_searchable_by_internal_users_only():
    ix = build_index(srm(APPROVED_BY="Manager A"))
    assert "asha rao" in ix.search_internal and "manager a" in ix.search_internal
    assert "asha rao" not in ix.search_public and "manager a" not in ix.search_public


def test_po_portal_internal_people_stay_out_of_the_supplier_search():
    row = po.normalize_row({"Reference": "PO-1", "Purchasing_Document": "340001", "Item": "00010", "SUPPLIER": "V3",
                            "Created_by_HOD1": "Hod One", "Service": "000123", "Invoice_Uploaded": "YES"}, "poPortal:x:1")
    ix = build_index(row)
    assert "hod one" in ix.search_internal and "hod one" not in ix.search_public
    assert "000123" in ix.search_public  # the service code is shown to suppliers
    assert ix.approvers() == {"Hod One"} and ix.po_value("hod1") == "Hod One"
