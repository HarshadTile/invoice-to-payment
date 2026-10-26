from pydantic import BaseModel
from typing import Dict, List, Any, Optional
from typing import Annotated
from pydantic import Field, field_validator, StrictBool
from pydantic_core import PydanticCustomError

LinkExpiryMinutes = Annotated[int, Field(strict=True)]

class TableUpdate(BaseModel):
    rows: List[List[Any]]

class SettingsUpdate(BaseModel):
    channelAvailability: Optional[Dict[str, StrictBool]] = None

    @field_validator('channelAvailability')
    @classmethod
    def validate_channels(cls, value):
        if value is not None and set(value) - {'msetuSrm', 'poPortal', 'mfoxPortal'}:
            raise PydanticCustomError('channel_availability', 'Unknown portal channel.')
        return value

    inviteLinkExpiryMinutes: Optional[LinkExpiryMinutes] = None
    resetLinkExpiryMinutes: Optional[LinkExpiryMinutes] = None
    supplierInviteLinkExpiryMinutes: Optional[LinkExpiryMinutes] = None
    supplierResetLinkExpiryMinutes: Optional[LinkExpiryMinutes] = None

    @field_validator('inviteLinkExpiryMinutes', 'resetLinkExpiryMinutes', 'supplierInviteLinkExpiryMinutes', 'supplierResetLinkExpiryMinutes')
    @classmethod
    def validate_expiry(cls, value):
        if value is not None and value not in (30, 60, 240, 720, 1440, 2880, 4320, 10080):
            raise PydanticCustomError('link_expiry', 'Choose an allowed link expiry between 30 minutes and 7 days.')
        return value

    roleMatrix: Optional[Dict[str, Dict[str, bool]]] = None
    senderEmail: Optional[str] = None
    twoFactorOn: Optional[bool] = None

class SettingsResponse(BaseModel):
    supplierInviteLinkExpiryMinutes: int = 10080
    supplierResetLinkExpiryMinutes: int = 1440
    inviteLinkExpiryMinutes: int = 10080
    resetLinkExpiryMinutes: int = 1440
    roleMatrix: Optional[Dict[str, Dict[str, bool]]] = None
    senderEmail: Optional[str] = None
    twoFactorOn: Optional[bool] = None
