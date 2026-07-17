"""Notifications API: the owner's current alerts, and dismissing the "update available" note."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

import shortlist
from shortlist.server.auth import require_owner
from shortlist.server.notifications import build_notifications
from shortlist.server.settings_store import SettingsStore

router = APIRouter(prefix="/notifications", tags=["notifications"], dependencies=[Depends(require_owner)])


@router.get("")
async def list_notifications(request: Request) -> dict:
    """Every currently-firing notification (update available, failed/partial run, paused, errors)."""
    with request.app.state.sessions() as session:
        items = build_notifications(session, SettingsStore(session), shortlist.__version__)
    return {"notifications": items}


class DismissUpdate(BaseModel):
    version: str


@router.post("/dismiss-update")
async def dismiss_update(body: DismissUpdate, request: Request) -> dict:
    """Hide the update note for this version. A newer release will surface again on its own."""
    with request.app.state.sessions() as session:
        SettingsStore(session).set("notifications.dismissed_update", body.version)
        session.commit()
    return {"ok": True}
