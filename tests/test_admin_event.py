"""Tests for Event POI CRUD operations via admin API."""

import pytest
from conftest import create_event, create_business


class TestCreateEventMinimal:
    def test_create_event_minimal(self, admin_client):
        """Minimal event with event: { start_datetime }."""
        data = create_event(admin_client, name="Minimal Event")
        assert data["name"] == "Minimal Event"
        assert data["poi_type"] == "EVENT"
        assert data["event"] is not None
        assert data["event"]["start_datetime"] is not None
        assert data["publication_status"] == "draft"


class TestCreateEventAllFields:
    def test_create_event_all_subtype_fields(self, admin_client):
        """All event subtype fields."""
        payload = {
            "name": "Full Event",
            "poi_type": "EVENT",
            "location": {"type": "Point", "coordinates": [-79.3, 35.6]},
            "description_long": "Annual summer festival with live music and food vendors.",
            "address_city": "Pittsboro",
            "cost": "$25",
            "pricing_details": "Kids under 5 free. VIP: $75",
            "event": {
                "ticket_links": [{"platform": "Eventbrite", "url": "https://tickets.example.com/summer-fest"}],
                "start_datetime": "2026-07-04T10:00:00Z",
                "end_datetime": "2026-07-04T22:00:00Z",
                "is_repeating": False,
                "organizer_name": "Pittsboro Arts Council",
                "venue_settings": ["Outdoor", "Indoor"],
                "event_entry_notes": "Enter through main gate on Hillsboro St",
                "food_and_drink_info": "Local food trucks and beer garden on site",
                "coat_check_options": ["Available", "Free"],
                "has_vendors": True,
                "vendor_types": ["Food", "Crafts", "Art"],
                "vendor_application_deadline": "2026-06-01T23:59:59Z",
                "vendor_application_info": "Apply online at our website",
                "vendor_fee": "$150 per booth",
                "vendor_requirements": "Must have NC business license and liability insurance",
            },
        }

        resp = admin_client.post("/api/pois/", json=payload)
        assert resp.status_code == 201, resp.text
        data = resp.json()
        event = data["event"]
        assert event["organizer_name"] == "Pittsboro Arts Council"
        assert event["has_vendors"] is True
        assert event["vendor_types"] == ["Food", "Crafts", "Art"]
        assert event["venue_settings"] == ["Outdoor", "Indoor"]
        assert data["cost"] == "$25"
        assert event["ticket_links"] == [{"platform": "Eventbrite", "url": "https://tickets.example.com/summer-fest"}]


