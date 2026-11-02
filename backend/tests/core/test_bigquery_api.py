import json
import re
from pathlib import Path

import httpx
import pytest

from app.core import bigquery_api as bq
from app.repositories import po_portal_invoice as po, srm_invoice as srm

TOKEN = "test-token-123"


@pytest.fixture(autouse=True)
def token(monkeypatch):
    monkeypatch.setenv("BIGQUERY_API_TOKEN", TOKEN)


def fake_client(handler):
    """An httpx client whose 'network' is `handler`, so no request leaves the machine."""
    return httpx.Client(base_url="https://bq.test", transport=httpx.MockTransport(handler),
                        headers={"Authorization": f"Bearer {TOKEN}"})


def test_run_sql_posts_query_with_bearer_token():
    seen = {}

    def handler(request):
        seen.update(path=request.url.path, auth=request.headers["Authorization"], body=json.loads(request.content))
        return httpx.Response(200, json={"data": [{"n": 1}], "row_count": 1})

    assert bq.run_sql("SELECT 1 AS n", client=fake_client(handler)) == [{"n": 1}]
    assert seen == {"path": "/query/sql", "auth": f"Bearer {TOKEN}", "body": {"sql": "SELECT 1 AS n"}}


def test_fetch_columns_pages_in_a_fixed_order(monkeypatch):
    monkeypatch.setattr(bq, "PAGE_SIZE", 2)
    table = [{"A": str(i), "B": "x"} for i in range(5)]
    queries = []

    def handler(request):
        sql = json.loads(request.content)["sql"]
        queries.append(sql)
        if sql.startswith("SELECT COUNT(*)"):
            return httpx.Response(200, json={"data": [{"n": len(table)}]})
        offset = int(re.search(r"OFFSET (\d+)", sql).group(1))
        return httpx.Response(200, json={"data": table[offset:offset + 2]})

    rows = bq.fetch_columns("tbl_x", ("A", "B"), client=fake_client(handler))

    assert rows == table
    pages = [q for q in queries if "OFFSET" in q]
    assert sorted(pages) == [f"SELECT A, B FROM tbl_x ORDER BY A, B LIMIT 2 OFFSET {n}" for n in (0, 2, 4)]


@pytest.mark.parametrize("table,columns", [("tbl; DROP TABLE x", ("A",)), ("tbl_x", ("A", "B FROM other"))])
def test_unsafe_identifiers_are_rejected_before_any_request(table, columns):
    def handler(request):
        raise AssertionError("no request may be sent")

    with pytest.raises(ValueError, match="Unsafe SQL identifier"):
        bq.fetch_columns(table, columns, client=fake_client(handler))


def test_http_error_never_exposes_the_token():
    def handler(request):
        return httpx.Response(401, json={"detail": f"invalid token {TOKEN}"})

    with pytest.raises(bq.InvoiceSourceError) as error:
        bq.run_sql("SELECT 1", client=fake_client(handler))
    assert "HTTP 401" in str(error.value)
    assert TOKEN not in str(error.value)


def test_unreachable_api_raises_source_error():
    def handler(request):
        raise httpx.ConnectError("boom", request=request)

    with pytest.raises(bq.InvoiceSourceError, match="unreachable"):
        bq.run_sql("SELECT 1", client=fake_client(handler))


def test_row_count_change_mid_load_is_an_error(monkeypatch):
    monkeypatch.setattr(bq, "PAGE_SIZE", 10)

    def handler(request):
        sql = json.loads(request.content)["sql"]
        return httpx.Response(200, json={"data": [{"n": 3}] if "COUNT" in sql else [{"A": "1"}]})

    with pytest.raises(bq.InvoiceSourceError, match="expected 3 rows, received 1"):
        bq.fetch_columns("tbl_x", ("A",), client=fake_client(handler))


def test_missing_token_is_reported(monkeypatch):
    monkeypatch.delenv("BIGQUERY_API_TOKEN")
    with pytest.raises(bq.InvoiceSourceError, match="BIGQUERY_API_TOKEN"):
        bq.make_client()


# --- the column lists must cover every source column the code reads ---

READ_KEY = re.compile(r"""(?:\.get\(|text\(|date\(|upper\(row,\s*)['"]([A-Za-z0-9_]+)['"]""")
APP = Path(__file__).resolve().parents[2] / "app"
# Keys the code adds itself, or aliases that only exist in other sources.
DERIVED = {"__channel", "__source_id", "OVERALL_STATUS", "VENDOR_INVOICE_NO", "PURCHASING_DOCUMENT", "ITEM",
           "PRODUCT_TYPE", "INVOICE_DATE", "INVOICE_UPLOAD_DATE", "POSTING_DATE", "PENDING_WITH", "NETDT"}


def keys_read(*files):
    return {key for name in files for key in READ_KEY.findall((APP / name).read_text(encoding="utf-8"))}


def test_po_portal_columns_cover_every_key_the_po_code_reads():
    used = keys_read("repositories/po_portal_invoice.py", "services/po_portal_invoice_service.py")
    assert used - DERIVED - set(po.PO_PORTAL_COLUMNS) == set()
    assert po.REQUIRED_COLUMNS <= set(po.PO_PORTAL_COLUMNS)


def test_srm_columns_cover_every_key_the_srm_code_reads():
    used = keys_read("services/invoice_service.py") | {f"APPROVER{i}" for i in range(1, 8)}
    assert used - DERIVED - set(srm.SRM_COLUMNS) == set()


# --- api mode feeds the same normalisation as the files ---

def test_po_portal_api_mode_normalises_rows(monkeypatch):
    raw = {column: "" for column in po.PO_PORTAL_COLUMNS}
    raw.update(Reference="INV-1", Purchasing_Document="650001", Item="10", SUPPLIER="V1",
               Invoice_Uploaded="YES", PAYABLE_AMOUNT=1250, Parking_Date="0000-00-00")
    calls = []
    monkeypatch.setattr(po, "_cached_invoices", None)
    monkeypatch.setattr(po, "use_api", lambda: True)
    monkeypatch.setattr(po.api_snapshot, "load", lambda name: None)  # never a snapshot left on this machine
    monkeypatch.setattr(po, "fetch_columns", lambda table, columns: calls.append((table, columns)) or [raw])

    rows = po.get_all_cached_invoices()

    assert calls == [("tbl_dw_inv_paymt_PO_PORTAL", po.PO_PORTAL_COLUMNS)]
    assert rows[0]["VENDOR_INVOICE_NO"] == "INV-1" and rows[0]["__source_id"].startswith("poPortal:")
    assert po.date_value(rows[0]["Parking_Date"]) is None  # BigQuery's blank date


def test_srm_api_mode_reads_bigquery_not_the_workbook(monkeypatch):
    monkeypatch.setattr(srm, "_cached_invoices", None)
    monkeypatch.setattr(srm, "use_api", lambda: True)
    monkeypatch.setattr(srm.api_snapshot, "load", lambda name: None)  # never a snapshot left on this machine
    monkeypatch.setattr(srm, "fetch_columns", lambda table, columns: [{"VENDOR_INVOICE_NO": "S1", "STATUS_FLAG": "A"}])
    monkeypatch.setattr(srm, "read_workbook_snapshot", lambda *a: pytest.fail("workbook must not be read"))

    rows = srm._load_excel_data()

    assert rows[0]["OVERALL_STATUS"] == "Approved"
