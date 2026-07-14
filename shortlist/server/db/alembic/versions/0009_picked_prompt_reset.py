"""clear the stored curation recipe on the default 'picked' row

The default row is curated with the GLOBAL recipe: ``ContextBuilder._build_rows`` passes
``prompt=None`` for slug ``picked`` so its style stays in sync with Settings → Curation style (the
same reason its name and size come from Settings → Defaults). The row editor nevertheless offered
per-row style fields on it, and the API stored them — a setting that saved cleanly and then did
nothing. The editor no longer offers it; this blanks whatever an owner already saved, so the DB
can't hold a recipe no run will ever apply.

Data-only and idempotent: no schema change, and re-running it on an already-blank row is a no-op.
"""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("UPDATE collections SET prompt = '{}' WHERE slug = 'picked'"))


def downgrade() -> None:
    # The old value was inert by definition, so there is nothing meaningful to restore.
    pass
