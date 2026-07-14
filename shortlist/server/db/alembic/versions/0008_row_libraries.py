"""per-row library targeting

Adds ``collections.library_keys`` (JSON): the specific Plex library section keys a row builds its
collections in. Empty list = every library of the row's media type (the default), so existing rows —
and any server with one movie + one show library — are unchanged. Lets an owner point a row at, say,
"4K Movies" only, on a server with several libraries of a type.

Idempotent like the migrations before it: the add is guarded so a re-run after an interrupted
migration finishes cleanly.
"""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    cols = {c["name"] for c in inspector.get_columns("collections")}
    if "library_keys" not in cols:
        op.add_column(
            "collections",
            sa.Column("library_keys", sa.JSON, nullable=False, server_default="[]"),
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    cols = {c["name"] for c in inspector.get_columns("collections")}
    if "library_keys" in cols:
        with op.batch_alter_table("collections") as batch:
            batch.drop_column("library_keys")
