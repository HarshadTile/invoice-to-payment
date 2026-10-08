from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.user import User

router = APIRouter()

class UserCreate(BaseModel):
    username: str
    password: str
    name: str
    email: str
    role: str
    dept: Optional[str] = ""
    title: Optional[str] = ""

# Note: In production we would add a `require_admin` dependency here.
@router.post("/")
def create_user(user_in: UserCreate, db: Session = Depends(get_db)):
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
        status="Active"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"msg": "User created successfully", "id": new_user.id}

@router.get("/")
def get_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return [{
        "id": u.id, "username": u.username, "name": u.name, 
        "email": u.email, "role": u.role, "status": u.status
    } for u in users]
