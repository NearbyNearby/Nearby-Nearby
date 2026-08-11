"""Task 2.1: JSONB UUID-array POI links migrated to poi_relationships edges.

Covers the EXPAND step (this release):
  * admin create/update writes the six link kinds as edges, NOT JSONB;
  * admin GET reconstructs the fields from edges (round-trip);
  * the public detail endpoint renders linked POIs from edges;
  * deleting a linked POI removes its edges (FK CASCADE + admin flow) — no ghost;
  * the idempotent backfill migrates JSONB arrays -> edges, skipping ghost refs;
  * new writes leave the JSONB columns untouched (not dropped this release).
"""

import uuid

import pytest
from sqlalchemy import text

from conftest import (
    orm_create_business, orm_create_park, orm_create_event,
    create_business, create_park, create_trail, create_event,
)
from shared.models.poi import POIRelationship, PointOfInterest
from shared.relationship_links import backfill_link_edges


def _edges(db, source_id, rel_type=None):
    q = db.query(POIRelationship).filter(
        POIRelationship.source_poi_id == source_id
    )
    if rel_type:
        q = q.filter(POIRelationship.relationship_type == rel_type)
    return q.all()


def _raw_col(db, table, poi_key, poi_id, column):
    return db.execute(
        text(f"SELECT {column} FROM {table} WHERE {poi_key} = :id"),
        {"id": str(poi_id)},
    ).scalar()


def _bare_poi(db, name):
    """A POI with NO subtype table (DISASTER_HUBS) so a raw DELETE exercises the
    poi_relationships FK CASCADE in isolation (no subtype FK to trip on)."""
    poi = PointOfInterest(
        id=uuid.uuid4(),
        poi_type="DISASTER_HUBS",
        name=name,
        slug=name.lower().replace(" ", "-") + "-" + uuid.uuid4().hex[:6],
        location="POINT(-79.0 35.8)",
        publication_status="draft",
    )
    db.add(poi)
    db.flush()
    return poi


