"""Tests for venue list and venue-data-for-event endpoints."""

import uuid
import pytest
from conftest import create_business, create_park, create_event, create_trail


class TestVenueList:
    def test_venue_list_business_park_trail(self, admin_client):
        """Phase 1: BUSINESS, PARK and TRAIL all appear in venue list; EVENT still excluded."""
        biz = create_business(admin_client, name="Venue List Biz")
        park = create_park(admin_client, name="Venue List Park")
        trail = create_trail(admin_client, name="Venue List Trail")
        evt = create_event(admin_client, name="Venue List Event")

        resp = admin_client.get("/api/pois/venues/list")
        assert resp.status_code == 200
        venues = resp.json()
        venue_names = [v["name"] for v in venues]
        assert "Venue List Biz" in venue_names
        assert "Venue List Park" in venue_names
        assert "Venue List Trail" in venue_names
        assert "Venue List Event" not in venue_names

    def test_venue_list_search(self, admin_client):
        """Search within venue list."""
        create_business(admin_client, name="Searchable Venue Cafe")
        create_business(admin_client, name="Another Place")

        resp = admin_client.get("/api/pois/venues/list", params={"search": "Searchable Venue"})
        assert resp.status_code == 200
        venues = resp.json()
        assert len(venues) >= 1
        assert venues[0]["name"] == "Searchable Venue Cafe"


