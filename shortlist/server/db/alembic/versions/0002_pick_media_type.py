"""picks.media_type — a TMDB id alone does not identify a title

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-12

TMDB ids are unique only WITHIN a namespace: movie 550 and TV 550 are different titles. The
staleness guard reads recent picks back by id, so without the media type a film silently
suppressed the show that shared its number for the next N runs. It is also what tells delivery
which library a pick belongs in — and a pick delivered to the wrong library produces a
collection Plex cannot hide from anyone.

Existing rows are backfilled as "movie" because nothing in the table can tell us otherwise —
and some of them really are shows (that is the bug this column exists to prevent). The only
consequence is that a mislabeled title becomes eligible for the row again one run early, which
is a freshness wobble, not a correctness problem: the next run records the true type.

Idempotent like 0003+, and this is the one where it matters most: unlike 0001 it runs against an
EXISTING database with real data in it. SQLite auto-commits DDL, so a crash after the ALTER but
before alembic stamps the version leaves the column present and the version at 0001 — and the
re-run on the next boot dies on "duplicate column name: media_type". The container then fails to
start on every subsequent boot, with the owner's data sitting behind a migration that can never
complete. The guard makes the re-run a no-op instead.
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "media_type" not in {column["name"] for column in inspector.get_columns("picks")}:
        op.add_column("picks", sa.Column("media_type", sa.String(16), nullable=False, server_default="movie"))


def downgrade() -> None:
    with op.batch_alter_table("picks") as batch:  # SQLite drops columns only via a table rebuild
        batch.drop_column("media_type")
