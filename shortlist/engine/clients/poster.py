"""Poster-art client contract: turn a text prompt into image bytes for a row's Plex collection poster.

The engine only knows this Protocol; the server builds the concrete artist from the AI curator's
provider/key (OpenAI images, Google Imagen) and injects it. Providers that can't make images
(Anthropic, Ollama) have no artist, and generate-mode posters are simply skipped for them.

A poster is cosmetic: an artist may return ``None`` (or raise) and delivery carries on unaffected.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class PosterArtist(Protocol):
    def render(self, prompt: str) -> bytes | None:
        """Generate a portrait poster image for ``prompt``.

        Args:
            prompt: The fully-rendered image prompt (text placeholders already substituted).

        Returns:
            Encoded image bytes (PNG/JPEG) suitable for ``uploadPoster``, or ``None`` if the image
            could not be produced.
        """
        ...
