"""Tests for updating POIs via admin API."""

import uuid
import pytest
from conftest import create_business, create_trail, create_event


class TestUpdateStringFields:
    def test_update_string_fields(self, admin_client):
        """Update name, description_long, phone_number, etc."""
        biz = create_business(admin_client, name="Original Name")
        poi_id = biz["id"]

        resp = admin_client.put(f"/api/pois/{poi_id}", json={
            "name": "Updated Name",
            "description_long": "New description",
            "phone_number": "919-999-8888",
            "email": "new@example.com",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Updated Name"
        assert data["description_long"] == "New description"
        assert data["phone_number"] == "919-999-8888"
        assert data["email"] == "new@example.com"


class TestUpdateJsonbFields:
    def test_update_jsonb_fields(self, admin_client):
        """Update hours, amenities.

        Task 2.5: the photos column is no longer written on update (the images
        table is the single source of truth) — a photos value in the payload is
        stripped, and the read derives photos from images. See
        tests/test_one_representation.py.
        """
        biz = create_business(admin_client, name="JSONB Update Biz")
        poi_id = biz["id"]

        new_hours = {"monday": {"open": "10:00", "close": "22:00"}}
        new_amenities = {"wifi": True, "parking": "paid"}

        resp = admin_client.put(f"/api/pois/{poi_id}", json={
            "hours": new_hours,
            "amenities": new_amenities,
            "photos": {"featured": "https://new-photo.jpg"},
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["hours"]["monday"]["open"] == "10:00"
        assert data["amenities"]["wifi"] is True
        # photos is derived from images (none uploaded here), so the stripped
        # payload value does NOT round-trip.
        assert data["photos"] is None


class TestUpdateListFields:
    def test_update_list_fields(self, admin_client):
        """Update parking_types, ideal_for, payment_methods."""
        biz = create_business(admin_client, name="List Update Biz")
        poi_id = biz["id"]

        resp = admin_client.put(f"/api/pois/{poi_id}", json={
            "parking_types": ["Garage", "Valet"],
            "ideal_for": ["Solo Travelers"],
            "payment_methods": ["Crypto", "Cash"],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["parking_types"] == ["Garage", "Valet"]
        # Phase 1: flat lists normalize to a grouped dict; unknown values go in _legacy.
        assert isinstance(data["ideal_for"], dict)
        assert "Solo Travelers" in data["ideal_for"].get("_legacy", [])
        assert data["payment_methods"] == ["Crypto", "Cash"]


class TestUpdateTitledLinks:
    def test_update_titled_links(self, admin_client):
        """Update delivery_links, reservation_links."""
        biz = create_business(admin_client, name="Links Update Biz")
        poi_id = biz["id"]

        resp = admin_client.put(f"/api/pois/{poi_id}", json={
            "delivery_links": [{"title": "UberEats", "url": "https://ubereats.com/biz"}],
            "reservation_links": [{"title": "Resy", "url": "https://resy.com/biz"}],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["delivery_links"][0]["title"] == "UberEats"
        assert data["reservation_links"][0]["title"] == "Resy"


class TestUpdateBooleanFields:
    def test_update_boolean_fields(self, admin_client):
        """Update is_verified, playground_available, available_for_rent."""
        biz = create_business(admin_client, name="Bool Update Biz")
        poi_id = biz["id"]

        resp = admin_client.put(f"/api/pois/{poi_id}", json={
            "is_verified": True,
            "playground_available": True,
            "available_for_rent": True,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_verified"] is True
        assert data["playground_available"] is True
        assert data["available_for_rent"] is True


class TestUpdateLocation:
    def test_update_location(self, admin_client):
        """Change coordinates."""
        biz = create_business(admin_client, name="Location Update Biz")
        poi_id = biz["id"]

        resp = admin_client.put(f"/api/pois/{poi_id}", json={
            "location": {"type": "Point", "coordinates": [-80.0, 36.0]},
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["location"]["coordinates"][0] == pytest.approx(-80.0, abs=0.01)
        assert data["location"]["coordinates"][1] == pytest.approx(36.0, abs=0.01)


class TestUpdateSubtypes:
    def test_update_business_subtype(self, admin_client):
        """Change price_range."""
        biz = create_business(admin_client, name="Subtype Update Biz")
        poi_id = biz["id"]

        resp = admin_client.put(f"/api/pois/{poi_id}", json={
            "business": {"price_range": "$$$$"},
        })
        assert resp.status_code == 200
        assert resp.json()["business"]["price_range"] == "$$$$"

    def test_update_trail_subtype(self, admin_client):
        """Change difficulty, length_text."""
        trail = create_trail(
            admin_client,
            name="Subtype Update Trail",
            trail={"difficulty": "easy", "length_text": "1 mile"},
        )
        poi_id = trail["id"]

        resp = admin_client.put(f"/api/pois/{poi_id}", json={
            "trail": {"difficulty": "difficult", "length_text": "5 miles"},
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["trail"]["difficulty"] == "difficult"
        assert data["trail"]["length_text"] == "5 miles"

    def test_update_event_subtype(self, admin_client):
        """Change end_datetime, is_repeating."""
        evt = create_event(admin_client, name="Subtype Update Event")
        poi_id = evt["id"]

        resp = admin_client.put(f"/api/pois/{poi_id}", json={
            "event": {
                "end_datetime": "2026-06-15T22:00:00Z",
                "is_repeating": True,
            },
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["event"]["is_repeating"] is True
        assert "2026-06-15" in data["event"]["end_datetime"]


class TestSlugRegeneration:
    def test_slug_regeneration_on_name_change(self, admin_client):
        """Verify slug updates when name changes."""
        biz = create_business(admin_client, name="Original Slug Biz", address_city="Durham")
        original_slug = biz["slug"]

        resp = admin_client.put(f"/api/pois/{biz['id']}", json={"name": "New Slug Biz"})
        assert resp.status_code == 200
        new_slug = resp.json()["slug"]
        assert new_slug != original_slug
        assert "new-slug-biz" in new_slug

    def test_slug_regeneration_on_city_change(self, admin_client):
        """Verify slug updates when city changes."""
        biz = create_business(admin_client, name="City Slug Biz", address_city="Durham")
        original_slug = biz["slug"]

        resp = admin_client.put(f"/api/pois/{biz['id']}", json={"address_city": "Raleigh"})
        assert resp.status_code == 200
        new_slug = resp.json()["slug"]
        assert new_slug != original_slug
        assert "raleigh" in new_slug


class TestPartialUpdate:
    def test_partial_update(self, admin_client):
        """Send only 1 field, verify others unchanged."""
        biz = create_business(
            admin_client,
            name="Partial Update Biz",
            phone_number="919-111-0000",
            email="original@example.com",
        )
        poi_id = biz["id"]

        resp = admin_client.put(f"/api/pois/{poi_id}", json={"phone_number": "919-222-0000"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["phone_number"] == "919-222-0000"
        assert data["name"] == "Partial Update Biz"  # unchanged
        assert data["email"] == "original@example.com"  # unchanged


class TestUpdateNonexistent:
    def test_update_nonexistent_poi(self, admin_client):
        """PUT /api/pois/{bad_id} → 404."""
        fake_id = str(uuid.uuid4())
        resp = admin_client.put(f"/api/pois/{fake_id}", json={"name": "Ghost"})
        assert resp.status_code == 404
