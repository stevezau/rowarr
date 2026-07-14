"""Every migration must be re-runnable after a crash.

SQLite auto-commits DDL. A migration interrupted after its statements ran but before Alembic bumped
`alembic_version` (the container is killed, two deployers race — as happened live on SFLIX) leaves
the schema change committed and the version stamp behind it. Alembic re-runs that revision on the
next boot, so every revision has to survive being applied to a database that already has its
changes: a re-run must FINISH the job, not fail on "table already exists" / "duplicate column".

This is not a tidiness rule. A revision that cannot be re-run bricks the container permanently —
it fails on every boot, and there is no state to roll back to.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config as AlembicConfig
from alembic.script import ScriptDirectory

from shortlist.server.db import session as db_session

pytestmark = pytest.mark.integration


def _revisions() -> list[tuple[str, str | None]]:
    """Every (revision, parent) in the migration tree, oldest first — read from the scripts.

    Enumerated rather than hard-coded so a new migration is covered the moment it is added: the
    revision that bricks a container will otherwise be the one nobody remembered to list here.
    """
    cfg = AlembicConfig()
    cfg.set_main_option("script_location", str(db_session.ALEMBIC_DIR))
    script = ScriptDirectory.from_config(cfg)
    return [(rev.revision, rev.down_revision) for rev in reversed(list(script.walk_revisions()))]


REVISIONS = _revisions()


def _version(engine) -> str:
    with engine.connect() as conn:
        return conn.execute(sa.text("SELECT version_num FROM alembic_version")).scalar()


@pytest.mark.parametrize(("revision", "parent"), REVISIONS, ids=[rev for rev, _ in REVISIONS])
def test_every_revision_is_re_runnable_after_a_crash(tmp_path: Path, revision: str, parent: str | None):
    """Rewind the version stamp to before `revision` on an already-migrated DB, and boot again.

    That is exactly the state a crash mid-`revision` leaves behind: its DDL committed, its version
    stamp never written. The next boot re-applies it — and must reach head.
    """
    db_session.run_migrations(tmp_path)
    engine = db_session.make_engine(tmp_path)
    head = _version(engine)

    with engine.begin() as conn:
        if parent is None:
            # A crash inside the FIRST migration: the version table exists but was never stamped.
            conn.execute(sa.text("DELETE FROM alembic_version"))
        else:
            conn.execute(sa.text("UPDATE alembic_version SET version_num = :v"), {"v": parent})

    db_session.run_migrations(tmp_path)  # must not raise

    assert _version(engine) == head
    with engine.connect() as conn:
        # Recovery must not duplicate the row 0003 seeds: a re-run finishes the job, it does not
        # redo it. (Re-seeding on every recovery would give the owner two "Picked for You" rows.)
        assert [r[0] for r in conn.execute(sa.text("SELECT slug FROM collections")).fetchall()] == ["picked"]


def test_0003_reseeds_the_default_row_a_crash_lost(tmp_path: Path):
    """The live SFLIX partial state: 0003's tables exist but its seed never ran.

    Recovery has to re-seed, and the seed must not depend on parsing the `settings` rows a real
    install already has — that is what broke on SFLIX.
    """
    db_session.run_migrations(tmp_path)
    engine = db_session.make_engine(tmp_path)
    with engine.connect() as conn:
        assert conn.execute(sa.text("SELECT count(*) FROM collections")).scalar() == 1

    with engine.begin() as conn:
        conn.execute(sa.text("DELETE FROM collections"))
        conn.execute(sa.text("UPDATE alembic_version SET version_num='0002'"))
        conn.execute(
            sa.text("INSERT INTO settings (key, value, updated_at) VALUES ('row.size', '10', :t)"),
            {"t": "2026-01-01"},
        )

    db_session.run_migrations(tmp_path)

    with engine.connect() as conn:
        assert conn.execute(sa.text("SELECT version_num FROM alembic_version")).scalar() >= "0004"
        assert [r[0] for r in conn.execute(sa.text("SELECT slug FROM collections")).fetchall()] == ["picked"]
