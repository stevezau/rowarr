"""per-user AI token breakdown + Exa searches

Adds two columns to ``run_users`` for per-run AI cost accounting:

* ``llm_tokens_by_step`` (JSON, default ``{}``): the user's ``llm_tokens`` total split by WHERE it
  went — ``{"curate": N, "llm_web": M, "llm_library": P}``. Legacy rows get ``{}``.
* ``exa_searches`` (Integer, default ``0``): Exa web searches run for the user (the ``llm_web``
  external backend). Tracked apart from tokens — Exa bills per search request, not per token.

The existing ``run_users.llm_tokens`` now also counts the AI candidate sources (``llm_web`` /
``llm_library``), which were previously discarded; no schema change needed for that. The run-total
tokens live in ``runs.stats`` (JSON), so they need no column either. Idempotent like the migrations
before it.
"""

import sqlalchemy as sa
from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    cols = {c["name"] for c in inspector.get_columns("run_users")}
    if "llm_tokens_by_step" not in cols:
        op.add_column("run_users", sa.Column("llm_tokens_by_step", sa.JSON(), nullable=False, server_default="{}"))
    if "exa_searches" not in cols:
        op.add_column("run_users", sa.Column("exa_searches", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    cols = {c["name"] for c in inspector.get_columns("run_users")}
    with op.batch_alter_table("run_users") as batch:
        if "exa_searches" in cols:
            batch.drop_column("exa_searches")
        if "llm_tokens_by_step" in cols:
            batch.drop_column("llm_tokens_by_step")
