"""Who is told about, and can be given, a query. Admins count as ticket Admins even when their stored
ticket role is empty, as the first account from seed_admin.py is: the same rule as at sign-in."""
import pytest

from app.core.database import SessionLocal
from app.models.user import User, UserChannelAccess
from app.services import notification_service, ticket_service


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.rollback()
    session.query(UserChannelAccess).filter(UserChannelAccess.user_id.in_(
        session.query(User.id).filter(User.username.like("recipient-%")))).delete(synchronize_session=False)
    session.query(User).filter(User.username.like("recipient-%")).delete(synchronize_session=False)
    session.commit()
    session.close()


def add_user(db, name, role, ticket_role=None, channel=None, status="Active"):
    user = User(username=f"recipient-{name}", password_hash="x", name=name, email=f"{name}@example.com",
                role=role, ticket_role=ticket_role, channel_scope=channel or "all", status=status)
    db.add(user)
    db.flush()
    if channel:
        db.add(UserChannelAccess(user_id=user.id, channel=channel))
        db.flush()
    return user


def test_admin_without_a_stored_ticket_role_is_told_about_new_queries(db):
    seeded = add_user(db, "seeded-admin", "Admin")  # what seed_admin.py used to create
    desk_admin = add_user(db, "desk-admin", "Invoice Team L3", "ADMIN")
    lead = add_user(db, "srm-lead", "Invoice Team L2", "CHANNEL_LEAD", "msetuSrm")
    other_lead = add_user(db, "po-lead", "Invoice Team L2", "CHANNEL_LEAD", "poPortal")
    retired = add_user(db, "retired-admin", "Admin", status="Inactive")
    recipients = notification_service.oversight_user_ids(db, "msetuSrm")
    assert {seeded.id, desk_admin.id, lead.id} <= recipients
    assert other_lead.id not in recipients and retired.id not in recipients


def test_admin_without_a_stored_ticket_role_can_be_assigned(db):
    seeded = add_user(db, "seeded-admin", "Admin")
    assignee = add_user(db, "srm-assignee", "Invoice Team L1", "ASSIGNEE", "msetuSrm")
    no_desk = add_user(db, "no-desk", "Invoice Team L1", "NO_ACCESS", "msetuSrm")
    staff = {"auth_type": "internal", "ticket_role": "ADMIN", "allowed_channels": ["msetuSrm"]}
    people = {person["id"]: person["role"] for person in ticket_service.assignable_users(db, staff, "msetuSrm")}
    assert people[seeded.id] == "ADMIN" and people[assignee.id] == "ASSIGNEE"
    assert no_desk.id not in people
