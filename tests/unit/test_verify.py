"""Privacy Check tiers T1/T2. T2 runs against the recorded hub fixture — leaks are detected
by collection id in the hub key, because hub payloads carry no labels."""

from __future__ import annotations

import json
from pathlib import Path
from typing import ClassVar
from unittest.mock import MagicMock

from shortlist.engine.models import OwnedRow
from shortlist.engine.verify import check_t1, check_t2, collection_id_from_hub
from tests.conftest import make_profile, plextv_user

FIXTURES = Path(__file__).parent.parent / "fixtures"
HUBS = json.loads((FIXTURES / "pms_hubs_home.json").read_text())["MediaContainer"]["Hub"]

STORED = {"sarah": "Shortlist_sarah", "mike": "Shortlist_mike"}
KNOWN = {100: "sarah", 200: "mike"}  # plex account id -> the slug Shortlist gave it
# Matches the fixture: sarah's collection is 571285, mike's is 571299.
COLLECTIONS = {
    "sarah": OwnedRow("Shortlist_sarah", [571285]),
    "mike": OwnedRow("Shortlist_mike", [571299]),
}


class TestCollectionIdFromHub:
    def test_parses_collection_hubs_from_recorded_fixture(self):
        ids = [collection_id_from_hub(h) for h in HUBS]
        assert ids == [None, 571285, 571299, None]


class TestCheckT1:
    def test_pass_when_all_excludes_present(self, mock_plextv):
        mock_plextv.users = [
            plextv_user(
                100,
                "sarah",
                filters={"filterMovies": "label!=Shortlist_mike", "filterTelevision": "label!=Shortlist_mike"},
            ),
            plextv_user(
                200,
                "mike",
                filters={"filterMovies": "label!=Shortlist_sarah", "filterTelevision": "label!=Shortlist_sarah"},
            ),
        ]
        result = check_t1(mock_plextv, KNOWN, STORED)
        assert result.passed
        assert result.detail == {}

    def test_fail_names_user_and_missing_excludes(self, mock_plextv):
        mock_plextv.users = [
            plextv_user(100, "sarah"),  # drifted: no excludes at all
            plextv_user(
                200,
                "mike",
                filters={"filterMovies": "label!=Shortlist_sarah", "filterTelevision": "label!=Shortlist_sarah"},
            ),
        ]
        result = check_t1(mock_plextv, KNOWN, STORED)
        assert not result.passed
        assert "Shortlist_mike" in result.detail["sarah"]

    def test_a_user_who_no_longer_shares_the_server_is_not_a_privacy_failure(self, mock_plextv):
        """Someone whose share was revoked cannot see anything, so there is nothing to check for
        them — but their row still exists, and everyone who CAN see the server must still exclude
        it. T1 asks plex.tv who the audience is rather than trusting Shortlist's own user list."""
        mock_plextv.users = [
            plextv_user(
                200,
                "mike",
                filters={"filterMovies": "label!=Shortlist_sarah", "filterTelevision": "label!=Shortlist_sarah"},
            )
        ]
        result = check_t1(mock_plextv, KNOWN, STORED)
        assert result.passed

    def test_an_account_shortlist_does_not_manage_must_still_exclude_every_row(self, mock_plextv):
        """The check that would have caught the live leak: 45 of 48 accounts on a real server had
        no excludes at all, because only the three users Shortlist managed were ever looked at."""
        mock_plextv.users = [
            plextv_user(
                100,
                "sarah",
                filters={"filterMovies": "label!=Shortlist_mike", "filterTelevision": "label!=Shortlist_mike"},
            ),
            plextv_user(
                200,
                "mike",
                filters={"filterMovies": "label!=Shortlist_sarah", "filterTelevision": "label!=Shortlist_sarah"},
            ),
            plextv_user(300, "stranger"),  # shares the server; Shortlist has never heard of them
        ]

        result = check_t1(mock_plextv, KNOWN, STORED)

        assert not result.passed
        assert "stranger" in result.detail

    def test_users_without_collections_expect_no_excludes(self, mock_plextv):
        mock_plextv.users = [plextv_user(100, "sarah"), plextv_user(300, "newbie")]
        # Only sarah has a collection; nobody needs excludes for newbie, and newbie needs sarah's.
        result = check_t1(mock_plextv, {100: "sarah", 300: "newbie"}, {"sarah": "Shortlist_sarah"})
        assert not result.passed
        assert "newbie" in result.detail
        assert "sarah" not in result.detail


