from pydantic import BaseModel
from typing import Dict, List, Any, Optional

class TableUpdate(BaseModel):
    rows: List[List[Any]]

class SettingsUpdate(BaseModel):
    roleMatrix: Optional[Dict[str, Dict[str, bool]]] = None
    senderEmail: Optional[str] = None
    twoFactorOn: Optional[bool] = None

class SettingsResponse(BaseModel):
    roleMatrix: Optional[Dict[str, Dict[str, bool]]] = None
    senderEmail: Optional[str] = None
    twoFactorOn: Optional[bool] = None