class TestLinkWriteCreatesEdges:
    """Admin create writes each link kind into poi_relationships, not JSONB."""

    def test_service_locations_business_to_park(self, db_session, admin_client):
        park = create_park(admin_client, name="Svc Park", published=True)
        biz = create_business(
            admin_client, name="Svc Biz", published=True,
            listing_type="paid", service_locations=[park["id"]],
        )

        edges = _edges(db_session, biz["id"], "service_location")
        assert len(edges) == 1
        assert str(edges[0].target_poi_id) == park["id"]

        # JSONB column NOT written by the new path.
        assert _raw_col(db_session, "points_of_interest", "id",
                        biz["id"], "service_locations") in (None, [])

        # Admin GET reconstructs the field from edges.
        got = admin_client.get(f"/api/pois/{biz['id']}").json()
        assert got["service_locations"] == [park["id"]]

    def test_associated_trails_park_to_trail(self, db_session, admin_client):
        trail = create_trail(admin_client, name="Assoc Trail", published=True)
        park = create_park(
            admin_client, name="Assoc Park", published=True,
            associated_trails=[trail["id"]],
        )
        edges = _edges(db_session, park["id"], "associated_trail")
        assert len(edges) == 1
        assert str(edges[0].target_poi_id) == trail["id"]
        assert _raw_col(db_session, "points_of_interest", "id",
                        park["id"], "associated_trails") in (None, [])
        got = admin_client.get(f"/api/pois/{park['id']}").json()
        assert got["associated_trails"] == [trail["id"]]

    def test_membership_passes_park_to_park(self, db_session, admin_client):
        other = create_park(admin_client, name="Pass Park", published=True)
        park = create_park(
            admin_client, name="Member Park", published=True,
            membership_passes=[other["id"]],
        )
        edges = _edges(db_session, park["id"], "membership_pass")
        assert len(edges) == 1
        assert str(edges[0].target_poi_id) == other["id"]

    def test_vendor_poi_links_event_to_business_keeps_meta(self, db_session, admin_client):
        vendor = create_business(admin_client, name="Vendor Biz", published=True)
        event = create_event(
            admin_client, name="Vendor Event", published=True,
            event={
                "start_datetime": "2026-06-15T18:00:00Z",
                "vendor_poi_links": [{"poi_id": vendor["id"], "vendor_type": "Food"}],
            },
        )
        edges = _edges(db_session, event["id"], "vendor")
        assert len(edges) == 1
        assert str(edges[0].target_poi_id) == vendor["id"]
        assert edges[0].meta == {"vendor_type": "Food"}

        # events.vendor_poi_links JSONB NOT written.
        assert _raw_col(db_session, "events", "poi_id",
                        event["id"], "vendor_poi_links") in (None, [])

        # Admin GET reconstructs the nested event field for the vendor form.
        got = admin_client.get(f"/api/pois/{event['id']}").json()
        assert got["event"]["vendor_poi_links"] == [
            {"poi_id": vendor["id"], "vendor_type": "Food"}
        ]

    def test_organization_memberships_poi_and_name_only(self, db_session, admin_client):
        org = create_business(admin_client, name="Org POI", published=True)
        biz = create_business(
            admin_client, name="Member Biz", published=True, listing_type="paid",
            organization_memberships=[
                {"poi_id": org["id"], "name": "Partner Org"},
                {"name": "Chamber of Commerce"},  # external, no poi_id -> not an edge
            ],
        )
        edges = _edges(db_session, biz["id"], "organization_membership")
        assert len(edges) == 1
        assert str(edges[0].target_poi_id) == org["id"]
        assert edges[0].meta == {"name": "Partner Org"}
        # Admin GET returns only the POI-linked entry (name-only is not migrated).
        got = admin_client.get(f"/api/pois/{biz['id']}").json()
        assert got["organization_memberships"] == [
            {"poi_id": org["id"], "name": "Partner Org"}
        ]

    def test_update_replaces_edges(self, db_session, admin_client):
        p1 = create_park(admin_client, name="Loc One", published=True)
        p2 = create_park(admin_client, name="Loc Two", published=True)
        biz = create_business(
            admin_client, name="Loc Biz", published=True, listing_type="paid",
            locally_found_at=[p1["id"]],
        )
        assert {str(e.target_poi_id) for e in _edges(db_session, biz["id"], "locally_found_at")} == {p1["id"]}

        # PUT swapping the link should replace the edge set (delete + reinsert).
        resp = admin_client.put(f"/api/pois/{biz['id']}", json={"locally_found_at": [p2["id"]]})
        assert resp.status_code == 200, resp.text
        assert {str(e.target_poi_id) for e in _edges(db_session, biz["id"], "locally_found_at")} == {p2["id"]}


class TestPublicRendersFromEdges:
    """The public detail endpoint renders linked POIs from edges."""

    def test_public_renders_service_locations(self, db_session, app_client):
        park = orm_create_park(db_session, name="Public Svc Park", published=True)
        biz = orm_create_business(
            db_session, name="Public Svc Biz", published=True, listing_type="paid",
        )
        db_session.add(POIRelationship(
            source_poi_id=biz.id, target_poi_id=park.id,
            relationship_type="service_location",
        ))
        db_session.commit()

        data = app_client.get(f"/api/pois/{biz.id}").json()
        assert "service_locations" in data
        assert len(data["service_locations"]) == 1
        item = data["service_locations"][0]
        assert item["id"] == str(park.id)
        assert item["name"] == "Public Svc Park"
        assert item["slug"] == park.slug

    def test_public_excludes_unpublished_link_target(self, db_session, app_client):
        draft_park = orm_create_park(db_session, name="Draft Target", published=False)
        biz = orm_create_business(
            db_session, name="Biz With Draft Link", published=True, listing_type="paid",
        )
        db_session.add(POIRelationship(
            source_poi_id=biz.id, target_poi_id=draft_park.id,
            relationship_type="service_location",
        ))
        db_session.commit()

        data = app_client.get(f"/api/pois/{biz.id}").json()
        assert data.get("service_locations", []) == []


