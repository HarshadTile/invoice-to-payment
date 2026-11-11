from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.permissions import require_internal_user
from app.models.sync_log import SyncLog
from app.schemas.sync_log import SyncLogResponse

router = APIRouter(prefix="/sync-log", tags=["Sync Log"])

@router.get(
    "",
    response_model=List[SyncLogResponse],
    operation_id="getSyncLog",
    summary="Get invoice synchronization history",
)
def get_sync_logs(
    user=Depends(require_internal_user),
    db: Session = Depends(get_db),
    limit: int = 100,
):
    """Staff only (it can contain infrastructure error text); newest first."""
    return db.query(SyncLog).order_by(SyncLog.id.desc()).limit(max(1, min(limit, 500))).all()
