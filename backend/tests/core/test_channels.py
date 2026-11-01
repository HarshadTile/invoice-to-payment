"""Portal (channel) availability: defaults, saved values and the sign-in guard."""
import pytest
from fastapi import HTTPException

from app.core.channels import DEFAULT_CHANNEL_AVAILABILITY, channel_availability, require_enabled_channel
from app.core.database import SessionLocal
from app.models.settings import AppSettings


@pytest.fixture
def saved_availability():
    """Lets a test save availability; restores what was there afterwards."""
    with SessionLocal() as db:
        settings = db.get(AppSettings, 1)
        created = settings is None
        if created:
            settings = AppSettings(id=1)
            db.add(settings)
        previous = settings.channel_availability
        db.commit()

        def save(value):
            db.get(AppSettings, 1).channel_availability = value
            db.commit()

        yield db, save
        if created:
            db.delete(db.get(AppSettings, 1))
        else:
            db.get(AppSettings, 1).channel_availability = previous
        db.commit()


def test_defaults_have_mfox_off(saved_availability):
    db, save = saved_availability
    save(None)
    assert channel_availability(db) == DEFAULT_CHANNEL_AVAILABILITY == {'msetuSrm': True, 'poPortal': True, 'mfoxPortal': False}


def test_saved_values_override_and_junk_is_ignored(saved_availability):
    db, save = saved_availability
    save({'poPortal': False, 'mfoxPortal': True, 'unknown': True, 'msetuSrm': 'no'})
    assert channel_availability(db) == {'msetuSrm': True, 'poPortal': False, 'mfoxPortal': True}


def test_disabled_portal_is_refused(saved_availability):
    db, save = saved_availability
    save({'poPortal': False})
    with pytest.raises(HTTPException) as error:
        require_enabled_channel(db, 'poPortal')
    assert error.value.status_code == 403
    assert error.value.detail == 'This portal is currently disabled. Contact your administrator.'
    require_enabled_channel(db, 'msetuSrm')
    require_enabled_channel(db, 'all')  # HQ is never switched off
