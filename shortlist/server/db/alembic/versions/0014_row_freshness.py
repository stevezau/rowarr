"""per-row freshness

Adds ``collections.freshness`` (float, nullable): how much this row varies day to day, as a
fraction (0.0 = stable, best quality; 1.0 = fresh, most variety). NULL = inherit the global
``recommendations.freshness`` setting. Existing rows get NULL (inherit), so behaviour is unchanged
until an owner sets one.

Idempotent like the migrations before it.
"""

import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    cols = {c["name"] for c in inspector.get_columns("collections")}
    if "freshness" not in cols:
        op.add_column("collections", sa.Column("freshness", sa.Float(), nullable=True))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    cols = {c["name"] for c in inspector.get_columns("collections")}
    if "freshness" in cols:
        with op.batch_alter_table("collections") as batch:
            batch.drop_column("freshness")
