from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.database import Base


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
    channel_scope = Column(String(32), nullable=False, default="all")
    ticket_role = Column(String(24), nullable=True)

    ticket_channels = relationship(
        "UserChannelAccess", back_populates="user", cascade="all, delete-orphan"
    )


class UserChannelAccess(Base):
    __tablename__ = "user_channel_access"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    channel = Column(String(32), primary_key=True)

    user = relationship("User", back_populates="ticket_channels")


class OTPCode(Base):
    __tablename__ = "otp_codes"

    vcode = Column(String(32), primary_key=True, index=True)
    mobile = Column(String(20), nullable=False)
    code = Column(String(6), nullable=False)
    expires_at = Column(DateTime, nullable=False)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
