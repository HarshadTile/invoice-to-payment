import pytest

from otp_tests.sample_data import make_mobile
from fastapi import HTTPException
from openpyxl import Workbook

from app.services.supplier_mobile import registered_mobile


def write_master(path, rows, sheet_name="vendors", headers=None):
    book = Workbook()
    sheet = book.active
    sheet.title = sheet_name
    sheet.append(headers or ["SUPPLIER", "SUPPLIER_MOBILE"])
    for row in rows:
        sheet.append(row)
    book.save(path)
    book.close()


@pytest.fixture
def master(tmp_path, monkeypatch):
    path = tmp_path / "mobile-master.xlsx"
    monkeypatch.setenv("SUPPLIER_MOBILE_EXCEL_FILE", str(path))
    return path


def test_single_master_row_maps_many_invoices_and_reads_phone_edits(master):
    invoice_rows = [{"SUPPLIER": "V1", "SUPPLIER_MOBILE": make_mobile("stale-invoice")}] * 10
    write_master(master, [[" V1 ", make_mobile("old-phone")]])
    assert registered_mobile("v1", invoice_rows) == make_mobile("old-phone")
    write_master(master, [["V1", make_mobile("new-phone")]])
    assert registered_mobile("V1", invoice_rows) == make_mobile("new-phone")


@pytest.mark.parametrize("phones", [[make_mobile("old-phone"), make_mobile("old-phone")], [make_mobile("old-phone"), make_mobile("new-phone")]])
def test_duplicate_master_rows_rejected(master, phones):
    write_master(master, [["V1", phones[0]], ["v1", phones[1]]])
    with pytest.raises(HTTPException) as error:
        registered_mobile("V1", [])
    assert error.value.status_code == 400


@pytest.mark.parametrize("phone", [None, "", int(make_mobile("numeric-cell")[1:]), make_mobile("no-country-code")[3:], "invalid"])
def test_invalid_master_phone_rejected(master, phone):
    write_master(master, [["V1", phone]])
    with pytest.raises(HTTPException) as error:
        registered_mobile("V1", [])
    assert error.value.status_code == 400


def test_missing_vendor_does_not_fall_back_to_invoice_phone(master):
    write_master(master, [["V2", make_mobile("old-phone")]])
    with pytest.raises(HTTPException) as error:
        registered_mobile("V1", [{"SUPPLIER": "V1", "SUPPLIER_MOBILE": make_mobile("stale-invoice")}])
    assert error.value.status_code == 400


@pytest.mark.parametrize("layout", ["missing", "wrong_sheet", "wrong_header"])
def test_unavailable_master_blocks_login(master, layout):
    if layout != "missing":
        # These checks concern the file layout, so no phone value is needed.
        write_master(master, [["V1", None]],
                     sheet_name="wrong" if layout == "wrong_sheet" else "vendors",
                     headers=["WRONG", "SUPPLIER_MOBILE"] if layout == "wrong_header" else None)
    with pytest.raises(HTTPException) as error:
        registered_mobile("V1", [])
    assert error.value.status_code == 503
