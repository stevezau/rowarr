"""Local watch-history store — sync the full per-user play history incrementally, read it complete.

Plex's history API returns only the most recent ~200 plays per call (and each source is session-
based), so a heavy watcher's older watches were invisible to the already-watched filter and got
recommended again (SFLIX/MooHouse 'Hawking', 2026-07-20). This mirrors the FULL per-user history
into ``watch_events``, synced incrementally (per-user high-water mark on ``User.watch_synced_at``),
and the engine reads the complete set. It's a drop-in ``HistorySource`` — ``fetch`` syncs then reads
— so it slots into ``ctx.history_source`` with no run-plumbing changes and the engine's existing
ratingKey→tmdb resolution and watched-filter logic are unchanged.

Known limit (Plex's, not ours): a title *marked* watched with no play event isn't in any history
source, so it isn't captured. Modern Plex writes a watch record on mark-as-watched, so this gap
only affects legacy marks and shrinks over time. Reading the PMS DB would close it but needs the DB
mounted — deliberately not required here.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from loguru import logger
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session, sessionmaker

from shortlist.engine.history import HistorySource
from shortlist.engine.models import MediaType, UserProfile, WatchedItem
from shortlist.server.db.models import User, WatchEvent, utcnow

# Re-pull a little before the watermark each run, so a play written slightly out of order (or landing
# during the previous run) isn't skipped. The unique constraint dedups the re-pulled overlap.
_OVERLAP = timedelta(hours=6)


class StoreHistorySource:
    """Syncs ``watch_events`` from ``upstream`` (incremental), then returns the COMPLETE stored
    history for the user. ``upstream`` is the real Plex/Tautulli source; this is what the engine sees."""

    def __init__(self, sessions: sessionmaker[Session], upstream: HistorySource, *, min_completion: float):
        self._sessions = sessions
        self._upstream = upstream
        self._min_completion = min_completion

    def fetch(self, user: UserProfile, *, min_completion: float, since: datetime | None = None) -> list[WatchedItem]:
        # `since` is ignored on the read: the store already holds the complete history; the engine
        # wants everything, and the incremental window is an internal sync detail.
        self._sync(user)
        return self._load(user, min_completion=min_completion)

    def _sync(self, user: UserProfile) -> None:
        """Pull plays newer than the user's watermark and upsert them; advance the watermark.

        Fail-soft: if the upstream fetch errors, keep whatever is already stored (a run must never die
        because the history API hiccuped) and leave the watermark so next run retries the same window.
        """
        with self._sessions() as session:
            row = session.query(User).filter_by(slug=user.slug).first()
            if row is None:
                return
            watermark = row.watch_synced_at
            # SQLite hands DateTime back timezone-NAIVE; the upstream sources compare it against
            # timezone-aware watch times (Plex/Tautulli), so normalise to aware UTC or the subtraction
            # and comparison raise a TypeError and the whole sync fails soft (no new events ever land).
            if watermark is not None and watermark.tzinfo is None:
                watermark = watermark.replace(tzinfo=UTC)
            since = (watermark - _OVERLAP) if watermark is not None else None
            try:
                new_items = self._upstream.fetch(user, min_completion=self._min_completion, since=since)
            except Exception as e:
                logger.warning(
                    "{}: watch-history sync failed ({}) — using the {} events already stored",
                    user.slug,
                    type(e).__name__,
                    session.query(WatchEvent).filter_by(user_id=row.id).count(),
                )
                return
            # Wrap the writes too (not just the fetch): the first-run backfill is ~thousands of rows,
            # and this runs inside the engine's per-user thread pool, so several users backfilling at
            # once contend for SQLite's single writer. Batch-commit to release the lock periodically,
            # and on any write error roll back and leave the watermark so next run retries from the same
            # point (dedup makes the re-pull harmless) — a locked DB must never fail the user's run.
            inserted = 0
            try:
                for i, item in enumerate(new_items):
                    if item.rating_key is None:
                        continue  # no ratingKey -> can't resolve to a tmdb_id, so it can never match a candidate
                    stmt = (
                        sqlite_insert(WatchEvent)
                        .values(
                            user_id=row.id,
                            rating_key=item.rating_key,
                            media_type=item.media_type.value,
                            title=item.title,
                            year=item.year,
                            watched_at=item.watched_at,
                            completion=item.completion,
                        )
                        .on_conflict_do_nothing(index_elements=["user_id", "rating_key", "watched_at"])
                    )
                    inserted += session.execute(stmt).rowcount or 0
                    if (i + 1) % 2000 == 0:
                        session.commit()  # release the writer lock between batches so other users can sync
                row.watch_synced_at = utcnow()
                session.commit()
            except Exception as e:
                session.rollback()
                logger.warning(
                    "{}: watch-history store write failed ({}) — watermark left for next run to retry",
                    user.slug,
                    type(e).__name__,
                )
                return
            logger.debug(
                "{}: watch-history sync +{} new events (since={})",
                user.slug,
                inserted,
                since.isoformat() if since else "full backfill",
            )

    def _load(self, user: UserProfile, *, min_completion: float) -> list[WatchedItem]:
        with self._sessions() as session:
            row = session.query(User).filter_by(slug=user.slug).first()
            if row is None:
                return []
            events = session.query(WatchEvent).filter_by(user_id=row.id).all()
        return [
            WatchedItem(
                title=e.title,
                media_type=MediaType(e.media_type),
                watched_at=e.watched_at if e.watched_at.tzinfo else e.watched_at.replace(tzinfo=UTC),
                year=e.year,
                rating_key=e.rating_key,
                completion=e.completion,
            )
            for e in events
            if e.completion >= min_completion
        ]
