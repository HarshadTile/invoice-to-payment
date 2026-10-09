import importlib.util
import os
import time
from pathlib import Path
from uuid import uuid4

import pytest

from otp_tests.sample_data import make_mobile
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import Double, create_engine, inspect, text
from sqlalchemy.dialects import mysql

from app.models.supplier_otp import SupplierOtpState


def test_timestamps_compile_to_mysql_double():
    for name in ("window_start", "last_send", "expires"):
        assert SupplierOtpState.__table__.c[name].type.compile(dialect=mysql.dialect()) == "DOUBLE"


def test_precision_migration_preserves_quotas_and_invalidates_old_codes():
    path = Path(__file__).parents[1] / "alembic/versions/d9f0a1b2c347_otp_timestamp_precision.py"
    spec = importlib.util.spec_from_file_location("precision_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    SupplierOtpState.__table__.create(engine)
    with engine.begin() as connection:
        connection.execute(text(
            "INSERT INTO supplier_otp_states (key, window_start, sends, attempts, last_send, "
            "challenge, digest, expires) VALUES ('test', :epoch, 2, 3, :epoch, "
            "'old-challenge', 'old-digest', :epoch)"
        ), {"epoch": 1_791_530_000})
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        row = connection.execute(text("SELECT * FROM supplier_otp_states")).mappings().one()
        assert row["challenge"] is None and row["digest"] is None
        assert row["sends"] == 2 and row["attempts"] == 3
        assert row["expires"] == 0
        columns = {column["name"]: column["type"] for column in inspect(connection).get_columns("supplier_otp_states")}
        assert all(isinstance(columns[name], Double) for name in ("window_start", "last_send", "expires"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
    engine.dispose()


@pytest.mark.skipif(os.getenv("RUN_MYSQL_OTP_TESTS") != "true", reason="Explicit MySQL regression opt-in required")
def test_mysql_roundtrip_expiry_and_single_use(monkeypatch):
    from dotenv import dotenv_values
    from fastapi import HTTPException
    from sqlalchemy import MetaData
    from sqlalchemy.orm import Session, registry
    from app.services import supplier_otp

    url = os.getenv("SUPPLIER_OTP_MYSQL_TEST_URL") or dotenv_values(".env").get("DATABASE_URL")
    if not url or not url.startswith("mysql"):
        pytest.skip("Local backend .env does not configure MySQL")
    engine = create_engine(url)
    probe_table = SupplierOtpState.__table__.to_metadata(MetaData(), name="otp_precision_probe_" + uuid4().hex)
    probe_table._prefixes.append("TEMPORARY")
    class Probe: pass
    mapper = registry()
    mapper.map_imperatively(Probe, probe_table)
    clock = [time.time()]
    captured = {}
    class FakeSender:
        def send(self, phone, code, challenge):
            captured[challenge] = code
    monkeypatch.setattr(supplier_otp, "SupplierOtpState", Probe)
    monkeypatch.setattr(supplier_otp, "get_sms_sender", lambda: FakeSender())
    monkeypatch.setattr(supplier_otp.time, "time", lambda: clock[0])
    monkeypatch.setenv("SUPPLIER_OTP_SECRET", "synthetic-test-secret-" + "x" * 40)
    identity = {"vcode": "synthetic-probe", "company": "Test", "pan": "-"}
    try:
        with engine.connect() as connection:
            probe_table.create(connection)
            connection.commit()
            try:
                with Session(bind=connection) as db:
                    first = supplier_otp.send_code(db, identity, make_mobile("old-phone"), "synthetic-ip")
                    challenge = first["challenge_id"]
                    row = db.query(Probe).filter_by(challenge=challenge).one()
                    assert abs(row.expires - clock[0] - 300) < 0.00001
                    assert abs(row.last_send - clock[0]) < 0.00001
                    clock[0] += 39
                    assert supplier_otp.verify_code(db, challenge, captured[challenge], "synthetic-ip", make_mobile("old-phone")) == identity
                    with pytest.raises(HTTPException):
                        supplier_otp.verify_code(db, challenge, captured[challenge], "synthetic-ip", make_mobile("old-phone"))
                    clock[0] += 61
                    second = supplier_otp.send_code(db, identity, make_mobile("old-phone"), "synthetic-ip")
                    clock[0] += 301
                    with pytest.raises(HTTPException):
                        supplier_otp.verify_code(db, second["challenge_id"], captured[second["challenge_id"]], "synthetic-ip", make_mobile("old-phone"))
            finally:
                probe_table.drop(connection)
                connection.commit()
    finally:
        mapper.dispose()
        engine.dispose()
