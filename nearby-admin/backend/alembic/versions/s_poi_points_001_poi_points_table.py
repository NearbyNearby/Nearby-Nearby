"""Task 2.3: move per-POI point geometry out of JSONB into ``poi_points``.

Revision ID: s_poi_points_001
Revises: r_ghost_refs_001
Create Date: 2026-07-03

Six admin fields stored point geometry (map pins) as arrays of ``{lat, lng, ...}``
objects (or, for the trailhead, a single object) inside JSONB columns, where
PostGIS could not query them:

    JSONB source (table.column)              kind
    --------------------------------------   ------------
    points_of_interest.parking_locations     parking
    points_of_interest.toilet_locations      restroom
    points_of_interest.playground_locations  playground
    points_of_interest.payphone_locations    payphone
    trails.access_points                     access_point
    trails.trailhead_location                trailhead

This migration (the EXPAND step of expand/contract) creates the GIST-indexed
``poi_points`` table and backfills it, so spatial queries ("nearest restroom to a
coordinate") work. The admin form and the public serialized shapes are unchanged:
the write path (see ``shared/poi_points.py``) stops writing the JSONB columns and
the reads reconstruct the original shape from ``poi_points``.

Schema decisions:
  * ``kind`` is an unconstrained ``varchar`` guarded by a CHECK constraint, NOT a
    native Postgres enum. The plan text suggested an enum, but this schema's
    precedent for controlled vocab (relationship_type, listing_type,
    publication_status, ...) is varchar + CHECK, and CHECK avoids the enum deploy
    hazards (both backends must know a value first; a value cannot be safely
    dropped without recreating the type). Deviation documented here per the task.
  * ``geom`` is ``geometry(Point, 4326) NOT NULL`` with a GIST index — a pin with
    no parseable coordinate pair has no point and is SKIPPED (and counted) by the
    backfill. The JSONB source columns are RETAINED this release, so any
    coordinate-less entries survive there until a later contract release.
  * ``meta`` (JSONB) holds every non-coordinate key from the original entry
    (name / notes / types / surfaces / description / what3words / photo_ids / ...)
    plus a reserved ``_pos`` ordinal so the original array order round-trips.

Backfill (idempotent): a ``(poi_id, kind)`` that already has rows is skipped, so
re-running is a no-op and a kind already written by the new write path during a
rolling deploy is never clobbered. Malformed / coordinate-less entries are
skipped and counted; the counts are logged.

Deploy ordering (recommended): snapshot RDS -> deploy the new app+admin image
(reads/writes poi_points; stops writing the JSONB columns) -> run this migration
(backfill) -> re-run the backfill once after all tasks are new, to pick up any
JSONB writes from old tasks during the rollout window.

Downgrade drops the table. The backfilled data is derived from the retained JSONB
columns, so nothing is lost; a re-upgrade re-runs the idempotent backfill.
"""

import logging

from alembic import op


revision = 's_poi_points_001'
down_revision = 'r_ghost_refs_001'
branch_labels = None
depends_on = None

logger = logging.getLogger("alembic.runtime.migration")


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Table + constraints + indexes. Raw SQL keeps the PostGIS geometry type
    #    and GIST index explicit and independent of geoalchemy2 DDL hooks.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS poi_points (
            id       uuid PRIMARY KEY,
            poi_id   uuid NOT NULL REFERENCES points_of_interest(id) ON DELETE CASCADE,
            kind     varchar NOT NULL,
            geom     geometry(Point, 4326) NOT NULL,
            meta     jsonb NOT NULL DEFAULT '{}'::jsonb,
            CONSTRAINT ck_poi_points_kind_valid CHECK (
                kind IN ('parking','restroom','playground','payphone','trailhead','access_point')
            )
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_poi_points_poi_id ON poi_points (poi_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_poi_points_geom ON poi_points USING GIST (geom)")

    # 2. Idempotent backfill from the six JSONB columns (skips + counts
    #    coordinate-less / malformed entries).
    from shared.poi_points import backfill_point_rows

    counts = backfill_point_rows(bind)
    total_written = sum(c["written"] for c in counts.values())
    total_skipped = sum(c["skipped"] for c in counts.values())
    summary = ", ".join(
        f"{f}: {c['written']} written / {c['skipped']} skipped"
        for f, c in counts.items()
    )
    msg = (
        f"[s_poi_points_001] backfilled {total_written} points "
        f"({total_skipped} coordinate-less/malformed skipped) -- {summary}"
    )
    logger.info(msg)
    print(msg)


def downgrade() -> None:
    # Derived data; the JSONB source columns are the retained source of truth.
    op.execute("DROP TABLE IF EXISTS poi_points")
