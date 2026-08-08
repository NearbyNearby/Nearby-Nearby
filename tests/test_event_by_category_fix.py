"""
Phase 1: Test that by-category endpoint returns correct event field names.

The endpoint previously used non-existent fields (start_date, end_date, start_time,
end_time, is_recurring, status) which caused AttributeError at runtime. The correct
fields are start_datetime, end_datetime, is_repeating, event_status.
"""

import pytest
from datetime import datetime, timedelta, timezone
from conftest import (
    orm_create_event, orm_create_category, orm_assign_main_category,
    orm_create_business, db_session, app_client,
)

# Relative future dates: by-category excludes past events by default, so
# hardcoded dates become time bombs once the calendar passes them.
_FUTURE = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(days=30)


class TestByCategoryEventFields:
    """Verify by-category endpoint returns correct event field names."""

    def test_by_category_returns_event_data(self, db_session, app_client):
        """Event POIs in a category should include event dict with correct field names."""
        # Create a category
        cat = orm_create_category(db_session, name="Music Events")

        # Create a published event with specific datetime
        ev_poi = orm_create_event(
            db_session,
            name="Summer Concert",
            published=True,
            event_fields={
                "start_datetime": _FUTURE.replace(hour=18, minute=0, second=0),
                "end_datetime": _FUTURE.replace(hour=22, minute=0, second=0),
                "is_repeating": True,
                "event_status": "Scheduled",
                "organizer_name": "Music Org",
                "venue_poi_id": None,
                "cost_type": "free",
            },
        )

        # Assign category
        orm_assign_main_category(db_session, ev_poi.id, cat.id)
        db_session.commit()

        # Call by-category endpoint
        resp = app_client.get(f"/api/pois/by-category/{cat.slug}")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

        data = resp.json()
        assert len(data["pois"]) == 1

        poi = data["pois"][0]
        assert "event" in poi, "Event POI should have 'event' key in response"

        event = poi["event"]

        # Correct field names (not the old broken ones)
        assert "start_datetime" in event, "Should use start_datetime, not start_date"
        assert "end_datetime" in event, "Should use end_datetime, not end_date"
        assert "is_repeating" in event, "Should use is_repeating, not is_recurring"
        assert "event_status" in event, "Should use event_status, not status"

        # Values should be correct
        assert event["event_status"] == "Scheduled"
        assert event["is_repeating"] is True
        assert event["start_datetime"] is not None
        assert event["end_datetime"] is not None

        # Old broken field names should NOT exist
        assert "start_date" not in event
        assert "end_date" not in event
        assert "start_time" not in event
        assert "end_time" not in event
        assert "is_recurring" not in event
        assert "status" not in event

    def test_by_category_includes_organizer_and_cost(self, db_session, app_client):
        """Event data in by-category should include organizer_name, venue_poi_id, cost_type."""
        cat = orm_create_category(db_session, name="Festivals")

        ev_poi = orm_create_event(
            db_session,
            name="Town Festival",
            published=True,
            event_fields={
                "start_datetime": _FUTURE.replace(hour=10, minute=0, second=0),
                "organizer_name": "Town Council",
                "cost_type": "free",
            },
        )

        orm_assign_main_category(db_session, ev_poi.id, cat.id)
        db_session.commit()

        resp = app_client.get(f"/api/pois/by-category/{cat.slug}")
        assert resp.status_code == 200

        event = resp.json()["pois"][0]["event"]
        assert event["organizer_name"] == "Town Council"
        assert event["cost_type"] == "free"
        assert "venue_poi_id" in event

    def test_by_category_non_event_has_no_event_key(self, db_session, app_client):
        """Non-event POIs should not have an 'event' key."""
        cat = orm_create_category(db_session, name="Local Shops")

        biz = orm_create_business(db_session, name="Coffee Shop", published=True)
        orm_assign_main_category(db_session, biz.id, cat.id)
        db_session.commit()

        resp = app_client.get(f"/api/pois/by-category/{cat.slug}")
        assert resp.status_code == 200

        poi = resp.json()["pois"][0]
        assert "event" not in poi or poi["event"] is None

    def test_by_category_event_with_null_end_datetime(self, db_session, app_client):
        """Events with null end_datetime should not cause errors."""
        cat = orm_create_category(db_session, name="Open Events")

        ev_poi = orm_create_event(
            db_session,
            name="Open-Ended Event",
            published=True,
            event_fields={
                "start_datetime": _FUTURE.replace(hour=10, minute=0, second=0),
                "end_datetime": None,
                "event_status": "Scheduled",
            },
        )

        orm_assign_main_category(db_session, ev_poi.id, cat.id)
        db_session.commit()

        resp = app_client.get(f"/api/pois/by-category/{cat.slug}")
        assert resp.status_code == 200

        event = resp.json()["pois"][0]["event"]
        assert event["start_datetime"] is not None
        assert event["end_datetime"] is None
