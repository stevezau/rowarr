"""request_candidates.excluded flag

Adds ``excluded`` (Boolean, default ``False``) to ``request_candidates``: True when a queued title
sits on Sonarr/Radarr's import-exclusion list (usually from a past delete), so the inbox can show
that approving it is a no-op until the owner removes the exclusion in the Arr. Legacy rows get
``False``. Idempotent like the migrations before it.
"""

import sqlalchemy as sa
from alembic import op

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    cols = {c["name"] for c in inspector.get_columns("request_candidates")}
    if "excluded" not in cols:
        op.add_column(
            "request_candidates",
            sa.Column("excluded", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    cols = {c["name"] for c in inspector.get_columns("request_candidates")}
    if "excluded" in cols:
        with op.batch_alter_table("request_candidates") as batch:
            batch.drop_column("excluded")
