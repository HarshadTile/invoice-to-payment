import logging
import os
import threading
from datetime import datetime, timedelta

from sqlalchemy.exc import IntegrityError

from app.core.database import SessionLocal
from app.models.ticket import Ticket
from app.models.ticket_activity import Notification, TicketJobRun
from app.repositories import ticket_repository
from app.services import notification_service, sla_service


logger = logging.getLogger(__name__)
AUTO_CLOSE_DAYS = int(os.getenv("AUTO_CLOSE_DAYS", "5"))
_stop_event = threading.Event()
_worker = None


def _claim(db, ticket_id: str, event: str) -> bool:
    try:
        db.add(TicketJobRun(ticket_id=ticket_id, event=event))
        db.flush()
        return True
    except IntegrityError:
        db.rollback()
        return False


def scan_sla_breaches() -> int:
    db = SessionLocal()
    count = 0
    try:
        tickets = db.query(Ticket).filter(
            Ticket.legacy_unlinked.is_(False),
            Ticket.awaiting == "STAFF",
            Ticket.status.in_(("OPEN", "IN_PROGRESS")),
            Ticket.response_due_at < datetime.utcnow(),
        ).all()
        for ticket in tickets:
            if not _claim(db, ticket.id, "SLA_BREACHED"):
                continue
            ticket_repository.add_activity(db, ticket.id, None, "SLA_BREACHED")
            if ticket.assignee_id:
                notification_service.add_for_user(db, ticket.assignee_id, ticket.id, "SLA_BREACHED")
            notification_service.add_for_oversight_team(
                db,
                ticket.channel,
                ticket.id,
                "SLA_BREACHED",
                exclude_user_ids={ticket.assignee_id} if ticket.assignee_id else None,
            )
            db.commit()
            count += 1
        return count
    finally:
        db.close()


def auto_close_resolved() -> int:
    db = SessionLocal()
    count = 0
    try:
        cutoff = datetime.utcnow() - timedelta(days=AUTO_CLOSE_DAYS)
        tickets = db.query(Ticket).filter(
            Ticket.legacy_unlinked.is_(False),
            Ticket.status == "RESOLVED",
            Ticket.resolved_at < cutoff,
        ).all()
        for ticket in tickets:
            if not _claim(db, ticket.id, "AUTO_CLOSED"):
                continue
            for key, value in sla_service.closed().items():
                setattr(ticket, key, value)
            ticket.row_version += 1
            ticket_repository.add_activity(db, ticket.id, None, "AUTO_CLOSED")
            notification_service.add_for_supplier(db, ticket.vendor_code, ticket.id, "TICKET_AUTO_CLOSED")
            if ticket.assignee_id:
                notification_service.add_for_user(db, ticket.assignee_id, ticket.id, "TICKET_AUTO_CLOSED")
            db.commit()
            count += 1
        return count
    finally:
        db.close()


def send_notification_emails() -> int:
    db = SessionLocal()
    count = 0
    try:
        rows = (
            db.query(Notification)
            .outerjoin(Ticket, Ticket.id == Notification.ticket_id)
            .filter(
                Notification.emailed_at.is_(None),
                (Notification.ticket_id.is_(None)) | (Ticket.legacy_unlinked.is_(False)),
            )
            .limit(100)
            .all()
        )
        for notification in rows:
            logger.info("email notification type=%s ticket_id=%s recipient=%s", notification.type, notification.ticket_id, notification.recipient_key or notification.user_id)
            notification.emailed_at = datetime.utcnow()
            count += 1
        db.commit()
        return count
    finally:
        db.close()


def _loop():
    minute = 0
    while not _stop_event.wait(60):
        minute += 1
        try:
            send_notification_emails()
            if minute % 5 == 0:
                scan_sla_breaches()
            if minute % 60 == 0:
                auto_close_resolved()
        except Exception:
            logger.exception("Inquiry Desk background job failed")


def start_jobs():
    global _worker
    if os.getenv("DISABLE_TICKET_JOBS", "").lower() in ("1", "true", "yes"):
        return
    if _worker and _worker.is_alive():
        return
    _stop_event.clear()
    _worker = threading.Thread(target=_loop, name="ticket-jobs", daemon=True)
    _worker.start()


def stop_jobs():
    _stop_event.set()
