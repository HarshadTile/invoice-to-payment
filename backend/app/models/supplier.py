from datetime import datetime

from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.core.database import Base


class Supplier(Base):
    """A supplier account. Signs in with email + password and sees only `vendor_codes`.
    A PAN may have several accounts (one per location / contact); the email is unique."""
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    pan = Column(String(10), nullable=True, index=True)
    name = Column(String(255), nullable=False, default="")
    email = Column(String(191), nullable=True, unique=True, index=True)
    channel = Column(String(32), nullable=False)
    status = Column(String(16), nullable=False, default="Invited")  # Invited | Active | Inactive
    password_hash = Column(String(255), nullable=True)
    failed_attempts = Column(Integer, nullable=False, default=0)
    locked_until = Column(DateTime, nullable=True)
    # Copied into each login token; raising it (logout) ends older sessions.
    session_version = Column(Integer, nullable=False, default=0, server_default="0")
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    vendor_codes = relationship(
        "SupplierVendorCode", back_populates="supplier", cascade="all, delete-orphan"
    )


class SupplierVendorCode(Base):
    __tablename__ = "supplier_vendor_codes"
    # The same code may belong to several accounts of one company, once per account.
    __table_args__ = (UniqueConstraint("supplier_id", "vendor_code", name="uq_supplier_vendor_codes_supplier_code"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False, index=True)
    vendor_code = Column(String(32), nullable=False, index=True)

    supplier = relationship("Supplier", back_populates="vendor_codes")


class SupplierSetupToken(Base):
    __tablename__ = "supplier_setup_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    link_type = Column(String(16), nullable=False, default="invite", server_default="invite")
    used = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class SupplierAccessRequest(Base):
    """A supplier asking for a new account (NEW_ACCOUNT, from the login page) or for a change
    to an existing account's vendor codes (CHANGE_ACCESS, from the supplier's profile).
    The supplier management team approves or rejects it."""
    __tablename__ = "supplier_access_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    kind = Column(String(16), nullable=False)  # NEW_ACCOUNT | CHANGE_ACCESS
    supplier_id = Column(Integer, ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False, default="")
    email = Column(String(191), nullable=False, index=True)
    pan = Column(String(10), nullable=True)
    requested_codes = Column(JSON, nullable=True)
    add_codes = Column(JSON, nullable=True)
    remove_codes = Column(JSON, nullable=True)
    note = Column(Text, nullable=True)
    status = Column(String(16), nullable=False, default="Pending", index=True)  # Pending | Approved | Rejected
    channel = Column(String(32), nullable=True)
    decision_reason = Column(String(32), nullable=True)
    decision_note = Column(Text, nullable=True)
    decided_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    decided_at = Column(DateTime, nullable=True)
    requester_ip = Column(String(64), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