class TestDeleteRemovesEdges:
    """Deleting a linked POI removes its edges — no ghost refs."""

    def test_fk_cascade_on_raw_delete(self, db_session):
        a = _bare_poi(db_session, "Cascade Source")
        b = _bare_poi(db_session, "Cascade Target")
        db_session.add(POIRelationship(
            source_poi_id=a.id, target_poi_id=b.id,
            relationship_type="service_location",
        ))
        db_session.commit()
        assert db_session.query(POIRelationship).count() == 1

        # Raw delete of the TARGET must cascade-remove the edge (proves the
        # ON DELETE CASCADE FK, independent of any app-level cleanup).
        db_session.execute(
            text("DELETE FROM points_of_interest WHERE id = :id"),
            {"id": str(b.id)},
        )
        db_session.commit()
        assert db_session.query(POIRelationship).count() == 0

    def test_admin_delete_of_target_leaves_no_ghost(self, db_session, admin_client):
        park = create_park(admin_client, name="Ghost Park")  # draft -> deletable
        biz = create_business(
            admin_client, name="Ghost Biz", listing_type="paid",
            service_locations=[park["id"]],
        )
        assert db_session.query(POIRelationship).count() == 1

        resp = admin_client.delete(f"/api/pois/{park['id']}")
        assert resp.status_code == 200, resp.text
        assert db_session.query(POIRelationship).count() == 0


class TestBackfillMigration:
    """The idempotent JSONB -> edges backfill (as the migration runs it)."""

    def test_backfill_skips_ghost_ref(self, db_session):
        park = orm_create_park(db_session, name="BF Park", published=True)
        ghost = str(uuid.uuid4())  # resolves to no POI
        biz = orm_create_business(
            db_session, name="BF Biz", published=True,
            service_locations=[str(park.id), ghost],
        )
        db_session.commit()
        # Precondition: the ORM helper wrote JSONB, created NO edges.
        assert db_session.query(POIRelationship).count() == 0

        results = backfill_link_edges(db_session)
        assert results["service_locations"]["written"] == 1
        assert results["service_locations"]["skipped"] == 1  # ghost uuid dropped

        edges = _edges(db_session, biz.id, "service_location")
        assert len(edges) == 1
        assert str(edges[0].target_poi_id) == str(park.id)

    def test_backfill_is_idempotent(self, db_session):
        park = orm_create_park(db_session, published=True)
        orm_create_business(
            db_session, published=True, service_locations=[str(park.id)],
        )
        db_session.commit()

        r1 = backfill_link_edges(db_session)
        assert r1["service_locations"]["written"] == 1
        first = db_session.query(POIRelationship).count()

        r2 = backfill_link_edges(db_session)  # re-run must be a no-op
        assert r2["service_locations"]["written"] == 0
        assert db_session.query(POIRelationship).count() == first

    def test_backfill_vendor_preserves_meta(self, db_session):
        vendor = orm_create_business(db_session, name="BF Vendor", published=True)
        event = orm_create_event(
            db_session, name="BF Event", published=True,
            event_fields={
                "vendor_poi_links": [{"poi_id": str(vendor.id), "vendor_type": "Food"}],
            },
        )
        db_session.commit()

        results = backfill_link_edges(db_session)
        assert results["vendor_poi_links"]["written"] == 1
        edge = (
            db_session.query(POIRelationship)
            .filter_by(source_poi_id=event.id, relationship_type="vendor")
            .one()
        )
        assert edge.meta == {"vendor_type": "Food"}

    def test_backfill_org_membership_skips_name_only(self, db_session):
        orm_create_business(
            db_session, name="Org Biz", published=True,
            organization_memberships=[{"name": "Chamber of Commerce"}],
        )
        db_session.commit()

        results = backfill_link_edges(db_session)
        # A name-only external org is not a POI link -> no edge, not a ghost ref.
        assert results["organization_memberships"]["written"] == 0
        assert db_session.query(POIRelationship).count() == 0
