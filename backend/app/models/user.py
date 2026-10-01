from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from app.core.database import Base
from datetime import datetime

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(String(64), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(128), nullable=False)
    email = Column(String(191), nullable=False)
    role = Column(String(64), nullable=False)
    dept = Column(String(64), nullable=False, default="")
    title = Column(String(128), nullable=False, default="")
    status = Column(String(32), nullable=False, default="Active")
    # Which portal this account may sign in to: "all" (Admin only) or one of the specific
    # channels (msetuSrm/poPortal/mfoxPortal). Assigned by an admin, never chosen at login.
    channel_scope = Column(String(32), nullable=False, default="all")

class OTPCode(Base):
    __tablename__ = "otp_codes"
    vcode = Column(String(32), primary_key=True, index=True)
    mobile = Column(String(20), nullable=False)
    code = Column(String(6), nullable=False)
    expires_at = Column(DateTime, nullable=False)


class PasswordResetToken(Base):
    """A single-use, time-limited token emailed to a user who requested a password reset.
    Never reused: consumed (marked used) the moment it successfully sets a new password.

    `id` (not `created_at`) is the reliable "which token is newest" ordering: MySQL's
    DATETIME truncates to whole seconds by default, so two tokens issued in the same
    second — e.g. an admin resetting someone right after their own invite — would tie."""
    __tablename__ = "password_reset_tokens"
    id = Column(Integer, primary_key=True, autoincrement=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
