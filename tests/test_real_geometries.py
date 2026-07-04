"""Task 2.4: real geometries for GIS (geom_line / geom_area + derived length).

Covers:
  * migration v_real_geometries_001 up/down/up (columns + GIST indexes);
  * GeoJSON write round-trip via the admin API (create + update, line + polygon,
    invalid -> 400);
  * poi_revisions snapshot includes the new fields JSON-safely;
  * derived trail length (ST_Length over geography) correct + length_text fallback
    when no line exists;
  * two SQL acceptance proofs (known-length line; ST_Contains park/ trail point);
  * public endpoints emit NO raw geometry for these admin-audience columns.

Admin-API tests use ``admin_client`` only; public-read tests build data via the
ORM helpers (avoiding the admin/app sys.modules swap) and read via ``app_client``,
matching the split used across the suite.
"""

import importlib.util
import os
import uuid

import pytest
import sqlalchemy as sa

from conftest import (
    create_business,
    create_park,
    create_trail,
    orm_create_park,
    orm_create_trail,
    orm_publish_poi,
)
from app.models import POIRevision


# A LineString / Polygon used across the write tests. Coordinates chosen so their
# double-precision round-trip is clean; the polygon contains (-79.05, 35.05).
LINE_GEOJSON = {
    "type": "LineString",
    "coordinates": [[-79.0, 35.0], [-79.05, 35.0], [-79.05, 35.05]],
}
POLY_GEOJSON = {
    "type": "Polygon",
    "coordinates": [[[-79.1, 35.0], [-79.0, 35.0], [-79.0, 35.1], [-79.1, 35.1], [-79.1, 35.0]]],
}


# --------------------------------------------------------------------------- #
# 1. Migration round-trip
# --------------------------------------------------------------------------- #
def _load_migration():
    path = os.path.abspath(os.path.join(
        os.path.dirname(__file__), "..", "nearby-admin", "backend", "alembic",
        "versions", "v_real_geometries_001_geom_line_geom_area.py",
    ))
    spec = importlib.util.spec_from_file_location("v_real_geometries_001", path)
    mig = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mig)
    return mig


def _column_exists(conn, col):
    return conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name = 'points_of_interest' AND column_name = :c"
    ), {"c": col}).scalar() is not None


def _index_exists(conn, name):
    return conn.execute(sa.text(
        "SELECT 1 FROM pg_indexes "
        "WHERE tablename = 'points_of_interest' AND indexname = :n"
    ), {"n": name}).scalar() is not None


_COLS = ["geom_line", "geom_area"]
_IDX = ["idx_points_of_interest_geom_line", "idx_points_of_interest_geom_area"]


def test_migration_up_down_up(db_session):
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    engine = db_session.get_bind()
    mig = _load_migration()
    assert mig.revision == "v_real_geometries_001"
    assert mig.down_revision == "u_validation_checks_001"

    # create_all already built the columns + geoalchemy2 auto GIST indexes.
    with engine.begin() as conn:
        for c in _COLS:
            assert _column_exists(conn, c)

    # upgrade() is idempotent (IF NOT EXISTS) — everything still present.
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            mig.upgrade()
        for c in _COLS:
            assert _column_exists(conn, c)
        for i in _IDX:
            assert _index_exists(conn, i), f"{i} missing after upgrade"

    # downgrade() drops both columns + indexes.
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            mig.downgrade()
        for c in _COLS:
            assert not _column_exists(conn, c), f"{c} not dropped"
        for i in _IDX:
            assert not _index_exists(conn, i), f"{i} not dropped"

    # upgrade() re-creates them (leaves the schema migrated for teardown).
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            mig.upgrade()
        for c in _COLS:
            assert _column_exists(conn, c)
        for i in _IDX:
            assert _index_exists(conn, i)


