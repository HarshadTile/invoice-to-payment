"""Minimal SMTP sender for transactional account email.

Reads SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD / EMAIL_FROM / SMTP_USE_TLS
from backend/.env. If SMTP_HOST isn't set, send_email() logs the message to the
console instead of sending it — so "Forgot password" is still testable on a
machine with no email credentials configured, without a different code path.
"""
import logging
import os
import queue
import smtplib
import threading
import time
from pathlib import Path
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr

from dotenv import load_dotenv

BACKEND_ENV = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=BACKEND_ENV)

logger = logging.getLogger("app.email")

SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = (os.getenv("SMTP_USER") or "").strip() or None
# Google displays app passwords in four-character groups; remove display spaces
# before SMTP AUTH while leaving other providers' password characters intact.
SMTP_PASSWORD = (os.getenv("SMTP_PASSWORD") or "").replace(" ", "") or None
EMAIL_FROM = (os.getenv("EMAIL_FROM") or SMTP_USER or "").strip()
EMAIL_FROM_NAME = os.getenv("EMAIL_FROM_NAME", "Invoice to Payment Tracker")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() == "true"


def is_configured() -> bool:
    return bool(SMTP_HOST)


def _build_message(to: str, subject: str, text: str, html: str | None):
    if html:
        msg = MIMEMultipart("alternative")
        msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))
    else:
        msg = MIMEText(text)
    msg["Subject"] = subject
    msg["From"] = formataddr((EMAIL_FROM_NAME, EMAIL_FROM))
    msg["To"] = to
    return msg


def _connect() -> smtplib.SMTP:
    server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15)
    if SMTP_USE_TLS:
        server.starttls()
    if SMTP_USER and SMTP_PASSWORD:
        server.login(SMTP_USER, SMTP_PASSWORD)
    return server


# Sending takes seconds (most of it the TLS handshake and login), so it never happens while a
# request waits: messages go on a queue and one background thread sends them, keeping the
# connection open for a short while so a burst of emails pays the setup cost once.
_IDLE_SECONDS = 30
_queue: "queue.Queue[tuple[str, str, object]]" = queue.Queue()
_worker_lock = threading.Lock()
_worker: threading.Thread | None = None


def _send_loop() -> None:
    server = None
    while True:
        try:
            to, subject, msg = _queue.get(timeout=_IDLE_SECONDS if server else None)
        except queue.Empty:
            try:
                server.quit()
            except Exception:
                pass
            server = None
            continue
        for attempt in (1, 2):  # a connection the server has closed is reopened once
            try:
                if server is None:
                    server = _connect()
                server.sendmail(EMAIL_FROM, [to], msg.as_string())
                logger.info("Email sent to %s: %s", to, subject)
                break
            except Exception:
                try:
                    if server is not None:
                        server.close()
                except Exception:
                    pass
                server = None
                if attempt == 2:
                    logger.exception("Could not send email to %s: %s", to, subject)
        _queue.task_done()


def _ensure_worker() -> None:
    global _worker
    with _worker_lock:
        if _worker is None or not _worker.is_alive():
            _worker = threading.Thread(target=_send_loop, name="email-sender", daemon=True)
            _worker.start()


def send_email(to: str, subject: str, text: str, html: str | None = None) -> None:
    """Queue a plain-text email, or a plain-text + HTML one when `html` is given (mail
    clients that render HTML show that; anything that can't falls back to `text`). Returns at
    once; the email is sent in the background and a failure is logged."""
    if not SMTP_HOST:
        logger.info("SMTP not configured — email not sent. To: %s\nSubject: %s\n\n%s", to, subject, text)
        print(f"\n[email not sent — no SMTP_HOST in .env]\nTo: {to}\nSubject: {subject}\n\n{text}\n")
        return
    _ensure_worker()
    _queue.put((to, subject, _build_message(to, subject, text, html)))


def wait_for_outgoing_email(timeout: float = 30) -> None:
    """Block until queued emails are sent (for scripts and shutdown)."""
    deadline = time.monotonic() + timeout
    while _queue.unfinished_tasks and time.monotonic() < deadline:
        time.sleep(0.05)
