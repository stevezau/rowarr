"""StoreHistorySource: incremental sync into watch_events, complete read back."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from shortlist.engine.models import MediaType, UserProfile, UserType, WatchedItem
from shortlist.server.db.models import User, WatchEvent
from shortlist.server.db.session import make_engine, make_session_factory, run_migrations
from shortlist.server.services.watch_history import StoreHistorySource


@pytest.fixture
def sessions(tmp_path: Path):
    run_migrations(tmp_path)
    engine = make_engine(tmp_path)
    factory = make_session_factory(engine)
    yield factory
    engine.dispose()


@pytest.fixture
def sarah(sessions):
    with sessions() as session:
        session.add(User(plex_account_id=100, username="sarah", slug="sarah", enabled=True))
        session.commit()
    return UserProfile(username="sarah", plex_account_id=100, user_type=UserType.SHARED, slug="sarah")


class _FakeUpstream:
    """A history source that returns canned items and records the `since` it was called with."""

    def __init__(self, items: list[WatchedItem]):
        self._items = items
        self.since_calls: list[datetime | None] = []

    def fetch(self, user, *, min_completion, since=None):
        self.since_calls.append(since)
        # Simulate an incremental source: on a `since`, only return items newer than it.
        if since is None:
            return list(self._items)
        return [i for i in self._items if i.watched_at > since]


def _item(rating_key, title, days_ago, media=MediaType.MOVIE, completion=1.0):
    return WatchedItem(
        title=title,
        media_type=media,
        watched_at=datetime.now(UTC) - timedelta(days=days_ago),
        rating_key=rating_key,
        completion=completion,
    )


def _count(sessions, slug="sarah") -> int:
    with sessions() as s:
        uid = s.query(User).filter_by(slug=slug).one().id
        return s.query(WatchEvent).filter_by(user_id=uid).count()


def test_first_fetch_backfills_full_history_and_returns_it(sessions, sarah):
    up = _FakeUpstream([_item(1, "Dune", 400), _item(2, "Arrival", 300)])
    src = StoreHistorySource(sessions, up, min_completion=0.7)

    out = src.fetch(sarah, min_completion=0.7)

    assert up.since_calls == [None]  # no watermark yet -> full backfill
    assert {i.title for i in out} == {"Dune", "Arrival"}
    assert _count(sessions) == 2  # both persisted


def test_second_fetch_is_incremental_and_dedups(sessions, sarah):
    # Arrival is watched "now" — inside the 6h overlap window — so the second (incremental) fetch
    # RE-returns it, genuinely driving the on_conflict_do_nothing path. Dune is old (outside overlap).
    up = _FakeUpstream([_item(1, "Dune", 400), _item(2, "Arrival", 0)])
    src = StoreHistorySource(sessions, up, min_completion=0.7)
    src.fetch(sarah, min_completion=0.7)  # backfill
    assert _count(sessions) == 2

    up._items.append(_item(3, "Sicario", 0))  # a genuinely new watch
    out = src.fetch(sarah, min_completion=0.7)

    assert up.since_calls[1] is not None  # second call used the watermark (incremental)
    # Arrival was re-returned by the overlap and hit the unique constraint -> no duplicate row.
    assert {i.title for i in out} == {"Dune", "Arrival", "Sicario"}
    assert _count(sessions) == 3


def test_upstream_failure_keeps_whatever_is_stored(sessions, sarah):
    up = _FakeUpstream([_item(1, "Dune", 400)])
    src = StoreHistorySource(sessions, up, min_completion=0.7)
    src.fetch(sarah, min_completion=0.7)  # stores Dune

    def boom(*a, **k):
        raise RuntimeError("plex.tv down")

    up.fetch = boom
    out = src.fetch(sarah, min_completion=0.7)

    assert {i.title for i in out} == {"Dune"}  # the run still gets the stored history, not an empty set


def test_read_filters_by_completion_and_skips_ratingkeyless(sessions, sarah):
    up = _FakeUpstream(
        [
            _item(1, "Finished", 10, completion=1.0),
            _item(2, "HalfWatched", 5, completion=0.4),
            WatchedItem(title="NoKey", media_type=MediaType.MOVIE, watched_at=datetime.now(UTC), rating_key=None),
        ]
    )
    src = StoreHistorySource(sessions, up, min_completion=0.0)  # sync stores all (incl. partial)

    out = src.fetch(sarah, min_completion=0.7)  # read only counts finished ones

    assert {i.title for i in out} == {"Finished"}  # partial filtered out at read, keyless never stored
    assert _count(sessions) == 2  # Finished + HalfWatched stored; NoKey skipped (no ratingKey)
