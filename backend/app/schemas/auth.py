from typing import Optional

from pydantic import BaseModel, EmailStr


class SupplierLoginRequest(BaseModel):
    vcode: str
    company: Optional[str] = "Vendor"


class SupplierPasswordLoginRequest(BaseModel):
    email: str
    password: str


class SupplierSetupRequest(BaseModel):
    token: str
    email: str
    password: str


class EmailRequest(BaseModel):
    """Forgot password (staff or supplier)."""
    email: EmailStr


class InternalLoginRequest(BaseModel):
    username: str
    password: str
    channelScope: Optional[str] = None


class TokenRequest(BaseModel):
    token: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str
