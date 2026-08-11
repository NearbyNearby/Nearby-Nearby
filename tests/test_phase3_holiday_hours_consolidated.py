"""Issue #70 — verify consolidation of holiday_hours into hours.holidays.

Holiday hours now live only at the nested `hours.holidays` JSONB key. The
legacy top-level `points_of_interest.holiday_hours` column has been renamed
to `_deprecated_holiday_hours` by Alembic migration g70_001, with a one-way
backfill into `hours.holidays`.

These tests assert:

* The admin form's canonical store accepts and returns `hours.holidays`.
* The CRUD response does NOT expose the deprecated `holiday_hours` top-level
  key.
* Even if a payload sends a top-level `holiday_hours` (legacy clients), the
  Pydantic schema strips it silently so it never lands in the DB.
* Direct SQL backfill from legacy column → nested key still works on a
  database that has the legacy column (mirroring the migration's behavior).

Note: the integration test harness has a pre-existing bcrypt-72-byte issue at
fixture setup time; these tests are written to pass once that environmental
problem is resolved.
"""

from sqlalchemy import text

from conftest import create_park


class TestHolidayHoursConsolidated:
    """Issue #70 — single canonical store at hours.holidays."""

    def test_park_can_write_and_read_hours_holidays(self, admin_client):
        hours_with_holidays = {
            "monday": [{"open": "08:00", "close": "20:00"}],
            "holidays": {
                "christmas": "Closed",
                "thanksgiving": {"open": "10:00", "close": "14:00"},
            },
        }
        park = create_park(admin_client, name="Holiday Park #70", hours=hours_with_holidays)
        poi_id = park["id"]

        resp = admin_client.get(f"/api/pois/{poi_id}")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["hours"]["holidays"]["christmas"] == "Closed"
        assert data["hours"]["holidays"]["thanksgiving"]["open"] == "10:00"

    def test_response_omits_legacy_top_level_holiday_hours(self, admin_client):
        """`holiday_hours` must NOT appear at the top level of CRUD responses."""
        park = create_park(
            admin_client,
            name="No Legacy #70",
            hours={"holidays": {"christmas": "Closed"}},
        )
        # Field absent (or at minimum, not exposed as top-level data).
        assert "holiday_hours" not in park

        resp = admin_client.get(f"/api/pois/{park['id']}")
        assert resp.status_code == 200
        assert "holiday_hours" not in resp.json()

    def test_holiday_modes_stay_nested_under_hours(self, admin_client):
        """#116 - the new per-holiday mode/note lives at hours.holidays only.

        Adding richer holiday data must not tempt anything into resurrecting the
        deprecated top-level column.
        """
        park = create_park(
            admin_client,
            name="Holiday Modes #116",
            hours={
                "holidays": {
                    "christmas": {
                        "name": "Christmas Day", "date": "12-25",
                        "mode": "closed", "status": "closed", "note": "Reopens December 26",
                    },
                },
            },
        )
        resp = admin_client.get(f"/api/pois/{park['id']}")
        assert resp.status_code == 200
        data = resp.json()
        assert "holiday_hours" not in data
        assert data["hours"]["holidays"]["christmas"]["mode"] == "closed"
        assert data["hours"]["holidays"]["christmas"]["note"] == "Reopens December 26"

    def test_legacy_top_level_holiday_hours_is_ignored(self, admin_client):
        """Sending the deprecated top-level field on create is silently dropped."""
        # Schema does not declare `holiday_hours` anymore, so Pydantic
        # (extra='ignore' by default in this codebase) drops it.
        payload = {
            "name": "Legacy Sender #70",
            "poi_type": "PARK",
            "location": {"type": "Point", "coordinates": [-79.1, 35.9]},
            "park": {},
            "holiday_hours": {"christmas": "Closed"},
            "hours": {"monday": [{"open": "08:00", "close": "20:00"}]},
        }
        resp = admin_client.post("/api/pois/", json=payload)
        assert resp.status_code == 201, resp.text
        data = resp.json()
        # Top-level legacy field must not round-trip.
        assert "holiday_hours" not in data
        # And the nested key the client did NOT send remains absent —
        # the legacy field is not silently moved.
        assert "holidays" not in (data.get("hours") or {})

    def test_top_level_holiday_hours_column_is_absent(self, db_session):
        """After Issue #70, `points_of_interest.holiday_hours` must not exist.

        The test fixture builds tables from current ORM metadata via
        `create_all()`; the legacy column has been removed from the model
        in this branch, so it should not appear in information_schema.
        """
        row = db_session.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'points_of_interest' "
            "  AND column_name = 'holiday_hours'"
        )).fetchone()
        assert row is None, (
            "points_of_interest.holiday_hours should not exist after Issue #70 "
            "consolidation; column should be renamed to "
            "_deprecated_holiday_hours by migration g70_001."
        )


class TestHolidayHoursBackfillSQL:
    """Issue #70 — simulate the migration's backfill on a synthetic legacy row.

    The integration test schema does not carry the legacy column (the ORM
    has been pruned), so we reproduce the legacy condition manually with raw
    SQL and assert the migration's backfill logic moves the data into
    `hours -> 'holidays'`.
    """

    def test_backfill_moves_legacy_column_into_nested_key(self, db_session):
        # 1. Recreate the legacy state: add the deprecated column locally,
        #    seed a row with data in it and no nested holidays key.
        db_session.execute(text("""
            ALTER TABLE points_of_interest
            ADD COLUMN IF NOT EXISTS holiday_hours JSONB
        """))

        # Seed a row that mimics a legacy POI (set hours = '{}' so the WHERE
        # clause's "no holidays key" branch hits).
        db_session.execute(text("""
            INSERT INTO points_of_interest
                (id, name, poi_type, publication_status, location, hours, holiday_hours)
            VALUES (
                gen_random_uuid(),
                'Legacy Backfill POI #70',
                'BUSINESS',
                'draft',
                ST_SetSRID(ST_MakePoint(-79, 36), 4326),
                '{}'::jsonb,
                '{"christmas": "closed"}'::jsonb
            )
        """))
        db_session.commit()

        # 2. Run the exact backfill SQL from migration g70_001.
        db_session.execute(text("""
            UPDATE points_of_interest
            SET hours = jsonb_set(
                COALESCE(hours, '{}'::jsonb),
                '{holidays}',
                holiday_hours,
                true
            )
            WHERE holiday_hours IS NOT NULL
              AND jsonb_typeof(holiday_hours) = 'object'
              AND (
                  hours IS NULL
                  OR jsonb_typeof(hours) <> 'object'
                  OR (hours -> 'holidays') IS NULL
              )
        """))
        db_session.commit()

        # 3. Confirm the data moved into hours.holidays.
        row = db_session.execute(text(
            "SELECT hours -> 'holidays' AS holidays "
            "FROM points_of_interest "
            "WHERE name = 'Legacy Backfill POI #70'"
        )).fetchone()
        assert row is not None
        assert row.holidays is not None
        assert row.holidays.get("christmas") == "closed"

        # 4. Cleanup so other tests do not see the synthetic legacy column.
        db_session.execute(text(
            "ALTER TABLE points_of_interest DROP COLUMN IF EXISTS holiday_hours"
        ))
        db_session.commit()
