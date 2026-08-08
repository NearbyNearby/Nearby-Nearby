"""
Tests for Task 45: Venue data inheritance for events.
Events should have venue_poi_id (FK) and venue_inheritance (JSONB)
to pull data from a linked venue POI with per-section controls.
"""
import uuid
import pytest
from sqlalchemy import text
from conftest import (
    create_event, create_business, create_park,
    orm_create_business, orm_create_event,
)
from shared.constants.venue_sections import UI_SECTIONS


class TestVenueInheritance:
    """Task 45: venue_poi_id and venue_inheritance on events."""

    def test_create_event_with_venue_poi_id(self, admin_client):
        """Create event linked to a venue POI via venue_poi_id."""
        venue = create_business(admin_client, "The Venue Hall")
        event = create_event(
            admin_client, "Concert at Venue",
            event={
                "start_datetime": "2026-06-15T18:00:00Z",
                "venue_poi_id": venue["id"],
            },
        )
        assert event["event"]["venue_poi_id"] == venue["id"]

    def test_venue_inheritance_config_stored(self, admin_client):
        """Venue inheritance config (per-section) is stored and returned."""
        venue = create_business(admin_client, "Config Venue")
        inheritance_config = {
            "parking": {"mode": "use_as_is"},
            "restrooms": {"mode": "use_and_add", "event_additions": "Portable restrooms near stage"},
            "playground": {"mode": "do_not_use"},
            "accessibility": {"mode": "use_as_is"},
            "pet_policy": {"mode": "use_as_is"},
            "drone_policy": {"mode": "use_as_is"},
        }
        event = create_event(
            admin_client, "Configured Event",
            event={
                "start_datetime": "2026-06-15T18:00:00Z",
                "venue_poi_id": venue["id"],
                "venue_inheritance": inheritance_config,
            },
        )
        vi = event["event"]["venue_inheritance"]
        assert vi["parking"]["mode"] == "use_as_is"
        assert vi["restrooms"]["mode"] == "use_and_add"
        assert vi["playground"]["mode"] == "do_not_use"

    def test_event_overrides_do_not_mutate_venue(self, admin_client):
        """Event overrides stored separately; venue POI stays unchanged."""
        venue = create_business(
            admin_client, "Immutable Venue",
            parking_notes="Venue has 50 spots",
        )
        event = create_event(
            admin_client, "Override Event",
            event={
                "start_datetime": "2026-06-15T18:00:00Z",
                "venue_poi_id": venue["id"],
            },
            parking_notes="Event adds valet parking",
        )
        # Venue should remain unchanged
        resp = admin_client.get(f"/api/pois/{venue['id']}")
        assert resp.json()["parking_notes"] == "Venue has 50 spots"
        # Event has its own parking notes
        assert event["parking_notes"] == "Event adds valet parking"

    def test_venue_poi_id_must_reference_valid_poi(self, admin_client):
        """venue_poi_id referencing a non-existent POI should fail or be rejected."""
        fake_id = str(uuid.uuid4())
        # This should fail because the FK constraint won't be satisfied
        resp = admin_client.post(
            "/api/pois/",
            json={
                "name": "Bad Venue Event",
                "poi_type": "EVENT",
                "location": {"type": "Point", "coordinates": [-79.3, 35.6]},
                "event": {
                    "start_datetime": "2026-06-15T18:00:00Z",
                    "venue_poi_id": fake_id,
                },
            },
        )
        # Should fail with 4xx or 5xx due to FK violation
        assert resp.status_code >= 400

    def test_venue_poi_id_nullable(self, admin_client):
        """Events without a venue_poi_id work normally (field is nullable)."""
        event = create_event(admin_client, "No Venue Event")
        assert event["event"].get("venue_poi_id") is None

    def test_venue_inheritance_nullable(self, admin_client):
        """Events without venue_inheritance work normally."""
        event = create_event(admin_client, "No Inheritance Event")
        assert event["event"].get("venue_inheritance") is None

    def test_park_as_venue(self, admin_client):
        """A park can be used as a venue for an event."""
        park = create_park(admin_client, "Festival Park")
        event = create_event(
            admin_client, "Park Festival",
            event={
                "start_datetime": "2026-06-15T18:00:00Z",
                "venue_poi_id": park["id"],
            },
        )
        assert event["event"]["venue_poi_id"] == park["id"]


