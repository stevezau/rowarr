"""collections.recent_count

Adds ``recent_count`` (Integer, nullable) to ``collections``: how many of a person's most recent
watches the web-search source searches for this row (one cached search each). NULL -> inherit the
global ``recommendations.recent_count``. Existing rows get NULL (inherit), so behaviour is unchanged.
Idempotent like the migrations before it.
"""

import sqlalchemy as sa
from alembic import op

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    cols = {c["name"] for c in inspector.get_columns("collections")}
    if "recent_count" not in cols:
        op.add_column("collections", sa.Column("recent_count", sa.Integer(), nullable=True))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    cols = {c["name"] for c in inspector.get_columns("collections")}
    if "recent_count" in cols:
        with op.batch_alter_table("collections") as batch:
            batch.drop_column("recent_count")
