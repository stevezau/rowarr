"""per-user + per-row request tags, and per-candidate tags in the inbox

Layers on top of the global requests.tag: a per-user tag (users.request_tag) and a per-row tag
(collections.request_tag), plus request_candidates.tags so a queued title carries the tags it should
get when the owner sends it later. A requested title ends up tagged with the union of the global tag,
every wanting user's tag, and every matching row's tag.

Idempotent like 0004/0005: each column is guarded, so a re-run after an interrupted migration finishes
the job instead of failing on "duplicate column".
"""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def _add_column_if_missing(inspector, table: str, column: sa.Column) -> None:
    if column.name not in {c["name"] for c in inspector.get_columns(table)}:
        op.add_column(table, column)


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    _add_column_if_missing(
        inspector, "users", sa.Column("request_tag", sa.String(64), nullable=False, server_default="")
    )
    _add_column_if_missing(
        inspector, "collections", sa.Column("request_tag", sa.String(64), nullable=False, server_default="")
    )
    _add_column_if_missing(
        inspector, "request_candidates", sa.Column("tags", sa.JSON, nullable=False, server_default="[]")
    )


def downgrade() -> None:
    op.drop_column("request_candidates", "tags")
    op.drop_column("collections", "request_tag")
    op.drop_column("users", "request_tag")
