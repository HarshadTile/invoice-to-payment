"""Helpers for tests that need a real staff account behind an internal token."""
from app.core.database import SessionLocal
from app.core.security import get_password_hash
from app.models.user import User


def internal_user_id(username="invoice_api_admin", role="Admin", channel_scope="all") -> int:
    """Id of an Active staff account (created on first use; not touched by conftest's cleanup).
    Tokens must belong to a real, active account: every request now re-checks it."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if not user:
            user = User(username=username, password_hash=get_password_hash("Test-only-pass1"), name=username,
                        email=f"{username}@example.com", role=role, status="Active", channel_scope=channel_scope)
            db.add(user)
            db.commit()
        return user.id
    finally:
        db.close()