class TestCreateEventRepeating:
    def test_create_event_repeating(self, admin_client):
        """Repeating event with repeat_pattern."""
        data = create_event(
            admin_client,
            name="Weekly Trivia",
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


class TestCreateEventVendors:
    def test_create_event_vendors(self, admin_client):
        """Vendor-related fields."""
        data = create_event(
            admin_client,
            name="Vendor Event",
            event={
                "start_datetime": "2026-05-01T08:00:00Z",
                "has_vendors": True,
                "vendor_types": ["Food", "Crafts"],
                "vendor_application_deadline": "2026-04-15T23:59:59Z",
                "vendor_fee": "$100",
                "vendor_requirements": "Booth must be 10x10",
            },
        )
        event = data["event"]
        assert event["has_vendors"] is True
        assert event["vendor_types"] == ["Food", "Crafts"]
        assert event["vendor_fee"] == "$100"
        assert event["vendor_requirements"] == "Booth must be 10x10"


class TestCreateEventCostFields:
    def test_create_event_cost_fields(self, admin_client):
        """Cost, pricing_details, ticket_links on base POI."""
        data = create_event(
            admin_client,
            name="Paid Event",
            cost="$50",
            pricing_details="Early bird: $35 before June 1",
            event={
                "start_datetime": "2026-06-15T18:00:00Z",
                "ticket_links": [{"platform": "Eventbrite", "url": "https://tickets.example.com/paid"}],
            },
        )
        assert data["cost"] == "$50"
        assert data["pricing_details"] == "Early bird: $35 before June 1"
        assert data["event"]["ticket_links"] == [{"platform": "Eventbrite", "url": "https://tickets.example.com/paid"}]


class TestEventRequiresEventsRow:
    """Issue #163: an EVENT POI must always have an events row. start_datetime
    has no defensible default, so the invariant is enforced at publish time
    rather than by auto-creating a placeholder row."""

    def test_create_event_poi_without_event_data_rejected(self, admin_client):
        """Direct creation already refuses poi_type EVENT with no event payload."""
        payload = {
            "name": "No Event Data",
            "poi_type": "EVENT",
            "location": {"type": "Point", "coordinates": [-79.3, 35.6]},
        }
        resp = admin_client.post("/api/pois/", json=payload)
        assert resp.status_code in (400, 422), resp.text

    def test_publish_after_type_switch_to_event_without_event_data_rejected(self, admin_client):
        """A POI created as another type and switched to EVENT via PUT (with no
        'event' payload) picks up no events row. Publishing it must be refused,
        otherwise the public API would show event: null with no date anywhere."""
        biz = create_business(admin_client, name="Switchable Business")
        poi_id = biz["id"]

        switch_resp = admin_client.put(f"/api/pois/{poi_id}", json={"poi_type": "EVENT"})
        assert switch_resp.status_code == 200, switch_resp.text
        assert switch_resp.json()["poi_type"] == "EVENT"
        assert switch_resp.json()["event"] is None

        publish_resp = admin_client.put(f"/api/pois/{poi_id}", json={"publication_status": "published"})
        assert publish_resp.status_code == 422, publish_resp.text

        # Fetch confirms the POI is still a draft with no event data.
        fetched = admin_client.get(f"/api/pois/{poi_id}").json()
        assert fetched["publication_status"] == "draft"
        assert fetched["event"] is None

    def test_publish_with_type_switch_and_publish_in_one_request_rejected(self, admin_client):
        """Switching to EVENT and publishing in the same request, still with no
        event data, must also be refused."""
        biz = create_business(admin_client, name="Switch And Publish Business")
        poi_id = biz["id"]

        resp = admin_client.put(
            f"/api/pois/{poi_id}",
            json={"poi_type": "EVENT", "publication_status": "published"},
        )
        assert resp.status_code == 422, resp.text

    def test_publish_with_empty_event_payload_rejected_cleanly(self, admin_client):
        """An 'event' key with no start_datetime (e.g. {}) must not sail past
        the invariant check into models.Event(**{}) and die on the DB's
        start_datetime NOT NULL constraint (a raw 400 IntegrityError). It must
        be caught by the same clean 422 as no 'event' key at all."""
        biz = create_business(admin_client, name="Empty Event Payload Business")
        poi_id = biz["id"]
        admin_client.put(f"/api/pois/{poi_id}", json={"poi_type": "EVENT"})

        resp = admin_client.put(
            f"/api/pois/{poi_id}",
            json={"event": {}, "publication_status": "published"},
        )
        assert resp.status_code == 422, resp.text

        fetched = admin_client.get(f"/api/pois/{poi_id}").json()
        assert fetched["publication_status"] == "draft"
        assert fetched["event"] is None

    def test_publish_succeeds_once_event_data_is_added(self, admin_client):
        """After a type switch, supplying event data and then publishing works."""
        biz = create_business(admin_client, name="Business Becoming Event")
        poi_id = biz["id"]

        admin_client.put(f"/api/pois/{poi_id}", json={"poi_type": "EVENT"})

        add_event_resp = admin_client.put(
            f"/api/pois/{poi_id}",
            json={"event": {"start_datetime": "2026-09-01T18:00:00Z"}},
        )
        assert add_event_resp.status_code == 200, add_event_resp.text
        assert add_event_resp.json()["event"]["start_datetime"] is not None

        publish_resp = admin_client.put(f"/api/pois/{poi_id}", json={"publication_status": "published"})
        assert publish_resp.status_code == 200, publish_resp.text
        assert publish_resp.json()["publication_status"] == "published"

    def test_autosave_cannot_publish_event_poi_without_event_row(self, admin_client):
        """The autosave endpoint denies changing poi_type, but publication_status
        is autosave-allowed; it must not be able to publish an EVENT POI whose
        events row is missing (e.g. left over from a type switch)."""
        biz = create_business(admin_client, name="Autosave Switch Business")
        poi_id = biz["id"]
        admin_client.put(f"/api/pois/{poi_id}", json={"poi_type": "EVENT"})

        autosave_resp = admin_client.patch(
            f"/api/pois/{poi_id}/autosave", json={"publication_status": "published"}
        )
        assert autosave_resp.status_code == 422, autosave_resp.text

        fetched = admin_client.get(f"/api/pois/{poi_id}").json()
        assert fetched["publication_status"] == "draft"
