"""Task 1.3: drop the migrated _deprecated_* columns.

Revision ID: p_drop_deprecated_001
Revises: o_poi_revisions_001
Create Date: 2026-07-03

DEPLOY ORDER (expand/contract, per CLAUDE.md section 4):
Apply this migration to prod ONLY AFTER deploying images built from this branch.
The shared ORM no longer maps these columns and every read/write path was
stripped when they were renamed to `_deprecated_*` in earlier waves, so nothing
live references them. This is the irreversible "contract" step. Snapshot prod
first (`aws rds create-db-snapshot ...`) as CLAUDE.md requires.

Columns dropped (all verified empty in prod, read-only run-task 2026-07-03,
`data=0 unmigrated=0` for each; destinations already hold the data):
  * points_of_interest._deprecated_holiday_hours   (JSONB)  -> hours -> 'holidays'
  * points_of_interest._deprecated_payphone_location (JSONB) -> payphone_locations
  * events._deprecated_primary_display_category (VARCHAR(100))
        -> poi_categories.is_main + points_of_interest.main_category_id

NOT dropped here (already dropped upstream on this same live chain):
_deprecated_public_transit_info (w33b_001), _deprecated_key_facilities
(w34b_001), _deprecated_wheelchair_accessible (w45b_001).

Downgrade re-adds the columns as nullable columns of their original types so the
schema shape is restored. Data is NOT restored -- the contract step is one-way
on data by design (the data already lives in the destinations above).
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = 'p_drop_deprecated_001'
down_revision = 'o_poi_revisions_001'
branch_labels = None
depends_on = None


# (table, column) pairs dropped by this migration.
_DROPS = [
    ('points_of_interest', '_deprecated_holiday_hours'),
    ('points_of_interest', '_deprecated_payphone_location'),
    ('events', '_deprecated_primary_display_category'),
]


def upgrade() -> None:
    # Guard on existence so re-runs and environments that never had the columns
    # (e.g. a create_all test DB) stay safe.
    for table, column in _DROPS:
        op.execute(f"""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = '{table}'
                      AND column_name = '{column}'
                ) THEN
                    ALTER TABLE {table} DROP COLUMN {column};
                END IF;
            END$$;
        """)


def downgrade() -> None:
    # Re-add as nullable columns of the original types (schema shape only; the
    # legacy data is not restored -- it already lives in the destinations).
    op.add_column(
        'points_of_interest',
        sa.Column('_deprecated_holiday_hours', JSONB(), nullable=True),
    )
    op.add_column(
        'points_of_interest',
        sa.Column('_deprecated_payphone_location', JSONB(), nullable=True),
    )
    op.add_column(
        'events',
        sa.Column('_deprecated_primary_display_category', sa.String(100), nullable=True),
    )
