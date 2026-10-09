from concurrent.futures import ThreadPoolExecutor
from threading import Event
import os
from uuid import uuid4
import time

import pytest
from fastapi import HTTPException
from sqlalchemy import MetaData, create_engine, update
from sqlalchemy.orm import registry, sessionmaker

from app.models.supplier_otp import SupplierOtpState
from app.services import supplier_otp
from otp_tests.sample_data import make_mobile


@pytest.fixture(params=["sqlite", "mysql"])
def database(request, tmp_path, monkeypatch):
    monkeypatch.setenv("SUPPLIER_OTP_SECRET", "synthetic-delivery-test-secret-" + "x" * 40)
    if request.param == "sqlite":
        engine = create_engine("sqlite:///" + str(tmp_path / "delivery.db"), connect_args={"timeout": 1})
        SupplierOtpState.__table__.create(engine)
        try:
            yield sessionmaker(bind=engine)
        finally:
            engine.dispose()
    else:
        if os.getenv("RUN_MYSQL_OTP_TESTS") != "true":
            pytest.skip("Explicit MySQL regression opt-in required")
        from dotenv import dotenv_values
        url = os.getenv("SUPPLIER_OTP_MYSQL_TEST_URL") or dotenv_values(".env").get("DATABASE_URL")
        if not url or not url.startswith("mysql"):
            pytest.skip("Local MySQL connection not configured")
        engine = create_engine(url)
        # Separate connections must share a table to exercise real MySQL locks.
        # This uniquely named scratch table contains generated test data only.
        table = SupplierOtpState.__table__.to_metadata(MetaData(), name="otp_load_probe_" + uuid4().hex)
        class Probe: pass
        mapper = registry()
        mapper.map_imperatively(Probe, table)
        monkeypatch.setattr(supplier_otp, "SupplierOtpState", Probe)
        table.create(engine)
        try:
            yield sessionmaker(bind=engine)
        finally:
            table.drop(engine)
            mapper.dispose()
            engine.dispose()


def identity(vendor):
    return {"vcode": vendor, "company": "Test", "pan": "-"}


def test_slow_sms_releases_transaction_and_allows_other_vendors(database, monkeypatch):
    entered, release = Event(), Event()
    captured = {}
    slow_phone, fast_phone = make_mobile("slow"), make_mobile("fast")
    class Sender:
        def send(self, phone, code, challenge):
            captured[phone] = (code, challenge)
            if phone == slow_phone:
                entered.set()
                assert release.wait(5)
    monkeypatch.setattr(supplier_otp, "get_sms_sender", lambda: Sender())
    def send(vendor, phone):
        with database() as db:
            return supplier_otp.send_code(db, identity(vendor), phone, "shared-ip")
    with ThreadPoolExecutor(max_workers=2) as executor:
        pending = executor.submit(send, "SLOW", slow_phone)
        try:
            assert entered.wait(3)
            with database() as db:
                state = db.query(supplier_otp.SupplierOtpState).filter_by(challenge=captured[slow_phone][1]).one()
                assert state.identity["delivery_pending"] is True
                with pytest.raises(HTTPException) as error:
                    supplier_otp.verify_code(db, captured[slow_phone][1], captured[slow_phone][0], "shared-ip", slow_phone)
                assert error.value.status_code == 409
            other = executor.submit(send, "FAST", fast_phone)
            assert other.result(timeout=2)["otp_required"] is True
            with database() as db:
                with pytest.raises(HTTPException) as error:
                    supplier_otp.send_code(db, identity("SLOW"), slow_phone, "shared-ip")
                assert error.value.status_code == 429
        finally:
            release.set()
        assert pending.result(timeout=3)["otp_required"] is True
    with database() as db:
        assert supplier_otp.verify_code(db, captured[slow_phone][1], captured[slow_phone][0], "shared-ip", slow_phone) == identity("SLOW")


@pytest.mark.parametrize("fails", [True, False])
def test_late_provider_response_cannot_reactivate_cancelled_code(database, monkeypatch, fails):
    phone = make_mobile("cancelled")
    captured = {}
    class Sender:
        def send(self, phone, code, challenge):
            captured.update(code=code, challenge=challenge)
            with database() as other:
                other.execute(update(supplier_otp.SupplierOtpState).where(supplier_otp.SupplierOtpState.challenge == challenge).values(digest=None))
                other.commit()
            if fails:
                raise RuntimeError("Provider error")
    monkeypatch.setattr(supplier_otp, "get_sms_sender", lambda: Sender())
    with database() as db:
        with pytest.raises(HTTPException) as error:
            supplier_otp.send_code(db, identity("VENDOR"), phone, "shared-ip")
        assert error.value.status_code == (503 if fails else 400)
    with database() as db:
        row = db.query(supplier_otp.SupplierOtpState).filter_by(challenge=captured["challenge"]).one()
        assert row.digest is None and row.sends == 1
        with pytest.raises(HTTPException):
            supplier_otp.verify_code(db, captured["challenge"], captured["code"], "shared-ip", phone)


@pytest.mark.parametrize("fails", [True, False])
def test_old_delivery_result_cannot_overwrite_replacement(database, monkeypatch, fails):
    phone = make_mobile("replacement")
    clock = [time.time()]
    monkeypatch.setattr(supplier_otp.time, "time", lambda: clock[0])
    captured = {}
    class Sender:
        def send(self, phone, code, challenge):
            if captured:
                captured.update(new_code=code, new_challenge=challenge)
                return
            captured.update(old_challenge=challenge)
            clock[0] += supplier_otp.COOLDOWN + 1
            with database() as other:
                captured["replacement"] = supplier_otp.send_code(other, identity("VENDOR"), phone, "shared-ip")
            if fails:
                raise RuntimeError("Old provider request failed")
    monkeypatch.setattr(supplier_otp, "get_sms_sender", lambda: Sender())
    with database() as db:
        with pytest.raises(HTTPException) as error:
            supplier_otp.send_code(db, identity("VENDOR"), phone, "shared-ip")
        assert error.value.status_code == (503 if fails else 400)
    with database() as db:
        assert supplier_otp.verify_code(db, captured["new_challenge"], captured["new_code"], "shared-ip", phone) == identity("VENDOR")
