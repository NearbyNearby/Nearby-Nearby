"""
Integration tests for GET /api/pois/counts endpoint.

Verifies that the endpoint returns correct counts by type and by amenity
(pet_friendly, wheelchair_accessible) — and that only published POIs are
counted.  Routes are exercised via the nearby-app TestClient (app_client).
"""

from datetime import datetime, timedelta, timezone

import pytest
from conftest import (
    orm_create_business,
    orm_create_park,
    orm_create_trail,
    orm_create_event,
)


class TestPoiCountsEndpointShape:
    def test_counts_returns_expected_keys(self, db_session, app_client):
        """Endpoint returns the correct top-level and nested keys."""
        resp = app_client.get("/api/pois/counts")
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert "by_type" in data
        assert "by_amenity" in data

        for key in ("BUSINESS", "PARK", "TRAIL", "EVENT"):
            assert key in data["by_type"], f"Missing type key: {key}"

        assert "pet_friendly" in data["by_amenity"]
        assert "wheelchair_accessible" in data["by_amenity"]

    def test_counts_are_integers(self, db_session, app_client):
        """All count values must be non-negative integers."""
        resp = app_client.get("/api/pois/counts")
        assert resp.status_code == 200
        data = resp.json()

        for key, val in data["by_type"].items():
            assert isinstance(val, int) and val >= 0, f"by_type[{key}] = {val!r}"

        for key, val in data["by_amenity"].items():
            assert isinstance(val, int) and val >= 0, f"by_amenity[{key}] = {val!r}"


class TestPoiCountsOnlyPublished:
    def test_draft_pois_excluded_from_counts(self, db_session, app_client):
        """Draft POIs must NOT be reflected in counts."""
        # Create one draft business and one draft park.
        orm_create_business(db_session, name="Draft Biz", published=False)
        orm_create_park(db_session, name="Draft Park", published=False)
        db_session.commit()

        resp = app_client.get("/api/pois/counts")
        assert resp.status_code == 200
        data = resp.json()

        assert data["by_type"]["BUSINESS"] == 0
        assert data["by_type"]["PARK"] == 0


class TestPoiCountsByType:
    def test_type_counts_match_published_pois(self, db_session, app_client):
        """Counts per type must exactly match what we inserted as published."""
        orm_create_business(db_session, name="Published Biz 1", published=True)
        orm_create_business(db_session, name="Published Biz 2", published=True)
        orm_create_business(db_session, name="Draft Biz", published=False)
        orm_create_park(db_session, name="Published Park", published=True)
        orm_create_trail(db_session, name="Published Trail", published=True)
        db_session.commit()

        resp = app_client.get("/api/pois/counts")
        assert resp.status_code == 200
        data = resp.json()

        assert data["by_type"]["BUSINESS"] == 2
        assert data["by_type"]["PARK"] == 1
        assert data["by_type"]["TRAIL"] == 1
        assert data["by_type"]["EVENT"] == 0


class TestPoiCountsByAmenity:
    def test_pet_friendly_count(self, db_session, app_client):
        """pet_friendly count reflects only published POIs with icon_pet_friendly=True."""
        orm_create_business(
            db_session, name="Pet Biz Published", published=True,
            icon_pet_friendly=True,
        )
        orm_create_business(
            db_session, name="Pet Biz Draft", published=False,
            icon_pet_friendly=True,
        )
        orm_create_business(
            db_session, name="Non-Pet Biz", published=True,
            icon_pet_friendly=False,
        )
        db_session.commit()

        resp = app_client.get("/api/pois/counts")
        assert resp.status_code == 200
        data = resp.json()

        # Only the one published + pet_friendly POI should count.
        assert data["by_amenity"]["pet_friendly"] == 1

    def test_wheelchair_accessible_count(self, db_session, app_client):
        """wheelchair_accessible count uses icon_wheelchair_accessible boolean only."""
        orm_create_park(
            db_session, name="Accessible Park", published=True,
            icon_wheelchair_accessible=True,
        )
        orm_create_park(
            db_session, name="Accessible Draft Park", published=False,
            icon_wheelchair_accessible=True,
        )
        orm_create_park(
            db_session, name="Non-Accessible Park", published=True,
            icon_wheelchair_accessible=False,
        )
        db_session.commit()

        resp = app_client.get("/api/pois/counts")
        assert resp.status_code == 200
        data = resp.json()

        assert data["by_amenity"]["wheelchair_accessible"] == 1

    def test_amenity_counts_independent_of_type(self, db_session, app_client):
        """Amenity counts span all POI types (business + park with same flag)."""
        orm_create_business(
            db_session, name="Pet Biz", published=True,
            icon_pet_friendly=True,
        )
        orm_create_park(
            db_session, name="Pet Park", published=True,
            icon_pet_friendly=True,
        )
        orm_create_trail(
            db_session, name="Pet Trail", published=True,
            icon_pet_friendly=True,
        )
        db_session.commit()

        resp = app_client.get("/api/pois/counts")
        assert resp.status_code == 200
        data = resp.json()

        assert data["by_amenity"]["pet_friendly"] == 3


class TestPoiCountsMatchExplore:
    """#175: each homepage tile links to Explore, so it counts what Explore lists."""

    def test_past_and_cancelled_events_are_not_counted(self, db_session, app_client):
        soon = datetime.now(timezone.utc) + timedelta(days=30)
        past = datetime.now(timezone.utc) - timedelta(days=30)
        orm_create_event(
            db_session, name="Upcoming Event", published=True,
            event_fields={"start_datetime": soon},
        )
        orm_create_event(
            db_session, name="Past Event", published=True, icon_pet_friendly=True,
            event_fields={"start_datetime": past},
        )
        orm_create_event(
            db_session, name="Canceled Event", published=True,
            event_fields={"start_datetime": soon, "event_status": "Canceled"},
        )
        db_session.commit()

        data = app_client.get("/api/pois/counts").json()
        assert data["by_type"]["EVENT"] == 1
        assert data["by_amenity"]["pet_friendly"] == 0
        listed = app_client.get("/api/pois/by-type/EVENT").json()
        assert [row["name"] for row in listed] == ["Upcoming Event"]

    def test_hidden_location_pois_are_not_counted(self, db_session, app_client):
        orm_create_business(db_session, name="Shown Biz", published=True)
        orm_create_business(
            db_session, name="Hidden Biz", published=True, dont_display_location=True,
        )
        db_session.commit()

        data = app_client.get("/api/pois/counts").json()
        assert data["by_type"]["BUSINESS"] == 1
