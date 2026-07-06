"""Task 2.2: GIN facet-index migration q_facet_indexes_001 round-trips.

The migration adds two jsonb_path_ops GIN indexes used by the Nearby facet
containment queries (payment_methods, ideal_for). The create_all test DB never
defines them, so this test exercises upgrade (creates) -> downgrade (drops) ->
upgrade on real Postgres, mirroring tests/test_drop_deprecated_columns.py.
"""

import os
import importlib.util

import sqlalchemy as sa


_INDEXES = ["ix_poi_payment_methods_gin", "ix_poi_ideal_for_gin"]


def _load_migration():
    here = os.path.dirname(__file__)
    mig_path = os.path.abspath(os.path.join(
        here, "..", "nearby-admin", "backend", "alembic", "versions",
        "q_facet_indexes_001_facet_gin_indexes.py",
    ))
    spec = importlib.util.spec_from_file_location("q_facet_indexes_001", mig_path)
    mig = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mig)
    return mig


def _index_exists(conn, name):
    return conn.execute(sa.text(
        "SELECT 1 FROM pg_indexes "
        "WHERE tablename = 'points_of_interest' AND indexname = :n"
    ), {"n": name}).scalar() is not None


def test_upgrade_downgrade_round_trips(db_session):
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    engine = db_session.get_bind()

    mig = _load_migration()
    assert mig.revision == "q_facet_indexes_001"
    assert mig.down_revision == "p_drop_deprecated_001"

    # Clean slate: create_all does not define these, but guard anyway.
    with engine.begin() as conn:
        for name in _INDEXES:
            conn.execute(sa.text(f"DROP INDEX IF EXISTS {name}"))

    # upgrade(): both GIN indexes created.
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            mig.upgrade()
        for name in _INDEXES:
            assert _index_exists(conn, name), f"{name} not created"

    # upgrade() is idempotent (CREATE INDEX IF NOT EXISTS).
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            mig.upgrade()
        for name in _INDEXES:
            assert _index_exists(conn, name)

    # downgrade(): both dropped.
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            mig.downgrade()
        for name in _INDEXES:
            assert not _index_exists(conn, name), f"{name} not dropped"

    # Re-run upgrade so the schema matches the migrated end-state for teardown.
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            mig.upgrade()
        for name in _INDEXES:
            assert _index_exists(conn, name)
