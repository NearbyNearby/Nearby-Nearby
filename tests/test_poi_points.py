"""Task 2.3: point geometry migrated from JSONB columns to the poi_points table.

Covers the EXPAND step (this release):
  * admin create/update/autosave write the six point fields as poi_points rows,
    NOT JSONB (per-kind delete + reinsert; original array order preserved);
  * admin GET reconstructs each field in its original JSONB shape (round-trip:
    add / move / delete a pin via the admin API), including non-geometry meta;
  * the public detail endpoint renders the flat POI-owned fields and the nested
    trail-owned fields (access_points / trailhead_location) from poi_points;
  * deleting a POI cascades its poi_points rows (FK ON DELETE CASCADE);
  * the idempotent backfill migrates JSONB -> rows, skipping and counting
    malformed / coordinate-less entries; re-running is a no-op;
  * the plan's acceptance query works: raw SQL "nearest restroom to a
    coordinate" (ST_Distance / ST_DWithin against poi_points WHERE
    kind='restroom') returns the right row;
  * new writes leave the JSONB columns untouched (not dropped this release).
"""

import uuid

import pytest
from geoalchemy2.elements import WKTElement
from sqlalchemy import text

from conftest import (
    orm_create_business, orm_create_park, orm_create_trail, orm_create_event,
    create_business, create_park, create_trail,
)
from shared.models.poi import POIPoint, PointOfInterest
from shared.poi_points import backfill_point_rows, read_point_field


def _rows(db, poi_id, kind=None):
    q = db.query(POIPoint).filter(POIPoint.poi_id == poi_id)
    if kind:
        q = q.filter(POIPoint.kind == kind)
    return q.all()


def _coords(db, poi_id, kind):
    """(lat, lng) tuples for a POI's rows of one kind, in _pos order."""
    return db.execute(
        text(
            "SELECT ST_Y(geom), ST_X(geom) FROM poi_points "
            "WHERE poi_id = :p AND kind = :k "
            "ORDER BY COALESCE((meta->>'_pos')::int, 0), id"
        ),
        {"p": str(poi_id), "k": kind},
    ).fetchall()


def _raw_col(db, table, poi_key, poi_id, column):
    return db.execute(
        text(f"SELECT {column} FROM {table} WHERE {poi_key} = :id"),
        {"id": str(poi_id)},
    ).scalar()


def _bare_poi(db, name):
    """A POI with NO subtype table (DISASTER_HUBS) so a raw DELETE exercises the
    poi_points FK CASCADE in isolation (no subtype FK to trip on)."""
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


def _point(db, poi_id, kind, lat, lng, meta=None, pos=0):
    """Insert a poi_points row directly (for public-render / query tests)."""
    m = dict(meta or {})
    m["_pos"] = pos
    row = POIPoint(
        poi_id=poi_id,
        kind=kind,
        geom=WKTElement(f"POINT({lng} {lat})", srid=4326),
        meta=m,
    )
    db.add(row)
    db.flush()
    return row


PARKING_ROW = {
    "lat": 35.8, "lng": -79.0, "w3w": "filled.count.soap",
    "name": "Main Lot", "parking_types": ["Free Parking"],
    "accessible_parking_details": [], "notes": "Back lot free after 5",
}