class TestEventRemembersVenue:
    """Issue #124 item 4: 'once saved, the event doesn't remember the venue'."""

    def test_venue_poi_id_survives_update(self, admin_client):
        """Editing an unrelated field must not drop the venue link."""
        venue = create_business(admin_client, "Sticky Venue")
        event = create_event(
            admin_client, "Sticky Event",
            event={
                "start_datetime": "2026-06-15T18:00:00Z",
                "venue_poi_id": venue["id"],
            },
        )
        resp = admin_client.put(f"/api/pois/{event['id']}", json={"description_short": "edited"})
        assert resp.status_code == 200
        assert resp.json()["event"]["venue_poi_id"] == venue["id"]

        reread = admin_client.get(f"/api/pois/{event['id']}").json()
        assert reread["event"]["venue_poi_id"] == venue["id"]

    def test_admin_response_carries_venue_name_and_type(self, admin_client):
        """The form showed 'Unknown venue' because the name was never returned."""
        venue = create_park(admin_client, "Named Venue Park")
        event = create_event(
            admin_client, "Named Venue Event",
            event={
                "start_datetime": "2026-06-15T18:00:00Z",
                "venue_poi_id": venue["id"],
            },
        )
        data = admin_client.get(f"/api/pois/{event['id']}").json()
        assert data["event"]["venue_name"] == "Named Venue Park"
        assert data["event"]["venue_type"] == "PARK"

    def test_admin_response_venue_fields_none_without_venue(self, admin_client):
        """No venue linked means no venue display fields."""
        event = create_event(admin_client, "Venueless Event")
        data = admin_client.get(f"/api/pois/{event['id']}").json()
        assert data["event"]["venue_name"] is None
        assert data["event"]["venue_type"] is None

    @pytest.mark.parametrize("section", UI_SECTIONS)
    def test_every_ui_section_mode_round_trips(self, admin_client, section):
        """Each of the nine per-section modes persists and reads back."""
        venue = create_business(admin_client, f"RoundTrip Venue {section}")
        event = create_event(
            admin_client, f"RoundTrip Event {section}",
            event={
                "start_datetime": "2026-06-15T18:00:00Z",
                "venue_poi_id": venue["id"],
                "venue_inheritance": {section: "use_and_add"},
            },
        )
        assert event["event"]["venue_inheritance"] == {section: "use_and_add"}

        resp = admin_client.put(
            f"/api/pois/{event['id']}",
            json={"event": {
                "start_datetime": "2026-06-15T18:00:00Z",
                "venue_poi_id": venue["id"],
                "venue_inheritance": {section: "as_is"},
            }},
        )
        assert resp.status_code == 200
        assert resp.json()["event"]["venue_inheritance"] == {section: "as_is"}


