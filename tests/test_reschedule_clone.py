"""Fix 2: reschedule_event clones edges, points, and photos (not just columns).

The original reschedule copied only the points_of_interest / events columns raw,
so it silently dropped every poi_relationships edge (vendor + other links),
poi_points pin, and images-table photo, while carrying stale legacy JSONB along as
dead data. The clone now copies edges / pins / photos from their real tables and
omits the dead JSONB columns; the source is left untouched (bar its status ->
Rescheduled) and a revision row is written for both sides.
"""

import uuid

import sqlalchemy as sa

from conftest import create_business, create_event
from shared.models.enums import ImageType
from shared.models.image import Image
from shared.models.poi import POIPoint, POIRelationship


def _edges(db, source_id, rel_type=None):
    q = db.query(POIRelationship).filter(POIRelationship.source_poi_id == source_id)
    if rel_type:
        q = q.filter(POIRelationship.relationship_type == rel_type)
    return q.all()


def _points(db, poi_id, kind=None):
    q = db.query(POIPoint).filter(POIPoint.poi_id == poi_id)
    if kind:
        q = q.filter(POIPoint.kind == kind)
    return q.all()


def _images(db, poi_id):
    return db.query(Image).filter(
        Image.poi_id == poi_id, Image.parent_image_id.is_(None)
    ).all()


def _add_image(db, poi_id, image_type, url, order=0):
    db.add(Image(
        id=uuid.uuid4(),
        poi_id=poi_id,
        image_type=ImageType(image_type),
        filename=f"{image_type}.jpg",
        storage_url=url,
        storage_provider="s3",
        image_size_variant="original",
        display_order=order,
    ))
    db.flush()


def _raw(db, table, poi_key, poi_id, column):
    return db.execute(
        sa.text(f"SELECT {column} FROM {table} WHERE {poi_key} = :id"),
        {"id": str(poi_id)},
    ).scalar()


def _revision_actions(db, poi_id):
    return [r[0] for r in db.execute(
        sa.text("SELECT action FROM poi_revisions WHERE poi_id = :id ORDER BY created_at"),
        {"id": str(poi_id)},
    ).fetchall()]


def _setup_source(db, client):
    """An event with 2 vendor edges + 1 service_location edge + 2 parking pins +
    2 images."""
    vendor1 = create_business(client, name="Vendor One")
    vendor2 = create_business(client, name="Vendor Two")
    svc = create_business(client, name="Service Loc")
    event = create_event(
        client, name="Summer Fair",
        service_locations=[svc["id"]],
        parking_locations=[
            {"lat": 35.70, "lng": -79.10, "name": "Lot A"},
            {"lat": 35.80, "lng": -79.20, "name": "Lot B"},
        ],
        event={
            "start_datetime": "2026-06-15T18:00:00Z",
            "vendor_poi_links": [
                {"poi_id": vendor1["id"], "vendor_type": "Food"},
                {"poi_id": vendor2["id"], "vendor_type": "Craft"},
            ],
        },
    )
    _add_image(db, event["id"], "main", "https://x/hero.jpg", 0)
    _add_image(db, event["id"], "gallery", "https://x/g1.jpg", 1)
    return event


def test_reschedule_clones_edges_points_images_leaves_source_intact(db_session, admin_client):
    event = _setup_source(db_session, admin_client)
    src_id = event["id"]

    # Sanity: the source has the edges / pins / photos (all in their real tables).
    assert len(_edges(db_session, src_id, "vendor")) == 2
    assert len(_edges(db_session, src_id, "service_location")) == 1
    assert len(_points(db_session, src_id, "parking")) == 2
    assert len(_images(db_session, src_id)) == 2

    resp = admin_client.post(
        f"/api/pois/{src_id}/reschedule",
        json={"new_start_datetime": "2026-08-01T18:00:00Z",
              "new_end_datetime": "2026-08-01T21:00:00Z"},
    )
    assert resp.status_code == 201, resp.text
    clone_id = resp.json()["id"]
    assert clone_id != src_id

    # (a) Clone has equivalent edges / pins / photos.
    clone_vendor = _edges(db_session, clone_id, "vendor")
    assert len(clone_vendor) == 2
    assert {e.meta.get("vendor_type") for e in clone_vendor} == {"Food", "Craft"}
    assert len(_edges(db_session, clone_id, "service_location")) == 1
    assert len(_points(db_session, clone_id, "parking")) == 2
    assert len(_images(db_session, clone_id)) == 2

    # Shape round-trips through the admin serializer (reconstructed from tables).
    got = admin_client.get(f"/api/pois/{clone_id}").json()
    assert len(got["parking_locations"]) == 2
    assert len(got["service_locations"]) == 1
    assert len(got["event"]["vendor_poi_links"]) == 2

    # (b) Legacy JSONB on the clone is empty/NULL (the dead columns are not copied).
    for col in ("service_locations", "parking_locations",
                "featured_image", "photos", "gallery_photos"):
        assert not _raw(db_session, "points_of_interest", "id", clone_id, col), col
    assert not _raw(db_session, "events", "poi_id", clone_id, "vendor_poi_links")

    # (c) Original untouched: still owns its edges / pins / photos; status flipped.
    assert len(_edges(db_session, src_id, "vendor")) == 2
    assert len(_edges(db_session, src_id, "service_location")) == 1
    assert len(_points(db_session, src_id, "parking")) == 2
    assert len(_images(db_session, src_id)) == 2
    src = admin_client.get(f"/api/pois/{src_id}").json()
    assert src["event"]["event_status"] == "Rescheduled"

    # (d) Revision rows written for both sides.
    assert "create" in _revision_actions(db_session, clone_id)
    assert "update" in _revision_actions(db_session, src_id)
