"""request_candidates.arr_slug

Adds ``arr_slug`` (String, nullable) to ``request_candidates``: the Sonarr/Radarr titleSlug captured
when a title is sent, so the inbox can deep-link straight to its arr page (Sonarr has no id-based
URL, only ``/series/<slug>``). Existing rows get NULL — the inbox falls back to the arr's home page
for those. Idempotent like the migrations before it.
"""

import sqlalchemy as sa
from alembic import op

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    cols = {c["name"] for c in inspector.get_columns("request_candidates")}
    if "arr_slug" not in cols:
        op.add_column("request_candidates", sa.Column("arr_slug", sa.String(length=256), nullable=True))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    cols = {c["name"] for c in inspector.get_columns("request_candidates")}
    if "arr_slug" in cols:
        with op.batch_alter_table("request_candidates") as batch:
            batch.drop_column("arr_slug")
