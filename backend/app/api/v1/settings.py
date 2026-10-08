from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user_token
from app.core.database import get_db
from app.models.settings import TableRow, AppSettings
from app.schemas.settings import TableUpdate, SettingsUpdate

router = APIRouter(
    tags=["Settings"],
)

@router.put("/tables/{table_key}")
def update_table(
    table_key: str,
    payload: TableUpdate,
    user: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    # Delete existing rows for this table_key
    db.query(TableRow).filter(TableRow.table_key == table_key).delete()
    
    # Insert new rows
    for idx, row in enumerate(payload.rows):
        db.add(TableRow(table_key=table_key, row_index=idx, cells_json=row))
        
    db.commit()
    return {"msg": "Table updated"}

@router.put("/settings")
def update_settings(
    payload: SettingsUpdate,
    user: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    settings = db.query(AppSettings).filter(AppSettings.id == 1).first()
    if not settings:
        settings = AppSettings(id=1, two_factor=False, sender_email="i2ptracker@company.com")
        db.add(settings)
        
    if payload.roleMatrix is not None:
        settings.role_matrix_json = payload.roleMatrix
    if payload.senderEmail is not None:
        settings.sender_email = payload.senderEmail
    if payload.twoFactorOn is not None:
        settings.two_factor = payload.twoFactorOn
        
    db.commit()
    return {"msg": "Settings updated"}
