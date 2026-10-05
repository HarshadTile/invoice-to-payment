import os

os.environ["DATABASE_URL"] = "mysql+pymysql://root:root@localhost:3306/mahindra_i2p_test"
os.environ["DISABLE_TICKET_JOBS"] = "true"

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text


admin_engine = create_engine("mysql+pymysql://root:root@localhost:3306/mysql")
with admin_engine.begin() as connection:
    connection.execute(text("CREATE DATABASE IF NOT EXISTS mahindra_i2p_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))

config = Config("alembic.ini")
config.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])
command.upgrade(config, "head")

from app.core.database import SessionLocal
from app.core.security import get_password_hash
from app.models.ticket import Ticket, TicketComment
from app.models.ticket_activity import (
    Notification,
    SlaPolicy,
    TicketActivity,
    TicketAttachment,
    TicketIdempotency,
    TicketJobRun,
    TicketRead,
)
from app.models.user import User, UserChannelAccess


@pytest.fixture(autouse=True)
def clean_ticket_database():
    db = SessionLocal()
    for model in (
        TicketJobRun,
        TicketIdempotency,
        TicketRead,
        Notification,
        TicketAttachment,
        TicketActivity,
        TicketComment,
        Ticket,
        UserChannelAccess,
        User,
    ):
        db.query(model).delete()

    admin = User(
        username="admin",
        password_hash=get_password_hash("admin123"),
        name="Ravi Kulkarni",
        email="admin@example.com",
        role="Admin",
        ticket_role="ADMIN",
        dept="Procurement",
        title="Admin",
        status="Active",
    )
    lead = User(
        username="lead",
        password_hash=get_password_hash("lead123"),
        name="Channel Lead",
        email="lead@example.com",
        role="MDE Invoice Team",
        ticket_role="CHANNEL_LEAD",
        dept="AP",
        title="Lead",
        status="Active",
    )
    assignee = User(
        username="priya",
        password_hash=get_password_hash("priya123"),
        name="Priya Nair",
        email="priya@example.com",
        role="Accounts",
        ticket_role="ASSIGNEE",
        dept="AP",
        title="Accountant",
        status="Active",
    )
    db.add_all((admin, lead, assignee))
    db.flush()
    db.add_all((
        UserChannelAccess(user_id=lead.id, channel="msetuSrm"),
        UserChannelAccess(user_id=assignee.id, channel="msetuSrm"),
    ))
    if not db.query(SlaPolicy).count():
        db.add_all((
            SlaPolicy(channel=None, priority="HIGH", response_minutes=240, business_hours=False, active=True),
            SlaPolicy(channel=None, priority="MEDIUM", response_minutes=1440, business_hours=False, active=True),
            SlaPolicy(channel=None, priority="LOW", response_minutes=2880, business_hours=False, active=True),
        ))
    db.commit()
    yield
    db.close()
