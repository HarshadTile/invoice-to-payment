from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional

from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.user import User, UserChannelAccess
from app.api.v1.auth import get_current_user

router = APIRouter()

class UserCreate(BaseModel):
    username: str
    password: str
    name: str
    email: str
    role: str
    dept: Optional[str] = ""
    title: Optional[str] = ""
    ticket_role: Optional[str] = "ASSIGNEE"
    channels: List[str] = Field(default_factory=list)

    @field_validator("ticket_role")
    @classmethod
    def validate_ticket_role(cls, value):
        value = (value or "ASSIGNEE").upper()
        if value not in {"CHANNEL_LEAD", "ASSIGNEE"}:
            raise ValueError("ticket_role must be CHANNEL_LEAD or ASSIGNEE")
        return value

    @field_validator("channels")
    @classmethod
    def validate_channels(cls, values):
        allowed = {"msetuSrm", "poPortal", "manual", "mfoxPortal"}
        if any(value not in allowed for value in values):
            raise ValueError("channels contains an unknown workspace")
        return values


def require_admin(user: dict = Depends(get_current_user)):
    if user["auth_type"] != "internal" or user["ticket_role"] != "ADMIN":
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Admin access required."}})
    return user

@router.post("/")
def create_user(user_in: UserCreate, _admin: dict = Depends(require_admin), db: Session = Depends(get_db)):
    # Check if exists
    existing = db.query(User).filter(
        (User.username == user_in.username) | (User.email == user_in.email)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already exists.")
        
    hashed_password = get_password_hash(user_in.password)
    
    new_user = User(
        username=user_in.username,
        password_hash=hashed_password,
        name=user_in.name,
        email=user_in.email,
        role=user_in.role,
        dept=user_in.dept,
        title=user_in.title,
        status="Active",
        ticket_role="ADMIN" if user_in.role.upper() == "ADMIN" else user_in.ticket_role,
    )
    db.add(new_user)
    db.flush()
    for channel in sorted(set(user_in.channels)):
        db.add(UserChannelAccess(user_id=new_user.id, channel=channel))
    db.commit()
    db.refresh(new_user)
    return {"msg": "User created successfully", "id": new_user.id}

@router.get("/")
def get_users(_admin: dict = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.query(User).all()
    return [{
        "id": u.id, "username": u.username, "name": u.name, 
        "email": u.email, "role": u.role, "status": u.status,
        "ticketRole": u.ticket_role,
        "channels": sorted(m.channel for m in u.ticket_channels),
    } for u in users]
