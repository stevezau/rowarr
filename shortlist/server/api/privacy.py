"""Privacy API: status, on-demand check (T1 + T2 when a canary exists), snapshots."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from shortlist.server.auth import require_owner
from shortlist.server.db.models import RestrictionSnapshotRow, User, iso_utc
from shortlist.server.services.privacy_state import privacy_summary

router = APIRouter(prefix="/privacy", tags=["privacy"], dependencies=[Depends(require_owner)])


@router.get("/status")
async def status(request: Request) -> dict:
    with request.app.state.sessions() as session:
        return privacy_summary(session)


class CheckRequest(BaseModel):
    probe: bool = False  # full probe (creates/removes a throwaway collection) vs read-only T1/T2


@router.post("/check")
async def run_check(request: Request, body: CheckRequest | None = None) -> dict:
    """Manually re-run the Privacy Check and persist its tiers.

    The run pipeline runs this automatically before it writes, so this endpoint is just the owner's
    on-demand re-check. probe=true runs the full end-to-end probe (throwaway labeled collection whose
    visibility is checked from a canary Home user, cleaned up in finally) when such a canary exists,
    else the read-only T1/T2 checks. Delegates to RunService.run_privacy_check — the one place the
    check runs — so the manual and automatic paths can never drift apart.
    """
    state = request.app.state
    loop = asyncio.get_running_loop()
    probe_mode = bool(body and body.probe)

    def on_step(message: str) -> None:
        loop.call_soon_threadsafe(state.bus.publish, "privacy.probe.step", {"message": message})

    service = state.run_service
    results = await loop.run_in_executor(None, lambda: service.run_privacy_check(probe=probe_mode, on_step=on_step))
    passed = all(r.passed for r in results)
    state.bus.publish("privacy.status", {"passed": passed})
    return {
        "passed": passed,
        "tiers": {r.tier: r.passed for r in results},
        # A failing check is the one result an owner must be able to act on: which row is visible to
        # whom. Returning a bare `false` makes them go digging in the database.
        "detail": {r.tier: r.detail for r in results if not r.passed},
    }


@router.get("/snapshots")
async def snapshots(request: Request) -> list[dict]:
    with request.app.state.sessions() as session:
        rows = session.query(RestrictionSnapshotRow).order_by(RestrictionSnapshotRow.id.desc()).limit(100).all()
        users = {u.id: u.username for u in session.query(User).all()}
        return [
            {
                "id": row.id,
                "username": users.get(row.user_id, "?"),
                "taken_at": iso_utc(row.taken_at),
                "reason": row.reason,
                "filters_before": row.filters_before,
            }
            for row in rows
        ]
