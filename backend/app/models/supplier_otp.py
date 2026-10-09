from sqlalchemy import Column, Double, Integer, JSON, String

from app.core.database import Base


class SupplierOtpState(Base):
    __tablename__ = "supplier_otp_states"

    key = Column(String(64), primary_key=True)
    window_start = Column(Double, nullable=False, default=0)
    sends = Column(Integer, nullable=False, default=0)
    attempts = Column(Integer, nullable=False, default=0)
    last_send = Column(Double, nullable=False, default=0)
    challenge = Column(String(64), unique=True, nullable=True)
    digest = Column(String(64), nullable=True)
    expires = Column(Double, nullable=False, default=0)
    identity = Column(JSON, nullable=True)
