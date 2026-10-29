from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.database import Base


class Supplier(Base):
    """One supplier account per PAN. Signs in with PAN + password; sees only `vendor_codes`."""
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    pan = Column(String(10), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False, default="")
    email = Column(String(191), nullable=True)
    channel = Column(String(32), nullable=False)
    status = Column(String(16), nullable=False, default="Invited")  # Invited | Active | Inactive
    password_hash = Column(String(255), nullable=True)
    failed_attempts = Column(Integer, nullable=False, default=0)
    locked_until = Column(DateTime, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    vendor_codes = relationship(
        "SupplierVendorCode", back_populates="supplier", cascade="all, delete-orphan"
    )


class SupplierVendorCode(Base):
    __tablename__ = "supplier_vendor_codes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False, index=True)
    vendor_code = Column(String(32), unique=True, nullable=False)

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
