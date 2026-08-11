"""Task 2.6: CHECK constraints for the enum-like VARCHAR columns.

``status`` / ``gift_cards`` / ``drone_usage`` / ``hunting_fishing_allowed`` /
``fishing_allowed`` (on ``points_of_interest``) and ``event_status`` (on
``events``) were unconstrained strings. Migration ``u_validation_checks_001``
normalizes the out-of-vocab prod values then adds NULL-tolerant CHECK constraints,
mirroring ``i_alcohol_001``. The constraints also live in the shared ORM
``__table_args__``, so the ``create_all`` test DB already carries them.

Coverage per column:
  * a valid value round-trips through the admin API,
  * an invalid value is rejected at the DB layer (raw SQL) and at the API layer
    (400, not 500),
and one migration up/down/up round-trip that seeds an out-of-vocab value and
proves it is normalized.
"""

import os
import uuid
import importlib.util

import pytest
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError

from conftest import create_business, create_park, create_event


# --------------------------------------------------------------------------
# Per-column vocab. (col, valid, invalid). All columns are NULL-tolerant.
# --------------------------------------------------------------------------
POI_COLUMNS = [
    ("status", "Warning", "totally-open"),
    ("gift_cards", "yes_select_others", "maybe"),
    ("drone_usage", "Yes, With Permit from Park", "allowed"),
    ("hunting_fishing_allowed", "seasonal", "always"),
    ("fishing_allowed", "catch_keep", "sometimes"),
]

_LOC = "ST_SetSRID(ST_MakePoint(-79,35),4326)"


# --------------------------------------------------------------------------
# DB layer: raw INSERT bypasses Pydantic and hits the CHECK directly.
# --------------------------------------------------------------------------
def _insert_poi(engine, col, value):
    sql = sa.text(
        "INSERT INTO points_of_interest "
        f"(id, poi_type, name, publication_status, location, {col}) "
        f"VALUES (:id, 'PARK', 'Check', 'draft', {_LOC}, :val)"
    )
    with engine.begin() as conn:
        conn.execute(sql, {"id": str(uuid.uuid4()), "val": value})


def _insert_event(engine, value):
    poi_id = str(uuid.uuid4())
    with engine.begin() as conn:
        conn.execute(sa.text(
            "INSERT INTO points_of_interest "
            f"(id, poi_type, name, publication_status, location) "
            f"VALUES (:id, 'EVENT', 'Check', 'draft', {_LOC})"
        ), {"id": poi_id})
        conn.execute(sa.text(
            "INSERT INTO events (poi_id, start_datetime, event_status) "
            "VALUES (:id, '2026-06-15T18:00:00Z', :val)"
        ), {"id": poi_id, "val": value})


@pytest.mark.parametrize("col,valid,invalid", POI_COLUMNS)
def test_poi_column_db_accepts_valid_and_null(db_session, col, valid, invalid):
    engine = db_session.get_bind()
    _insert_poi(engine, col, valid)        # valid value
    _insert_poi(engine, col, None)         # NULL is always allowed


@pytest.mark.parametrize("col,valid,invalid", POI_COLUMNS)
def test_poi_column_db_rejects_invalid(db_session, col, valid, invalid):
    engine = db_session.get_bind()
    with pytest.raises(IntegrityError):
        _insert_poi(engine, col, invalid)


def test_event_status_db_accepts_valid_rejects_invalid(db_session):
    engine = db_session.get_bind()
    _insert_event(engine, "Rescheduled")   # valid
    _insert_event(engine, None)            # NULL allowed
    with pytest.raises(IntegrityError):
        _insert_event(engine, "not-a-status")


# --------------------------------------------------------------------------
# API layer: valid round-trips, invalid returns 400 (not 500), never 5xx.
# --------------------------------------------------------------------------
def test_status_api_round_trip_and_reject(admin_client):
    poi = create_business(admin_client, status="Temporarily Closed")
    assert poi["status"] == "Temporarily Closed"

    resp = admin_client.post("/api/pois/", json={
        "name": "Bad Status", "poi_type": "BUSINESS",
        "location": {"type": "Point", "coordinates": [-79.0, 35.8]},
        "business": {"price_range": "$$"}, "status": "totally-open",
    })
    assert resp.status_code == 400, resp.text


def test_gift_cards_api_round_trip_and_reject(admin_client):
    poi = create_business(admin_client, gift_cards="yes_select_others")
    assert poi["gift_cards"] == "yes_select_others"

    resp = admin_client.post("/api/pois/", json={
        "name": "Bad Gift", "poi_type": "BUSINESS",
        "location": {"type": "Point", "coordinates": [-79.0, 35.8]},
        "business": {"price_range": "$$"}, "gift_cards": "maybe",
    })
    assert resp.status_code == 400, resp.text


def test_drone_usage_api_round_trip_and_reject(admin_client):
    poi = create_park(admin_client, drone_usage="Yes, With Permit from Park")
    assert poi["drone_usage"] == "Yes, With Permit from Park"

    resp = admin_client.post("/api/pois/", json={
        "name": "Bad Drone", "poi_type": "PARK",
        "location": {"type": "Point", "coordinates": [-79.1, 35.9]},
        "park": {}, "drone_usage": "allowed",
    })
    assert resp.status_code == 400, resp.text


