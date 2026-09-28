from sqlalchemy import Column, Integer, String, Boolean, JSON
from app.core.database import Base

class TableRow(Base):
    __tablename__ = "table_rows"

    table_key = Column(String(64), primary_key=True)
    row_index = Column(Integer, primary_key=True)
    cells_json = Column(JSON)


class AppSettings(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True)
    role_matrix_json = Column(JSON)
    two_factor = Column(Boolean)
    sender_email = Column(String(191))