class TestCheckT2:
    def _plex_with_fixture_hubs(self, mock_plextv):
        plex = MagicMock()
        plex.user_hubs.return_value = HUBS
        mock_plextv.canary_server_token.return_value = "canary-tok"
        return plex

    def test_fixture_hubs_leak_is_detected_by_collection_id(self, mock_plextv):
        """The fixture contains BOTH users' promoted rows — for canary sarah, mike's row is a leak."""
        sarah = make_profile("sarah", account_id=100)
        plex = self._plex_with_fixture_hubs(mock_plextv)
        result = check_t2(plex, mock_plextv, sarah, COLLECTIONS)
        assert not result.passed
        assert result.detail["leaked"] == [{"title": "✨ Picked for You", "collection_id": 571299, "slug": "mike"}]
        assert result.detail["own_row_visible"] is True
        plex.user_hubs.assert_called_once_with("canary-tok")

    def test_pass_when_only_own_row_visible(self, mock_plextv):
        sarah = make_profile("sarah", account_id=100)
        plex = self._plex_with_fixture_hubs(mock_plextv)
        own_only = [h for h in HUBS if collection_id_from_hub(h) in (None, 571285)]
        plex.user_hubs.return_value = own_only
        result = check_t2(plex, mock_plextv, sarah, COLLECTIONS)
        assert result.passed
        assert result.detail["own_row_visible"] is True
        assert result.detail["foreign_collections_checked"] == 1

    def test_identical_row_titles_do_not_fool_detection(self, mock_plextv):
        """Both rows in the fixture share the title '✨ Picked for You' — ids, not titles, decide."""
        mike = make_profile("mike", account_id=200)
        plex = self._plex_with_fixture_hubs(mock_plextv)
        result = check_t2(plex, mock_plextv, mike, COLLECTIONS)
        assert not result.passed
        assert result.detail["leaked"][0]["collection_id"] == 571285
        assert result.detail["leaked"][0]["slug"] == "sarah"

    def test_a_leak_in_a_users_second_library_is_still_a_leak(self, mock_plextv):
        """A user owns one row per library. Checking only one of them is how a live leak hid:
        mike's TV row was visible to everyone while T2 reported PASS on his movie row."""
        sarah = make_profile("sarah", account_id=100)
        collections = {
            "sarah": OwnedRow("Shortlist_sarah", [571285]),
            "mike": OwnedRow("Shortlist_mike", [571299, 571300]),  # movie row + TV row
        }
        plex = self._plex_with_fixture_hubs(mock_plextv)
        plex.user_hubs.return_value = [
            {"key": "/library/collections/571285/children", "title": "✨ Picked for You"},
            {"key": "/library/collections/571300/children", "title": "✨ Picked for You"},  # mike's TV row
        ]

        result = check_t2(plex, mock_plextv, sarah, collections)

        assert not result.passed
        assert result.detail["leaked"] == [{"title": "✨ Picked for You", "collection_id": 571300, "slug": "mike"}]
        assert result.detail["foreign_collections_checked"] == 2

    def test_own_row_in_any_library_counts_as_visible(self, mock_plextv):
        sarah = make_profile("sarah", account_id=100)
        collections = {"sarah": OwnedRow("Shortlist_sarah", [571285, 571286])}
        plex = self._plex_with_fixture_hubs(mock_plextv)
        plex.user_hubs.return_value = [{"key": "/library/collections/571286/children", "title": "Row"}]

        result = check_t2(plex, mock_plextv, sarah, collections)

        assert result.passed
        assert result.detail["own_row_visible"] is True