class TestPointWriteCreatesRows:
    """Admin writes persist each point kind into poi_points, not JSONB."""

    def test_parking_locations_create_roundtrip(self, db_session, admin_client):
        park = create_park(
            admin_client, name="Pk Park", published=True,
            parking_locations=[PARKING_ROW],
        )

        rows = _rows(db_session, park["id"], "parking")
        assert len(rows) == 1
        assert _coords(db_session, park["id"], "parking") == [(35.8, -79.0)]
        # Every non-coordinate key survives via meta (plus the internal _pos).
        assert {k: v for k, v in rows[0].meta.items() if k != "_pos"} == {
            k: v for k, v in PARKING_ROW.items() if k not in ("lat", "lng")
        }

        # JSONB column NOT written by the new path.
        assert _raw_col(db_session, "points_of_interest", "id",
                        park["id"], "parking_locations") in (None, [])

        # Admin GET reconstructs the original shape from poi_points.
        got = admin_client.get(f"/api/pois/{park['id']}").json()
        assert got["parking_locations"] == [PARKING_ROW]

    def test_toilet_locations_create(self, db_session, admin_client):
        row = {"restroom_name": "Visitor Center", "lat": 35.81, "lng": -79.01,
               "w3w": "", "description": "<p>Paying customers only</p>",
               "photos": "", "toilet_types": ["Flush Toilets"],
               "accessible_restroom": False, "accessible_restroom_details": []}
        biz = create_business(
            admin_client, name="WC Biz", published=True, toilet_locations=[row],
        )
        assert len(_rows(db_session, biz["id"], "restroom")) == 1
        assert _raw_col(db_session, "points_of_interest", "id",
                        biz["id"], "toilet_locations") in (None, [])
        got = admin_client.get(f"/api/pois/{biz['id']}").json()
        assert got["toilet_locations"] == [row]

    def test_playground_locations_create(self, db_session, admin_client):
        row = {"lat": 35.82, "lng": -79.02, "w3w": "",
               "types": ["Swings"], "surfaces": ["Mulch"], "notes": ""}
        park = create_park(
            admin_client, name="Pg Park", published=True,
            playground_locations=[row],
        )
        rows = _rows(db_session, park["id"], "playground")
        assert len(rows) == 1
        assert rows[0].meta["types"] == ["Swings"]
        assert rows[0].meta["surfaces"] == ["Mulch"]
        assert _raw_col(db_session, "points_of_interest", "id",
                        park["id"], "playground_locations") in (None, [])
        got = admin_client.get(f"/api/pois/{park['id']}").json()
        assert got["playground_locations"] == [row]

    def test_payphone_locations_autosave(self, db_session, admin_client):
        park = create_park(admin_client, name="Pp Park")
        resp = admin_client.patch(
            f"/api/pois/{park['id']}/autosave",
            json={"payphone_locations": [
                {"lat": 35.83, "lng": -79.03, "w3w": "", "description": "Near entrance"},
            ]},
        )
        assert resp.status_code == 200, resp.text

        rows = _rows(db_session, park["id"], "payphone")
        assert len(rows) == 1
        assert rows[0].meta["description"] == "Near entrance"
        assert _raw_col(db_session, "points_of_interest", "id",
                        park["id"], "payphone_locations") in (None, [])
        got = admin_client.get(f"/api/pois/{park['id']}").json()
        assert got["payphone_locations"] == [
            {"lat": 35.83, "lng": -79.03, "w3w": "", "description": "Near entrance"},
        ]

    def test_trail_access_points_and_trailhead_create(self, db_session, admin_client):
        ap = {"name": "South Access", "description": "", "latitude": 35.7,
              "longitude": -79.2, "what3words_address": "", "notes": ""}
        th = {"name": "Main Trailhead", "lat": 35.71, "lng": -79.21}
        trail = create_trail(
            admin_client, name="Pt Trail", published=True,
            trail={"access_points": [ap], "trailhead_location": th},
        )

        assert len(_rows(db_session, trail["id"], "access_point")) == 1
        assert len(_rows(db_session, trail["id"], "trailhead")) == 1
        # access_points uses latitude/longitude keys; trailhead uses lat/lng.
        assert _coords(db_session, trail["id"], "access_point") == [(35.7, -79.2)]
        assert _coords(db_session, trail["id"], "trailhead") == [(35.71, -79.21)]

        # trails JSONB columns NOT written.
        assert _raw_col(db_session, "trails", "poi_id",
                        trail["id"], "access_points") in (None, [])
        assert _raw_col(db_session, "trails", "poi_id",
                        trail["id"], "trailhead_location") is None

        # Admin GET reconstructs both nested trail fields.
        got = admin_client.get(f"/api/pois/{trail['id']}").json()
        assert got["trail"]["access_points"] == [ap]
        assert got["trail"]["trailhead_location"] == th

    def test_update_moves_and_deletes_pins(self, db_session, admin_client):
        park = create_park(
            admin_client, name="Move Park", published=True,
            parking_locations=[
                {"lat": 35.8, "lng": -79.0, "name": "Lot A"},
                {"lat": 35.9, "lng": -79.1, "name": "Lot B"},
            ],
        )
        assert len(_rows(db_session, park["id"], "parking")) == 2

        # PUT that MOVES Lot A and DELETES Lot B (delete + reinsert per kind).
        resp = admin_client.put(f"/api/pois/{park['id']}", json={
            "parking_locations": [{"lat": 36.0, "lng": -78.5, "name": "Lot A"}],
        })
        assert resp.status_code == 200, resp.text

        assert _coords(db_session, park["id"], "parking") == [(36.0, -78.5)]
        got = admin_client.get(f"/api/pois/{park['id']}").json()
        assert got["parking_locations"] == [
            {"lat": 36.0, "lng": -78.5, "name": "Lot A"},
        ]

        # A PUT NOT mentioning the field leaves the rows alone (partial-safe).
        resp = admin_client.put(f"/api/pois/{park['id']}", json={"pricing": "$5"})
        assert resp.status_code == 200, resp.text
        assert len(_rows(db_session, park["id"], "parking")) == 1

    def test_update_leaves_legacy_jsonb_untouched(self, db_session, admin_client):
        """Pre-cutover JSONB data survives an admin PUT (expand/contract: the
        columns are the retained recovery source until the contract release)."""
        legacy = [{"lat": 35.5, "lng": -79.5, "name": "Legacy Lot"}]
        park = orm_create_park(db_session, name="Legacy Park", published=True,
                               parking_locations=legacy)
        db_session.commit()

        resp = admin_client.put(f"/api/pois/{park.id}", json={
            "parking_locations": [{"lat": 36.1, "lng": -78.4, "name": "New Lot"}],
        })
        assert resp.status_code == 200, resp.text

        # poi_points has the NEW pin; the JSONB column still holds the OLD data.
        assert _coords(db_session, park.id, "parking") == [(36.1, -78.4)]
        assert _raw_col(db_session, "points_of_interest", "id",
                        park.id, "parking_locations") == legacy

    def test_coordinate_less_entry_not_persisted(self, db_session, admin_client):
        """geom is NOT NULL: an entry with no parseable coordinate pair has no
        point and is skipped by the write path (documented Task 2.3 semantic)."""
        park = create_park(
            admin_client, name="NoCoord Park", published=True,
            parking_locations=[
                {"lat": None, "lng": None, "name": "Not geolocated yet"},
                {"lat": 35.8, "lng": -79.0, "name": "Real Lot"},
            ],
        )
        rows = _rows(db_session, park["id"], "parking")
        assert len(rows) == 1
        assert rows[0].meta["name"] == "Real Lot"


