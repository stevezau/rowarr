"""Global safe-mode: SHORTLIST_DRY_RUN forces every Plex-touching action to write nothing.

For a demo or test instance pointed at a real Plex server. When set, runs, the manual row
delete/rename/poster-reset/disable-user reconciles, AND uninstall all become previews — the app
builds its clients and logs the would-be changes but never mutates Plex/plex.tv.
"""

from __future__ import annotations

import os

_TRUTHY = frozenset({"1", "true", "yes", "on"})


def force_dry_run() -> bool:
    """True when ``SHORTLIST_DRY_RUN`` is set to a recognized truthy value."""
    return os.environ.get("SHORTLIST_DRY_RUN", "").strip().lower() in _TRUTHY


def misconfigured_dry_run() -> str | None:
    """The raw value if ``SHORTLIST_DRY_RUN`` is set but NOT a recognized truthy value, else None.

    A safety toggle that fails open on a typo ('tru', 'enabled') would leave an operator who believed
    the server protected taking live writes — so a caller (boot) can surface this instead."""
    raw = os.environ.get("SHORTLIST_DRY_RUN")
    if raw is None or raw.strip() == "" or raw.strip().lower() in _TRUTHY:
        return None
    return raw
