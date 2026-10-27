"""Portal availability is independent of user permissions and invoice history."""
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.settings import AppSettings

DEFAULT_CHANNEL_AVAILABILITY = {'msetuSrm': True, 'poPortal': True, 'mfoxPortal': False}


def channel_availability(db: Session) -> dict:
    settings = db.get(AppSettings, 1)
    saved = settings.channel_availability if settings else None
    return {**DEFAULT_CHANNEL_AVAILABILITY, **{
        key: value for key, value in (saved or {}).items()
        if key in DEFAULT_CHANNEL_AVAILABILITY and type(value) is bool
    }}


def require_enabled_channel(db: Session, channel: str):
    if channel_availability(db).get(channel) is False:
        raise HTTPException(status_code=403, detail='This portal is currently disabled. Contact your administrator.')
