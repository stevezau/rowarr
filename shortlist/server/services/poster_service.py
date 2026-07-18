"""Row-poster service: image storage, the image-generation artist, and provider capability checks.

A poster is cosmetic — it only ever changes the artwork of a collection Shortlist owns, never a share
filter or promotion. Generate mode reuses the AI curator's provider/key (OpenAI images / Google
Imagen); providers that can't make images (Anthropic, Ollama) have no artist and generate-mode rows
fall back to Plex's own artwork. Uploaded originals and generated images live in the ``poster_assets``
table (under /config) so they survive a container recreate and a config backup carries them.
"""

from __future__ import annotations

import base64
import hashlib
import io

from loguru import logger
from sqlalchemy.orm import Session, sessionmaker

from shortlist.engine.clients.poster import PosterArtist
from shortlist.server.db.models import PosterAsset
from shortlist.server.settings_store import SettingsStore

# Curator providers that can generate images (so generate-mode posters reuse the curator key).
IMAGE_PROVIDERS = ("openai", "google")
OPENAI_IMAGE_MODEL = "gpt-image-1"
GOOGLE_IMAGE_MODEL = "imagen-3.0-generate-002"
MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # a poster is a poster; reject anything absurd before it hits the DB
# A poster is portrait (Plex artwork is ~2:3). OpenAI takes an explicit pixel size; Imagen an aspect ratio.
_OPENAI_SIZE = "1024x1536"
_GOOGLE_ASPECT = "3:4"


def image_provider_status(store: SettingsStore) -> dict:
    """Whether the configured AI curator provider can generate poster images, and why not if it can't.

    Returns ``{"capable": bool, "provider": str, "reason": str}`` — ``reason`` is a plain-English,
    user-facing sentence when generation isn't available (shown next to a disabled Generate button).
    """
    provider = (store.get("curator.provider") or "").strip()
    if provider not in IMAGE_PROVIDERS:
        label = provider or "none"
        return {
            "capable": False,
            "provider": provider,
            "reason": (
                f"Your AI provider ({label}) can't create images. Switch your AI curator to OpenAI or "
                "Google in Settings → Curation to generate posters — or upload your own image instead."
            ),
        }
    if not store.get("curator.api_key"):
        return {
            "capable": False,
            "provider": provider,
            "reason": f"Add your {provider} API key in Settings → Curation to generate posters.",
        }
    return {"capable": True, "provider": provider, "reason": ""}


def make_artist(store: SettingsStore, sessions: sessionmaker[Session]) -> PosterArtist | None:
    """Build the poster artist from the curator provider/key, wrapped in a DB-backed prompt cache.

    Returns None when the provider can't generate images — the engine then simply skips generated
    posters. The cache means an identical prompt (a poster with no per-user text) is generated once
    and reused across every user and every nightly run, not regenerated 48x a night.
    """
    status = image_provider_status(store)
    if not status["capable"]:
        return None
    key = store.get("curator.api_key")
    inner: PosterArtist = _OpenAIArtist(key) if status["provider"] == "openai" else _GoogleArtist(key)
    return _CachingArtist(inner, sessions)


class _OpenAIArtist:
    """OpenAI Images (gpt-image-1). Always returns base64 in ``data[0].b64_json``."""

    def __init__(self, api_key: str):
        self._api_key = api_key

    def render(self, prompt: str) -> bytes | None:
        try:
            import openai
        except ImportError as exc:  # pragma: no cover - image extra missing from the runtime
            raise ImportError("OpenAI image generation needs `pip install shortlist[openai]`") from exc
        client = openai.OpenAI(api_key=self._api_key, timeout=120.0, max_retries=2)
        resp = client.images.generate(model=OPENAI_IMAGE_MODEL, prompt=prompt, n=1, size=_OPENAI_SIZE)
        b64 = resp.data[0].b64_json if resp.data else None
        return base64.b64decode(b64) if b64 else None


