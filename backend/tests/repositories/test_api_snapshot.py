"""The on-disk snapshot that lets a restart serve the BigQuery invoices in seconds, and the refresh."""
import gzip
import json

import pytest

from app.repositories import api_snapshot, po_portal_invoice as po, srm_invoice as srm
from app.services import invoice_refresh
from app.services.invoice_index import INDEX_KEY, index_of
from app.services.invoice_query import query_rows


def srm_row(no, **changes):
    return {"VENDOR_INVOICE_NO": no, "SUPPLIER": "V1", "SUPPLIER_NAME": "Supplier One", "PURCHASING_DOCUMENT": "650001",
            "ITEM": "00010", "PRODUCT_TYPE": "S", "STATUS_FLAG": "A", "INVOICE_DATE": "2026-05-10",
            "PAYABLE_AMOUNT": 1000, "CURRENCY": "INR", "APPROVER1": "Asha Rao", **changes}


@pytest.fixture(autouse=True)
def snapshot_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(api_snapshot, "CACHE_DIR", tmp_path)
    return tmp_path


def indexed(rows):
    for row in rows:
        row["OVERALL_STATUS"] = srm.invoice_status(row)
        index_of(row)
    return rows


def test_snapshot_restores_rows_with_the_same_index():
    rows = indexed([srm_row("INV-1"), srm_row("INV-2", UTR_NUMBER="UTR9", CLEARING_DATE="2026-07-01")])
    api_snapshot.save("srm", rows)
    loaded = api_snapshot.load("srm")
    assert [r["VENDOR_INVOICE_NO"] for r in loaded] == ["INV-1", "INV-2"]
    assert loaded[1][INDEX_KEY] == rows[1][INDEX_KEY]  # status, dates, amount, search text all equal
    assert loaded[1][INDEX_KEY].status == "Paid" and "asha rao" in loaded[0][INDEX_KEY].search_internal


def test_a_snapshot_from_other_code_or_a_damaged_file_is_ignored(snapshot_dir, monkeypatch):
    api_snapshot.save("srm", indexed([srm_row("INV-1")]))
    monkeypatch.setattr(api_snapshot, "_code_version", "written-by-older-code")
    assert api_snapshot.load("srm") is None
    monkeypatch.setattr(api_snapshot, "_code_version", None)
    api_snapshot.path_for("srm").write_bytes(b"not a gzip file")
    assert api_snapshot.load("srm") is None
    assert api_snapshot.load("never-saved") is None


def test_api_mode_starts_from_the_snapshot_without_calling_bigquery(monkeypatch):
    api_snapshot.save("srm", indexed([srm_row("INV-SNAP")]))
    monkeypatch.setattr(srm, "_cached_invoices", None)
    monkeypatch.setattr(srm, "use_api", lambda: True)
    monkeypatch.setattr(srm, "fetch_columns", lambda *a: pytest.fail("BigQuery must not be called"))
    rows = srm._load_excel_data()
    assert [r["VENDOR_INVOICE_NO"] for r in rows] == ["INV-SNAP"] and srm.loaded_from_snapshot is True


def test_refresh_swaps_in_fresh_indexed_data_and_saves_it(monkeypatch):
    monkeypatch.setattr(srm, "_cached_invoices", indexed([srm_row("INV-OLD")]))
    monkeypatch.setattr(srm, "loaded_from_snapshot", True)
    monkeypatch.setattr(srm, "fetch_columns", lambda *a: [srm_row("INV-NEW")])
    monkeypatch.setattr(po, "_cached_invoices", [])
    assert [r["VENDOR_INVOICE_NO"] for r in query_rows({"channel": "msetuSrm"}, internal=True)] == ["INV-OLD"]
    rows = srm.refresh_from_api(prepare=invoice_refresh._index_all)
    assert INDEX_KEY in rows[0]  # indexed before the swap, so no request waits for it
    assert srm.loaded_from_snapshot is False
    # results cached for the old rows are not served for the new ones
    assert [r["VENDOR_INVOICE_NO"] for r in query_rows({"channel": "msetuSrm"}, internal=True)] == ["INV-NEW"]


def test_a_failed_refresh_keeps_the_loaded_data(monkeypatch):
    old = indexed([srm_row("INV-OLD")])
    monkeypatch.setattr(srm, "_cached_invoices", old)
    monkeypatch.setattr(po, "_cached_invoices", [])

    def fail(*args):
        raise RuntimeError("BigQuery unreachable")
    monkeypatch.setattr(srm, "fetch_columns", fail)
    monkeypatch.setattr(po, "fetch_columns", fail)
    invoice_refresh.refresh_all()  # logs, never raises
    assert srm._cached_invoices is old


def test_saved_snapshot_is_plain_json(snapshot_dir):
    api_snapshot.save("srm", indexed([srm_row("INV-1")]))
    with gzip.open(api_snapshot.path_for("srm"), "rt", encoding="utf-8") as stream:
        payload = json.load(stream)
    assert set(payload) == {"code", "saved_at", "rows", "index"} and INDEX_KEY not in payload["rows"][0]


def test_temp_files_left_by_a_stopped_server_are_cleaned_up(snapshot_dir):
    import os
    import time
    abandoned = snapshot_dir / "bigquery-srm-abandoned.tmp"
    in_progress = snapshot_dir / "bigquery-srm-writing-now.tmp"  # another server, mid-write
    abandoned.write_text("x"), in_progress.write_text("x")
    old = time.time() - 3600
    os.utime(abandoned, (old, old))
    api_snapshot.save("srm", indexed([srm_row("INV-1")]))
    assert not abandoned.exists() and in_progress.exists()
