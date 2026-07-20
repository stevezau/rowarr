"""watch_events store + users.watch_synced_at (incremental watch-history sync)

Plex's history API returns only the most recent ~200 plays per call, so a heavy watcher's older
watches were invisible to the already-watched filter and got recommended again. This adds a local
mirror of the FULL per-user play history, synced incrementally (``users.watch_synced_at`` is the
high-water mark), read complete at run time. One row per play event; unique (user_id, rating_key,
watched_at) dedups the incremental overlap. Idempotent like the migrations before it.
"""

import sqlalchemy as sa
from alembic import op

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "watch_events" not in inspector.get_table_names():
        op.create_table(
            "watch_events",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("rating_key", sa.Integer(), nullable=False),
            sa.Column("media_type", sa.String(length=16), nullable=False),
            sa.Column("title", sa.String(length=512), nullable=False, server_default=""),
            sa.Column("year", sa.Integer(), nullable=True),
            sa.Column("watched_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("completion", sa.Float(), nullable=False, server_default="1.0"),
            sa.UniqueConstraint("user_id", "rating_key", "watched_at", name="uq_watch_event"),
        )
        op.create_index("ix_watch_events_user_id", "watch_events", ["user_id"])

    user_cols = {c["name"] for c in inspector.get_columns("users")}
    if "watch_synced_at" not in user_cols:
        op.add_column("users", sa.Column("watch_synced_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    user_cols = {c["name"] for c in inspector.get_columns("users")}
    if "watch_synced_at" in user_cols:
        with op.batch_alter_table("users") as batch:
            batch.drop_column("watch_synced_at")
    if "watch_events" in inspector.get_table_names():
        op.drop_index("ix_watch_events_user_id", table_name="watch_events")
        op.drop_table("watch_events")
