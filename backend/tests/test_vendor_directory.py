import pytest

from app.services import vendor_directory

ROWS = [
    {"SUPPLIER": "TSTV001", "SUPPLIER_NAME": "Acme Tools", "PAN_NO": "TSTPA1111A"},
    {"SUPPLIER": "TSTV001", "SUPPLIER_NAME": "Acme Tools", "PAN_NO": "TSTPA1111A"},
    {"SUPPLIER": "TSTV002", "SUPPLIER_NAME": "Acme Tools Pune", "PAN_NO": " tstpa1111a "},
    {"SUPPLIER": "TSTV003", "SUPPLIER_NAME": "Bolt Works", "PAN_NO": "TSTPB2222B"},
    {"SUPPLIER": "TSTV004", "SUPPLIER_NAME": "No Pan Ltd", "PAN_NO": None},
    {"SUPPLIER": "TSTV005", "SUPPLIER_NAME": "Dash Pan Ltd", "PAN_NO": "-"},
]


@pytest.fixture(autouse=True)
def fake_data(monkeypatch):
    monkeypatch.setattr(vendor_directory, "get_all_cached_invoices", lambda: ROWS)


def test_search_by_partial_name_groups_codes_under_the_pan():
    found = vendor_directory.search_vendors("acme")
    assert found == [{"pan": "TSTPA1111A", "name": "Acme Tools", "vendorCodes": ["TSTV001", "TSTV002"]}]


def test_search_by_a_few_letters_of_the_pan():
    found = vendor_directory.search_vendors("pb22")
    assert [f["pan"] for f in found] == ["TSTPB2222B"]


def test_search_by_vendor_code_is_case_insensitive():
    found = vendor_directory.search_vendors("tstv003")
    assert [f["pan"] for f in found] == ["TSTPB2222B"]


def test_empty_query_returns_nothing_and_rows_without_a_valid_pan_are_skipped():
    assert vendor_directory.search_vendors("   ") == []
    assert vendor_directory.search_vendors("pan ltd") == []


def test_limit_is_applied():
    assert len(vendor_directory.search_vendors("tst", limit=1)) == 1


def test_get_vendor_by_pan_normalises_the_pan():
    entry = vendor_directory.get_vendor_by_pan(" tstpa1111a")
    assert entry["pan"] == "TSTPA1111A"
    assert entry["codes"] == {"tstv001": "TSTV001", "tstv002": "TSTV002"}
    assert vendor_directory.get_vendor_by_pan("ZZZZZ9999Z") is None