class TestVenueInheritanceReadPath:
    """The mode contract as seen through the public app (#124 item 5)."""

    def test_as_is_section_follows_venue_update(self, db_session, app_client):
        """as_is means LIVE: editing the venue changes the event, untouched.

        This is the promise of 'Use as is' in issue #124: 'that accordion is
        locked down and keeps updating automatically whenever the venue POI
        updates'. The event row is never written to here.
        """
        venue = orm_create_business(db_session, "Live Venue", published=True,
                                    parking_notes="Venue lot A")
        event = orm_create_event(
            db_session, "Live Event", published=True,
            event_fields={
                "venue_poi_id": venue.id,
                "venue_inheritance": {"parking": "as_is"},
            },
        )
        db_session.commit()
        event_id = str(event.id)

        first = app_client.get(f"/api/pois/{event_id}")
        assert first.status_code == 200
        assert first.json()["parking_notes"] == "Venue lot A"

        # Edit ONLY the venue.
        venue.parking_notes = "Venue lot B"
        db_session.commit()

        second = app_client.get(f"/api/pois/{event_id}")
        assert second.status_code == 200
        assert second.json()["parking_notes"] == "Venue lot B"

    def test_use_and_add_section_does_not_follow_venue_update(self, db_session, app_client):
        """use_and_add is a one-time copy: later venue edits must NOT reach in.

        Mirror of test_as_is_section_follows_venue_update. Issue #124: 'their
        changes won't get overwritten if the venue POI updates'.
        """
        venue = orm_create_business(db_session, "Frozen Venue", published=True,
                                    parking_notes="Venue lot A")
        event = orm_create_event(
            db_session, "Frozen Event", published=True,
            parking_notes="Copied lot A, plus valet",
            event_fields={
                "venue_poi_id": venue.id,
                "venue_inheritance": {"parking": "use_and_add"},
            },
        )
        db_session.commit()
        event_id = str(event.id)

        assert app_client.get(f"/api/pois/{event_id}").json()["parking_notes"] == (
            "Copied lot A, plus valet"
        )

        venue.parking_notes = "Venue lot B"
        db_session.commit()

        assert app_client.get(f"/api/pois/{event_id}").json()["parking_notes"] == (
            "Copied lot A, plus valet"
        )

    def test_stale_hours_config_is_inert(self, db_session, app_client):
        """Prod rows carrying {"hours": "as_is"} keep working, ignored (#124 P10)."""
        venue = orm_create_business(db_session, "Hours Venue", published=True,
                                    hours={"monday": {"open": "09:00", "close": "17:00"}})
        event = orm_create_event(
            db_session, "Hours Event", published=True,
            event_fields={
                "venue_poi_id": venue.id,
                "venue_inheritance": {"hours": "as_is"},
            },
        )
        db_session.commit()
        resp = app_client.get(f"/api/pois/{event.id}")
        assert resp.status_code == 200
        assert not resp.json().get("hours")

    def test_app_response_carries_venue_name(self, db_session, app_client):
        """The public venue link needs the venue's name, resolved live (#124)."""
        venue = orm_create_business(db_session, "Public Venue Hall", published=True)
        event = orm_create_event(
            db_session, "Public Venue Event", published=True,
            event_fields={"venue_poi_id": venue.id},
        )
        db_session.commit()
        data = app_client.get(f"/api/pois/{event.id}").json()
        assert data["event"]["venue_poi_id"] == str(venue.id)
        assert data["event"]["venue_name"] == "Public Venue Hall"
        assert data["event"]["venue_type"] == "BUSINESS"

    def test_address_as_is_inherits_entry_notes(self, db_session, app_client):
        """Entry notes cross tables: venue business_entry_notes -> event_entry_notes."""
        venue = orm_create_business(
            db_session, "Entry Notes Venue", published=True,
            address_city="Pittsboro",
            business_entry_notes="Use the blue side door",
        )
        event = orm_create_event(
            db_session, "Entry Notes Event", published=True,
            event_fields={
                "venue_poi_id": venue.id,
                "venue_inheritance": {"address": "as_is"},
            },
        )
        db_session.commit()
        data = app_client.get(f"/api/pois/{event.id}").json()
        assert data["address_city"] == "Pittsboro"
        assert data["event"]["event_entry_notes"] == "Use the blue side door"

        # Read-time resolution must not write the inherited value into the row.
        db_session.expire_all()
        stored = db_session.execute(
            text("SELECT event_entry_notes FROM events WHERE poi_id = :pid"),
            {"pid": str(event.id)},
        ).scalar()
        assert stored is None
