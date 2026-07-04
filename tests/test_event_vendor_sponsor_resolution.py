"""
Phase 11: Test vendor & sponsor POI resolution endpoints.

GET /pois/{poi_id}/vendors — resolves vendor_poi_links to POI summaries
GET /pois/{poi_id}/sponsors — resolves sponsor entries (linked POIs + manual)

Uses ORM helpers (not admin_client) to create data, then app_client to read.
"""

import pytest
from conftest import orm_create_event, orm_create_business
from shared.models.poi import POIRelationship


def _add_vendor_edge(db, event, vendor, vendor_type=None):
    """Task 2.1: event vendors now live in poi_relationships (type 'vendor');
    vendor_type is carried in the edge meta."""
    db.add(POIRelationship(
        source_poi_id=event.id,
        target_poi_id=vendor.id,
        relationship_type="vendor",
        meta={"vendor_type": vendor_type} if vendor_type else None,
    ))
    db.flush()


class TestVendorResolution:
    """GET /pois/{poi_id}/vendors resolves 'vendor' edges to POI summaries."""

    def test_vendors_resolves_linked_pois(self, db_session, app_client):
        """A 'vendor' edge should resolve to a POI summary."""
        vendor = orm_create_business(db_session, name="BBQ Vendor", published=True)
        vendor_id = str(vendor.id)

        event = orm_create_event(
            db_session,
            name="BBQ Festival",
            published=True,
            event_fields={"start_datetime": "2026-08-01T12:00:00+00:00"},
        )
        _add_vendor_edge(db_session, event, vendor, vendor_type="Food")
        event_id = str(event.id)
        db_session.commit()

        resp = app_client.get(f"/api/pois/{event_id}/vendors")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["id"] == vendor_id
        assert data[0]["name"] == "BBQ Vendor"
        assert data[0]["vendor_type"] == "Food"
        assert "slug" in data[0]

    def test_vendors_empty_list_when_no_vendors(self, db_session, app_client):
        """Returns empty list when event has no vendor_poi_links."""
        event = orm_create_event(
            db_session,
            name="Solo Event",
            published=True,
        )
        event_id = str(event.id)
        db_session.commit()

        resp = app_client.get(f"/api/pois/{event_id}/vendors")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_vendors_skips_unpublished_pois(self, db_session, app_client):
        """Vendor POIs that are not published should be excluded."""
        vendor = orm_create_business(db_session, name="Draft Vendor", published=False)

        event = orm_create_event(
            db_session,
            name="Vendor Event Draft",
            published=True,
            event_fields={"start_datetime": "2026-08-01T12:00:00+00:00"},
        )
        _add_vendor_edge(db_session, event, vendor, vendor_type="Crafts")
        event_id = str(event.id)
        db_session.commit()

        resp = app_client.get(f"/api/pois/{event_id}/vendors")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_vendors_404_for_nonexistent_poi(self, app_client):
        """Should return 404 for a non-existent event POI."""
        resp = app_client.get("/api/pois/00000000-0000-0000-0000-000000000000/vendors")
        assert resp.status_code == 404


class TestSponsorResolution:
    """GET /pois/{poi_id}/sponsors resolves sponsor entries."""

    def test_sponsors_resolves_linked_poi(self, db_session, app_client):
        """Sponsor with poi_id should resolve to POI details."""
        sponsor_poi = orm_create_business(db_session, name="Sponsor Corp", published=True)
        sponsor_id = str(sponsor_poi.id)

        event = orm_create_event(
            db_session,
            name="Sponsored Event",
            published=True,
            event_fields={
                "start_datetime": "2026-09-01T10:00:00+00:00",
                "sponsors": [{"poi_id": sponsor_id, "tier": "Gold"}],
            },
        )
        event_id = str(event.id)
        db_session.commit()

        resp = app_client.get(f"/api/pois/{event_id}/sponsors")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "Sponsor Corp"
        assert data[0]["poi_id"] == sponsor_id
        assert data[0]["tier"] == "Gold"

    def test_sponsors_manual_entry_returned_as_is(self, db_session, app_client):
        """Manual sponsor entries (no poi_id) should be returned as-is."""
        event = orm_create_event(
            db_session,
            name="Manual Sponsor Event",
            published=True,
            event_fields={
                "start_datetime": "2026-09-01T10:00:00+00:00",
                "sponsors": [{"name": "Local Bakery", "tier": "Silver"}],
            },
        )
        event_id = str(event.id)
        db_session.commit()

        resp = app_client.get(f"/api/pois/{event_id}/sponsors")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "Local Bakery"
        assert data[0]["tier"] == "Silver"

    def test_sponsors_mixed_linked_and_manual(self, db_session, app_client):
        """Both linked POI sponsors and manual sponsors should appear."""
        sponsor_poi = orm_create_business(db_session, name="Big Corp", published=True)
        sponsor_id = str(sponsor_poi.id)

        event = orm_create_event(
            db_session,
            name="Mixed Sponsors Event",
            published=True,
            event_fields={
                "start_datetime": "2026-09-01T10:00:00+00:00",
                "sponsors": [
                    {"poi_id": sponsor_id, "tier": "Platinum"},
                    {"name": "Mom & Pop Shop", "tier": "Bronze"},
                ],
            },
        )
        event_id = str(event.id)
        db_session.commit()

        resp = app_client.get(f"/api/pois/{event_id}/sponsors")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        names = [s["name"] for s in data]
        assert "Big Corp" in names
        assert "Mom & Pop Shop" in names

    def test_sponsors_empty_list_when_no_sponsors(self, db_session, app_client):
        """Returns empty list when event has no sponsors."""
        event = orm_create_event(
            db_session,
            name="No Sponsors Event",
            published=True,
        )
        event_id = str(event.id)
        db_session.commit()

        resp = app_client.get(f"/api/pois/{event_id}/sponsors")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_sponsors_404_for_nonexistent_poi(self, app_client):
        """Should return 404 for a non-existent event POI."""
        resp = app_client.get("/api/pois/00000000-0000-0000-0000-000000000000/sponsors")
        assert resp.status_code == 404
