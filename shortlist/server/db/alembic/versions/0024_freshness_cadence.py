"""Freshness becomes a refresh cadence; retire staleness_runs

Freshness used to be a per-run rotation knob that, in practice, did nothing to nightly change — the
``staleness_runs`` guard (default 3) forbade reusing recent picks and forced a full re-curation of
every row every night. Freshness is now the REFRESH CADENCE (how often a row rebuilds), with rows
reused unchanged in between, and ``staleness_runs`` is gone.

Two data fix-ups, both idempotent (deletes of absent rows are no-ops):

1. Delete the retired ``staleness_runs`` setting row (also in LEGACY_KEYS, purged on boot).
2. Clear a stored ``recommendations.freshness`` of 0.0. Under the OLD meaning 0.0 was "no extra
   rotation" (churn happened anyway via staleness_runs), NOT the NEW "freeze forever". Clearing it
   lets the install inherit the new weekly default (0.5) instead of freezing every row on whatever
   last ran. An explicit non-zero value is a real choice and is left untouched.
"""

import json

import sqlalchemy as sa
from alembic import op

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("DELETE FROM settings WHERE key = 'staleness_runs'"))
    row = bind.execute(sa.text("SELECT value FROM settings WHERE key = 'recommendations.freshness'")).fetchone()
    if row is None:
        return
    raw = row[0]
    try:
        parsed = json.loads(raw) if isinstance(raw, str) else raw
        value = parsed.get("v") if isinstance(parsed, dict) else None
    except (json.JSONDecodeError, TypeError):
        value = None
    if value in (0, 0.0):
        bind.execute(sa.text("DELETE FROM settings WHERE key = 'recommendations.freshness'"))


def downgrade() -> None:
    # A settings-value fix-up: the prior values can't be reconstructed, so downgrade is a no-op.
    pass
