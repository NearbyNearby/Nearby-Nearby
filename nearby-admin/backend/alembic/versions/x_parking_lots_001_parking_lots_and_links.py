"""Reusable parking lots: ``parking_lots`` + ``poi_parking_links`` (issues #90 / #161).

Revision ID: x_parking_lots_001
Revises: v_real_geometries_001
Create Date: 2026-08-08

A parking lot is frequently SHARED: one municipal deck serves a dozen
storefronts, one trailhead lot serves both the park and the trail. Until now the
only representation was a POI's OWN pins (``poi_points`` rows with
``kind='parking'``), which no second POI can reference, so a shared lot had to
be re-entered, re-pinned and re-photographed everywhere it appears and edits
never propagated.

This migration is purely ADDITIVE. It creates:

    parking_lots        one row per SHAREABLE lot. ``owner_poi_id`` NULL means a
                        standalone, admin-curated public lot; NOT NULL means the
                        lot belongs to that POI but is offered to others.
    poi_parking_links   which POIs surface which lot, in which order, with an
                        optional linker-owned ``label`` ("free after 5pm").

and widens ``images`` so a lot can own photos:

    images.parking_lot_id   nullable FK, ON DELETE CASCADE.
    images.poi_id           NOT NULL dropped (widening only). A STANDALONE lot's
                            photo has no POI owner, so it stays invisible to every
                            existing ``WHERE poi_id = ...`` query path. An OWNED
                            lot's photo sets BOTH ids and keeps appearing in the
                            owner's parking_images collection: zero regression.
    ck_images_owner_present CHECK (poi_id IS NOT NULL OR parking_lot_id IS NOT NULL)

The POI's own-parking path is NOT touched: nothing here reads, rewrites or
backfills ``poi_points``. The two representations are unified at READ time into
one ``parking_lots`` array with an ``origin`` discriminator (see
``shared/parking_lots.py``). Collapsing them into a single table is a follow-up
contract release, deliberately not this one.

Schema decisions (matching s_poi_points_001's precedent):
  * ``expect_to_pay`` and ``publication_status`` are varchar guarded by CHECK,
    NOT native Postgres enums: this schema's controlled vocab is always
    varchar + CHECK, and CHECK avoids the enum deploy hazards.
  * No new ``ImageType`` enum value. Lot photos reuse ``image_type='parking'``,
    which avoids an ALTER TYPE on the ``imagetype`` enum entirely.
  * ``parking_lots.geom`` is NULLABLE (unlike ``poi_points.geom``): a lot may be
    recorded from an address before anyone pins it.
  * ``ck_images_owner_present`` is added NOT VALID then VALIDATEd separately, so
    the initial ALTER takes only a brief lock on ``images``.

NO data migration / backfill. Every DDL statement is IF NOT EXISTS or guarded, so
re-running is a no-op.

Deploy ordering (MIGRATIONS-FIRST): the new code reads ``poi_parking_links`` and
``parking_lots`` on EVERY POI detail response. Shipping the code before the
tables means a missing relation -> 500, not "no lots". Apply this migration
first; it is safe against still-old tasks during the rolling window, since the
tables are additive and old code never touches them, and the ``images.poi_id``
NOT NULL drop only widens what old code may insert.

Prod sequence: take a manual RDS snapshot FIRST
(aws rds create-db-snapshot --db-instance-identifier nearby-admin-db
--db-snapshot-identifier pre-migration-x_parking_lots_001-<date>
--profile nn-prod), then apply this migration, then deploy admin + app.

Downgrade removes everything it added: the CHECK, the column and its index, the
two tables. It restores ``images.poi_id NOT NULL`` only after deleting the
lot-only image rows that could not satisfy it (those rows are lot photos, which
disappear with the lots anyway).
"""

from alembic import op


