"""Task 2.5: one representation per concept (photos, contact, payments).

Revision ID: t_one_representation_001
Revises: s_poi_points_001
Create Date: 2026-07-04

Three concepts had duplicate storage. This migration (the EXPAND step of
expand/contract) consolidates each onto its winning representation by an
idempotent DATA backfill — no schema change, no column drop this release:

  * PHOTOS  -> the ``images`` table wins. Backfill any URL living ONLY in
    ``featured_image`` / ``photos`` / ``gallery_photos`` into an ``images`` row
    (``featured_image`` + ``photos.featured`` -> a single ``main`` hero;
    ``photos.gallery`` + ``gallery_photos`` -> ``gallery``). Deduped against
    existing ``images.storage_url`` per POI; ordering preserved via
    ``display_order``. See ``shared/poi_media.py``.

  * CONTACT -> the ``main_contact_*`` columns win. Fill ``main_contact_name`` /
    ``main_contact_phone`` / ``main_contact_email`` from ``contact_info.best.*``
    and ``offsite_emergency_contact`` from ``contact_info.emergency`` — ONLY where
    the column is empty (NULL/''); a differing column value is kept and the
    conflict logged (JSONB loses). See ``shared/poi_contact_payments.py``.

  * PAYMENTS -> the ``payment_methods`` column wins. Union
    ``amenities.payment_methods`` into it (order-preserving, deduped). This
    increases Task 2.2 facet correctness. Same module.

The three photo columns, ``contact_info``, and ``amenities.payment_methods`` are
RETAINED (expand/contract) and remain the recovery source until a later contract
release drops them. The write path stops writing all of them (photos/contact are
stripped from the payload; amenities.payment_methods is stripped before persist).

Idempotent + rolling-deploy safe: every backfill dedups/fills-only, so re-running
(e.g. once more after all tasks are the new image) is a no-op.

Deploy ordering (MIGRATIONS-FIRST — this migration before the code): unlike the
Task 2.1/2.3 migrations this adds no table/column, so there is no read-500 hazard
either way. But the new code derives featured_image/photos/gallery_photos from the
images table; a POI whose photo lived ONLY in a legacy column shows no hero until
this backfill creates its images row. Run this migration FIRST so no hero is
missing during the rolling window. Safe against still-old tasks: it only creates
images rows (indistinguishable from uploads) and old code reads the images table
normally.

Downgrade is a documented NO-OP: this migration only backfills derived data from
retained columns; a re-upgrade re-runs the idempotent backfills. (The image rows
it may create are indistinguishable from user uploads and are left in place, like
the Task 2.1/2.3 edge/point backfills.)
"""

import logging

from alembic import op


revision = 't_one_representation_001'
down_revision = 's_poi_points_001'
branch_labels = None
depends_on = None

logger = logging.getLogger("alembic.runtime.migration")


def upgrade() -> None:
    bind = op.get_bind()

    from shared.poi_media import backfill_images_from_legacy
    from shared.poi_contact_payments import (
        backfill_contact_info,
        backfill_payment_methods,
    )

    photos = backfill_images_from_legacy(bind)
    contact = backfill_contact_info(bind)
    payments = backfill_payment_methods(bind)

    msg = (
        f"[t_one_representation_001] photos: {photos['main']} main + "
        f"{photos['gallery']} gallery images written ({photos['skipped']} "
        f"already-present URLs skipped); contact: {contact['filled']} column "
        f"values filled ({contact['conflicts']} conflicts kept, "
        f"{contact['skipped']} already-set); payments: {payments['updated']} rows "
        f"unioned (+{payments['added']} values)"
    )
    logger.info(msg)
    print(msg)


def downgrade() -> None:
    # No-op: derived backfills from retained columns (see module docstring).
    pass
