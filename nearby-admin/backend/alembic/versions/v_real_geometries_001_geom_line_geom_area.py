"""Task 2.4: real geometries for GIS — geom_line + geom_area on points_of_interest.

Adds two nullable PostGIS columns alongside the existing required POINT
``location``:

  * ``geom_line`` geometry(LineString, 4326) — trail routes
  * ``geom_area`` geometry(Polygon,   4326) — park boundaries

Both get a GIST index. The index names match geoalchemy2's auto spatial-index
convention (``idx_<table>_<column>``) so a create_all-built database (the test
DB) and this migration produce the SAME index name — every statement is
``IF [NOT] EXISTS`` so the migration is idempotent and safe whether or not the
column/index already exists.

These columns are populated by import scripts and, later, the admin Leaflet-draw
UI (Task 4.3). They are never serialized as raw geometry to a public endpoint
(registry audience=admin); the only public derivation is a trail's length in
miles via ST_Length(geom_line::geography) (see shared/poi_geometry.py).

Downgrade drops both indexes and columns. Expand/contract: this migration only
ADDS nullable columns, so it is safe to deploy ahead of any code that reads them.

Revision ID: v_real_geometries_001
Revises: u_validation_checks_001
Create Date: 2026-07-04
"""

from alembic import op


revision = 'v_real_geometries_001'
down_revision = 'u_validation_checks_001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.execute(
        "ALTER TABLE points_of_interest "
        "ADD COLUMN IF NOT EXISTS geom_line geometry(LineString, 4326)"
    )
    op.execute(
        "ALTER TABLE points_of_interest "
        "ADD COLUMN IF NOT EXISTS geom_area geometry(Polygon, 4326)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_points_of_interest_geom_line "
        "ON points_of_interest USING gist (geom_line)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_points_of_interest_geom_area "
        "ON points_of_interest USING gist (geom_area)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_points_of_interest_geom_line")
    op.execute("DROP INDEX IF EXISTS idx_points_of_interest_geom_area")
    op.execute("ALTER TABLE points_of_interest DROP COLUMN IF EXISTS geom_line")
    op.execute("ALTER TABLE points_of_interest DROP COLUMN IF EXISTS geom_area")
