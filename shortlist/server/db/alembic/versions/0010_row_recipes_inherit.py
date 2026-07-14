"""let existing rows inherit the global curation style; drop the two prefs that did nothing

A row's recipe is now blank-means-inherit: `PromptIn.tone` defaulted to "balanced", which is
indistinguishable from "unset", so every custom row silently overrode Settings -> Curation style
with a bare balanced recipe — the setting that claimed to write "everyone's rows" wrote exactly one.

This backfills that intent for rows created under the old default: a row whose recipe is EXACTLY the
old default (tone "balanced", no guidance, no template) had no style of its own, so it becomes blank
and inherits. A row with any real customization is left alone — its choices are its own.

Also strips `row_size` and `max_rating` from `users.prefs`. Neither was read by anything: max_rating
filtered no content at all, and a row's own size always won. A per-person row size lives on the row
override, which is what the UI writes.

Data-only and idempotent: no schema change, and re-running is a no-op.
"""

import json

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None

_OLD_DEFAULT = {"tone": "balanced", "guidance": "", "template": ""}
_DEAD_PREFS = ("row_size", "max_rating")


def upgrade() -> None:
    bind = op.get_bind()

    for row_id, recipe_json in bind.execute(sa.text("SELECT id, prompt FROM collections")).fetchall():
        recipe = _loads(recipe_json)
        if not recipe:
            continue
        normalized = {
            "tone": (recipe.get("tone") or "").strip(),
            "guidance": (recipe.get("guidance") or "").strip(),
            "template": (recipe.get("template") or "").strip(),
        }
        if normalized == _OLD_DEFAULT:
            bind.execute(
                sa.text("UPDATE collections SET prompt = :recipe WHERE id = :id"),
                {"recipe": json.dumps({"tone": "", "guidance": "", "template": ""}), "id": row_id},
            )

    for user_id, prefs_json in bind.execute(sa.text("SELECT id, prefs FROM users")).fetchall():
        prefs = _loads(prefs_json)
        if not any(key in prefs for key in _DEAD_PREFS):
            continue
        cleaned = {key: value for key, value in prefs.items() if key not in _DEAD_PREFS}
        bind.execute(
            sa.text("UPDATE users SET prefs = :prefs WHERE id = :id"),
            {"prefs": json.dumps(cleaned), "id": user_id},
        )


def _loads(value) -> dict:
    """The JSON column comes back as a str on SQLite and a dict on some drivers."""
    if isinstance(value, dict):
        return value
    if not value:
        return {}
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def downgrade() -> None:
    # The old values were inert (prefs) or indistinguishable from the default (recipes), so there is
    # nothing meaningful to restore.
    pass