revision = 'x_parking_lots_001'
down_revision = 'v_real_geometries_001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. The shareable lot table. Raw SQL keeps the PostGIS geometry type and the
    #    GIST index explicit and independent of geoalchemy2's DDL hooks.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS parking_lots (
            id            uuid PRIMARY KEY,
            owner_poi_id  uuid NULL REFERENCES points_of_interest(id) ON DELETE CASCADE,
            name          varchar(255) NOT NULL,
            parking_types jsonb NOT NULL DEFAULT '[]'::jsonb,
            accessible_parking_details jsonb NOT NULL DEFAULT '[]'::jsonb,
            notes         text,
            geom          geometry(Point, 4326) NULL,
            what3words    varchar(100),
            address_hint  varchar(255),
            expect_to_pay varchar(20),
            publication_status varchar(20) NOT NULL DEFAULT 'draft',
            created_at    timestamptz NOT NULL DEFAULT now(),
            updated_at    timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ck_parking_lots_expect_to_pay_valid CHECK (
                expect_to_pay IS NULL OR expect_to_pay IN ('yes','no','sometimes')
            ),
            CONSTRAINT ck_parking_lots_publication_status_valid CHECK (
                publication_status IN ('draft','published','archived')
            )
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_parking_lots_owner_poi_id ON parking_lots (owner_poi_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_parking_lots_geom ON parking_lots USING GIST (geom)")

    # 2. The link edge. Composite PK makes a duplicate link impossible; both FKs
    #    cascade so neither a deleted POI nor a deleted lot can leave a ghost ref.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS poi_parking_links (
            poi_id         uuid NOT NULL REFERENCES points_of_interest(id) ON DELETE CASCADE,
            parking_lot_id uuid NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
            sort_order     integer NOT NULL DEFAULT 0,
            label          varchar(160),
            created_at     timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (poi_id, parking_lot_id)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_poi_parking_links_lot ON poi_parking_links (parking_lot_id)")

    # 3. Widen images so a lot can own photos.
    op.execute("ALTER TABLE images ADD COLUMN IF NOT EXISTS parking_lot_id uuid NULL")
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_images_parking_lot_id'
            ) THEN
                ALTER TABLE images ADD CONSTRAINT fk_images_parking_lot_id
                    FOREIGN KEY (parking_lot_id) REFERENCES parking_lots(id) ON DELETE CASCADE;
            END IF;
        END $$;
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_images_parking_lot_id ON images (parking_lot_id)")
    op.execute("ALTER TABLE images ALTER COLUMN poi_id DROP NOT NULL")

    # 4. An image must belong to SOMETHING. NOT VALID first so the ALTER is a
    #    catalog-only change, then a separate VALIDATE that takes no write lock.
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'ck_images_owner_present'
            ) THEN
                ALTER TABLE images ADD CONSTRAINT ck_images_owner_present
                    CHECK (poi_id IS NOT NULL OR parking_lot_id IS NOT NULL) NOT VALID;
            END IF;
        END $$;
        """
    )
    op.execute("ALTER TABLE images VALIDATE CONSTRAINT ck_images_owner_present")


def downgrade() -> None:
    op.execute("ALTER TABLE images DROP CONSTRAINT IF EXISTS ck_images_owner_present")
    # Lot-only rows cannot satisfy poi_id NOT NULL; they are lot photos, which go
    # away with the lots below, so delete them before restoring the constraint.
    op.execute("DELETE FROM images WHERE poi_id IS NULL")
    op.execute("DROP INDEX IF EXISTS ix_images_parking_lot_id")
    op.execute("ALTER TABLE images DROP CONSTRAINT IF EXISTS fk_images_parking_lot_id")
    op.execute("ALTER TABLE images DROP COLUMN IF EXISTS parking_lot_id")
    op.execute("ALTER TABLE images ALTER COLUMN poi_id SET NOT NULL")

    op.execute("DROP TABLE IF EXISTS poi_parking_links")
    op.execute("DROP TABLE IF EXISTS parking_lots")
