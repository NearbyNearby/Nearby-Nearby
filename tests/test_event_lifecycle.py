"""
Event lifecycle integration tests.

Covers:
- Event creation with all field variants (admin API)
- Event detail via app (event pulls base POI attributes)
- Past event filtering (nearby results)
- Event update (date changes, publish/unpublish)
- Repeating events
- Cross-app: admin creates event → app reads event detail
"""

import pytest
from datetime import datetime, timedelta, timezone

from conftest import (
    create_event,
    publish_poi,
    orm_create_event,
    orm_create_business,
    orm_publish_poi,
)


# ---------------------------------------------------------------------------
# 1. Admin: Event creation and field round-trips
# ---------------------------------------------------------------------------


class TestEventCreationValidation:
    """Verify event creation requires event subtype data."""

    def test_event_without_event_object_rejected(self, admin_client):
        """EVENT type without event object → 400 or 422."""
        payload = {
            "name": "No Event Object",
            "poi_type": "EVENT",
            "location": {"type": "Point", "coordinates": [-79.3, 35.6]},
        }
        resp = admin_client.post("/api/pois/", json=payload)
        assert resp.status_code in (400, 422)

    def test_event_without_start_datetime_rejected(self, admin_client):
        """Event object without start_datetime → 422."""
        payload = {
            "name": "No Start",
            "poi_type": "EVENT",
            "location": {"type": "Point", "coordinates": [-79.3, 35.6]},
            "event": {"organizer_name": "Someone"},
        }
        resp = admin_client.post("/api/pois/", json=payload)
        assert resp.status_code == 422


class TestEventBasePoiFields:
    """Events inherit all base POI fields (address, hours, amenities, etc.)."""

    def test_event_with_full_poi_fields(self, admin_client):
        """Create event with base POI fields and verify they round-trip."""
        data = create_event(
            admin_client,
            name="Full POI Event",
            published=True,
            description_long="A detailed event description with lots of info.",
            description_short="Short desc.",
            teaser_paragraph="Come join us!",
            address_street="100 Main St",
            address_city="Pittsboro",
            address_state="NC",
            address_zip="27312",
            address_county="Chatham County",
            address_full="100 Main St, Pittsboro, NC 27312",
            website_url="https://event.example.com",
            phone_number="919-555-0001",
            hours={
                "saturday": [{"open": "10:00", "close": "22:00"}],
                "sunday": [{"open": "10:00", "close": "18:00"}],
            },
            parking_types=["Public Parking Lot", "Street Parking"],
            parking_notes="Free parking in the courthouse lot.",
            # wheelchair_accessible removed — column dropped (Issue #45 PR2 Migration B)
            pet_options=["Dog Friendly"],
            ideal_for=["All Ages", "Families"],
            cost="$15",
            pricing_details="Kids under 5 free",
            event={
                "start_datetime": "2026-06-15T18:00:00Z",
                "ticket_links": [{"platform": "Eventbrite", "url": "https://tickets.example.com"}],
            },
        )
        assert data["name"] == "Full POI Event"
        assert data["description_long"] is not None
        assert data["address_city"] == "Pittsboro"
        assert data["hours"]["saturday"][0]["open"] == "10:00"
        assert data["parking_types"] == ["Public Parking Lot", "Street Parking"]
        # wheelchair_accessible assertion removed — column dropped (Issue #45 PR2 Migration B)
        assert data["pet_options"] == ["Dog Friendly"]
        # Phase 1: ideal_for is a grouped dict. "All Ages" -> age_group, "Families" -> age_group.
        assert isinstance(data["ideal_for"], dict)
        assert "All Ages" in data["ideal_for"].get("age_group", [])
        assert "Families" in data["ideal_for"].get("age_group", [])
        assert data["cost"] == "$15"
        assert data["event"]["ticket_links"] == [{"platform": "Eventbrite", "url": "https://tickets.example.com"}]

    def test_event_with_social_media(self, admin_client):
        """Event with social media fields."""
        data = create_event(
            admin_client,
            name="Social Event",
            instagram_username="socialfest",
            facebook_username="socialfest",
        )
        assert data["instagram_username"] == "socialfest"
        assert data["facebook_username"] == "socialfest"


