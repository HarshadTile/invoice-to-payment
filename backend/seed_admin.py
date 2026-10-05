"""
Create the first login account for a fresh database.

Run `alembic upgrade head` first (see README.md), then this. Safe to run
again later — it does nothing if the username already exists.

    python seed_admin.py                                       # admin / HQ Admin, random password printed once
    python seed_admin.py bob secret123 "Bob Singh" bob@x.com    # username password name email [role]
"""
import secrets
import sys

import sqlalchemy.exc

from app.core.database import SessionLocal
from app.core.security import get_password_hash
from app.models.user import User


def seed(username="admin", password=None, name="Administrator",
         email="admin@example.com", role="Admin"):
    # Never hardcode a real default password in source — a fresh install should
    # get a unique, unguessable admin password, not the same well-known string
    # every clone of this repo would otherwise share. Generate one and print it
    # once instead; pass a password explicitly (see usage above) to set your own.
    generated = password is None
    if generated:
        password = secrets.token_urlsafe(12)
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
        if generated:
            print("That password was generated randomly and is shown only this once — save it now.")
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