# --------------------------------------------------------------------------- #
# 2. GeoJSON write round-trip via the admin API
# --------------------------------------------------------------------------- #
class TestWriteRoundTrip:
    def test_create_trail_with_line(self, admin_client):
        data = create_trail(admin_client, name="Line Trail", geom_line=LINE_GEOJSON)
        gl = data["geom_line"]
        assert gl["type"] == "LineString"
        assert len(gl["coordinates"]) == 3
        assert gl["coordinates"][0] == pytest.approx([-79.0, 35.0])
        assert gl["coordinates"][2] == pytest.approx([-79.05, 35.05])
        # area stays null for a trail that only set a line.
        assert data["geom_area"] is None

    def test_create_park_with_area(self, admin_client):
        data = create_park(admin_client, name="Area Park", geom_area=POLY_GEOJSON)
        ga = data["geom_area"]
        assert ga["type"] == "Polygon"
        assert len(ga["coordinates"][0]) == 5
        assert ga["coordinates"][0][0] == pytest.approx([-79.1, 35.0])
        assert data["geom_line"] is None

    def test_create_without_geometry_is_null(self, admin_client):
        data = create_business(admin_client, name="No Geom Biz")
        assert data["geom_line"] is None
        assert data["geom_area"] is None

    def test_update_sets_line(self, admin_client):
        biz = create_business(admin_client, name="Update Line")
        assert biz["geom_line"] is None
        resp = admin_client.put(f"/api/pois/{biz['id']}", json={"geom_line": LINE_GEOJSON})
        assert resp.status_code == 200, resp.text
        assert resp.json()["geom_line"]["type"] == "LineString"

    def test_update_sets_area(self, admin_client):
        park = create_park(admin_client, name="Update Area")
        resp = admin_client.put(f"/api/pois/{park['id']}", json={"geom_area": POLY_GEOJSON})
        assert resp.status_code == 200, resp.text
        assert resp.json()["geom_area"]["type"] == "Polygon"

    def test_update_clears_line_with_null(self, admin_client):
        trail = create_trail(admin_client, name="Clear Line", geom_line=LINE_GEOJSON)
        assert trail["geom_line"] is not None
        resp = admin_client.put(f"/api/pois/{trail['id']}", json={"geom_line": None})
        assert resp.status_code == 200, resp.text
        assert resp.json()["geom_line"] is None

    def test_update_partial_leaves_geometry_untouched(self, admin_client):
        trail = create_trail(admin_client, name="Keep Line", geom_line=LINE_GEOJSON)
        # An update that does not mention geom_line must not clear it.
        resp = admin_client.put(f"/api/pois/{trail['id']}", json={"name": "Keep Line 2"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["geom_line"]["type"] == "LineString"


class TestWriteInvalidGeometry:
    def test_create_wrong_type_400(self, admin_client):
        # A Polygon posted to geom_line must be rejected as 400 (not 422/500).
        payload = {
            "name": "Bad Type",
            "poi_type": "TRAIL",
            "location": {"type": "Point", "coordinates": [-79.2, 35.7]},
            "trail": {},
            "geom_line": POLY_GEOJSON,
        }
        resp = admin_client.post("/api/pois/", json=payload)
        assert resp.status_code == 400, resp.text
        assert "geom_line" in resp.json()["detail"]

    def test_create_out_of_range_400(self, admin_client):
        payload = {
            "name": "Bad Coords",
            "poi_type": "TRAIL",
            "location": {"type": "Point", "coordinates": [-79.2, 35.7]},
            "trail": {},
            "geom_line": {"type": "LineString", "coordinates": [[-200.0, 35.0], [-79.0, 35.0]]},
        }
        resp = admin_client.post("/api/pois/", json=payload)
        assert resp.status_code == 400, resp.text

    def test_create_degenerate_line_400(self, admin_client):
        payload = {
            "name": "One Point",
            "poi_type": "TRAIL",
            "location": {"type": "Point", "coordinates": [-79.2, 35.7]},
            "trail": {},
            "geom_line": {"type": "LineString", "coordinates": [[-79.0, 35.0]]},
        }
        resp = admin_client.post("/api/pois/", json=payload)
        assert resp.status_code == 400, resp.text

    def test_update_invalid_area_400(self, admin_client):
        park = create_park(admin_client, name="Bad Update Area")
        resp = admin_client.put(
            f"/api/pois/{park['id']}",
            json={"geom_area": {"type": "LineString", "coordinates": [[-79, 35], [-79.1, 35]]}},
        )
        assert resp.status_code == 400, resp.text


# --------------------------------------------------------------------------- #
# 3. Revision snapshot includes the new fields JSON-safely
# --------------------------------------------------------------------------- #
class TestRevisionSnapshot:
    def _latest_snapshot(self, db, poi_id):
        rev = (
            db.query(POIRevision)
            .filter(POIRevision.poi_id == uuid.UUID(str(poi_id)))
            .order_by(POIRevision.created_at.desc())
            .first()
        )
        return rev.snapshot

    def test_create_snapshot_has_line(self, admin_client, db_session):
        trail = create_trail(admin_client, name="Snap Line", geom_line=LINE_GEOJSON)
        snap = self._latest_snapshot(db_session, trail["id"])
        # JSON-safe GeoJSON dict, not a WKB blob.
        assert snap["geom_line"]["type"] == "LineString"
        assert snap["geom_line"]["coordinates"][0] == pytest.approx([-79.0, 35.0])
        assert snap["geom_area"] is None

    def test_update_snapshot_has_area(self, admin_client, db_session):
        park = create_park(admin_client, name="Snap Area")
        admin_client.put(f"/api/pois/{park['id']}", json={"geom_area": POLY_GEOJSON})
        snap = self._latest_snapshot(db_session, park["id"])
        assert snap["geom_area"]["type"] == "Polygon"


# --------------------------------------------------------------------------- #
# 4. Derived trail length + length_text fallback (public read)
# --------------------------------------------------------------------------- #
class TestDerivedLength:
    def test_length_miles_from_line(self, db_session, app_client):
        # A ~34.47-mile half-degree-latitude line.
        poi = orm_create_trail(
            db_session,
            name="Derived Trail",
            published=True,
            geom_line="LINESTRING(-79 35, -79 35.5)",
            trail_fields={"length_text": "about 34 miles"},
        )
        db_session.commit()

        resp = app_client.get(f"/api/pois/{poi.id}")
        assert resp.status_code == 200, resp.text
        trail = resp.json()["trail"]
        assert trail["length_miles"] == pytest.approx(34.47, abs=0.05)
        # length_text is still present (and stays the display fallback).
        assert trail["length_text"] == "about 34 miles"

    def test_length_text_fallback_when_no_line(self, db_session, app_client):
        poi = orm_create_trail(
            db_session,
            name="No Line Trail",
            published=True,
            trail_fields={"length_text": "2.5 miles"},
        )
        db_session.commit()

        resp = app_client.get(f"/api/pois/{poi.id}")
        assert resp.status_code == 200, resp.text
        trail = resp.json()["trail"]
        assert trail["length_miles"] is None
        assert trail["length_text"] == "2.5 miles"


# --------------------------------------------------------------------------- #
# 5. Public endpoints emit NO raw geometry for the admin-audience columns
# --------------------------------------------------------------------------- #
class TestPublicNoRawGeometry:
    def test_trail_detail_hides_geom_columns(self, db_session, app_client):
        poi = orm_create_trail(
            db_session,
            name="Hidden Geom Trail",
            published=True,
            geom_line="LINESTRING(-79 35, -79 35.5)",
        )
        db_session.commit()

        resp = app_client.get(f"/api/pois/{poi.id}")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "geom_line" not in data
        assert "geom_area" not in data
        assert "geom_line" not in (data.get("trail") or {})

    def test_park_detail_hides_geom_columns(self, db_session, app_client):
        poi = orm_create_park(
            db_session,
            name="Hidden Geom Park",
            published=True,
            geom_area="POLYGON((-79.1 35,-79 35,-79 35.1,-79.1 35.1,-79.1 35))",
        )
        db_session.commit()

        resp = app_client.get(f"/api/pois/{poi.id}")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "geom_area" not in data
        assert "geom_area" not in (data.get("park") or {})


# --------------------------------------------------------------------------- #
# 6. SQL-level acceptance proofs
# --------------------------------------------------------------------------- #
class TestAcceptanceSQL:
    def test_known_length_line(self, db_session):
        """A half-degree-latitude line is ~34.47 miles via ST_Length(geography)."""
        meters = db_session.execute(sa.text(
            "SELECT ST_Length("
            "ST_GeomFromText('LINESTRING(-79 35, -79 35.5)', 4326)::geography)"
        )).scalar()
        miles = meters / 1609.344
        assert miles == pytest.approx(34.47, abs=0.02)

    def test_st_contains_park_polygon_over_trail_point(self, db_session):
        """ST_Contains(park.geom_area, trail.location) is True inside, False out."""
        park = orm_create_park(
            db_session,
            name="Containment Park",
            geom_area="POLYGON((-79.1 35,-79 35,-79 35.1,-79.1 35.1,-79.1 35))",
        )
        inside = orm_create_trail(
            db_session, name="Inside Trail", location="POINT(-79.05 35.05)"
        )
        outside = orm_create_trail(
            db_session, name="Outside Trail", location="POINT(-80 36)"
        )
        db_session.flush()

        def contains(trail_poi):
            return db_session.execute(sa.text(
                "SELECT ST_Contains(p.geom_area, t.location) "
                "FROM points_of_interest p, points_of_interest t "
                "WHERE p.id = :pid AND t.id = :tid"
            ), {"pid": str(park.id), "tid": str(trail_poi.id)}).scalar()

        assert contains(inside) is True
        assert contains(outside) is False
