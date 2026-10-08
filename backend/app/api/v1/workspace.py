from fastapi import APIRouter, Depends
from typing import Dict, Any
from sqlalchemy.orm import Session, joinedload

from app.api.v1.auth import get_current_user_token
from app.core.database import get_db
from app.models.ticket import Ticket
from app.models.settings import TableRow, AppSettings
from app.models.sync_log import SyncLog
from app.schemas.sync_log import SyncLogResponse
from collections import defaultdict
from app.schemas.ticket import TicketResponse

router = APIRouter(
    prefix="/workspace",
    tags=["Workspace"],
)

@router.get("")
def get_workspace_data(
    payload: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    
    auth_type = payload.get("auth_type")
    
    # Query tickets based on auth type
    query = db.query(Ticket).options(joinedload(Ticket.comments))
    
    if auth_type == "supplier":
        vcode = payload.get("sub")
        # Assuming supplier tickets have raised_by = vendor_code or something similar?
        # Let's check frontend or DB schema. For now we will return all tickets matching vcode.
        query = query.filter(Ticket.raised_by == vcode)
    
    tickets_db = query.all()
    tickets = [TicketResponse.model_validate(t).model_dump() for t in tickets_db]
    

    # Query Tables
    tables_db = db.query(TableRow).all()
    tables_dict = defaultdict(list)
    
    # Sort by row_index to reconstruct arrays properly
    tables_db.sort(key=lambda x: x.row_index)
    for row in tables_db:
        tables_dict[row.table_key].append(row.cells_json)
        
    # Query Settings
    settings_db = db.query(AppSettings).filter(AppSettings.id == 1).first()
    settings_dict = {}
    if settings_db:
        settings_dict = {
            "roleMatrix": settings_db.role_matrix_json,
            "twoFactorOn": settings_db.two_factor,
            "senderEmail": settings_db.sender_email
        }
    

    # Query Sync Log
    sync_logs_db = db.query(SyncLog).all()
    sync_logs = [SyncLogResponse.model_validate(s).model_dump() for s in sync_logs_db]
    
    return {
        "invoices": [],
        "syncLog": sync_logs,
        "tickets": tickets,

        "ticketSeq": 0,
        "tables": dict(tables_dict),
        "settings": settings_dict
    }