class TestPublicRendersFromPoints:
    """The public detail endpoint renders point fields from poi_points."""

    def test_public_flat_parking_locations(self, db_session, app_client):
        park = orm_create_park(db_session, name="Public Pk Park", published=True)
        _point(db_session, park.id, "parking", 35.8, -79.0,
               meta={"name": "Main Lot"})
        db_session.commit()

        data = app_client.get(f"/api/pois/{park.id}").json()
        assert data["parking_locations"] == [
            {"lat": 35.8, "lng": -79.0, "name": "Main Lot"},
        ]

    def test_public_nested_trail_points(self, db_session, app_client):
        trail = orm_create_trail(db_session, name="Public Pt Trail", published=True)
        _point(db_session, trail.id, "access_point", 35.7, -79.2,
               meta={"name": "North"}, pos=0)
        _point(db_session, trail.id, "access_point", 35.72, -79.22,
               meta={"name": "South"}, pos=1)
        _point(db_session, trail.id, "trailhead", 35.71, -79.21,
               meta={"name": "Main Trailhead"})
        db_session.commit()

        data = app_client.get(f"/api/pois/{trail.id}").json()
        # Nested under the trail structural object (what TrailDetail.jsx reads),
        # in original array order, with the access-point coordinate key names.
        assert data["trail"]["access_points"] == [
            {"latitude": 35.7, "longitude": -79.2, "name": "North"},
            {"latitude": 35.72, "longitude": -79.22, "name": "South"},
        ]
        assert data["trail"]["trailhead_location"] == {
            "lat": 35.71, "lng": -79.21, "name": "Main Trailhead",
        }
        # NOT duplicated as flat keys (they are structural, trail-owned).
        assert "access_points" not in data
        assert "trailhead_location" not in data

    def test_venue_inheritance_reads_venue_points(self, db_session, app_client):
        """An event inheriting parking 'as_is' gets the VENUE's pins from
        poi_points (not the venue's stale JSONB column)."""
        venue = orm_create_park(db_session, name="Venue Park", published=True)
        _point(db_session, venue.id, "parking", 35.8, -79.0,
               meta={"name": "Venue Lot"})
        event = orm_create_event(
            db_session, name="Inheriting Event", published=True,
            event_fields={
                "venue_poi_id": venue.id,
                "venue_inheritance": {"parking": "as_is"},
            },
        )
        db_session.commit()

        data = app_client.get(f"/api/pois/{event.id}").json()
        assert data["parking_locations"] == [
            {"lat": 35.8, "lng": -79.0, "name": "Venue Lot"},
        ]


