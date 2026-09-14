"""Issue #180: events-in-range must match occurrences by the Eastern day.

/api/events/in-range takes YYYY-MM-DD bounds. With event storage now holding
correct UTC instants, a 7 PM Eastern occurrence in winter is 00:00Z the NEXT
UTC day, so UTC-labeled bounds would drop evening events on the edges of the
requested range. The bounds are Eastern days (all POIs are in North Carolina).
"""

import pytest
from conftest import orm_create_event
from datetime import datetime, timezone


def _create_recurring_trivia(db):
    """Weekly Tue 19:00 Eastern, first occurrence Tue 2026-11-03 (EST) = 00:00Z Nov 4."""
    return orm_create_event(
        db, name="Range Edge Trivia", published=True, slug="range-edge-trivia",
        event_fields={
            "start_datetime": datetime(2026, 11, 4, 0, 0, tzinfo=timezone.utc),
            "is_repeating": True,
            "repeat_pattern": {"frequency": "weekly", "interval": 1, "days_of_week": ["Tue"]},
        },
    )


class TestEventsInRangeEasternBounds:
    def test_recurring_evening_on_last_day_of_range(self, db_session, app_client):
        _create_recurring_trivia(db_session)
        db_session.commit()

        # Tue Nov 17 is the last day of the range; the occurrence is
        # 19:00 EST Nov 17 = 00:00Z Nov 18, outside a UTC 23:59:59Z cutoff.
        resp = app_client.get("/api/events/in-range?date_from=2026-11-03&date_to=2026-11-17")
        assert resp.status_code == 200
        # Full instant compare: the last occurrence must be the exact
        # 2026-11-18T00:00:00Z instant, not just some Nov 17-ish date prefix.
        expected = datetime(2026, 11, 18, 0, 0, tzinfo=timezone.utc)
        instants = [
            datetime.fromisoformat(r["occurrence_datetime"].replace("Z", "+00:00"))
            for r in resp.json()
        ]
        assert expected in instants

    def test_nonrepeating_evening_on_last_day_of_range(self, db_session, app_client):
        # 19:00 EST Nov 18 = 00:00Z Nov 19: outside a UTC 23:59:59Z cutoff for
        # the requested day, inside an Eastern one.
        orm_create_event(
            db_session, name="Range Edge Oneoff", published=True, slug="range-edge-oneoff",
            event_fields={
                "start_datetime": datetime(2026, 11, 19, 0, 0, tzinfo=timezone.utc),
            },
        )
        db_session.commit()

        resp = app_client.get("/api/events/in-range?date_from=2026-11-18&date_to=2026-11-18")
        assert resp.status_code == 200
        names = [r["name"] for r in resp.json()]
        assert "Range Edge Oneoff" in names
