"""
Create the first login account for a fresh database.

Run `alembic upgrade head` first (see README.md), then this. Safe to run
again later — it does nothing if the username already exists.

    python seed_admin.py                                       # admin / admin123, HQ / Admin
    python seed_admin.py bob secret123 "Bob Singh" bob@x.com    # username password name email [role]
"""
import sys

import sqlalchemy.exc

from app.core.database import SessionLocal
from app.core.security import get_password_hash
from app.models.user import User


def seed(username="admin", password="admin123", name="Administrator",
         email="admin@example.com", role="Admin"):
    db = SessionLocal()
    try:
        if db.query(User).filter(User.username == username).first():
            print(f"'{username}' already exists - nothing to do.")
            return
        db.add(User(
            username=username,
            password_hash=get_password_hash(password),
            name=name,
            email=email,
            role=role,
            channel_scope="all",
        ))
        db.commit()
        print(f"Created '{username}' ({role}). Password: {password}")
    except sqlalchemy.exc.OperationalError as err:
        db.rollback()
        print(f"Database error: {err}")
        print("Has the schema been created yet? Run: alembic upgrade head")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and len(args) < 4:
        print("Usage: python seed_admin.py [username password name email [role]]")
        sys.exit(1)
    seed(*args)
