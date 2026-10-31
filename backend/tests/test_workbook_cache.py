from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time
from threading import Event
from unittest.mock import Mock

import pytest

from app.repositories import workbook_cache as cache, gcp_invoice as source


@pytest.fixture
def snapshot(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, 'CACHE_DIR', tmp_path / 'cache')
    path = tmp_path / 'source.xlsx'
    path.write_bytes(b'workbook-v1')
    return path


def test_disk_snapshot_avoids_reparse_and_preserves_source_types(snapshot):
    rows = [{'zero': 0, 'missing': None, 'text': '00010', 'flag': False,
             'date': date(2026, 10, 30), 'datetime': datetime(2026, 10, 30, 8, 9), 'time': time(8, 9),
             'amount': 123.45, 'unicode': 'Supplier ₹'}]
    reader = Mock(return_value=rows)
    assert cache.read_workbook_snapshot(snapshot, 'in', reader) == rows
    assert cache.read_workbook_snapshot(snapshot, 'in', reader) == rows
    reader.assert_called_once()


def test_content_change_invalidates_even_with_same_file_size(snapshot):
    reader = Mock(side_effect=[[{'value': 1}], [{'value': 2}]])
    cache.read_workbook_snapshot(snapshot, 'in', reader)
    snapshot.write_bytes(b'workbook-v2')
    assert cache.read_workbook_snapshot(snapshot, 'in', reader) == [{'value': 2}]
    assert reader.call_count == 2


def test_sheet_and_source_path_do_not_share_snapshots(snapshot):
    first = Mock(return_value=[{'value': 1}])
    second = Mock(return_value=[{'value': 2}])
    cache.read_workbook_snapshot(snapshot, 'in', first)
    assert cache.read_workbook_snapshot(snapshot, 'other', second) == [{'value': 2}]
    other = snapshot.with_name('another.xlsx')
    other.write_bytes(snapshot.read_bytes())
    assert cache.read_workbook_snapshot(other, 'in', second) == [{'value': 2}]
    assert second.call_count == 2


def test_corrupt_disk_cache_falls_back_to_excel(snapshot):
    reader = Mock(return_value=[{'value': 1}])
    cache.read_workbook_snapshot(snapshot, 'in', reader)
    next(cache.CACHE_DIR.glob('*.json.gz')).write_bytes(b'incomplete file')
    assert cache.read_workbook_snapshot(snapshot, 'in', reader) == [{'value': 1}]
    assert reader.call_count == 2


def test_read_only_cache_location_does_not_stop_loading(snapshot, monkeypatch):
    blocked = snapshot.parent / 'not-a-directory'
    blocked.write_text('file')
    monkeypatch.setattr(cache, 'CACHE_DIR', blocked)
    assert cache.read_workbook_snapshot(snapshot, 'in', lambda: [{'value': 1}]) == [{'value': 1}]


def test_missing_source_never_returns_a_stale_snapshot(snapshot):
    cache.read_workbook_snapshot(snapshot, 'in', lambda: [{'value': 1}])
    snapshot.unlink()
    with pytest.raises(FileNotFoundError):
        cache.read_workbook_snapshot(snapshot, 'in', lambda: [])


def test_source_saved_during_parse_does_not_publish_cache(snapshot):
    def changed():
        snapshot.write_bytes(b'workbook-v2')
        return [{'value': 1}]
    with pytest.raises(RuntimeError, match='changed during loading'):
        cache.read_workbook_snapshot(snapshot, 'in', changed)
    assert not cache.CACHE_DIR.exists()


def test_concurrent_first_requests_only_load_once(monkeypatch):
    started, release = Event(), Event()
    rows = [{'VENDOR_INVOICE_NO': 'A', 'STATUS_FLAG': 'A'}]
    def load(*_args):
        started.set()
        assert release.wait(5)
        return rows
    reader = Mock(side_effect=load)
    monkeypatch.setattr(source, '_cached_invoices', None)
    monkeypatch.setattr(source, 'read_workbook_snapshot', reader)
    with ThreadPoolExecutor(max_workers=4) as pool:
        tasks = [pool.submit(source.get_all_cached_invoices) for _ in range(4)]
        assert started.wait(5)
        release.set()
        assert all(task.result() is rows for task in tasks)
    reader.assert_called_once()


def test_fast_unfiltered_result_does_not_mutate_source_or_bypass_empty_vendor_scope(monkeypatch):
    rows = [{'VENDOR_INVOICE_NO': 'A', 'SUPPLIER': 'V1'}, {'VENDOR_INVOICE_NO': 'B', 'SUPPLIER': 'V2'}]
    monkeypatch.setattr(source, '_cached_invoices', rows)
    result = source.filter_invoices()
    result.reverse()
    assert rows[0]['VENDOR_INVOICE_NO'] == 'A'
    assert source.filter_invoices(vendor_codes=[]) == []
    assert source.filter_invoices(vendor_codes=['V1']) == [rows[0]]
    assert source.filter_invoices(invoice_uploaded=False) == rows


def test_large_invoice_responses_are_compressed_without_changing_data(monkeypatch):
    from fastapi.testclient import TestClient
    from app.core.security import create_access_token
    from app.main import app
    monkeypatch.setattr(source, '_cached_invoices', [
        {'VENDOR_INVOICE_NO': f'INV/{i}', 'SUPPLIER': 'V1', 'STATUS_FLAG': 'A'} for i in range(100)
    ])
    headers = {'Authorization': 'Bearer ' + create_access_token(subject='1', auth_type='internal', scope={'channelScope': 'all'})}
    client = TestClient(app)
    compressed = client.get('/api/v1/invoices/list-invoices?page_size=100', headers={**headers, 'Accept-Encoding': 'gzip'})
    plain = client.get('/api/v1/invoices/list-invoices?page_size=100', headers={**headers, 'Accept-Encoding': 'identity'})
    assert compressed.status_code == plain.status_code == 200
    assert compressed.headers['content-encoding'] == 'gzip'
    assert compressed.json() == plain.json()
    assert int(compressed.headers['content-length']) < len(plain.content)
