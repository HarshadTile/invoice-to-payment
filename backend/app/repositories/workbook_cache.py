"""Disposable JSON cache of parsed workbook values, never executable pickle data."""
from datetime import date, datetime, time
import gzip
import hashlib
import json
import logging
import os
from pathlib import Path
import tempfile

logger = logging.getLogger(__name__)
CACHE_DIR = Path(__file__).resolve().parents[2] / 'data' / '.invoice-cache'
CACHE_VERSION = 1


def _encode(value):
    for kind, cls in [('datetime', datetime), ('date', date), ('time', time)]:
        if isinstance(value, cls):
            return {'__workbook_type__': kind, 'value': value.isoformat()}
    raise TypeError(f'Unsupported workbook value: {type(value).__name__}')


def _decode(value):
    if set(value) == {'__workbook_type__', 'value'}:
        cls = {'datetime': datetime, 'date': date, 'time': time}.get(value['__workbook_type__'])
        if cls is not None:
            return cls.fromisoformat(value['value'])
    return value


def _fingerprint(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def read_workbook_snapshot(path, sheet, read_rows):
    """A changed/missing/corrupt cache falls back to the original reader.

    The source must exist and its complete content hash must match. Cache only
    source values; current business mapping/status logic still runs on load.
    """
    path = Path(path)
    source_hash = _fingerprint(path)
    identity = hashlib.sha256(f'{path.resolve()}|{sheet}'.encode()).hexdigest()
    cache_path = CACHE_DIR / f'{identity}.json.gz'
    try:
        with gzip.open(cache_path, 'rt', encoding='utf-8') as stream:
            snapshot = json.load(stream, object_hook=_decode)
        if (snapshot.get('version') == CACHE_VERSION and snapshot.get('source_hash') == source_hash
                and isinstance(snapshot.get('rows'), list)
                and all(isinstance(row, dict) for row in snapshot['rows'])):
            return snapshot['rows']
    except (OSError, ValueError, TypeError, AttributeError, EOFError):
        pass

    records = read_rows()
    # Do not publish a snapshot if Excel was saved while it was being parsed.
    if _fingerprint(path) != source_hash:
        raise RuntimeError('Invoice workbook changed during loading; retry after the save finishes')
    temp_path = None
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        handle, filename = tempfile.mkstemp(prefix='workbook-', suffix='.tmp', dir=CACHE_DIR)
        temp_path = Path(filename)
        os.close(handle)
        with gzip.open(temp_path, 'wt', encoding='utf-8', compresslevel=1) as stream:
            stream.write(json.dumps({'version': CACHE_VERSION, 'source_hash': source_hash, 'rows': records},
                                    default=_encode, separators=(',', ':'), ensure_ascii=False))
        os.replace(temp_path, cache_path)
    except (OSError, ValueError, TypeError):
        logger.warning('Invoice disk cache unavailable; using parsed workbook data')
    finally:
        if temp_path is not None:
            try:
                temp_path.unlink(missing_ok=True)
            except OSError:
                logger.warning('Could not remove temporary invoice cache file')
    return records
