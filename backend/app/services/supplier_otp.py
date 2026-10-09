import hashlib
import hmac
import os
import secrets
import time

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError, OperationalError

from app.models.supplier_otp import SupplierOtpState
from app.services.supplier_sms import get_sms_sender

TTL = 300
WINDOW = 900
COOLDOWN = 60


def mobile_auth_enabled():
    value = os.getenv("SUPPLIER_MOBILE_AUTH", "false").lower().strip()
    if value not in {"true", "false"}:
        raise HTTPException(503, "Supplier authentication configuration is invalid.")
    if value == "true":
        from app.core.security import SECRET_KEY
        if len(SECRET_KEY) < 32 or SECRET_KEY == "SUPER_SECRET_KEY_REPLACE_IN_PRODUCTION":
            raise HTTPException(503, "A secure JWT_SECRET_KEY is required for supplier OTP authentication.")
    return value == "true"


def _hash(value):
    secret = os.getenv("SUPPLIER_OTP_SECRET", "")
    if len(secret) < 32:
        raise HTTPException(503, "Supplier OTP secret is not configured.")
    return hmac.new(secret.encode(), value.encode(), hashlib.sha256).hexdigest()


def _locked(db, key, now):
    # An UPDATE acquires a write lock on both MySQL and SQLite, including tests.
    try:
        db.execute(update(SupplierOtpState).where(SupplierOtpState.key == key).values(key=key))
        row = db.query(SupplierOtpState).filter_by(key=key).with_for_update().populate_existing().first()
        if row is None:
            row = SupplierOtpState(key=key, window_start=now)
            db.add(row)
            db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(429, "Concurrent login request. Please try again.") from None
    except OperationalError as error:
        db.rollback()
        db_code = error.orig.args[0] if getattr(error.orig, "args", None) else None
        if db_code in (1205, 1213) or "database is locked" in str(error.orig).lower():
            raise HTTPException(429, "Login is busy. Please try again.") from None
        raise
    if now - row.window_start >= WINDOW:
        row.window_start, row.sends, row.attempts = now, 0, 0
    return row


def send_code(db, identity, phone, client_ip, previous=None):
    sender = get_sms_sender()
    now = time.time()
    ip = _locked(db, _hash("ip:" + client_ip), now)
    row = _locked(db, _hash("vendor:" + identity["vcode"].lower()), now)
    if previous and (row.challenge != previous or not row.digest):
        raise HTTPException(400, "Login request expired. Please start again.")
    if row.attempts >= 5 or row.sends >= 5 or ip.sends >= 20 or now - row.last_send < COOLDOWN:
        raise HTTPException(429, "Too many requests. Please wait before trying again.")
    ip.sends += 1
    row.sends += 1
    row.last_send = now
    row.challenge = secrets.token_urlsafe(32)
    code = f"{secrets.randbelow(1000000):06d}"
    row.digest = _hash(row.challenge + ":" + code)
    row.expires = now + TTL
    bound_identity = {key: identity[key] for key in ("vcode", "company", "pan")}
    bound_identity["phone_binding"] = _hash("phone:" + phone)
    row.identity = {**bound_identity, "delivery_pending": True}
    challenge = row.challenge
    digest = row.digest
    # Reserve quota and an inactive challenge, then release database locks and
    # the connection before the network request. Other vendors can proceed.
    db.commit()
    try:
        sender.send(phone, code, challenge)
    except Exception:
        db.execute(update(SupplierOtpState).where(
            SupplierOtpState.challenge == challenge,
            SupplierOtpState.digest == digest,
        ).values(digest=None, expires=0))
        db.commit()  # Failed delivery still consumes the reserved quota.
        raise HTTPException(503, "SMS delivery failed. Please try again later.") from None
    # A cancelled or superseded send must never reactivate its old challenge.
    result = db.execute(update(SupplierOtpState).where(
        SupplierOtpState.challenge == challenge,
        SupplierOtpState.digest == digest,
    ).values(identity=bound_identity, expires=time.time() + TTL))
    db.commit()
    if result.rowcount != 1:
        raise HTTPException(400, "Login request was cancelled or replaced. Please start again.")
    return {"otp_required": True, "challenge_id": challenge, "phone_last4": phone[-4:],
            "expires_in": TTL, "resend_after": COOLDOWN}


def challenge_identity(db, challenge):
    row = db.query(SupplierOtpState).filter_by(challenge=challenge).first()
    if not row or not row.digest:
        raise HTTPException(400, "Login request expired. Please start again.")
    if (row.identity or {}).get("delivery_pending"):
        raise HTTPException(409, "Code delivery is still in progress. Please wait.")
    return {key: row.identity[key] for key in ("vcode", "company", "pan")}


def verify_code(db, challenge, code, client_ip, phone):
    identity = challenge_identity(db, challenge)
    now = time.time()
    ip = _locked(db, _hash("ip:" + client_ip), now)
    row = _locked(db, _hash("vendor:" + identity["vcode"].lower()), now)
    if row.challenge != challenge or not row.digest or row.expires <= now:
        raise HTTPException(400, "Code expired or already used. Please start again.")
    if not hmac.compare_digest((row.identity or {}).get("phone_binding", ""), _hash("phone:" + phone)):
        row.digest = None
        db.commit()
        raise HTTPException(400, "Registered mobile number changed. Please start again.")
    if row.attempts >= 5 or ip.attempts >= 50:
        raise HTTPException(429, "Too many verification attempts. Please try again later.")
    row.attempts += 1
    ip.attempts += 1
    valid = hmac.compare_digest(row.digest, _hash(challenge + ":" + code))
    if valid or row.attempts >= 5:
        row.digest = None
    db.commit()
    if not valid:
        raise HTTPException(400, "Incorrect code. Please try again.")
    return identity
