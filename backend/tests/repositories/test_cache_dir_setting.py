"""INVOICE_CACHE_DIR moves the saved invoice data (on Cloud Run: to a mounted bucket that survives restarts).
Checked in a fresh Python process, because the folder is fixed when the modules are first imported."""
import os
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
PRINT_PATHS = ("from app.repositories import api_snapshot, workbook_cache; "
               "print(workbook_cache.CACHE_DIR); print(api_snapshot.path_for('srm'))")


def _paths(**env):
    run_env = {**os.environ, **env}
    if "INVOICE_CACHE_DIR" not in env:
        run_env.pop("INVOICE_CACHE_DIR", None)
    out = subprocess.run([sys.executable, "-c", PRINT_PATHS], cwd=BACKEND, env=run_env,
                         capture_output=True, text=True, check=True).stdout.split("\n")
    return Path(out[0].strip()), Path(out[1].strip())


def test_default_is_the_folder_next_to_the_code():
    cache_dir, snapshot = _paths()
    assert cache_dir == BACKEND / "data" / ".invoice-cache"
    assert snapshot == cache_dir / "bigquery-srm.json.gz"


def test_setting_moves_the_snapshot(tmp_path):
    cache_dir, snapshot = _paths(INVOICE_CACHE_DIR=str(tmp_path / "bucket" / "invoice-cache"))
    assert cache_dir == tmp_path / "bucket" / "invoice-cache"
    assert snapshot == cache_dir / "bigquery-srm.json.gz"
