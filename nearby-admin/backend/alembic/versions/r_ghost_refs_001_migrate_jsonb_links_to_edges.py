"""Task 2.1: migrate JSONB UUID-array POI links into poi_relationships edges.

Revision ID: r_ghost_refs_001
Revises: q_facet_indexes_001
Create Date: 2026-07-03

Six admin fields stored POI-to-POI links as untyped UUID arrays (or dict-lists)
inside JSONB columns, with NO referential integrity — deleting a referenced POI
left a dangling "ghost" UUID. This migration (the EXPAND step of expand/contract)
moves those links into the typed, FK-backed ``poi_relationships`` edge table:

    JSONB column               relationship_type
    ------------------------   ----------------------
    service_locations          service_location
    locally_found_at           locally_found_at
    associated_trails          associated_trail
    membership_passes          membership_pass
    vendor_poi_links (events)  vendor           (reuses the existing generic type)
    organization_memberships   organization_membership

What it does:
  1. Adds ``poi_relationships.meta`` (JSONB) to preserve per-edge extras that the
     old JSONB entries carried (an event vendor's ``vendor_type``; an
     organization-membership entry's display name / external link).
  2. Recreates both FKs with ``ON DELETE CASCADE`` so deleting a POI removes every
     edge referencing it, in BOTH directions (the ghost-ref fix).
  3. Backfills edge rows from the six JSONB columns. Idempotent
     (``ON CONFLICT DO NOTHING``) so it is SAFE TO RE-RUN — e.g. once more right
     after a rolling deploy, to pick up any JSONB writes made by still-old code
     during the rollout window. Ghost refs (UUIDs that do not resolve to an
     existing POI) are skipped and counted in the migration output.

What it does NOT do:
  * It does NOT drop the JSONB columns — that is a later (contract) release. The
    columns stay as the authoritative fallback until reads/writes are fully
    cut over and verified in prod.

Deploy ordering:
  * ``relationship_type`` is an unconstrained ``varchar`` (no DB enum, no CHECK),
    so the new values are plain strings — there is NO enum "both backends must
    know the value first" hazard here, and both backends now share ONE ORM
    (Task 1.2), so a single deploy carries the reader/writer everywhere.
  * Recommended prod order: snapshot RDS -> deploy the new app+admin image (reads
    and writes edges; stops writing the JSONB columns) -> run this migration
    (backfill) -> re-run the backfill once after all tasks are new, to catch any
    JSONB writes from old tasks during the rolling window.

Downgrade: reverses the SCHEMA only (drops ``meta``, restores the plain
non-cascade FKs). It deliberately LEAVES the backfilled edge rows in place — they
are derived data and the JSONB columns were retained as the source of truth, so
nothing is lost; a re-upgrade simply re-runs the idempotent backfill.
"""

import logging

from alembic import op


revision = 'r_ghost_refs_001'
down_revision = 'q_facet_indexes_001'
branch_labels = None
depends_on = None

logger = logging.getLogger("alembic.runtime.migration")

_SOURCE_FK = "poi_relationships_source_poi_id_fkey"
_TARGET_FK = "poi_relationships_target_poi_id_fkey"


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Per-edge metadata column (preserves vendor_type / org-membership extras).
    op.execute("ALTER TABLE poi_relationships ADD COLUMN IF NOT EXISTS meta jsonb")

    # 2. Recreate both FKs with ON DELETE CASCADE. Drop-IF-EXISTS first so the
    #    migration is robust to the auto-generated constraint names and re-runs.
    op.execute(f"ALTER TABLE poi_relationships DROP CONSTRAINT IF EXISTS {_SOURCE_FK}")
    op.execute(f"ALTER TABLE poi_relationships DROP CONSTRAINT IF EXISTS {_TARGET_FK}")
    op.execute(
        f"ALTER TABLE poi_relationships ADD CONSTRAINT {_SOURCE_FK} "
        "FOREIGN KEY (source_poi_id) REFERENCES points_of_interest(id) ON DELETE CASCADE"
    )
    op.execute(
        f"ALTER TABLE poi_relationships ADD CONSTRAINT {_TARGET_FK} "
        "FOREIGN KEY (target_poi_id) REFERENCES points_of_interest(id) ON DELETE CASCADE"
    )

    # 3. Backfill edges from the JSONB columns (idempotent; skips ghost refs).
    from shared.relationship_links import backfill_link_edges

    counts = backfill_link_edges(bind)
    total_written = sum(c["written"] for c in counts.values())
    total_skipped = sum(c["skipped"] for c in counts.values())
    summary = ", ".join(
        f"{f}: {c['written']} written / {c['skipped']} ghost-skipped"
        for f, c in counts.items()
    )
    msg = (
        f"[r_ghost_refs_001] backfilled {total_written} edges "
        f"({total_skipped} ghost refs skipped) — {summary}"
    )
    logger.info(msg)
    print(msg)


def downgrade() -> None:
    # Reverse the schema only. Backfilled edges are intentionally left in place
    # (derived data; the JSONB columns are the retained source of truth).
    op.execute(f"ALTER TABLE poi_relationships DROP CONSTRAINT IF EXISTS {_SOURCE_FK}")
    op.execute(f"ALTER TABLE poi_relationships DROP CONSTRAINT IF EXISTS {_TARGET_FK}")
    op.execute(
        f"ALTER TABLE poi_relationships ADD CONSTRAINT {_SOURCE_FK} "
        "FOREIGN KEY (source_poi_id) REFERENCES points_of_interest(id)"
    )
    op.execute(
        f"ALTER TABLE poi_relationships ADD CONSTRAINT {_TARGET_FK} "
        "FOREIGN KEY (target_poi_id) REFERENCES points_of_interest(id)"
    )
    op.execute("ALTER TABLE poi_relationships DROP COLUMN IF EXISTS meta")