class TestDeleteCascades:
    """Deleting a POI removes its poi_points rows (FK ON DELETE CASCADE)."""

    def test_fk_cascade_on_raw_delete(self, db_session):
        poi = _bare_poi(db_session, "Cascade Points")
        _point(db_session, poi.id, "restroom", 35.8, -79.0)
        db_session.commit()
        assert db_session.query(POIPoint).count() == 1

        db_session.execute(
            text("DELETE FROM points_of_interest WHERE id = :id"),
            {"id": str(poi.id)},
        )
        db_session.commit()
        assert db_session.query(POIPoint).count() == 0

    def test_admin_delete_removes_points(self, db_session, admin_client):
        park = create_park(  # draft -> deletable
            admin_client, name="Del Park",
            parking_locations=[{"lat": 35.8, "lng": -79.0, "name": "Lot"}],
        )
        assert db_session.query(POIPoint).count() == 1

        resp = admin_client.delete(f"/api/pois/{park['id']}")
        assert resp.status_code == 200, resp.text
        assert db_session.query(POIPoint).count() == 0


class TestBackfillMigration:
    """The idempotent JSONB -> poi_points backfill (as the migration runs it)."""

    def test_backfill_all_six_sources(self, db_session):
        biz = orm_create_business(
            db_session, name="BF Biz", published=True,
            parking_locations=[{"lat": 35.8, "lng": -79.0, "name": "Lot"}],
            toilet_locations=[{"lat": 35.81, "lng": -79.01, "description": "WC"}],
            playground_locations=[{"lat": 35.82, "lng": -79.02, "types": ["Swings"]}],
            payphone_locations=[{"lat": 35.83, "lng": -79.03, "description": "Front"}],
        )
        trail = orm_create_trail(
            db_session, name="BF Trail", published=True,
            trail_fields={
                "access_points": [
                    {"name": "Trail Exit", "latitude": 35.7, "longitude": -79.2,
                     "photo_ids": []},
                ],
                "trailhead_location": {"lat": 35.71, "lng": -79.21, "name": "TH"},
            },
        )
        db_session.commit()
        assert db_session.query(POIPoint).count() == 0  # ORM wrote JSONB only

        results = backfill_point_rows(db_session)
        for field in ("parking_locations", "toilet_locations",
                      "playground_locations", "payphone_locations",
                      "access_points", "trailhead_location"):
            assert results[field] == {"written": 1, "skipped": 0}, field

        # Round-trip through the reader matches the original JSONB shape.
        assert read_point_field(db_session, biz.id, "parking_locations") == [
            {"lat": 35.8, "lng": -79.0, "name": "Lot"},
        ]
        assert read_point_field(db_session, trail.id, "access_points") == [
            {"latitude": 35.7, "longitude": -79.2, "name": "Trail Exit",
             "photo_ids": []},
        ]
        assert read_point_field(db_session, trail.id, "trailhead_location") == {
            "lat": 35.71, "lng": -79.21, "name": "TH",
        }
        # JSONB sources untouched by the backfill.
        assert _raw_col(db_session, "points_of_interest", "id",
                        biz.id, "parking_locations") == [
            {"lat": 35.8, "lng": -79.0, "name": "Lot"},
        ]

    def test_backfill_skips_and_counts_malformed(self, db_session):
        orm_create_park(
            db_session, name="BF Bad Park", published=True,
            parking_locations=[
                {"lat": 35.8, "lng": -79.0, "name": "Good"},
                {"lat": None, "lng": None, "name": "No coords"},   # coordinate-less
                {"name": "Missing keys"},                          # coordinate-less
                "front",                                           # malformed (str)
                {"lat": "garbage", "lng": -79.0},                  # unparseable
            ],
        )
        db_session.commit()

        results = backfill_point_rows(db_session)
        assert results["parking_locations"] == {"written": 1, "skipped": 4}

    def test_backfill_is_idempotent(self, db_session):
        park = orm_create_park(
            db_session, published=True,
            parking_locations=[{"lat": 35.8, "lng": -79.0}],
        )
        db_session.commit()

        r1 = backfill_point_rows(db_session)
        assert r1["parking_locations"]["written"] == 1
        first = db_session.query(POIPoint).count()

        r2 = backfill_point_rows(db_session)  # re-run must be a no-op
        assert r2["parking_locations"]["written"] == 0
        assert r2["parking_locations"]["skipped"] == 0
        assert db_session.query(POIPoint).count() == first

        # Rolling-deploy safety: a (poi_id, kind) already written by the NEW
        # write path is never clobbered or duplicated by a later backfill.
        assert _coords(db_session, park.id, "parking") == [(35.8, -79.0)]

    def test_backfill_tolerates_legacy_single_dict_playground(self, db_session):
        """Pre-g67_001 rows stored playground_location as a single object."""
        orm_create_park(
            db_session, name="BF Single Park", published=True,
            playground_locations={"lat": 35.82, "lng": -79.02, "types": ["Slide"]},
        )
        db_session.commit()

        results = backfill_point_rows(db_session)
        assert results["playground_locations"] == {"written": 1, "skipped": 0}


