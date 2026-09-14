"""Issue #180 data fix: correction script for event times already stored wrong.

The admin event form once sent timezone-naive times that Postgres stored as
UTC (a 7 PM Eastern entry became 19:00Z). fix_event_timezones.py reinterprets
the stored UTC wall clock as America/New_York wall time. These tests exercise
the script's correction function directly against the test DB.
"""

import importlib.util
import os
from datetime import datetime, timezone

import pytest

UTC = timezone.utc

_SCRIPT_PATH = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "nearby-admin", "backend", "scripts",
    "fix_event_timezones.py",
))
_spec = importlib.util.spec_from_file_location("fix_event_timezones", _SCRIPT_PATH)
fix_script = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fix_script)

from conftest import orm_create_event


def _event_row(db, poi):
    db.expire_all()
    from app.models.poi import Event
    return db.query(Event).filter(Event.poi_id == poi.id).one()


def test_dry_run_reports_but_changes_nothing(db_session):
    poi = orm_create_event(
        db_session,
        name="Dry Run Trivia",
        event_fields={
            "start_datetime": datetime(2026, 9, 1, 19, 0, tzinfo=UTC),
            "end_datetime": datetime(2026, 9, 1, 21, 0, tzinfo=UTC),
        },
    )

    results = fix_script.correct_event_times(db_session, ids=None, apply=False)

    assert len(results) == 1
    result_row, changes = results[0]
    assert result_row.poi_id == poi.id
    old_start, new_start = changes["start_datetime"]
    old_end, new_end = changes["end_datetime"]
    assert old_start == datetime(2026, 9, 1, 19, 0, tzinfo=UTC)
    assert new_start == datetime(2026, 9, 1, 23, 0, tzinfo=UTC)
    assert old_end == datetime(2026, 9, 1, 21, 0, tzinfo=UTC)
    assert new_end == datetime(2026, 9, 2, 1, 0, tzinfo=UTC)

    row = _event_row(db_session, poi)
    assert row.start_datetime == datetime(2026, 9, 1, 19, 0, tzinfo=UTC)
    assert row.end_datetime == datetime(2026, 9, 1, 21, 0, tzinfo=UTC)


def test_apply_shifts_only_listed_ids(db_session):
    summer = orm_create_event(
        db_session,
        name="Pub Trivia",
        event_fields={
            "start_datetime": datetime(2026, 9, 1, 19, 0, tzinfo=UTC),
            "end_datetime": datetime(2026, 9, 1, 21, 0, tzinfo=UTC),
            "recurrence_end_date": datetime(2026, 9, 30, 0, 0, tzinfo=UTC),
            "vendor_application_deadline": datetime(2026, 8, 25, 19, 0, tzinfo=UTC),
        },
    )
    other = orm_create_event(
        db_session,
        name="Farmers Market",
        event_fields={
            "start_datetime": datetime(2026, 7, 2, 15, 0, tzinfo=UTC),
            "end_datetime": datetime(2026, 7, 2, 18, 0, tzinfo=UTC),
        },
    )

    results = fix_script.correct_event_times(
        db_session, ids=[summer.id], apply=True
    )

    assert [row.poi_id for row, _ in results] == [summer.id]

    row = _event_row(db_session, summer)
    assert row.start_datetime == datetime(2026, 9, 1, 23, 0, tzinfo=UTC)
    assert row.end_datetime == datetime(2026, 9, 2, 1, 0, tzinfo=UTC)
    # Midnight UTC reinterpreted as midnight Eastern (EDT, UTC-4).
    assert row.recurrence_end_date == datetime(2026, 9, 30, 4, 0, tzinfo=UTC)
    assert row.vendor_application_deadline == datetime(2026, 8, 25, 23, 0, tzinfo=UTC)

    untouched = _event_row(db_session, other)
    assert untouched.start_datetime == datetime(2026, 7, 2, 15, 0, tzinfo=UTC)
    assert untouched.end_datetime == datetime(2026, 7, 2, 18, 0, tzinfo=UTC)


def test_apply_without_ids_is_refused(db_session):
    poi = orm_create_event(
        db_session,
        name="Refused Event",
        event_fields={"start_datetime": datetime(2026, 9, 1, 19, 0, tzinfo=UTC)},
    )

    with pytest.raises(ValueError):
        fix_script.correct_event_times(db_session, ids=None, apply=True)

    row = _event_row(db_session, poi)
    assert row.start_datetime == datetime(2026, 9, 1, 19, 0, tzinfo=UTC)


def test_winter_row_reinterprets_as_est(db_session):
    poi = orm_create_event(
        db_session,
        name="Winter Event",
        event_fields={"start_datetime": datetime(2026, 1, 15, 19, 0, tzinfo=UTC)},
    )

    fix_script.correct_event_times(db_session, ids=[poi.id], apply=True)

    row = _event_row(db_session, poi)
    assert row.start_datetime == datetime(2026, 1, 16, 0, 0, tzinfo=UTC)
