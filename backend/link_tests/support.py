"""Explicit pytest plugin: temporary SQLite only, never the configured application DB.

Run with --noconftest -p link_tests.support to bypass the legacy MySQL
conftest, which drops a fixed database name during collection.
"""
import os
from pathlib import Path
from tempfile import TemporaryDirectory

_scratch = TemporaryDirectory(prefix="i2p-manual-links-tests-")
os.environ["DATABASE_URL"] = "sqlite:///" + (Path(_scratch.name) / "tests.db").as_posix()
os.environ["DISABLE_TICKET_JOBS"] = "true"
os.environ["SMTP_HOST"] = ""
os.environ["I2P_LINK_TEST_ISOLATED"] = "1"
os.environ["FRONTEND_URL"] = "http://192.168.1.10:5173"

from app.core.database import Base, engine
from app.models import *  # noqa: F403 - register all models in test metadata
from app.models.settings import AppSettings, TableRow
from app.models.sync_log import SyncLog
from sqlalchemy import event


@event.listens_for(engine, 'connect')
def enable_foreign_keys(connection, _record):
    # Match MySQL cascade behavior when tests delete a supplier with code/token rows.
    connection.execute('PRAGMA foreign_keys=ON')

Base.metadata.create_all(engine)


def pytest_unconfigure(config):
    engine.dispose()
    _scratch.cleanup()
