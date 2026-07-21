"""Fold the Ollama curator into the one local/OpenAI-compatible provider

Ollama, llama.cpp, LM Studio, vLLM and LocalAI all speak the same OpenAI-compatible API, so two
providers meant two code paths and two cards in the UI for one capability (issue #7 discussion).
Anyone configured as `ollama` is moved to `openai_compatible`, carrying their URL over — and gaining
the `/v1` suffix the OpenAI API lives under, which the native Ollama client never needed.

Data-only and idempotent: it reads what is there and rewrites just that row.
"""

import json

import sqlalchemy as sa
from alembic import op

revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None


def _get(bind, key: str):
    row = bind.execute(sa.text("select value from settings where key = :k"), {"k": key}).scalar()
    return json.loads(row) if isinstance(row, str) else row


def _set(bind, key: str, value) -> None:
    bind.execute(
        sa.text(
            "insert into settings (key, value, updated_at) values (:k, :v, CURRENT_TIMESTAMP) "
            "on conflict(key) do update set value = :v, updated_at = CURRENT_TIMESTAMP"
        ),
        {"k": key, "v": json.dumps(value)},
    )


def upgrade() -> None:
    bind = op.get_bind()
    if _get(bind, "curator.provider") != "ollama":
        return
    url = (_get(bind, "curator.ollama_url") or "").strip().rstrip("/")
    if url and not url.rstrip("/").endswith(("/v1", "/api/v1")):
        # The native Ollama API sat at the root; the OpenAI-compatible one it is moving to is at /v1.
        url = f"{url}/v1"
    _set(bind, "curator.provider", "openai_compatible")
    if url:
        _set(bind, "curator.openai_base_url", url)


def downgrade() -> None:
    """Best-effort: only an instance whose URL still looks like Ollama's default port goes back."""
    bind = op.get_bind()
    if _get(bind, "curator.provider") != "openai_compatible":
        return
    url = (_get(bind, "curator.openai_base_url") or "").strip()
    if ":11434" in url:
        _set(bind, "curator.provider", "ollama")
