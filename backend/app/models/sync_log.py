from sqlalchemy import Column, Integer, String, Text
from app.core.database import Base

class SyncLog(Base):
    __tablename__ = "sync_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    channel = Column(String(64))
    time = Column(String(48))
    status = Column(String(16))
    records = Column(Integer)
    msg = Column(Text)