def test_hunting_fishing_api_round_trip_and_reject(admin_client):
    poi = create_park(admin_client, hunting_fishing_allowed="year_round",
                      fishing_allowed="catch_release")
    assert poi["hunting_fishing_allowed"] == "year_round"
    assert poi["fishing_allowed"] == "catch_release"

    resp = admin_client.post("/api/pois/", json={
        "name": "Bad Hunt", "poi_type": "PARK",
        "location": {"type": "Point", "coordinates": [-79.1, 35.9]},
        "park": {}, "hunting_fishing_allowed": "always",
    })
    assert resp.status_code == 400, resp.text


def test_event_status_api_round_trip_and_reject(admin_client):
    poi = create_event(admin_client, event={
        "start_datetime": "2026-06-15T18:00:00Z", "event_status": "Canceled"})
    assert poi["event"]["event_status"] == "Canceled"

    resp = admin_client.post("/api/pois/", json={
        "name": "Bad Event", "poi_type": "EVENT",
        "location": {"type": "Point", "coordinates": [-79.3, 35.6]},
        "event": {"start_datetime": "2026-06-15T18:00:00Z",
                  "event_status": "not-a-status"},
    })
    assert resp.status_code == 400, resp.text


def test_status_api_update_rejects_invalid(admin_client):
    """The UPDATE path also surfaces a CHECK violation as 400, not 500."""
    poi = create_business(admin_client)
    resp = admin_client.put(f"/api/pois/{poi['id']}", json={"status": "nope"})
    assert resp.status_code == 400, resp.text


# --------------------------------------------------------------------------
# Empty-string coercion: the admin form submits '' for an untouched Radio field
# (e.g. drone_usage initialValue ''). These CHECK columns are Optional[str] (not
# Optional[Literal]), so the original coercer did not touch them and '' would trip
# the CHECK. The extended coercer NULLs ''/whitespace on create, update, autosave.
# --------------------------------------------------------------------------
# (col, poi_type, created_value). Blank '' is coerced to None BEFORE the CHECK; a
# column with an ORM default ('status'->'Fully Open') then takes that default on
# INSERT (still in-vocab), the rest persist NULL. Either way the CHECK is not
# tripped — the point of the fix.
BLANK_POI_COLUMNS = [
    ("status", "BUSINESS", "Fully Open"),
    ("gift_cards", "BUSINESS", None),
    ("drone_usage", "PARK", None),
    ("hunting_fishing_allowed", "PARK", None),
    ("fishing_allowed", "PARK", None),
]


def _create_by_type(client, poi_type, **overrides):
    return (create_business if poi_type == "BUSINESS" else create_park)(client, **overrides)


@pytest.mark.parametrize("col,poi_type,created", BLANK_POI_COLUMNS)
def test_blank_check_column_create_is_accepted(admin_client, col, poi_type, created):
    # create_business/create_park assert 201 -> a blank untouched Radio no longer 400s.
    poi = _create_by_type(admin_client, poi_type, **{col: ""})
    assert poi[col] == created
    got = admin_client.get(f"/api/pois/{poi['id']}").json()
    assert got[col] == created


@pytest.mark.parametrize("col,poi_type,created", BLANK_POI_COLUMNS)
def test_blank_check_column_update_persists_null(admin_client, col, poi_type, created):
    # On UPDATE the ORM default never fires, so '' -> None -> NULL for every column.
    poi = _create_by_type(admin_client, poi_type)
    resp = admin_client.put(f"/api/pois/{poi['id']}", json={col: ""})
    assert resp.status_code == 200, resp.text
    assert resp.json()[col] is None


@pytest.mark.parametrize("col,poi_type,created", BLANK_POI_COLUMNS)
def test_blank_check_column_autosave_persists_null(admin_client, col, poi_type, created):
    poi = _create_by_type(admin_client, poi_type)
    resp = admin_client.patch(f"/api/pois/{poi['id']}/autosave", json={col: ""})
    assert resp.status_code == 200, resp.text
    got = admin_client.get(f"/api/pois/{poi['id']}").json()
    assert got[col] is None


def test_whitespace_only_check_column_coerced(admin_client):
    # Whitespace-only, not just '', is coerced (drone_usage has no ORM default).
    poi = create_park(admin_client, drone_usage="   ")
    assert poi["drone_usage"] is None


def test_event_status_blank_create_update_autosave(admin_client):
    # create: '' -> None -> the events.event_status ORM default 'Scheduled' on INSERT.
    poi = create_event(admin_client, event={
        "start_datetime": "2026-06-15T18:00:00Z", "event_status": ""})
    assert poi["event"]["event_status"] == "Scheduled"
    # update: '' -> NULL (ORM default does not fire on UPDATE).
    resp = admin_client.put(f"/api/pois/{poi['id']}",
                            json={"event": {"start_datetime": "2026-06-15T18:00:00Z",
                                            "event_status": ""}})
    assert resp.status_code == 200, resp.text
    assert resp.json()["event"]["event_status"] is None
    # autosave: a flat '' event_status -> NULL (coerced on the raw dict path even
    # though PointOfInterestUpdate does not declare event_status).
    resp = admin_client.patch(f"/api/pois/{poi['id']}/autosave", json={"event_status": ""})
    assert resp.status_code == 200, resp.text
    got = admin_client.get(f"/api/pois/{poi['id']}").json()
    assert got["event"]["event_status"] is None


