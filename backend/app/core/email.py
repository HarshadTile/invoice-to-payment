"""Minimal SMTP sender for transactional email (currently just password resets).

Reads SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD / EMAIL_FROM / SMTP_USE_TLS
from backend/.env. If SMTP_HOST isn't set, send_email() logs the message to the
console instead of sending it — so "Forgot password" is still testable on a
machine with no email credentials configured, without a different code path.
"""
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("app.email")

SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
EMAIL_FROM = os.getenv("EMAIL_FROM", SMTP_USER)
EMAIL_FROM_NAME = os.getenv("EMAIL_FROM_NAME", "Invoice to Payment Tracker")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() == "true"


def send_email(to: str, subject: str, text: str, html: str | None = None) -> None:
    """Send a plain-text email, or a plain-text + HTML one when `html` is given (mail
    clients that render HTML show that; anything that can't falls back to `text`)."""
    if not SMTP_HOST:
        logger.info("SMTP not configured — email not sent. To: %s\nSubject: %s\n\n%s", to, subject, text)
        print(f"\n[email not sent — no SMTP_HOST in .env]\nTo: {to}\nSubject: {subject}\n\n{text}\n")
        return

    if html:
        msg = MIMEMultipart("alternative")
        msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))
    else:
        msg = MIMEText(text)

    msg["Subject"] = subject
    msg["From"] = formataddr((EMAIL_FROM_NAME, EMAIL_FROM))
    msg["To"] = to

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
        if SMTP_USE_TLS:
            server.starttls()
        if SMTP_USER and SMTP_PASSWORD:
            server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(EMAIL_FROM, [to], msg.as_string())
