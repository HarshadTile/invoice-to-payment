import os
from datetime import date

import pytest
from openpyxl import Workbook

from app.repositories import gcp_invoice as repo

HEADERS = [
    "INV_NO", "STATUS_FLAG", "OVERALL_STATUS", "UTR_NO",
    "MIRO_NET_DUE_DATE", "MIRO_CD_BASE", "MIRO_AMOUNT", "MIRO_AMOUNT_LC",
]


def _write(path, rows):
    wb = Workbook()
    ws = wb.active
    ws.title = repo.SHEET_NAME
    ws.append(HEADERS)
    for row in rows:
        ws.append([row.get(h) for h in HEADERS])
    wb.save(path)


@pytest.fixture
def workbook(tmp_path, monkeypatch):
    path = tmp_path / "invoices.xlsx"
    monkeypatch.setattr(repo, "EXCEL_FILE", path)
    monkeypatch.setattr(repo, "_cached_invoices", None)
    monkeypatch.setattr(repo, "_cached_mtime", None, raising=False)
    return path


def _status_by_invoice():
    return {r["INV_NO"]: r["OVERALL_STATUS"] for r in repo.get_all_cached_invoices()}


def test_utr_makes_an_approved_invoice_paid_and_a_due_date_makes_it_payment_due(workbook):
    _write(workbook, [
        {"INV_NO": "A", "STATUS_FLAG": "A", "OVERALL_STATUS": "Approved", "UTR_NO": "UTR1"},
        {"INV_NO": "B", "STATUS_FLAG": "A", "OVERALL_STATUS": "Approved", "MIRO_NET_DUE_DATE": date(2026, 11, 1)},
        {"INV_NO": "C", "STATUS_FLAG": "A", "OVERALL_STATUS": "Approved"},
    ])
    assert _status_by_invoice() == {"A": "Paid", "B": "Payment Due", "C": "Approved"}


@pytest.mark.parametrize("flag,status", [("X", "Deleted"), ("D", "Rejected"), ("Y", "Rejected")])
def test_deleted_and_rejected_invoices_are_never_turned_into_paid_or_payment_due(workbook, flag, status):
    _write(workbook, [
        {"INV_NO": "with-utr", "STATUS_FLAG": flag, "OVERALL_STATUS": status, "UTR_NO": "UTR9"},
        {"INV_NO": "with-due", "STATUS_FLAG": flag, "OVERALL_STATUS": status, "MIRO_NET_DUE_DATE": date(2026, 11, 1)},
    ])
    assert _status_by_invoice() == {"with-utr": status, "with-due": status}


def test_a_dash_utr_does_not_count_as_paid(workbook):
    _write(workbook, [{"INV_NO": "A", "STATUS_FLAG": "A", "OVERALL_STATUS": "Approved", "UTR_NO": "-"}])
    assert _status_by_invoice() == {"A": "Approved"}


def test_data_reloads_when_the_excel_file_changes_without_a_restart(workbook):
    _write(workbook, [{"INV_NO": "OLD", "STATUS_FLAG": "A", "OVERALL_STATUS": "Approved"}])
    assert set(_status_by_invoice()) == {"OLD"}

    _write(workbook, [{"INV_NO": "NEW", "STATUS_FLAG": "A", "OVERALL_STATUS": "Approved"}])
    stat = workbook.stat()
    os.utime(workbook, (stat.st_atime, stat.st_mtime + 10))  # a later save time, as a real refresh would have

    assert set(_status_by_invoice()) == {"NEW"}


def test_data_is_served_from_memory_while_the_file_is_unchanged(workbook, monkeypatch):
    _write(workbook, [{"INV_NO": "A", "STATUS_FLAG": "A", "OVERALL_STATUS": "Approved"}])
    first = repo.get_all_cached_invoices()
    assert repo.get_all_cached_invoices() is first