class TestSharedRowsAreNotLeaks:
    """The verifier must classify shared rows exactly as the WRITER does.

    When it didn't, `desired_excludes` was asked for excludes with no `shared_labels`, so T1
    demanded an exclude for the shared row that `sync_user_restrictions` deliberately never
    writes — and T2 counted the shared row on the canary's own Home as a leak. A correctly
    configured public shared row failed the check forever, which shut the write gate and stopped
    the server building ANY row. Both tiers now take the same config the writer restricts by.
    """

    STORED_WITH_SHARED: ClassVar = {
        "sarah": "Shortlist_sarah",
        "mike": "Shortlist_mike",
        "shared_popular": "Shortlist__shared_popular",
    }
    PUBLIC: ClassVar = {"shortlist__shared_popular": None}  # None = public: everyone may see it

    def test_t1_passes_when_a_public_shared_row_is_excluded_from_nobody(self, mock_plextv):
        mock_plextv.users = [
            plextv_user(
                100,
                "sarah",
                filters={"filterMovies": "label!=Shortlist_mike", "filterTelevision": "label!=Shortlist_mike"},
            ),
            plextv_user(
                200,
                "mike",
                filters={"filterMovies": "label!=Shortlist_sarah", "filterTelevision": "label!=Shortlist_sarah"},
            ),
        ]
        result = check_t1(mock_plextv, KNOWN, self.STORED_WITH_SHARED, shared_labels=self.PUBLIC)
        assert result.passed, result.detail

    def test_t1_still_demands_the_exclude_for_a_shared_row_the_account_is_not_in(self, mock_plextv):
        """A SUBSET shared row is private to everyone outside its audience — the writer excludes it,
        so the check must insist on it. Sarah (100) is in the audience; mike (200) is not."""
        subset = {"shortlist__shared_popular": {100}}
        mock_plextv.users = [
            plextv_user(
                100,
                "sarah",
                filters={"filterMovies": "label!=Shortlist_mike", "filterTelevision": "label!=Shortlist_mike"},
            ),
            plextv_user(
                200,
                "mike",
                filters={"filterMovies": "label!=Shortlist_sarah", "filterTelevision": "label!=Shortlist_sarah"},
            ),
        ]
        result = check_t1(mock_plextv, KNOWN, self.STORED_WITH_SHARED, shared_labels=subset)
        assert not result.passed
        assert "Shortlist__shared_popular" in result.detail["mike"]
        assert "sarah" not in result.detail  # in the audience -> allowed to see it

    def test_a_stale_shared_collection_not_in_the_config_is_still_demanded(self, mock_plextv):
        """Fail-safe: a shared row the config no longer declares is treated as private and excluded
        from everyone — a leak we never write beats one we can't unwrite."""
        mock_plextv.users = [plextv_user(200, "mike", filters={"filterMovies": "label!=Shortlist_sarah"})]
        result = check_t1(mock_plextv, KNOWN, self.STORED_WITH_SHARED, shared_labels={})
        assert not result.passed
        assert "Shortlist__shared_popular" in result.detail["mike"]

    def test_t2_a_public_shared_row_on_the_canarys_home_is_the_feature_not_a_leak(self, mock_plextv):
        sarah = make_profile("sarah", account_id=100)
        collections = {
            "sarah": OwnedRow("Shortlist_sarah", [571285]),
            "_shared_popular": OwnedRow("Shortlist__shared_popular", [571400]),
        }
        plex = MagicMock()
        mock_plextv.canary_server_token.return_value = "canary-tok"
        plex.user_hubs.return_value = [
            {"key": "/library/collections/571285/children", "title": "✨ Picked for You"},
            {"key": "/library/collections/571400/children", "title": "Popular on this server"},
        ]

        result = check_t2(plex, mock_plextv, sarah, collections, shared_labels=self.PUBLIC)

        assert result.passed, result.detail
        assert result.detail["own_row_visible"] is True

    def test_t2_a_subset_shared_row_the_canary_is_not_in_is_a_leak(self, mock_plextv):
        sarah = make_profile("sarah", account_id=100)
        collections = {
            "sarah": OwnedRow("Shortlist_sarah", [571285]),
            "_shared_popular": OwnedRow("Shortlist__shared_popular", [571400]),
        }
        plex = MagicMock()
        mock_plextv.canary_server_token.return_value = "canary-tok"
        plex.user_hubs.return_value = [{"key": "/library/collections/571400/children", "title": "Date Night"}]

        result = check_t2(plex, mock_plextv, sarah, collections, shared_labels={"shortlist__shared_popular": {999}})

        assert not result.passed
        assert result.detail["leaked"][0]["collection_id"] == 571400

    def test_t2_without_shared_config_a_shared_row_is_treated_as_private(self, mock_plextv):
        """Fail-safe again: no config -> the row is not known to be shared -> its presence is a leak."""
        sarah = make_profile("sarah", account_id=100)
        collections = {"_shared_popular": OwnedRow("Shortlist__shared_popular", [571400])}
        plex = MagicMock()
        mock_plextv.canary_server_token.return_value = "canary-tok"
        plex.user_hubs.return_value = [{"key": "/library/collections/571400/children", "title": "Stale row"}]

        result = check_t2(plex, mock_plextv, sarah, collections)

        assert not result.passed