class _GoogleArtist:
    """Google Imagen via google-genai. Bytes live in ``generated_images[0].image.image_bytes``."""

    def __init__(self, api_key: str):
        self._api_key = api_key

    def render(self, prompt: str) -> bytes | None:
        try:
            from google import genai
            from google.genai import types
        except ImportError as exc:  # pragma: no cover - image extra missing from the runtime
            raise ImportError("Google image generation needs `pip install shortlist[google]`") from exc
        client = genai.Client(api_key=self._api_key)
        resp = client.models.generate_images(
            model=GOOGLE_IMAGE_MODEL,
            prompt=prompt,
            config=types.GenerateImagesConfig(
                number_of_images=1, aspect_ratio=_GOOGLE_ASPECT, output_mime_type="image/jpeg"
            ),
        )
        images = getattr(resp, "generated_images", None) or []
        return images[0].image.image_bytes if images else None


class _CachingArtist:
    """Wraps an artist with a persistent per-prompt cache (``gen:<hash>`` rows in poster_assets)."""

    def __init__(self, inner: PosterArtist, sessions: sessionmaker[Session]):
        self._inner = inner
        self._sessions = sessions

    def render(self, prompt: str) -> bytes | None:
        key = _gen_key(prompt)
        with self._sessions() as session:
            asset = session.get(PosterAsset, key)
            if asset is not None:
                return asset.image
        image = self._inner.render(prompt)
        if image:
            with self._sessions() as session:
                _put_asset(session, key, image, "image/png")
                session.commit()
        return image


def _gen_key(prompt: str) -> str:
    return "gen:" + hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:40]


def _upload_key(collection_id: int) -> str:
    return f"upload:{collection_id}"


def _put_asset(session: Session, key: str, image: bytes, content_type: str) -> None:
    asset = session.get(PosterAsset, key)
    if asset is None:
        session.add(PosterAsset(key=key, image=image, content_type=content_type))
    else:
        asset.image = image
        asset.content_type = content_type


def store_upload(session: Session, collection_id: int, image: bytes, content_type: str) -> None:
    """Persist a user-uploaded poster image for a row (caller commits)."""
    _put_asset(session, _upload_key(collection_id), image, content_type)


def load_upload(session: Session, collection_id: int) -> tuple[bytes, str] | None:
    """The stored uploaded image for a row as (bytes, content_type), or None if none was uploaded."""
    asset = session.get(PosterAsset, _upload_key(collection_id))
    return (asset.image, asset.content_type) if asset is not None else None


def load_generated(session: Session, prompt: str) -> bytes | None:
    """The cached generated image for ``prompt`` (from a prior preview or run), or None."""
    asset = session.get(PosterAsset, _gen_key(prompt))
    return asset.image if asset is not None else None


def clear_assets(session: Session, collection_id: int) -> None:
    """Drop a row's uploaded image (caller commits). Generated images are shared by prompt, so left."""
    asset = session.get(PosterAsset, _upload_key(collection_id))
    if asset is not None:
        session.delete(asset)


def normalize_upload(raw: bytes) -> tuple[bytes, str]:
    """Validate + downscale an uploaded image to a sane portrait poster (JPEG).

    Uses Pillow when available: rejects non-images, flattens to RGB, and caps the longest side so a
    40-megapixel phone photo doesn't bloat the DB. If Pillow is missing it stores the bytes as-is —
    a poster is cosmetic, so a best-effort store beats a hard failure.

    Raises:
        ValueError: the bytes aren't a decodable image (only when Pillow is available to tell).
    """
    try:
        from PIL import Image, UnidentifiedImageError
    except ImportError:  # pragma: no cover - posters extra missing from the runtime
        return raw, "image/png"
    try:
        image = Image.open(io.BytesIO(raw))
        image = image.convert("RGB")
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("that file isn't an image we can read") from exc
    image.thumbnail((1000, 1500))  # keep aspect; poster-sized ceiling
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=88)
    logger.debug("normalized uploaded poster to {} bytes JPEG", out.tell())
    return out.getvalue(), "image/jpeg"


def sample_preview_prompt(store: SettingsStore, title: str, subtitle: str, style: str) -> str:
    """The image prompt a generate-mode preview would use, with placeholders filled by sample values
    ('Alex' / the first movie library) so the editor can show what a poster will look like."""
    from shortlist.engine.delivery import build_poster_prompt
    from shortlist.engine.models import PosterSpec, UserProfile, UserType

    who = UserProfile(username="Alex", plex_account_id=0, user_type=UserType.SHARED)
    spec = PosterSpec(mode="generate", title=title, subtitle=subtitle, style=style)
    return build_poster_prompt(spec, who, [], library_name="Movies")
