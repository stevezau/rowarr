"""Unit tests for PlexClient.order_owned_hubs — the Recommended-shelf placement of Shortlist rows.

The Plex move mechanic itself is verified live on a real server; these pin the DECISION logic: only
our hubs move, the anchor is read-only (Kometa coexistence), it's idempotent, and dry-run is inert.
"""

from shortlist.engine.clients.plex_pms import PlexClient

_UNSET = "UNSET"  # sentinel: move() was never called on this hub


class FakeHub:
    def __init__(self, title: str, ident: str):
        self.title = title
        self.identifier = ident
        self.moved_after = _UNSET

    def reload(self):
        return self

    def move(self, after=None):
        self.moved_after = after


class FakeLabel:
    def __init__(self, tag: str):
        self.tag = tag


class FakeColl:
    def __init__(self, title: str, tags: list[str]):
        self.title = title
        self.labels = [FakeLabel(t) for t in tags]


class FakeSection:
    def __init__(self, hubs: list[FakeHub], title: str = "TV Shows", key: int = 2):
        self._hubs = hubs
        self.title = title
        self.key = key

    def managedHubs(self):
        return list(self._hubs)


def _client(colls: list[FakeColl]) -> PlexClient:
    client = PlexClient.__new__(PlexClient)  # bypass __init__ (no real PlexServer)
    client._section_collections = lambda section: colls
    return client


def test_moves_our_rows_immediately_after_the_anchor():
    anchor = FakeHub("New Series", "a")
    genre = FakeHub("Genre", "g")
    r1 = FakeHub("Picked for You", "o1")
    r2 = FakeHub("Because you watched X", "o2")
    section = FakeSection([anchor, genre, r1, r2])  # our rows buried at the bottom
    client = _client(
        [
            FakeColl("Picked for You", ["shortlist_sarah"]),
            FakeColl("Because you watched X", ["shortlist_mike"]),
            FakeColl("Genre", ["kometa"]),
        ]
    )

    result = client.order_owned_hubs(section, label_prefix="shortlist", anchor_title="New Series")

    assert result["skipped"] is False
    assert set(result["moved"]) == {"Picked for You", "Because you watched X"}
    assert r1.moved_after is anchor  # first row lands right after the anchor
    assert r2.moved_after is r1  # second chains after the first, preserving their order
    assert anchor.moved_after == _UNSET  # anchor is READ-ONLY (Kometa coexistence)
    assert genre.moved_after == _UNSET  # a foreign hub is never touched


def test_before_places_rows_ahead_of_the_anchor():
    other = FakeHub("Trending", "t")
    anchor = FakeHub("New Series", "a")
    r1 = FakeHub("Picked for You", "o1")
    section = FakeSection([other, anchor, r1])
    client = _client([FakeColl("Picked for You", ["shortlist_sarah"])])

    result = client.order_owned_hubs(section, label_prefix="shortlist", anchor_title="New Series", before=True)

    assert result["skipped"] is False
    assert r1.moved_after is other  # 'before New Series' == right after the hub preceding it


def test_skips_when_already_in_place():
    anchor = FakeHub("New Series", "a")
    r1 = FakeHub("Picked for You", "o1")
    section = FakeSection([anchor, r1, FakeHub("Genre", "g")])  # already directly after the anchor
    client = _client([FakeColl("Picked for You", ["shortlist_sarah"])])

    result = client.order_owned_hubs(section, label_prefix="shortlist", anchor_title="New Series")

    assert result["skipped"] is True
    assert result["reason"] == "already in place"
    assert r1.moved_after == _UNSET  # no write when nothing needs moving


def test_missing_anchor_leaves_the_shelf_untouched():
    r1 = FakeHub("Picked for You", "o1")
    section = FakeSection([FakeHub("Genre", "g"), r1])
    client = _client([FakeColl("Picked for You", ["shortlist_sarah"])])

    result = client.order_owned_hubs(section, label_prefix="shortlist", anchor_title="Nonexistent")

    assert result["skipped"] is True
    assert result["reason"] == "anchor not found"
    assert r1.moved_after == _UNSET


def test_before_with_the_anchor_at_the_top_moves_our_row_to_position_zero():
    anchor = FakeHub("New Series", "a")  # already first
    r1 = FakeHub("Picked for You", "o1")
    section = FakeSection([anchor, FakeHub("Genre", "g"), r1])
    client = _client([FakeColl("Picked for You", ["shortlist_sarah"])])

    result = client.order_owned_hubs(section, label_prefix="shortlist", anchor_title="New Series", before=True)

    assert result["skipped"] is False
    assert r1.moved_after is None  # 'before' the top hub -> the very top of the shelf


def test_before_is_idempotent_when_our_row_already_precedes_the_anchor():
    r1 = FakeHub("Picked for You", "o1")  # already directly before the anchor (and at the top)
    anchor = FakeHub("New Series", "a")
    section = FakeSection([r1, anchor, FakeHub("Genre", "g")])
    client = _client([FakeColl("Picked for You", ["shortlist_sarah"])])

    result = client.order_owned_hubs(section, label_prefix="shortlist", anchor_title="New Series", before=True)

    assert result["skipped"] is True
    assert result["reason"] == "already in place"
    assert r1.moved_after == _UNSET


def test_skips_when_our_rows_are_not_promoted_yet():
    # An owned collection exists (labelled) but isn't a managed hub — the row hasn't been promoted, so
    # there is nothing to move (managedHubs only lists promoted recommendations).
    section = FakeSection([FakeHub("New Series", "a"), FakeHub("Genre", "g")])
    client = _client([FakeColl("Picked for You", ["shortlist_sarah"])])

    result = client.order_owned_hubs(section, label_prefix="shortlist", anchor_title="New Series")

    assert result["skipped"] is True
    assert result["reason"] == "rows not promoted yet"


def test_dry_run_reports_the_move_without_writing():
    anchor = FakeHub("New Series", "a")
    r1 = FakeHub("Picked for You", "o1")
    section = FakeSection([anchor, FakeHub("Genre", "g"), r1])
    client = _client([FakeColl("Picked for You", ["shortlist_sarah"])])

    result = client.order_owned_hubs(section, label_prefix="shortlist", anchor_title="New Series", dry_run=True)

    assert result["dry_run"] is True
    assert result["moved"] == ["Picked for You"]
    assert r1.moved_after == _UNSET  # dry-run never actually moves a hub
