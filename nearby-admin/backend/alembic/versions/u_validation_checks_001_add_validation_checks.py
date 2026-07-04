"""Task 2.6: CHECK constraints for the remaining enum-like VARCHAR columns.

Revision ID: u_validation_checks_001
Revises: t_one_representation_001
Create Date: 2026-07-04

Mirrors the existing pattern from ``i_alcohol_001`` (alcohol/parking/listing_type/
publication_status/sponsor_level): several columns are declared ``VARCHAR`` with
no CHECK constraint, so an out-of-vocab value (an empty string, a legacy default)
sneaks in via the raw-dict autosave path. This migration constrains six more:

  points_of_interest:
    * status                  -> BUSINESS_STATUS_OPTIONS (the superset covering
                                 every POI type; OTHER_STATUS_TYPES is a subset)
    * gift_cards              -> GIFT_CARD_OPTIONS values
    * drone_usage            -> DRONE_USAGE_OPTIONS
    * hunting_fishing_allowed -> admin HUNTING_FISHING_OPTIONS ('no'/'seasonal'/
                                 'year_round'; no shared constant exists, derived
                                 from the admin Radio option list)
    * fishing_allowed        -> admin FISHING_OPTIONS ('no'/'catch_release'/
                                 'catch_keep'/'other'; same, derived from admin)
  events:
    * event_status           -> EVENT_STATUS_OPTIONS

All six columns are nullable, so every constraint is NULL-tolerant
(``col IS NULL OR col IN (...)``), matching the base pattern.

NORMALIZE FIRST (from a read-only prod audit, 2026-07-04, 25 POIs / 1 event):
  * status: 24 rows held the legacy default 'active' + 1 held 'Fully Open'.
    'active' is the pre-BUSINESS_STATUS_OPTIONS default and is the semantic
    equivalent of 'Fully Open' (the current ORM default), so it is mapped
    'active' -> 'Fully Open' (an explicit, justified mapping) rather than NULLed
    (status is a public-facing display field; NULLing 24 of 25 rows would drop
    the "this place is open" signal).
  * gift_cards: 23 rows held '' (empty string) -> NULLed. ('no' x1, 'yes_this_only'
    x1 already valid.)
  * drone_usage: 24 rows held '' -> NULLed. ('No' x1 already valid.)
  * hunting_fishing_allowed / fishing_allowed / event_status: no out-of-vocab
    values in prod; the general NULL-out below is a no-op belt-and-suspenders.

After the explicit mapping, a general pass NULLs any remaining out-of-vocab value
for each column (all nullable), then the constraint is added via ``NOT VALID`` +
``VALIDATE CONSTRAINT`` to keep the table-lock window short.

Idempotency: cleanup only touches non-conforming rows; the constraint add is
guarded by a ``pg_constraint`` lookup. Downgrade drops the constraints; the
normalization is NOT reverted (the original out-of-vocab values are unrecoverable
and were invalid by design).

Deploy ordering (MIGRATIONS-FIRST, with a caveat): the rest of the Phase 2 batch
must apply before the code (their new tables/columns are read by the new code).
This migration is the one exception where migrations-first has a small window:
once the CHECK is live, a STILL-OLD task that writes an untouched Radio field
(the admin form's default for ``drone_usage`` is ``''``) would trip the CHECK.
The new code coerces ''/whitespace -> NULL for these columns before writing (see
``app/schemas/_coercers.py`` CHECK_ENUM_STRING_FIELDS), so once the deploy
completes the hazard is gone; the residual risk is only an old task doing a POI
write during the short rolling window (rare at this manual-curation scale, and
the reverse ordering would 500 every read for the r_/s_/v_ migrations, which is
far worse). Apply with the batch; snapshot RDS first.
"""

from alembic import op
from sqlalchemy import text


revision = 'u_validation_checks_001'
down_revision = 't_one_representation_001'
branch_labels = None
depends_on = None


# Allowed vocabulary per (table, column). All columns are nullable.
ENUM_COLUMNS = {
    ('points_of_interest', 'status'): (
        'Fully Open', 'Partly Open', 'Temporary Hour Changes', 'Temporarily Closed',
        'Call Ahead', 'Permanently Closed', 'Warning', 'Limited Capacity',
        'Coming Soon', 'Under Development', 'Alert',
    ),
    ('points_of_interest', 'gift_cards'):
        ('yes_this_only', 'no', 'yes_select_others'),
    ('points_of_interest', 'drone_usage'):
        ('Yes, follow all current Drone Laws', 'Yes, With Permit from Park', 'No'),
    ('points_of_interest', 'hunting_fishing_allowed'):
        ('no', 'seasonal', 'year_round'),
    ('points_of_interest', 'fishing_allowed'):
        ('no', 'catch_release', 'catch_keep', 'other'),
    ('events', 'event_status'): (
        'Scheduled', 'Canceled', 'Postponed', 'Updated Date and/or Time',
        'Rescheduled', 'Moved Online', 'Unofficial Proposed Date',
    ),
}

# Explicit, data-justified value remaps applied BEFORE the general NULL-out.
# (table, col) -> {old_value: canonical_value}
NORMALIZE = {
    ('points_of_interest', 'status'): {'active': 'Fully Open'},
}


def _lit(value):
    return "'" + value.replace("'", "''") + "'"


def _quote(values):
    return ", ".join(_lit(v) for v in values)


def upgrade() -> None:
    bind = op.get_bind()

    # 1a. Explicit documented remaps.
    for (table, col), mapping in NORMALIZE.items():
        for old, new in mapping.items():
            op.execute(
                f"UPDATE {table} SET {col} = {_lit(new)} WHERE {col} = {_lit(old)}"
            )

    # 1b. General cleanup: NULL out anything still not in the allowed set
    #     (catches '' and any straggler; every column here is nullable).
    for (table, col), allowed in ENUM_COLUMNS.items():
        allowed_sql = _quote(allowed)
        op.execute(
            f"UPDATE {table} SET {col} = NULL "
            f"WHERE {col} IS NOT NULL AND {col} NOT IN ({allowed_sql})"
        )

    # 2. Add CHECK NOT VALID, then VALIDATE CONSTRAINT.
    for (table, col), allowed in ENUM_COLUMNS.items():
        constraint = f"ck_{table}_{col}_valid"
        allowed_sql = _quote(allowed)
        already_exists = bind.execute(
            text("SELECT 1 FROM pg_constraint WHERE conname = :name"),
            {"name": constraint},
        ).scalar()
        if not already_exists:
            op.execute(
                f"ALTER TABLE {table} ADD CONSTRAINT {constraint} "
                f"CHECK ({col} IS NULL OR {col} IN ({allowed_sql})) NOT VALID"
            )
        op.execute(f"ALTER TABLE {table} VALIDATE CONSTRAINT {constraint}")


def downgrade() -> None:
    for (table, col), _ in ENUM_COLUMNS.items():
        constraint = f"ck_{table}_{col}_valid"
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint}")
