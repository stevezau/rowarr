"""per-row placement + pin-to-top

Adds two columns to ``collections``:

* ``placement`` (str, default ``"both"``): where the row appears once promoted — ``both`` (Home +
  Library Recommended, the legacy behaviour), ``home``, or ``library``.
* ``pin_top`` (bool, default ``False``): pin the row to the top of its library's Recommended shelf.

Existing rows get the legacy defaults (``both`` / not pinned), so behaviour is unchanged until an
owner sets one. Idempotent like the migrations before it.
"""

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    cols = {c["name"] for c in inspector.get_columns("collections")}
    if "placement" not in cols:
        op.add_column("collections", sa.Column("placement", sa.String(16), nullable=False, server_default="both"))
    if "pin_top" not in cols:
        op.add_column("collections", sa.Column("pin_top", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    cols = {c["name"] for c in inspector.get_columns("collections")}
    with op.batch_alter_table("collections") as batch:
        if "pin_top" in cols:
            batch.drop_column("pin_top")
        if "placement" in cols:
            batch.drop_column("placement")