class TestVenueData:
    def test_venue_data_returns_all_fields(self, admin_client):
        """All venue-copyable fields present."""
        biz = create_business(
            admin_client,
            name="Venue Data Biz",
            address_full="123 Main St, Pittsboro, NC",
            address_street="123 Main St",
            address_city="Pittsboro",
            address_state="NC",
            address_zip="27312",
            phone_number="919-555-1234",
            email="venue@example.com",
            website_url="https://venuebiz.com",
            parking_types=["Lot"],
            parking_notes="Free lot behind building",
            # wheelchair_accessible removed — column dropped (Issue #45 PR2 Migration B)
            wheelchair_details="Ramp at front",
            public_toilets=["Indoor"],
            toilet_description="ADA compliant",
            hours={"monday": {"open": "09:00", "close": "17:00"}},
        )

        resp = admin_client.get(f"/api/pois/{biz['id']}/venue-data")
        assert resp.status_code == 200
        data = resp.json()
        assert data["venue_name"] == "Venue Data Biz"
        assert data["venue_type"] == "BUSINESS"
        assert data["address_city"] == "Pittsboro"
        assert data["phone_number"] == "919-555-1234"
        assert data["parking_types"] == ["Lot"]
        # wheelchair_accessible assertion removed — column dropped (Issue #45 PR2 Migration B)
        assert data["public_toilets"] == ["Indoor"]

    def test_venue_data_omits_hours(self, admin_client):
        """INVERTED (#124): hours are no longer copyable venue data.

        This used to be an assertion inside test_venue_data_returns_all_fields
        (`data["hours"]["monday"]["open"] == "09:00"`). Per issue #124 hours must
        stop copying: an event's schedule is its own, not the venue's opening
        hours. The venue still HAS hours; they just are not offered to the event.
        """
        biz = create_business(
            admin_client,
            name="Hours Not Copied Biz",
            hours={"monday": {"open": "09:00", "close": "17:00"}},
        )
        resp = admin_client.get(f"/api/pois/{biz['id']}/venue-data")
        assert resp.status_code == 200
        assert "hours" not in resp.json()

    def test_venue_data_includes_arrival_and_entry_notes(self, admin_client):
        """#124: arrival methods and entry notes were missing from the payload."""
        biz = create_business(
            admin_client,
            name="Arrival Biz",
            arrival_methods=["Street Parking", "Public Transit"],
            business_entry_notes="Enter through the blue side door.",
            what3words_address="index.home.raft",
        )
        data = admin_client.get(f"/api/pois/{biz['id']}/venue-data").json()
        assert data["arrival_methods"] == ["Street Parking", "Public Transit"]
        assert data["entry_notes"] == "Enter through the blue side door."
        assert data["what3words_address"] == "index.home.raft"

    def test_venue_data_entry_notes_resolved_per_venue_type(self, admin_client):
        """entry_notes normalizes park_entry_notes / trail_entry_notes too (P11)."""
        park = create_park(admin_client, name="Entry Park", park_entry_notes="Gate B only")
        trail = create_trail(
            admin_client, name="Entry Trail",
            trail={"trail_entry_notes": "North trailhead"},
        )

        assert admin_client.get(f"/api/pois/{park['id']}/venue-data").json()["entry_notes"] == "Gate B only"
        assert admin_client.get(f"/api/pois/{trail['id']}/venue-data").json()["entry_notes"] == "North trailhead"

    def test_venue_data_includes_mobility_access(self, admin_client):
        """#124: 'Step Free Entry / Main Service Area / Ground Level' did not copy.

        They are keys in ONE JSONB column, which was absent from the payload.
        """
        mobility = {
            "step_free_entry": True,
            "main_area_accessible": True,
            "ground_level_service": False,
        }
        biz = create_business(admin_client, name="Mobility Biz", mobility_access=mobility)
        data = admin_client.get(f"/api/pois/{biz['id']}/venue-data").json()
        assert data["mobility_access"] == mobility

    def test_venue_data_includes_parking_and_restroom_gaps(self, admin_client):
        """#124: accessible parking/restroom details were missing."""
        biz = create_business(
            admin_client,
            name="Access Details Biz",
            accessible_parking_details=["Van accessible", "Near entrance"],
            accessible_restroom_details=["Grab bars"],
        )
        data = admin_client.get(f"/api/pois/{biz['id']}/venue-data").json()
        assert data["accessible_parking_details"] == ["Van accessible", "Near entrance"]
        assert data["accessible_restroom_details"] == ["Grab bars"]
        # accessible_restroom is derived from the checklist, so mirror the venue.
        assert data["accessible_restroom"] == biz["accessible_restroom"]

    def test_venue_data_includes_playground(self, admin_client):
        """#124 asked for playground to copy over."""
        park = create_park(
            admin_client,
            name="Playground Park",
            playground_available=True,
            playground_types=["Swings", "Slides"],
            playground_surface_types=["Mulch"],
            playground_notes="Fenced",
            playground_age_groups=["2-5"],
            playground_ada_checklist=["Transfer station"],
        )
        data = admin_client.get(f"/api/pois/{park['id']}/venue-data").json()
        assert data["playground_available"] is True
        assert data["playground_types"] == ["Swings", "Slides"]
        assert data["playground_surface_types"] == ["Mulch"]
        assert data["playground_notes"] == "Fenced"
        assert data["playground_age_groups"] == ["2-5"]
        assert data["playground_ada_checklist"] == ["Transfer station"]
        # inclusive_playground is derived from the checklist, so mirror the venue.
        assert data["inclusive_playground"] == park["inclusive_playground"]

    def test_venue_data_includes_pet_alcohol_smoking(self, admin_client):
        """#124 asked for pet policy, alcohol and smoking to copy over."""
        biz = create_business(
            admin_client,
            name="Policies Biz",
            pet_options=["Leashed dogs"],
            pet_policy="Dogs on patio only",
            alcohol_available="beer_wine",
            alcohol_availability=["Beer"],
            alcohol_notes="Last call 10pm",
            byob_allowed=True,
            smoking_options=["Designated areas"],
            smoking_details="Rear patio",
        )
        data = admin_client.get(f"/api/pois/{biz['id']}/venue-data").json()
        assert data["pet_options"] == ["Leashed dogs"]
        assert data["pet_policy"] == "Dogs on patio only"
        assert data["alcohol_available"] == "beer_wine"
        assert data["alcohol_availability"] == ["Beer"]
        assert data["alcohol_notes"] == "Last call 10pm"
        assert data["byob_allowed"] is True
        assert data["smoking_options"] == ["Designated areas"]
        assert data["smoking_details"] == "Rear patio"

    def test_venue_data_includes_amenity_extras(self, admin_client):
        """Payment methods / cell service / payphones ride along with amenities."""
        biz = create_business(
            admin_client,
            name="Amenity Extras Biz",
            payment_methods=["Cash", "Credit Card"],
            cell_service="Good",
        )
        data = admin_client.get(f"/api/pois/{biz['id']}/venue-data").json()
        assert data["payment_methods"] == ["Cash", "Credit Card"]
        assert data["cell_service"] == "Good"

    def test_venue_data_trail_source_200(self, admin_client):
        """TRAIL is offered in venues/list, so venue-data must accept it too."""
        trail = create_trail(admin_client, name="Venue Data Trail")
        resp = admin_client.get(f"/api/pois/{trail['id']}/venue-data")
        assert resp.status_code == 200
        assert resp.json()["venue_type"] == "TRAIL"

    def test_venue_data_non_venue_type_400(self, admin_client):
        """EVENT POI → 400."""
        evt = create_event(admin_client, name="Not a Venue Event")
        resp = admin_client.get(f"/api/pois/{evt['id']}/venue-data")
        assert resp.status_code == 400

    def test_venue_data_missing_poi_404(self, admin_client):
        """Bad UUID → 404."""
        fake_id = str(uuid.uuid4())
        resp = admin_client.get(f"/api/pois/{fake_id}/venue-data")
        assert resp.status_code == 404
