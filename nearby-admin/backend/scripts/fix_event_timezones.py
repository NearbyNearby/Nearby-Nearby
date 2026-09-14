#!/usr/bin/env python3
"""Issue #180 data fix: correct event times stored with the wrong timezone.

The admin event form once sent timezone-naive times ("2026-09-17 19:00:00")
that Postgres stored as UTC, so an event typed as 7 PM Eastern is stored as
19:00Z (3 PM Eastern). This script reinterprets the stored UTC wall clock as
America/New_York wall time — in SQL terms
``(col AT TIME ZONE 'UTC') AT TIME ZONE 'America/New_York'`` — which is
correct for both summer (EDT, UTC-4) and winter (EST, UTC-5) rows.

Events written through the reschedule modal carry real offsets and are
already correct, so correction must never be blind: the default mode is a
dry run that changes nothing, and ``--apply`` requires an explicit ``--ids``
list so a blanket second run cannot shift the same rows twice.

Columns corrected (every timestamptz the admin event form writes):
``events.start_datetime``, ``events.end_datetime``,
``events.recurrence_end_date``, ``events.vendor_application_deadline``.

Usage
-----
    # Dry run over ALL events (prints current vs corrected, changes nothing)
    python scripts/fix_event_timezones.py

    # Dry run for specific events
    python scripts/fix_event_timezones.py --ids <poi_id> [<poi_id> ...]

    # Apply the correction to ONLY the listed events, one transaction
    python scripts/fix_event_timezones.py --apply --ids <poi_id> [<poi_id> ...]

``--apply`` without ``--ids`` is refused. Prod needs an RDS snapshot first
(see the root CLAUDE.md); run it as an ECS run-task like the embedding
backfill (see scripts/README.md).
"""

import argparse
import os
import sys
from datetime import timezone
from zoneinfo import ZoneInfo

from sqlalchemy import text

# Add the backend root (parent of scripts/) to sys.path so `app` resolves the
# same way the other admin scripts do (see backfill_embeddings.py).
_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_ROOT not in sys.path:
    sys.path.append(_BACKEND_ROOT)

from app.database import SessionLocal  # noqa: E402  admin app DB session

EASTERN = ZoneInfo("America/New_York")

# (column, nullable) pairs corrected on the events table. Only timestamptz
# columns the admin form writes; repeat_pattern / excluded_dates / manual_dates
# are JSONB and carry no absolute instants.
DATETIME_COLUMNS = [
    ("start_datetime", False),
    ("end_datetime", True),
    ("recurrence_end_date", True),
    ("vendor_application_deadline", True),
]


def _to_eastern(value):
    return value.astimezone(EASTERN)


def correct_event_times(db, ids=None, apply=False):
    """Reinterpret stored event UTC wall clocks as America/New_York wall time.

    With ``apply=False`` (dry run) nothing is changed: it returns, per event,
    ``(row, {column: (old, new)})``. With ``apply=True`` the same computation
    is written back in one transaction (committed here) and only for ``ids``;
    ``apply=True`` with ``ids=None`` raises ValueError so a blanket second run
    cannot shift rows twice.
    """
    if apply and ids is None:
        raise ValueError(
            "Refusing to apply without --ids. Correcting every event blindly "
            "would double-shift rows written with real offsets (reschedule "
            "modal). List the events to correct: --apply --ids <poi_id> [...]"
        )

    sql = (
        "SELECT e.poi_id AS poi_id, e.start_datetime AS start_datetime, "
        "e.end_datetime AS end_datetime, "
        "e.recurrence_end_date AS recurrence_end_date, "
        "e.vendor_application_deadline AS vendor_application_deadline, "
        "p.name AS poi_name, p.publication_status AS publication_status "
        "FROM events e JOIN points_of_interest p ON p.id = e.poi_id"
    )
    params = {}
    if ids is not None:
        sql += " WHERE e.poi_id = ANY(CAST(:ids AS uuid[]))"
        params["ids"] = [str(i) for i in ids]
    sql += " ORDER BY p.name"
    query = text(sql)

    rows = db.execute(query, params).fetchall()

    results = []
    for row in rows:
        changes = {}
        for column, _nullable in DATETIME_COLUMNS:
            value = getattr(row, column)
            if value is None:
                continue
            # The stored value is an aware UTC instant whose UTC wall clock is
            # the Eastern wall clock the admin intended. Rebuild that wall
            # clock in Eastern: strip the UTC offset, attach Eastern.
            corrected = value.replace(tzinfo=None).replace(tzinfo=EASTERN)
            if corrected == value:
                continue
            changes[column] = (value, corrected)

        results.append((row, changes))

        if not changes:
            print(
                f"  {row.poi_name} ({row.poi_id}, {row.publication_status}): "
                "no shift needed"
            )
            continue

        for column, (old, new) in changes.items():
            print(
                f"  {row.poi_name} ({row.poi_id}, {row.publication_status}) "
                f"{column}: {old.isoformat()} "
                f"[{_to_eastern(old).isoformat()}] -> {new.isoformat()} "
                f"[{_to_eastern(new).isoformat()}]"
            )

        if apply:
            sets = ", ".join(f"{column} = :new_{column}" for column in changes)
            db.execute(
                text(f"UPDATE events SET {sets} WHERE poi_id = :poi_id"),
                {
                    **{f"new_{column}": new for column, (_o, new) in changes.items()},
                    "poi_id": str(row.poi_id),
                },
            )

    if apply:
        db.commit()
    return results


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Issue #180 data fix: reinterpret stored event UTC wall clocks as "
            "America/New_York wall time. Default mode is a dry run."
        )
    )
    parser.add_argument(
        "--ids", nargs="+", default=None, metavar="POI_ID",
        help="Only correct these event POI ids (required with --apply)",
    )
    parser.add_argument(
        "--apply", action="store_true",
        help="Write the corrected values (default is a dry run); requires --ids",
    )
    args = parser.parse_args()

    print("=" * 60)
    mode = "APPLY" if args.apply else "DRY RUN (nothing will change)"
    print(f"Event timezone correction — {mode}")
    print("=" * 60)

    db = SessionLocal()
    try:
        results = correct_event_times(db, ids=args.ids, apply=args.apply)
    finally:
        db.close()

    changed = sum(1 for _r, changes in results if changes)
    print(f"\n[DONE] {len(results)} event(s) examined, {changed} would change")
    if not args.apply and changed:
        print("Re-run with --apply --ids <poi_id> [...] to correct listed events.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
