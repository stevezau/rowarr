"""Row-poster tests: the engine's cosmetic apply step, prompt rendering, and the server-side
service (provider capability, image storage, generation cache)."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from shortlist.engine.delivery import apply_poster, build_poster_prompt
from shortlist.engine.models import PosterSpec, UserProfile, UserType
from shortlist.server.db.models import Base
from shortlist.server.services.poster_service import (
    _CachingArtist,
    clear_assets,
    image_provider_status,
    load_generated,
    load_upload,
    store_upload,
)


def _profile(name: str = "Alex") -> UserProfile:
    return UserProfile(username=name, plex_account_id=1, user_type=UserType.SHARED)


class TestApplyPoster:
    """Cosmetic apply step — must upload for real modes, skip safely otherwise, and never raise."""

    def test_upload_mode_uploads_the_stored_bytes(self):
        plex = MagicMock()
        apply_poster(
            plex,
            "COLL",
            PosterSpec(mode="upload", image=b"PNGDATA"),
            _profile(),
            [],
            library_name="Movies",
            artist=None,
            dry_run=False,
        )
        plex.upload_poster.assert_called_once_with("COLL", b"PNGDATA")

    def test_generate_mode_renders_prompt_then_uploads(self):
        plex = MagicMock()
        artist = MagicMock()
        artist.render.return_value = b"IMG"
        apply_poster(
            plex,
            "COLL",
            PosterSpec(mode="generate", title="{user}'s picks"),
            _profile("Sam"),
            [],
            library_name="Movies",
            artist=artist,
            dry_run=False,
        )
        assert "Sam's picks" in artist.render.call_args.args[0]
        plex.upload_poster.assert_called_once_with("COLL", b"IMG")

    def test_generate_without_capable_artist_is_skipped(self):
        plex = MagicMock()
        apply_poster(
            plex,
            "COLL",
            PosterSpec(mode="generate", title="x"),
            _profile(),
            [],
            library_name="Movies",
            artist=None,
            dry_run=False,
        )
        plex.upload_poster.assert_not_called()

    def test_dry_run_never_writes_or_generates(self):
        plex, artist = MagicMock(), MagicMock()
        apply_poster(
            plex,
            "COLL",
            PosterSpec(mode="upload", image=b"x"),
            _profile(),
            [],
            library_name="Movies",
            artist=artist,
            dry_run=True,
        )
        plex.upload_poster.assert_not_called()
        artist.render.assert_not_called()

    @pytest.mark.parametrize("poster", [None, PosterSpec(mode="")])
    def test_no_poster_is_a_noop(self, poster):
        plex = MagicMock()
        apply_poster(plex, "COLL", poster, _profile(), [], library_name="Movies", artist=None, dry_run=False)
        plex.upload_poster.assert_not_called()

    def test_upload_failure_never_breaks_delivery(self):
        plex = MagicMock()
        plex.upload_poster.side_effect = RuntimeError("PMS down")
        # Must not raise — a poster is cosmetic.
        apply_poster(
            plex,
            "COLL",
            PosterSpec(mode="upload", image=b"x"),
            _profile(),
            [],
            library_name="Movies",
            artist=None,
            dry_run=False,
        )

    def test_empty_generated_image_leaves_plex_artwork(self):
        plex, artist = MagicMock(), MagicMock()
        artist.render.return_value = None
        apply_poster(
            plex,
            "COLL",
            PosterSpec(mode="generate", title="x"),
            _profile(),
            [],
            library_name="Movies",
            artist=artist,
            dry_run=False,
        )
        plex.upload_poster.assert_not_called()


class TestBuildPosterPrompt:
    def test_fills_user_and_library_and_style(self):
        prompt = build_poster_prompt(
            PosterSpec(mode="generate", title="{user} in {library_name}", style="noir comic"),
            _profile("Jo"),
            [],
            "Movies",
        )
        assert "Jo in Movies" in prompt
        assert "noir comic" in prompt

    def test_top_seed_with_no_seed_is_dropped_not_defaulted(self):
        prompt = build_poster_prompt(
            PosterSpec(mode="generate", title="Because you watched {top_seed}"), _profile(), [], "Movies"
        )
        # The whole line is dropped rather than rendered to the default row name.
        assert "Because you watched" not in prompt
        assert "Picked for You" not in prompt


class TestImageProviderStatus:
    """The full curator-provider matrix: only OpenAI/Google with a key can generate images."""

    class _Store:
        def __init__(self, values: dict):
            self._values = values

        def get(self, key: str):
            return self._values.get(key)

    def test_anthropic_cannot(self):
        status = image_provider_status(self._Store({"curator.provider": "anthropic", "curator.api_key": "k"}))
        assert status["capable"] is False
        assert "OpenAI or Google" in status["reason"]

    def test_ollama_cannot(self):
        assert not image_provider_status(self._Store({"curator.provider": "ollama"}))["capable"]

    def test_no_provider_cannot(self):
        assert not image_provider_status(self._Store({"curator.provider": ""}))["capable"]

    def test_openai_needs_a_key(self):
        status = image_provider_status(self._Store({"curator.provider": "openai", "curator.api_key": ""}))
        assert status["capable"] is False
        assert "API key" in status["reason"]

    def test_openai_with_key_is_capable(self):
        assert image_provider_status(self._Store({"curator.provider": "openai", "curator.api_key": "k"}))["capable"]

    def test_google_with_key_is_capable(self):
        assert image_provider_status(self._Store({"curator.provider": "google", "curator.api_key": "k"}))["capable"]


@pytest.fixture
def sessions():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    return sessionmaker(engine)


class TestImageStorage:
    def test_upload_roundtrip(self, sessions):
        with sessions() as session:
            store_upload(session, 5, b"IMG", "image/jpeg")
            session.commit()
        with sessions() as session:
            assert load_upload(session, 5) == (b"IMG", "image/jpeg")

    def test_missing_upload_is_none(self, sessions):
        with sessions() as session:
            assert load_upload(session, 999) is None

    def test_clear_removes_only_this_rows_upload(self, sessions):
        with sessions() as session:
            store_upload(session, 1, b"A", "image/png")
            store_upload(session, 2, b"B", "image/png")
            session.commit()
        with sessions() as session:
            clear_assets(session, 1)
            session.commit()
        with sessions() as session:
            assert load_upload(session, 1) is None
            assert load_upload(session, 2) == (b"B", "image/png")


class TestCachingArtist:
    def test_generates_once_then_serves_from_cache(self, sessions):
        inner = MagicMock()
        inner.render.return_value = b"IMG"
        artist = _CachingArtist(inner, sessions)
        assert artist.render("a prompt") == b"IMG"
        assert artist.render("a prompt") == b"IMG"
        inner.render.assert_called_once()  # second call hit the DB cache

    def test_different_prompts_generate_separately(self, sessions):
        inner = MagicMock()
        inner.render.side_effect = [b"ONE", b"TWO"]
        artist = _CachingArtist(inner, sessions)
        assert artist.render("one") == b"ONE"
        assert artist.render("two") == b"TWO"
        assert inner.render.call_count == 2

    def test_cached_image_is_loadable_by_prompt(self, sessions):
        inner = MagicMock()
        inner.render.return_value = b"IMG"
        _CachingArtist(inner, sessions).render("warm me")
        with sessions() as session:
            assert load_generated(session, "warm me") == b"IMG"

    def test_none_result_is_not_cached(self, sessions):
        inner = MagicMock()
        inner.render.return_value = None
        artist = _CachingArtist(inner, sessions)
        assert artist.render("p") is None
        assert artist.render("p") is None
        assert inner.render.call_count == 2  # nothing cached, so it retries


class TestNormalizeUpload:
    def test_converts_and_downscales_with_pillow(self):
        pil = pytest.importorskip("PIL")
        import io

        from shortlist.server.services.poster_service import normalize_upload

        buf = io.BytesIO()
        pil.Image.new("RGB", (4000, 6000), "navy").save(buf, format="PNG")
        image, content_type = normalize_upload(buf.getvalue())
        assert content_type == "image/jpeg"
        out = pil.Image.open(io.BytesIO(image))
        assert max(out.size) <= 1500  # capped

    def test_rejects_non_image_with_pillow(self):
        pytest.importorskip("PIL")
        from shortlist.server.services.poster_service import normalize_upload

        with pytest.raises(ValueError):
            normalize_upload(b"this is not an image")