class TestEventSubtypeFields:
    """Event-specific subtype fields."""

    def test_event_end_datetime(self, admin_client):
        """Event with explicit end_datetime."""
        data = create_event(
            admin_client,
            name="Timed Event",
            event={
                "start_datetime": "2026-07-04T10:00:00Z",
                "end_datetime": "2026-07-04T22:00:00Z",
            },
        )
        assert "2026-07-04" in data["event"]["start_datetime"]
        assert "2026-07-04" in data["event"]["end_datetime"]

    def test_event_no_end_datetime(self, admin_client):
        """Event without end_datetime (open-ended)."""
        data = create_event(
            admin_client,
            name="Open Ended",
            event={"start_datetime": "2026-08-01T09:00:00Z"},
        )
        assert data["event"]["end_datetime"] is None

    def test_event_venue_settings(self, admin_client):
        """Event with venue_settings list."""
        data = create_event(
            admin_client,
            name="Hybrid Event",
            event={
                "start_datetime": "2026-09-01T10:00:00Z",
                "venue_settings": ["Indoor", "Outdoor", "Online Only"],
            },
        )
        assert set(data["event"]["venue_settings"]) == {"Indoor", "Outdoor", "Online Only"}

    def test_event_food_and_drink_info(self, admin_client):
        """food_and_drink_info text field."""
        data = create_event(
            admin_client,
            name="Food Event",
            event={
                "start_datetime": "2026-06-01T12:00:00Z",
                "food_and_drink_info": "Food trucks and a cash bar available.",
            },
        )
        assert data["event"]["food_and_drink_info"] == "Food trucks and a cash bar available."


# ---------------------------------------------------------------------------
# 2. Event update
# ---------------------------------------------------------------------------


class TestEventUpdate:
    """Verify event fields can be updated after creation."""

    def test_update_event_datetime(self, admin_client):
        """Change event start/end times."""
        data = create_event(admin_client, name="Date Change Event")
        poi_id = data["id"]

        resp = admin_client.put(f"/api/pois/{poi_id}", json={
            "event": {
                "start_datetime": "2026-12-25T18:00:00Z",
                "end_datetime": "2026-12-25T23:00:00Z",
            },
        })
        assert resp.status_code == 200
        updated = resp.json()
        assert "2026-12-25" in updated["event"]["start_datetime"]
        assert updated["event"]["end_datetime"] is not None

    def test_update_event_base_fields(self, admin_client):
        """Update base POI fields on an event."""
        data = create_event(admin_client, name="Update Base Event")
        poi_id = data["id"]

        resp = admin_client.put(f"/api/pois/{poi_id}", json={
            "address_city": "Siler City",
            "cost": "$25",
        })
        assert resp.status_code == 200
        updated = resp.json()
        assert updated["address_city"] == "Siler City"
        assert updated["cost"] == "$25"

    def test_publish_then_unpublish_event(self, admin_client):
        """Publish → unpublish → verify draft."""
        data = create_event(admin_client, name="Pub Unpub Event")
        poi_id = data["id"]
        assert data["publication_status"] == "draft"

        # Publish
        published = publish_poi(admin_client, poi_id)
        assert published["publication_status"] == "published"

        # Unpublish (back to draft)
        resp = admin_client.put(f"/api/pois/{poi_id}", json={
            "publication_status": "draft",
        })
        assert resp.status_code == 200
        assert resp.json()["publication_status"] == "draft"


# ---------------------------------------------------------------------------
# 3. Cross-app: admin creates event → app reads
# ---------------------------------------------------------------------------


