"""Effectiveness report: is Shortlist actually getting watched?

All of it comes from ``picks.watched_at`` (set when a delivered pick turns up in the person's watch
history). A "recommendation" is a distinct (user, title) pair — a title recommended to one person —
and it's a "hit" once that person watches it. Distinct titles, not pick rows: a title re-recommended
over several runs is one recommendation, and one watch is one hit (counting rows would skew both).
Owner-only, read-only.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import String, cast, func

from shortlist.server.auth import require_owner
from shortlist.server.db.models import Collection, PickRow, User, iso_utc

router = APIRouter(prefix="/report", tags=["report"], dependencies=[Depends(require_owner)])


def _rate(watched: int, delivered: int) -> float | None:
    return round(watched / delivered, 3) if delivered else None


@router.get("")
async def effectiveness(request: Request) -> dict:
    """Overall hit rate + trend, per-user, per-row, and a recent-watches feed — the 'is it working?'
    dashboard report, all from the delivered-vs-watched pick ledger."""
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

        # Watches over time: distinct (person, title) hits bucketed by the week they were watched.
        trend_rows = (
            session.query(
                func.strftime("%Y-%W", PickRow.watched_at),
                func.count(func.distinct(person_title)),
            )
            .filter(PickRow.watched_at.isnot(None))
            .group_by(func.strftime("%Y-%W", PickRow.watched_at))
            .order_by(func.strftime("%Y-%W", PickRow.watched_at))
            .all()
        )

        users = {u.id: u for u in session.query(User).all()}
        row_names = {c.slug: c.name for c in session.query(Collection).all()}

        per_user = sorted(
            (
                {
                    "username": users[uid].username if uid in users else "unknown",
                    "slug": users[uid].slug if uid in users else str(uid),
                    "delivered": d,
                    "watched": w,
                    "hit_rate": _rate(w, d),
                }
                for uid, (d, w) in per_user_raw.items()
                if uid in users
            ),
            key=lambda r: (r["hit_rate"] is not None, r["hit_rate"] or 0, r["watched"]),
            reverse=True,
        )
        per_row = sorted(
            (
                {
                    "slug": slug or "picked",
                    "name": row_names.get(slug, slug or "Picked for You"),
                    "delivered": d,
                    "watched": w,
                    "hit_rate": _rate(w, d),
                }
                for slug, (d, w) in per_row_raw.items()
            ),
            key=lambda r: (r["hit_rate"] is not None, r["hit_rate"] or 0, r["watched"]),
            reverse=True,
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
            for p in (
                session.query(PickRow)
                .filter(PickRow.watched_at.isnot(None))
                .order_by(PickRow.watched_at.desc())
                .limit(20)
                .all()
            )
        ]

    return {
        "overall": {
            "delivered": delivered_total,
            "watched": watched_total,
            "hit_rate": _rate(watched_total, delivered_total),
        },
        "trend": [{"week": week, "watched": n} for week, n in trend_rows],
        "per_user": per_user,
        "per_row": per_row,
        "recent": recent,
    }
