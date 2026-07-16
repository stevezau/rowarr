"""who wanted each requested title

Adds ``wanters`` (JSON, default ``[]``) to ``request_candidates``: the usernames whose candidate
pools surfaced the missing title, so the approval inbox can show WHO drove the demand, not just the
count. Empty (the default for existing rows) means "not recorded yet" — the next run that re-surfaces
the title fills it in. Idempotent like the migrations before it.
"""

import sqlalchemy as sa
from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    cols = {c["name"] for c in inspector.get_columns("request_candidates")}
    if "wanters" not in cols:
        op.add_column("request_candidates", sa.Column("wanters", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    cols = {c["name"] for c in inspector.get_columns("request_candidates")}
    with op.batch_alter_table("request_candidates") as batch:
        if "wanters" in cols:
            batch.drop_column("wanters")
