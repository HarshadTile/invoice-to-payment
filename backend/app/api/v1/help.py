"""User manuals for staff.

The internal manuals (All Channels HQ, Msetu / SRM, PO Portal) show real screens, so they are
not public files: they live in backend/manuals and are served only to a signed-in staff member,
who gets the manual for the portal they signed in to. The supplier manual (dummy data only) stays
public at /user-manual/vendor-view.pdf in the frontend, because suppliers need it before signing in.
"""
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.api.deps import get_current_user

router = APIRouter(prefix="/help", tags=["Help"])

MANUAL_DIR = Path(__file__).resolve().parents[3] / "manuals"
MANUAL_FOR_PORTAL = {"msetuSrm": "msetu-srm.pdf", "poPortal": "po-portal.pdf"}
DEFAULT_MANUAL = "all-channels-hq.pdf"
DOWNLOAD_NAMES = {
    "all-channels-hq.pdf": "Invoice Tracker - All Channels (HQ) User Manual.pdf",
    "msetu-srm.pdf": "Invoice Tracker - Msetu SRM User Manual.pdf",
    "po-portal.pdf": "Invoice Tracker - PO Portal User Manual.pdf",
}


def manual_for(user: dict) -> str:
    return MANUAL_FOR_PORTAL.get(user.get("channel_scope") or "", DEFAULT_MANUAL)


@router.get("/user-manual", summary="The user manual for the signed-in staff member's portal (staff only)")
def user_manual(user: dict = Depends(get_current_user)):
    if user["auth_type"] != "internal":
        raise HTTPException(status_code=403, detail="Suppliers use the Vendor View manual from the Help button.")
    name = manual_for(user)
    path = MANUAL_DIR / name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="The user manual is not available right now.")
    return FileResponse(
        path, media_type="application/pdf", filename=DOWNLOAD_NAMES[name], content_disposition_type="inline",
        headers={"Cache-Control": "no-store"},
    )