class TestEventCrossApp:
    """Events created via ORM, read via app client."""

    def test_app_reads_event_detail(self, db_session, app_client):
        """Published event visible via app /api/pois/{id} with event subtype."""
        poi = orm_create_event(
            db_session,
            name="Crossapp Festival",
            published=True,
            address_city="Pittsboro",
            description_long="A great festival in Pittsboro.",
            cost="$20",
            event_fields={
                "start_datetime": datetime(2026, 9, 15, 12, 0, tzinfo=timezone.utc),
                "end_datetime": datetime(2026, 9, 15, 22, 0, tzinfo=timezone.utc),
            },
        )
        db_session.commit()

        resp = app_client.get(f"/api/pois/{str(poi.id)}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Crossapp Festival"
        assert data["poi_type"] == "EVENT"
        assert data["address_city"] == "Pittsboro"
        assert data["description_long"] == "A great festival in Pittsboro."
        assert data["cost"] == "$20"
        # Event subtype fields
        assert data["event"] is not None
        assert "2026-09-15" in data["event"]["start_datetime"]
        assert data["event"]["end_datetime"] is not None

    def test_draft_event_hidden_from_app(self, db_session, app_client):
        """Draft event → 404 on app."""
        poi = orm_create_event(
            db_session,
            name="Draft Event",
            published=False,
        )
        db_session.commit()

        resp = app_client.get(f"/api/pois/{str(poi.id)}")
        assert resp.status_code == 404

    def test_event_inherits_hours_on_detail(self, db_session, app_client):
        """Event with hours → app detail returns hours."""
        poi = orm_create_event(
            db_session,
            name="Hours Event",
            published=True,
            hours={"saturday": [{"open": "09:00", "close": "21:00"}]},
        )
        db_session.commit()

        resp = app_client.get(f"/api/pois/{str(poi.id)}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["hours"]["saturday"][0]["open"] == "09:00"

    def test_event_parking_and_accessibility_on_detail(self, db_session, app_client):
        """Event with parking fields → visible via app.

        Note: wheelchair_accessible removed — column dropped (Issue #45 PR2 Migration B).
        """
        poi = orm_create_event(
            db_session,
            name="Accessible Event",
            published=True,
            parking_types=["Public Parking Lot"],
            parking_notes="Free lot behind the venue.",
        )
        db_session.commit()

        resp = app_client.get(f"/api/pois/{str(poi.id)}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["parking_types"] == ["Public Parking Lot"]
        assert data["parking_notes"] == "Free lot behind the venue."


# ---------------------------------------------------------------------------
# 4. Events in nearby results
# ---------------------------------------------------------------------------


class TestEventInNearbyResults:
    """Events appear (or don't) in nearby results based on publish status."""

    def test_published_event_in_nearby(self, db_session, app_client):
        """Published event near a business → appears in nearby results."""
        biz = orm_create_business(
            db_session,
            name="Anchor Biz",
            location="POINT(-79.17 35.72)",
            published=True,
        )
        evt = orm_create_event(
            db_session,
            name="Nearby Event",
            location="POINT(-79.171 35.721)",
            published=True,
            event_fields={
                "start_datetime": datetime.now(timezone.utc) + timedelta(days=30),
                "end_datetime": datetime.now(timezone.utc) + timedelta(days=30, hours=8),
            },
        )
        db_session.commit()

        resp = app_client.get(
            f"/api/pois/{str(biz.id)}/nearby",
            params={"radius_miles": "5"},
        )
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "Nearby Event" in names

    def test_draft_event_excluded_from_nearby(self, db_session, app_client):
        """Draft event → NOT in nearby results."""
        biz = orm_create_business(
            db_session,
            name="Anchor Biz 2",
            location="POINT(-79.17 35.72)",
            published=True,
        )
        orm_create_event(
            db_session,
            name="Draft Nearby Event",
            location="POINT(-79.171 35.721)",
            published=False,
        )
        db_session.commit()

        resp = app_client.get(
            f"/api/pois/{str(biz.id)}/nearby",
            params={"radius_miles": "5"},
        )
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "Draft Nearby Event" not in names

    def test_event_type_in_nearby_result(self, db_session, app_client):
        """Nearby result for an event includes poi_type=EVENT."""
        biz = orm_create_business(
            db_session,
            name="Anchor Biz 3",
            location="POINT(-79.17 35.72)",
            published=True,
        )
        orm_create_event(
            db_session,
            name="Typed Nearby Event",
            location="POINT(-79.171 35.721)",
            published=True,
            event_fields={
                "start_datetime": datetime.now(timezone.utc) + timedelta(days=7),
            },
        )
        db_session.commit()

        resp = app_client.get(
            f"/api/pois/{str(biz.id)}/nearby",
            params={"radius_miles": "5"},
        )
        assert resp.status_code == 200
        results = resp.json()
        event_result = next((r for r in results if r["name"] == "Typed Nearby Event"), None)
        assert event_result is not None
        assert event_result["poi_type"] == "EVENT"


# ---------------------------------------------------------------------------
# 5. Past event behavior
#
# NOTE: The backend does NOT filter past events — that's done client-side
# in NearbySection.jsx. These tests verify that past events are still
# stored and retrievable via the API (so the frontend can decide).
# ---------------------------------------------------------------------------


class TestPastEventBehavior:
    """Past event storage and retrieval behavior."""

    def test_past_event_still_visible_on_detail(self, db_session, app_client):
        """Past event detail page still returns 200 (not auto-archived)."""
        past_event = orm_create_event(
            db_session,
            name="Past Concert",
            published=True,
            event_fields={
                "start_datetime": datetime(2025, 1, 1, 18, 0, tzinfo=timezone.utc),
                "end_datetime": datetime(2025, 1, 1, 23, 0, tzinfo=timezone.utc),
            },
        )
        db_session.commit()

        resp = app_client.get(f"/api/pois/{str(past_event.id)}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Past Concert"
        assert "2025-01-01" in data["event"]["start_datetime"]

    def test_past_event_in_nearby_results(self, db_session, app_client):
        """Past events excluded by default, included with include_past_events flag."""
        biz = orm_create_business(
            db_session,
            name="Anchor Biz Past",
            location="POINT(-79.17 35.72)",
            published=True,
        )
        orm_create_event(
            db_session,
            name="Expired Festival",
            location="POINT(-79.171 35.721)",
            published=True,
            event_fields={
                "start_datetime": datetime(2024, 6, 1, 10, 0, tzinfo=timezone.utc),
                "end_datetime": datetime(2024, 6, 1, 22, 0, tzinfo=timezone.utc),
            },
        )
        db_session.commit()

        # Default: past events are excluded
        resp = app_client.get(
            f"/api/pois/{str(biz.id)}/nearby",
            params={"radius_miles": "5"},
        )
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "Expired Festival" not in names

        # With flag: past events are included
        resp = app_client.get(
            f"/api/pois/{str(biz.id)}/nearby",
            params={"radius_miles": "5", "include_past_events": "true"},
        )
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "Expired Festival" in names

    def test_past_event_not_searchable(self, db_session, app_client):
        """Past events are hidden from search (#127).

        This used to assert the opposite. Search feeds the homepage suggestion
        dropdown, Explore and the Nearby search box, and surfacing finished
        events there was the reported bug; the row is untouched and still
        reachable directly (test_past_event_still_visible_on_detail above).
        """
        past = orm_create_event(
            db_session,
            name="Historical Gala 2024",
            published=True,
            event_fields={
                "start_datetime": datetime(2024, 12, 31, 20, 0, tzinfo=timezone.utc),
                "end_datetime": datetime(2025, 1, 1, 2, 0, tzinfo=timezone.utc),
            },
        )
        db_session.commit()

        resp = app_client.get("/api/pois/search", params={"q": "Historical Gala"})
        assert resp.status_code == 200
        names = [r["name"] for r in resp.json()]
        assert "Historical Gala 2024" not in names

        # ...but the POI itself is untouched and still directly reachable.
        assert app_client.get(f"/api/pois/{str(past.id)}").status_code == 200


# ---------------------------------------------------------------------------
# 6. Repeating events
# ---------------------------------------------------------------------------


class TestRepeatingEvents:
    """Repeating event pattern storage and retrieval."""

    def test_repeating_weekly_event_roundtrip(self, admin_client):
        """Weekly repeating event → all pattern fields persisted."""
        data = create_event(
            admin_client,
            name="Weekly Trivia Night",
            event={
                "start_datetime": "2026-03-05T19:00:00Z",
                "is_repeating": True,
                "repeat_pattern": {
                    "frequency": "weekly",
                    "days": ["thursday"],
                },
            },
        )
        event = data["event"]
        assert event["is_repeating"] is True
        assert event["repeat_pattern"]["frequency"] == "weekly"
        assert event["repeat_pattern"]["days"] == ["thursday"]

    def test_repeating_monthly_event(self, admin_client):
        """Monthly repeating event."""
        data = create_event(
            admin_client,
            name="Monthly Market",
            event={
                "start_datetime": "2026-04-06T11:00:00Z",
                "is_repeating": True,
                "repeat_pattern": {
                    "frequency": "monthly",
                    "day_of_month": "first_sunday",
                },
            },
        )
        event = data["event"]
        assert event["is_repeating"] is True
        assert event["repeat_pattern"]["frequency"] == "monthly"

    def test_repeating_event_via_app(self, db_session, app_client):
        """Repeating event readable via app detail endpoint."""
        poi = orm_create_event(
            db_session,
            name="App Repeating Event",
            published=True,
            event_fields={
                "start_datetime": datetime(2026, 5, 1, 10, 0, tzinfo=timezone.utc),
                "is_repeating": True,
                "repeat_pattern": {"frequency": "weekly", "days": ["saturday"]},
            },
        )
        db_session.commit()

        resp = app_client.get(f"/api/pois/{str(poi.id)}")
        assert resp.status_code == 200
        # App Event schema only has start_datetime, end_datetime
        # Verify the base event fields are accessible
        data = resp.json()
        assert data["event"]["start_datetime"] is not None


# ---------------------------------------------------------------------------
# 7. Event with categories
# ---------------------------------------------------------------------------


class TestEventCategories:
    """Events with category assignments."""

    def test_event_with_category_via_admin(self, admin_client):
        """Create event + assign category via admin API."""
        cat = admin_client.post("/api/categories/", json={
            "name": "Festival Cat",
            "applicable_to": ["EVENT"],
        })
        assert cat.status_code == 201
        cat_id = cat.json()["id"]

        data = create_event(
            admin_client,
            name="Categorized Event",
            main_category_id=cat_id,
        )
        assert data["name"] == "Categorized Event"

    def test_event_category_visible_in_app(self, db_session, app_client):
        """Event category visible via app detail endpoint."""
        from conftest import orm_create_category, orm_assign_main_category

        cat = orm_create_category(db_session, name="Music Festival", applicable_to=["EVENT"])
        poi = orm_create_event(
            db_session,
            name="Music Fest",
            published=True,
            event_fields={
                "start_datetime": datetime(2026, 8, 1, 12, 0, tzinfo=timezone.utc),
            },
        )
        orm_assign_main_category(db_session, poi.id, cat.id)
        db_session.commit()

        resp = app_client.get(f"/api/pois/{str(poi.id)}")
        assert resp.status_code == 200
        data = resp.json()
        cat_names = [c["name"] for c in data["categories"]]
        assert "Music Festival" in cat_names


# ---------------------------------------------------------------------------
# 8. Event by-type and by-slug endpoints
# ---------------------------------------------------------------------------


class TestEventEndpoints:
    """App endpoints for filtering/finding events."""

    def test_by_type_event(self, db_session, app_client):
        """GET /api/pois/by-type/EVENT returns only events."""
        # Use a future date so the by-type endpoint's default past-event filter
        # keeps it (orm_create_event's hardcoded default date has drifted past).
        future = datetime.now(timezone.utc) + timedelta(days=365)
        orm_create_event(db_session, name="Type Filter Event", published=True,
                         event_fields={"start_datetime": future})
        orm_create_business(db_session, name="Not An Event", published=True)
        db_session.commit()

        resp = app_client.get("/api/pois/by-type/EVENT")
        assert resp.status_code == 200
        results = resp.json()
        names = [r["name"] for r in results]
        assert "Type Filter Event" in names
        assert "Not An Event" not in names

    def test_by_slug_event(self, db_session, app_client):
        """GET /api/pois/by-slug/{slug} returns event detail."""
        poi = orm_create_event(
            db_session,
            name="Slug Event",
            slug="slug-event-pittsboro",
            published=True,
            address_city="Pittsboro",
        )
        db_session.commit()

        resp = app_client.get("/api/pois/by-slug/slug-event-pittsboro")
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Slug Event"
        assert data["poi_type"] == "EVENT"
        assert data["event"] is not None
