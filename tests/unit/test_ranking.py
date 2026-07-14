from shortlist.engine.models import MediaType, Seed
from shortlist.engine.ranking import pre_rank, score
from tests.conftest import make_candidate


def seed(tmdb_id: int, weight: float) -> Seed:
    return Seed(tmdb_id=tmdb_id, title=f"seed{tmdb_id}", media_type=MediaType.MOVIE, weight=weight)


class TestScore:
    def test_seed_frequency_raises_the_score(self):
        one = make_candidate(1, "One", seeds=[seed(1, 1.0)])
        two = make_candidate(2, "Two", seeds=[seed(1, 1.0), seed(2, 1.0)])
        assert score(two) > score(one)

    def test_unrated_gets_neutral_prior_not_zero(self):
        unrated = make_candidate(1, "Unrated", rating=0.0)
        assert score(unrated) > 0

    def test_a_seedless_candidate_is_not_worthless(self):
        """Provenance ADDS, it doesn't multiply. When score was `seed_frequency x rating x weight`,
        every title from a seedless source (tmdb_discover / llm_library / llm_web) scored exactly 0
        and sorted below the worst seeded one — so those three sources never reached the curator."""
        seedless = make_candidate(1, "Great", rating=9.5, seeds=[])
        assert score(seedless) > 0

    def test_a_great_seedless_title_beats_a_poor_seeded_one(self):
        seedless = make_candidate(1, "Great", rating=9.5, seeds=[])
        seeded_but_poor = make_candidate(2, "Meh", rating=2.0, seeds=[seed(1, 0.5)])
        assert score(seedless) > score(seeded_but_poor)

    def test_seeds_still_win_all_else_equal(self):
        seeded = make_candidate(1, "Seeded", rating=7.0, seeds=[seed(1, 1.0)])
        seedless = make_candidate(2, "Seedless", rating=7.0, seeds=[])
        assert score(seeded) > score(seedless)


class TestPreRank:
    def test_keeps_top_n_by_score(self):
        cands = [make_candidate(i, f"m{i}", rating=float(i)) for i in range(1, 6)]
        top = pre_rank(cands, keep=2)
        assert [c.tmdb_id for c in top] == [5, 4]

    def test_stable_tiebreak_by_title(self):
        a = make_candidate(1, "Alpha", rating=7.0)
        b = make_candidate(2, "Beta", rating=7.0)
        assert [c.title for c in pre_rank([b, a], keep=2)] == ["Alpha", "Beta"]

    def test_a_flooding_source_cannot_shut_the_others_out(self):
        """The bug this exists to prevent: 30 seeds x TMDB suggestions is hundreds of seeded
        candidates, so a global sort handed the curator 40 tmdb_similar titles and nothing else —
        the LLM sources we paid for never reached it. Every source now gets a turn."""
        pool = [
            make_candidate(100 + i, f"sim{i}", rating=6.0, seeds=[seed(1, 1.0)], sources={"tmdb_similar"})
            for i in range(600)
        ]
        pool += [
            make_candidate(200 + i, f"disc{i}", rating=8.0, seeds=[], sources={"tmdb_discover"}) for i in range(20)
        ]
        pool += [make_candidate(300 + i, f"lib{i}", rating=9.0, seeds=[], sources={"llm_library"}) for i in range(20)]

        kept = pre_rank(pool, keep=30)

        by_source = {
            s: sum(1 for c in kept if s in c.sources) for s in ("tmdb_similar", "tmdb_discover", "llm_library")
        }
        assert all(count == 10 for count in by_source.values()), by_source

    def test_a_narrow_source_running_out_gives_its_slack_to_the_others(self):
        pool = [make_candidate(100 + i, f"sim{i}", rating=6.0, sources={"tmdb_similar"}) for i in range(50)]
        pool += [make_candidate(300 + i, f"lib{i}", rating=9.0, seeds=[], sources={"llm_library"}) for i in range(3)]

        kept = pre_rank(pool, keep=20)

        assert len(kept) == 20  # no slots wasted on a source with nothing left to offer
        assert sum(1 for c in kept if "llm_library" in c.sources) == 3  # all it had
        assert sum(1 for c in kept if "tmdb_similar" in c.sources) == 17

    def test_a_title_two_sources_both_found_is_only_kept_once(self):
        both = make_candidate(1, "Both", rating=8.0, sources={"tmdb_similar", "llm_library"})
        others = [make_candidate(10 + i, f"o{i}", rating=5.0, sources={"tmdb_similar"}) for i in range(5)]

        kept = pre_rank([both, *others], keep=3)

        assert [c.tmdb_id for c in kept].count(1) == 1

    def test_untagged_candidates_still_rank(self):
        """Candidates built by hand (cold start, tests) carry no source tag and must not vanish."""
        pool = [make_candidate(i, f"m{i}", rating=float(i)) for i in range(1, 6)]
        assert len(pre_rank(pool, keep=3)) == 3
