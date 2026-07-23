"""Tests for the watched-show filter — the logic that decides when a show is "finished" and should
not be recommended back to a user (issue #12: in-progress shows were being recommended)."""

from shortlist.engine.models import MediaType
from shortlist.engine.rows import _watched_titles


class TestWatchedShowFilter:
    """The ``_watched_titles`` function decides which shows count as "finished" (already watched) based
    on episode-play count vs. total episodes. A show is finished when the user has watched either:

    - >= ``show_pct`` of its episodes (default 0.8 = 80%), OR
    - >= ``_ENGAGED_EPISODES`` episodes (default 3, lowered from 10 for issue #12)

    The bar is ``min(total * show_pct, _ENGAGED_EPISODES)``, so for a short show the percentage is
    tighter, and for a long show the episode count is tighter."""

    def test_a_show_with_3_episodes_watched_is_finished(self):
        """3 episodes = past the pilot, given it a real try → finished. Catches mark-as-watched
        undercounting (issue #12): if history misses marked episodes, show_plays undercounts, and only
        a low bar keeps in-progress shows from being recommended back."""
        watched_movies = set()
        show_plays = {100: 3}  # tmdb_id 100 → 3 episodes watched
        episode_counts = {100: 60}  # show has 60 episodes total
        show_pct = 0.8

        finished = _watched_titles(watched_movies, show_plays, episode_counts, show_pct)

        assert (100, MediaType.SHOW) in finished, "3 episodes watched (>= _ENGAGED_EPISODES=3) → finished"

    def test_a_show_with_2_episodes_watched_is_not_finished(self):
        """2 episodes = still sampling, not committed → not finished yet."""
        watched_movies = set()
        show_plays = {100: 2}
        episode_counts = {100: 60}
        show_pct = 0.8

        finished = _watched_titles(watched_movies, show_plays, episode_counts, show_pct)

        assert (100, MediaType.SHOW) not in finished, "2 episodes < _ENGAGED_EPISODES=3 → not finished"

    def test_a_short_show_at_80_percent_is_finished(self):
        """For a 10-episode show, the percentage bar (8 episodes) is tighter than the count bar (3)."""
        watched_movies = set()
        show_plays = {200: 8}  # 8 of 10 = 80%
        episode_counts = {200: 10}
        show_pct = 0.8

        finished = _watched_titles(watched_movies, show_plays, episode_counts, show_pct)

        assert (200, MediaType.SHOW) in finished, "8/10 = 80% → finished"

    def test_a_short_show_at_70_percent_is_not_finished(self):
        """7 of 10 = 70%, which is < 80% and also >= 3 episodes → finished by the count bar."""
        watched_movies = set()
        show_plays = {200: 7}
        episode_counts = {200: 10}
        show_pct = 0.8

        finished = _watched_titles(watched_movies, show_plays, episode_counts, show_pct)

        # 7 >= min(10*0.8, 3) = min(8, 3) = 3 → finished
        assert (200, MediaType.SHOW) in finished, "7 episodes >= 3 → finished by count bar"

    def test_a_long_returning_series_never_hits_80_percent(self):
        """Gold Rush on SFLIX: 160 plays of 226 episodes = 71%, never hits 80%. The count bar (3) catches it."""
        watched_movies = set()
        show_plays = {300: 160}
        episode_counts = {300: 226}
        show_pct = 0.8

        finished = _watched_titles(watched_movies, show_plays, episode_counts, show_pct)

        # 160 >= min(226*0.8, 3) = min(180.8, 3) = 3 → finished
        assert (300, MediaType.SHOW) in finished, "160 plays >> 3 → finished by count bar"

    def test_an_unindexed_show_is_treated_as_finished(self):
        """If a show has plays but no episode_count (not in the library index), treat it as finished
        to be conservative — better to skip a potential recommendation than to re-recommend something
        the user has already worked through."""
        watched_movies = set()
        show_plays = {400: 5}
        episode_counts = {}  # show 400 is not in the index
        show_pct = 0.8

        finished = _watched_titles(watched_movies, show_plays, episode_counts, show_pct)

        assert (400, MediaType.SHOW) in finished, "missing episode_count → treat as finished (conservative)"

    def test_movies_are_always_finished(self):
        """Movies have no episode complexity — any watch = finished."""
        watched_movies = {500, 600}
        show_plays = {}
        episode_counts = {}
        show_pct = 0.8

        finished = _watched_titles(watched_movies, show_plays, episode_counts, show_pct)

        assert (500, MediaType.MOVIE) in finished
        assert (600, MediaType.MOVIE) in finished
