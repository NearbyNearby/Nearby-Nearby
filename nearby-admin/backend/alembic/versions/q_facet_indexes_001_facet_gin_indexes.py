"""Task 2.2: GIN (jsonb_path_ops) indexes for Nearby facet filtering.

Revision ID: q_facet_indexes_001
Revises: p_drop_deprecated_001
Create Date: 2026-07-03

The Nearby feature now filters candidates by attribute facets. Two of the
facets translate to JSONB containment (`@>`) queries:

  * payment_methods @> '["<method>"]'          (payment facet)
  * ideal_for       @> '{"age_group": [...]}'  (kid-friendly facet)

`jsonb_path_ops` GIN indexes make those containment lookups index-backed. They
are a pure read optimisation (no schema/column change) and cheap to build at the
current ~31-row scale; they matter as the dataset grows via imports.

The boolean facets (icon_pet_friendly / icon_public_restroom /
icon_wheelchair_accessible / icon_free_wifi / playground_available) and the
alcohol facet (alcohol_available string) are plain btree columns and need no
index at this scale, so none is added (nothing speculative).

Guarded with IF NOT EXISTS / IF EXISTS so re-runs and the create_all test DB
(which never defines these indexes) stay safe. Downgrade drops both indexes.
"""

from alembic import op


revision = 'q_facet_indexes_001'
down_revision = 'p_drop_deprecated_001'
branch_labels = None
depends_on = None


# (index_name, column) pairs. jsonb_path_ops supports the @> containment operator.
_GIN_INDEXES = [
    ('ix_poi_payment_methods_gin', 'payment_methods'),
    ('ix_poi_ideal_for_gin', 'ideal_for'),
]


def upgrade() -> None:
    for index_name, column in _GIN_INDEXES:
        op.execute(
            f"CREATE INDEX IF NOT EXISTS {index_name} "
            f"ON points_of_interest USING gin ({column} jsonb_path_ops)"
        )


def downgrade() -> None:
    for index_name, _ in _GIN_INDEXES:
        op.execute(f"DROP INDEX IF EXISTS {index_name}")