def test_form_shaped_payload_all_blank_check_columns_creates_cleanly(admin_client):
    """A park created with every CHECK column blank (mirroring untouched-Radio form
    defaults, e.g. drone_usage='') is accepted post-migration, not 400."""
    poi = create_park(admin_client, status="", gift_cards="", drone_usage="",
                      hunting_fishing_allowed="", fishing_allowed="")
    assert poi["status"] == "Fully Open"  # ORM default on the coerced None
    for col in ("gift_cards", "drone_usage", "hunting_fishing_allowed", "fishing_allowed"):
        assert poi[col] is None, col


# --------------------------------------------------------------------------
# Migration round-trip: seed out-of-vocab data, upgrade normalizes + constrains.
# --------------------------------------------------------------------------
_CONSTRAINTS = {
    "ck_points_of_interest_status_valid": "points_of_interest",
    "ck_points_of_interest_gift_cards_valid": "points_of_interest",
    "ck_points_of_interest_drone_usage_valid": "points_of_interest",
    "ck_points_of_interest_hunting_fishing_allowed_valid": "points_of_interest",
    "ck_points_of_interest_fishing_allowed_valid": "points_of_interest",
    "ck_events_event_status_valid": "events",
}


def _load_migration():
    here = os.path.dirname(__file__)
    mig_path = os.path.abspath(os.path.join(
        here, "..", "nearby-admin", "backend", "alembic", "versions",
        "u_validation_checks_001_add_validation_checks.py",
    ))
    spec = importlib.util.spec_from_file_location("u_validation_checks_001", mig_path)
    mig = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mig)
    return mig


def _constraint_exists(conn, name):
    return conn.execute(sa.text(
        "SELECT 1 FROM pg_constraint WHERE conname = :n"
    ), {"n": name}).scalar() is not None


def test_migration_normalizes_and_round_trips(db_session):
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    engine = db_session.get_bind()
    mig = _load_migration()
    assert mig.revision == "u_validation_checks_001"
    assert mig.down_revision == "t_one_representation_001"

    # Simulate the pre-migration schema: drop the constraints create_all added.
    with engine.begin() as conn:
        for name, table in _CONSTRAINTS.items():
            conn.execute(sa.text(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {name}"))

    # Seed out-of-vocab rows (only insertable with the constraints gone):
    #   status='active' (legacy default -> maps to 'Fully Open'),
    #   gift_cards='' and drone_usage='' (empty strings -> NULL),
    #   event_status='bogus' (-> NULL).
    poi_id = str(uuid.uuid4())
    ev_id = str(uuid.uuid4())
    with engine.begin() as conn:
        conn.execute(sa.text(
            "INSERT INTO points_of_interest "
            f"(id, poi_type, name, publication_status, location, status, gift_cards, drone_usage) "
            f"VALUES (:id, 'PARK', 'Legacy', 'draft', {_LOC}, 'active', '', '')"
        ), {"id": poi_id})
        conn.execute(sa.text(
            "INSERT INTO points_of_interest "
            f"(id, poi_type, name, publication_status, location) "
            f"VALUES (:id, 'EVENT', 'Legacy Event', 'draft', {_LOC})"
        ), {"id": ev_id})
        conn.execute(sa.text(
            "INSERT INTO events (poi_id, start_datetime, event_status) "
            "VALUES (:id, '2026-06-15T18:00:00Z', 'bogus')"
        ), {"id": ev_id})

    # upgrade(): normalizes the seeded values AND (re)adds every constraint.
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            mig.upgrade()
        row = conn.execute(sa.text(
            "SELECT status, gift_cards, drone_usage FROM points_of_interest WHERE id = :id"
        ), {"id": poi_id}).one()
        assert row.status == "Fully Open"       # 'active' -> canonical
        assert row.gift_cards is None           # '' -> NULL
        assert row.drone_usage is None          # '' -> NULL
        es = conn.execute(sa.text(
            "SELECT event_status FROM events WHERE poi_id = :id"
        ), {"id": ev_id}).scalar()
        assert es is None                       # 'bogus' -> NULL
        for name in _CONSTRAINTS:
            assert _constraint_exists(conn, name), f"{name} not created"

    # The constraint now bites: a bad status insert fails.
    with pytest.raises(IntegrityError):
        _insert_poi(engine, "status", "still-bad")

    # downgrade(): all constraints dropped.
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            mig.downgrade()
        for name in _CONSTRAINTS:
            assert not _constraint_exists(conn, name), f"{name} not dropped"

    # upgrade() again is idempotent (data already normalized, constraints re-added).
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            mig.upgrade()
        for name in _CONSTRAINTS:
            assert _constraint_exists(conn, name)
