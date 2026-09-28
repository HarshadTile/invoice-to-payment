from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from app.api.v1.auth import get_current_user_token
from app.core.database import get_db
from app.models.sync_log import SyncLog
from app.schemas.sync_log import SyncLogResponse

router = APIRouter(
    prefix="/sync-log",
    tags=["Sync Log"],
)

@router.get("", response_model=List[SyncLogResponse])
def get_sync_logs(
    user: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    return db.query(SyncLog).all()