class TestNearestRestroomQuery:
    """The plan's Task 2.3 acceptance query: PostGIS can now answer
    "nearest restroom to a coordinate" directly against poi_points."""

    def test_nearest_restroom_raw_sql(self, db_session):
        near = orm_create_park(db_session, name="Near Park", published=True)
        far = orm_create_park(db_session, name="Far Park", published=True)
        # ~1.1 km and ~14 km from the query point (35.81, -79.01).
        _point(db_session, near.id, "restroom", 35.80, -79.00)
        _point(db_session, far.id, "restroom", 35.90, -79.10)
        # A non-restroom kind even closer — must NOT win a kind-filtered query.
        _point(db_session, far.id, "parking", 35.81, -79.01)
        db_session.commit()

        row = db_session.execute(text(
            "SELECT poi_id, "
            "       ST_Distance(geom::geography, "
            "                   ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography"
            "       ) AS meters "
            "FROM poi_points "
            "WHERE kind = 'restroom' "
            "  AND ST_DWithin(geom::geography, "
            "                 ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, "
            "                 :radius_m) "
            "ORDER BY meters LIMIT 1"
        ), {"lat": 35.81, "lng": -79.01, "radius_m": 50000}).fetchone()

        assert row is not None
        assert str(row[0]) == str(near.id)
        assert row[1] < 2000  # ~1.4 km

        # A tight ST_DWithin radius excludes the far restroom entirely.
        rows = db_session.execute(text(
            "SELECT poi_id FROM poi_points "
            "WHERE kind = 'restroom' "
            "  AND ST_DWithin(geom::geography, "
            "                 ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, "
            "                 2000)"
        ), {"lat": 35.81, "lng": -79.01}).fetchall()
        assert [str(r[0]) for r in rows] == [str(near.id)]

    def test_geom_gist_index_exists(self, db_session):
        """The spatial index is created (via the ORM in tests; via
        s_poi_points_001 in prod)."""
        idx = db_session.execute(text(
            "SELECT indexdef FROM pg_indexes "
            "WHERE tablename = 'poi_points' AND indexdef ILIKE '%USING gist%geom%'"
        )).fetchone()
        assert idx is not None
