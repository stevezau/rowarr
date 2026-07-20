"""The squashed initial migration must stay in lockstep with the models.

The 28 pre-release migrations were collapsed into a single `0001_initial`. This guards that the schema
it builds still matches `Base.metadata` exactly (same tables, same columns) — so the day someone adds a
column to a model and forgets the migration, this fails instead of a fresh install silently drifting
from the ORM. Compares column SETS, not raw DDL (column order and backfill-era server_defaults differ
harmlessly and aren't part of the model contract).
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from shortlist.server.db.models import Base
from shortlist.server.db.session import make_engine, run_migrations


def _columns(db_path: str) -> dict[str, set[str]]:
    conn = sqlite3.connect(db_path)
    try:
        tables = [
            r[0]
            for r in conn.execute(
                "select name from sqlite_master where type='table' "
                "and name not like 'sqlite_%' and name != 'alembic_version'"
            )
        ]
        return {t: {r[1] for r in conn.execute(f"pragma table_info('{t}')")} for t in tables}
    finally:
        conn.close()


def test_initial_migration_schema_matches_the_models(tmp_path: Path):
    migrated_dir = tmp_path / "migrated"
    migrated_dir.mkdir()
    run_migrations(migrated_dir)
    from_migration = _columns(str(migrated_dir / "shortlist.db"))

    model_dir = tmp_path / "model"
    model_dir.mkdir()
    engine = make_engine(model_dir)
    Base.metadata.create_all(engine)
    engine.dispose()
    from_models = _columns(str(model_dir / "shortlist.db"))

    assert from_migration == from_models, (
        "The initial migration drifted from the models. A model changed without updating "
        "shortlist/server/db/alembic/versions/0001_initial.py — regenerate or amend it."
    )


def test_a_db_stamped_at_a_squashed_revision_is_healed_not_crashed(tmp_path: Path):
    # The maintainer's pre-release DB is stamped at a now-removed revision (e.g. 0028). Booting must
    # re-stamp it to the baseline, not crash on "Can't locate revision".
    run_migrations(tmp_path)  # full schema, stamped at 0001
    db = tmp_path / "shortlist.db"
    conn = sqlite3.connect(db)
    conn.execute("update alembic_version set version_num = '0028'")  # a squashed-away revision
    conn.commit()
    conn.close()

    run_migrations(tmp_path)  # must heal, not raise

    conn = sqlite3.connect(db)
    version = conn.execute("select version_num from alembic_version").fetchone()[0]
    conn.close()
    assert version == "0001"  # stamped forward to the baseline, schema untouched


def test_an_incomplete_db_at_a_squashed_revision_is_not_silently_healed(tmp_path: Path):
    # The safety branch: a DB stamped at a squashed revision but MISSING a table must NOT be marked
    # complete — better to fail loudly than silently stamp an incomplete schema as up-to-date.
    import pytest
    from alembic.util.exc import CommandError

    run_migrations(tmp_path)
    db = tmp_path / "shortlist.db"
    conn = sqlite3.connect(db)
    conn.execute("update alembic_version set version_num = '0028'")
    conn.execute("drop table watch_events")  # schema now incomplete
    conn.commit()
    conn.close()

    with pytest.raises(CommandError):  # heal skips (table missing); upgrade then can't resolve '0028'
        run_migrations(tmp_path)

    conn = sqlite3.connect(db)
    version = conn.execute("select version_num from alembic_version").fetchone()[0]
    conn.close()
    assert version == "0028"  # left as-is, NOT rewritten to 0001
