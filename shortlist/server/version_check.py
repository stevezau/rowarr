"""Is a newer Shortlist released? A cached, best-effort check against the GitHub releases API.

Powers the "update available" notification. Every failure mode is swallowed — GitHub being down,
rate-limited, or the repo having no releases yet must never break the notifications endpoint or slow
it down. The result is cached in-process (single uvicorn worker) so the API is hit at most a few
times a day, not on every 60-second poll.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import httpx
from loguru import logger
from packaging.version import InvalidVersion, Version

_RELEASES_URL = "https://api.github.com/repos/stevezau/shortlist/releases/latest"
_OK_TTL = timedelta(hours=6)  # a successful check is fresh for 6h
_FAIL_TTL = timedelta(minutes=30)  # after a failure, retry sooner
_cache: dict[str, object] = {"at": None, "value": None}


def _parse(version: str) -> Version | None:
    try:
        return Version(version.lstrip("vV"))
    except (InvalidVersion, AttributeError):
        return None


def _fetch_latest() -> dict | None:
    """The newest published release, or None on any error / no releases."""
    try:
        response = httpx.get(_RELEASES_URL, timeout=3, headers={"Accept": "application/vnd.github+json"})
        if response.status_code == 404:  # repo has no releases yet
            return None
        response.raise_for_status()
        data = response.json()
        return {"tag": str(data.get("tag_name") or ""), "url": str(data.get("html_url") or "")}
    except Exception as error:  # network, timeout, JSON, rate-limit — all non-fatal
        logger.debug("update check skipped: {}", error)
        return None


def check_for_update(current_version: str) -> dict | None:
    """`{latest, url}` when a newer release exists, else None. Cached; never raises.

    Args:
        current_version: the running app version (e.g. ``shortlist.__version__``).

    Returns:
        ``{"latest": "0.2.0", "url": "https://github.com/.../releases/tag/v0.2.0"}`` if the newest
        release parses as strictly greater than ``current_version``; otherwise ``None``.
    """
    now = datetime.now(UTC)
    at = _cache["at"]
    ttl = _OK_TTL if _cache["value"] is not None else _FAIL_TTL
    if not isinstance(at, datetime) or now - at > ttl:
        _cache["value"] = _fetch_latest()
        _cache["at"] = now

    latest = _cache["value"]
    if not isinstance(latest, dict) or not latest.get("tag"):
        return None
    current, newest = _parse(current_version), _parse(latest["tag"])
    if current is None or newest is None or newest <= current:
        return None
    return {"latest": newest.public, "url": latest["url"]}
