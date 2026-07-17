"""Effectiveness report: is Shortlist actually getting watched?

All of it comes from ``picks.watched_at`` (set when a delivered pick turns up in the person's watch
history), joined against runs, collections and the request queue. A "recommendation" is a distinct
(user, title) pair — a title recommended to one person — and it's a "hit" once that person watches it.
Distinct titles, not pick rows: a title re-recommended over several runs is one recommendation, and one
watch is one hit (counting rows would skew both). Owner-only, read-only.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Request
from sqlalchemy import String, cast, func

from shortlist.server.auth import require_owner
from shortlist.server.db.models import Collection, PickRow, RequestCandidate, Run, RunUser, User, iso_utc

router = APIRouter(prefix="/report", tags=["report"], dependencies=[Depends(require_owner)])


def _rate(watched: int, delivered: int) -> float | None:
    return round(watched / delivered, 3) if delivered else None


@router.get("")
async def effectiveness(request: Request) -> dict:
    """The dashboard tracking report: headline hit rate + reach, watch momentum, per-user and per-row
    breakdowns, the titles landing best, requests that paid off, and a recent-watches feed."""
    now = datetime.now(UTC)
    week_ago = now - timedelta(days=7)
    with request.app.state.sessions() as session:
        # A title within one person's set: (tmdb_id, media_type). `.concat()` (SQL `||`), never
        # func.concat — the latter needs SQLite >= 3.44 and the runtime image ships 3.40.
        title = cast(PickRow.tmdb_id, String).concat("-").concat(PickRow.media_type)
        # A title across everyone: prefix the person, so one film recommended to two people counts twice.
        person_title = cast(PickRow.user_id, String).concat("-").concat(title)

        def counts(group_col, key_expr):
            """{group value -> (delivered, watched)} distinct-title counts, in two grouped scans."""
            delivered = dict(session.query(group_col, func.count(func.distinct(key_expr))).group_by(group_col).all())
            watched = dict(
                session.query(group_col, func.count(func.distinct(key_expr)))
                .filter(PickRow.watched_at.isnot(None))
                .group_by(group_col)
                .all()
            )
            return {k: (delivered.get(k, 0), watched.get(k, 0)) for k in delivered}

        per_user_raw = counts(PickRow.user_id, title)
        per_row_raw = counts(PickRow.collection_slug, person_title)

        delivered_total = sum(d for d, _ in per_user_raw.values())
        watched_total = sum(w for _, w in per_user_raw.values())

        watched_last_7d = (
            session.query(func.count(func.distinct(person_title)))
            .filter(PickRow.watched_at.isnot(None), PickRow.watched_at >= week_ago)
            .scalar()
            or 0
        )
        # Average days from delivery to watch, over the picks that were watched (SQLite julianday()).
        avg_days = (
            session.query(func.avg(func.julianday(PickRow.watched_at) - func.julianday(PickRow.created_at)))
            .filter(PickRow.watched_at.isnot(None))
            .scalar()
        )

        trend_rows = (
            session.query(func.strftime("%Y-%W", PickRow.watched_at), func.count(func.distinct(person_title)))
            .filter(PickRow.watched_at.isnot(None))
            .group_by(func.strftime("%Y-%W", PickRow.watched_at))
            .order_by(func.strftime("%Y-%W", PickRow.watched_at))
            .all()
        )

        users = {u.id: u for u in session.query(User).all()}
        row_names = {c.slug: c.name for c in session.query(Collection).all()}

        # Reach: who's actually covered.
        users_enabled = sum(1 for u in users.values() if u.enabled)
        users_with_picks = session.query(func.count(func.distinct(PickRow.user_id))).scalar() or 0
        rows_enabled = session.query(func.count(Collection.id)).filter(Collection.enabled.is_(True)).scalar() or 0

        # Runs summary.
        runs_total = session.query(func.count(Run.id)).scalar() or 0
        last_run = session.query(Run).filter(Run.status.in_(("ok", "error"))).order_by(Run.id.desc()).first()
        errors_last = (
            session.query(func.count(RunUser.user_id))
            .filter(RunUser.run_id == last_run.id, RunUser.status == "error")
            .scalar()
            if last_run
            else 0
        )

        # Requests that paid off: auto/hand-sent titles that were later watched by anyone.
        sent_keys = {(r.tmdb_id, r.media_type) for r in session.query(RequestCandidate).filter_by(status="sent").all()}
        watched_keys = {
            (tid, mt)
            for tid, mt in session.query(PickRow.tmdb_id, PickRow.media_type)
            .filter(PickRow.watched_at.isnot(None))
            .distinct()
            .all()
        }
        requests = {
            "sent": len(sent_keys),
            "pending": session.query(func.count(RequestCandidate.id)).filter_by(status="pending").scalar() or 0,
            "watched_after_sent": len(sent_keys & watched_keys),
        }

        # The titles landing best: most distinct watchers among delivered picks.
        top_rows = (
            session.query(
                PickRow.tmdb_id,
                PickRow.media_type,
                func.max(PickRow.title),
                func.count(func.distinct(PickRow.user_id)),
            )
            .filter(PickRow.watched_at.isnot(None))
            .group_by(PickRow.tmdb_id, PickRow.media_type)
            .order_by(func.count(func.distinct(PickRow.user_id)).desc())
            .limit(8)
            .all()
        )

        def _breakdown(raw, label):
            return sorted(
                (
                    {**label(key), "delivered": d, "watched": w, "hit_rate": _rate(w, d)}
                    for key, (d, w) in raw.items()
                    if label(key) is not None
                ),
                key=lambda r: (r["hit_rate"] is not None, r["hit_rate"] or 0, r["watched"]),
                reverse=True,
            )

        per_user = _breakdown(
            per_user_raw,
            lambda uid: {"username": users[uid].username, "slug": users[uid].slug} if uid in users else None,
        )
        per_row = _breakdown(
            per_row_raw,
            lambda slug: {"slug": slug or "picked", "name": row_names.get(slug, slug or "Picked for You")},
        )

        recent = [
            {
                "username": users[p.user_id].username if p.user_id in users else "unknown",
                "title": p.title,
                "media_type": p.media_type,
                "row": row_names.get(p.collection_slug, p.collection_slug or "Picked for You"),
                "seed_title": p.seed_title or "",
                "watched_at": iso_utc(p.watched_at),
            }
            for p in session.query(PickRow)
            .filter(PickRow.watched_at.isnot(None))
            .order_by(PickRow.watched_at.desc())
            .limit(20)
            .all()
        ]

    return {
        "overall": {
            "delivered": delivered_total,
            "watched": watched_total,
            "hit_rate": _rate(watched_total, delivered_total),
            "watched_last_7d": watched_last_7d,
            "avg_days_to_watch": round(avg_days, 1) if avg_days is not None else None,
        },
        "coverage": {
            "users_enabled": users_enabled,
            "users_total": len(users),
            "users_with_picks": users_with_picks,
            "rows_enabled": rows_enabled,
        },
        "runs": {
            "total": runs_total,
            "last_finished": iso_utc(last_run.finished_at) if last_run else None,
            "last_status": last_run.status if last_run else None,
            "errors_last": errors_last or 0,
        },
        "requests": requests,
        "trend": [{"week": week, "watched": n} for week, n in trend_rows],
        "per_user": per_user,
        "per_row": per_row,
        "top_titles": [{"tmdb_id": tid, "media_type": mt, "title": ttl, "watchers": n} for tid, mt, ttl, n in top_rows],
        "recent": recent,
    }
