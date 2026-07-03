"""Task 1.3: drop the migrated _deprecated_* columns.

Migration ``p_drop_deprecated_001`` drops three columns whose data was already
consolidated into their destinations in earlier waves:

  * points_of_interest._deprecated_holiday_hours     (JSONB)
  * points_of_interest._deprecated_payphone_location (JSONB)
  * events._deprecated_primary_display_category      (VARCHAR(100))

Prod was verified read-only (2026-07-03) to hold NO data in any of them.

The test DB is built by ``create_all`` from the shared ORM, which never mapped
these columns, so this test first ADDS them (simulating the pre-migration prod
schema), then exercises upgrade -> downgrade -> upgrade on real Postgres.
"""

import os
import importlib.util

import sqlalchemy as sa


# (table, column, expected information_schema.data_type after downgrade)
_COLS = [
    ("points_of_interest", "_deprecated_holiday_hours", "jsonb"),
    ("points_of_interest", "_deprecated_payphone_location", "jsonb"),
    ("events", "_deprecated_primary_display_category", "character varying"),
]


def _load_migration():
    here = os.path.dirname(__file__)
    mig_path = os.path.abspath(os.path.join(
        here, "..", "nearby-admin", "backend", "alembic", "versions",
        "p_drop_deprecated_001_drop_deprecated_columns.py",
    ))
    spec = importlib.util.spec_from_file_location("p_drop_deprecated_001", mig_path)
    mig = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mig)
    return mig


def _data_type(conn, table, column):
    return conn.execute(sa.text(
        "SELECT data_type FROM information_schema.columns "
        "WHERE table_name = :t AND column_name = :c"
    ), {"t": table, "c": column}).scalar()


def test_upgrade_downgrade_round_trips(db_session):
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    engine = db_session.get_bind()

    mig = _load_migration()
    assert mig.revision == "p_drop_deprecated_001"
    assert mig.down_revision == "o_poi_revisions_001"

    # create_all never adds these columns, so seed the pre-migration schema.
    with engine.begin() as conn:
        conn.execute(sa.text(
            "ALTER TABLE points_of_interest "
            "ADD COLUMN IF NOT EXISTS _deprecated_holiday_hours jsonb"))
        conn.execute(sa.text(
            "ALTER TABLE points_of_interest "
            "ADD COLUMN IF NOT EXISTS _deprecated_payphone_location jsonb"))
        conn.execute(sa.text(
            "ALTER TABLE events "
            "ADD COLUMN IF NOT EXISTS _deprecated_primary_display_category varchar(100)"))
        for table, column, _ in _COLS:
            assert _data_type(conn, table, column) is not None

    # upgrade(): all three columns dropped.
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            mig.upgrade()
        for table, column, _ in _COLS:
            assert _data_type(conn, table, column) is None, f"{table}.{column} not dropped"

    # upgrade() is idempotent (guarded on existence): re-running is a no-op.
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            mig.upgrade()
        for table, column, _ in _COLS:
            assert _data_type(conn, table, column) is None

    # downgrade(): columns re-added as nullable, with their original types.
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            mig.downgrade()
        for table, column, want_type in _COLS:
            got = _data_type(conn, table, column)
            assert got == want_type, f"{table}.{column} type {got!r} != {want_type!r}"

    # Re-run upgrade so the schema matches the migrated end-state (== create_all)
    # for test teardown.
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            mig.upgrade()
        for table, column, _ in _COLS:
            assert _data_type(conn, table, column) is None
