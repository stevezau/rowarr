"""Privacy Check tiers, exactly as validated live in Phase 0 (2026-07-12).

T1: read every restricted user's filters back from plex.tv and assert the expected
    shortlist excludes are present.
T2: mint a canary Home user's server token (switch + resources exchange) and assert that no
    OTHER user's shortlist collection appears among the canary's Home hubs. Detection is by
    collection id parsed from each hub's key (``/library/collections/<id>/children``) — hub
    payloads do not carry labels, and row titles are shared templates, so ids are the only
    reliable discriminator. See tests/fixtures/pms_hubs_home.json.
"""

from __future__ import annotations

import re

from loguru import logger

from shortlist.engine.clients.plex_pms import PlexClient
from shortlist.engine.clients.plextv import PlexTvClient
from shortlist.engine.models import OwnedRow, PrivacyCheckResult, UserProfile, UserType
from shortlist.engine.privacy import desired_excludes, shortlist_labels_in, visible_shared_slugs

_COLLECTION_KEY = re.compile(r"/library/collections/(\d+)")


def collection_id_from_hub(hub: dict) -> int | None:
    """Collection id behind a Home hub, or None for non-collection hubs."""
    match = _COLLECTION_KEY.search(str(hub.get("key") or hub.get("hubKey") or ""))
    return int(match.group(1)) if match else None


def check_t1(
    plextv: PlexTvClient,
    known_slugs: dict[int, str],
    stored_labels: dict[str, str],
    *,
    label_prefix: str = "shortlist",
    shared_labels: dict[str, set[int] | None] | None = None,
) -> PrivacyCheckResult:
    """Assert EVERY account sharing this server excludes every row that isn't theirs.

    Every account, not just the ones Shortlist manages: a row is visible to anyone whose filter
    doesn't exclude it, so a check that only looked at managed users would have reported PASS
    while 45 of a live server's 48 accounts could see three other people's rows — which is
    exactly what it did (SFLIX, 2026-07-12).

    `known_slugs` maps plex account id -> the slug Shortlist gave that account, and is how "whose row
    is this?" is answered. Never by name: people rename themselves, and two display names can
    slugify identically — either would quietly excuse an account from an exclude it needs.
    """
    failures = {}
    for remote in plextv.list_users():
        if remote.user_type is UserType.OWNER:
            continue  # Plex cannot restrict the owner (rule 5)
        own_slug = known_slugs.get(remote.id)
        # The SAME inputs the writer used (privacy.sync_user_restrictions). Asking for excludes
        # without `shared_labels`/`account_id` would demand an exclude for every shared row — the
        # rows the writer deliberately leaves visible — and fail a correctly-configured server.
        wanted = desired_excludes(
            stored_labels.get(own_slug) if own_slug else None,
            stored_labels,
            account_id=remote.id,
            shared_labels=shared_labels,
        )
        if not wanted:
            continue
        for fieldname in ("filterMovies", "filterTelevision"):
            present = shortlist_labels_in(remote.filters.get(fieldname, ""), label_prefix)
            missing = {w for w in wanted if w.lower() not in {p.lower() for p in present}}
            if missing:
                failures[remote.username] = f"{fieldname} missing excludes: {sorted(missing)}"
    passed = not failures
    logger.info("Privacy Check T1: {}", "PASS" if passed else f"FAIL {failures}")
    return PrivacyCheckResult(tier="T1", passed=passed, detail=failures)


def check_t2(
    plex: PlexClient,
    plextv: PlexTvClient,
    canary: UserProfile,
    collections: dict[str, OwnedRow],
    *,
    shared_labels: dict[str, set[int] | None] | None = None,
) -> PrivacyCheckResult:
    """Fetch Home hubs AS the canary; assert no other user's collection id appears.

    Every id of every other user counts — a user owns one collection per library, and a leak in
    any one of them is a leak.

    A shared "popular on this server" row the canary is entitled to see is NOT a leak — it is the
    feature. `shared_labels` is what tells the two apart (the same config the writer restricts by):
    without it, every shared row on the canary's Home reads as a leak and T2 fails forever.
    """
    token = plextv.canary_server_token(canary.plex_account_id)
    hubs = plex.user_hubs(token)
    allowed = visible_shared_slugs(collections, shared_labels, canary.plex_account_id) | {canary.slug}
    foreign_ids = {
        rating_key: slug for slug, row in collections.items() if slug not in allowed for rating_key in row.rating_keys
    }
    own_ids = set(collections[canary.slug].rating_keys) if canary.slug in collections else set()

    leaked = []
    own_visible = False
    for hub in hubs:
        cid = collection_id_from_hub(hub)
        if cid is None:
            continue
        if cid in foreign_ids:
            leaked.append({"title": hub.get("title"), "collection_id": cid, "slug": foreign_ids[cid]})
        if cid in own_ids:
            own_visible = True

    detail = {
        "hub_count": len(hubs),
        "leaked": leaked,
        "own_row_visible": own_visible,
        "foreign_collections_checked": len(foreign_ids),
    }
    passed = not leaked
    logger.info("Privacy Check T2 ({}): {}", canary.username, "PASS" if passed else f"FAIL {leaked}")
    return PrivacyCheckResult(tier="T2", passed=passed, detail=detail)
