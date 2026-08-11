"""Reusable parking lots: shareable lot records + per-POI links (#90 / #161).

Covers the EXPAND step (this release), where parking has TWO representations
that are unified only at read time:

  * admin CRUD on ``parking_lots`` (owned and standalone), including the CHECK
    vocabularies, the delete-with-links 409 guard and the picker search;
  * the permission split - an owned lot is ordinary POI content (admin-or-editor)
    but a standalone lot is shared infrastructure (admin only);
  * linking from the POI payload: ``parking_lot_links`` round-trips in
    sort_order, reorders, unlinks, is partial-update safe (a PUT that omits it
    leaves the links alone), skips unknown lot ids rather than 500ing, and
    cascades on both sides so a ghost ref is impossible;
  * the unified read - own pins first (in their ``_pos`` order) then linked lots
    (in ``sort_order``), each tagged with ``origin`` / ``is_standalone`` /
    ``owner`` / ``label``, with the publication rules applied for the public
    audience (a draft lot, and a lot owned by a draft POI, never leak);
  * lot photos: the caption note round-trips inside the entry's ``images``, a
    STANDALONE lot's photo is invisible to every POI image path, and an OWNED
    lot's photo still shows up in its owner's parking collection;
  * the own-parking REGRESSION GATE: adding lots and links must not perturb
    ``parking_locations`` / poi_points by one byte.
"""

import uuid

import pytest
from sqlalchemy import text

from conftest import (
    admin_app, create_business, create_park, orm_create_business, orm_publish_poi,
)
from shared.models.image import Image
from shared.models.parking_lot import ParkingLot, POIParkingLink
from shared.parking_lots import read_parking_lots, sync_parking_links


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _lot_payload(name="Main St Deck", **overrides):
    payload = {
        "name": name,
        "parking_types": ["Lot", "Free"],
        "accessible_parking_details": ["Van accessible"],
        "notes": "Enter from the alley",
        "latitude": 35.81,
        "longitude": -79.01,
        "what3words": "index.home.raft",
        "address_hint": "Behind the hardware store",
        "expect_to_pay": "no",
        "publication_status": "published",
    }
    payload.update(overrides)
    return payload


def _create_lot(client, name="Main St Deck", **overrides):
    resp = client.post("/api/parking-lots/", json=_lot_payload(name, **overrides))
    assert resp.status_code == 201, f"Failed to create lot: {resp.text}"
    return resp.json()


def _as_role(role):
    """Override the admin app's role dependency for one test."""
    from app.core.permissions import get_current_user_with_role

    class _User:
        def __init__(self):
            self.email = "test@example.com"
            self.role = role
            self.id = "test-user-id"

    admin_app.dependency_overrides[get_current_user_with_role] = lambda: _User()


def _parking_pin(name, lat, lng, **extra):
    pin = {"name": name, "lat": lat, "lng": lng, "parking_types": ["Lot"]}
    pin.update(extra)
    return pin


def _add_lot_image(db, lot_id, poi_id=None, caption="Look for the blue awning"):
    img = Image(
        id=uuid.uuid4(),
        poi_id=poi_id,
        parking_lot_id=lot_id,
        image_type="parking",
        image_context=f"parking_lot_{lot_id}",
        filename="lot.png",
        storage_provider="s3",
        storage_url="http://example.test/lot.png",
        caption=caption,
    )
    db.add(img)
    db.commit()
    return img


# --------------------------------------------------------------------------- #
# 1-5. Admin CRUD
# --------------------------------------------------------------------------- #
class TestParkingLotCrud:
    def test_create_standalone_lot_round_trips(self, admin_client):
        lot = _create_lot(admin_client)
        assert lot["is_standalone"] is True
        assert lot["owner_poi_id"] is None
        assert lot["owner"] is None
        assert lot["name"] == "Main St Deck"
        assert lot["parking_types"] == ["Lot", "Free"]
        assert lot["accessible_parking_details"] == ["Van accessible"]
        assert lot["notes"] == "Enter from the alley"
        assert lot["latitude"] == pytest.approx(35.81)
        assert lot["longitude"] == pytest.approx(-79.01)
        assert lot["what3words"] == "index.home.raft"
        assert lot["address_hint"] == "Behind the hardware store"
        assert lot["expect_to_pay"] == "no"
        assert lot["linked_poi_count"] == 0

        fetched = admin_client.get(f"/api/parking-lots/{lot['id']}")
        assert fetched.status_code == 200
        assert fetched.json() == lot

    def test_create_owned_lot_carries_owner_summary(self, admin_client):
        poi = create_business(admin_client, name="Corner Diner")
        lot = _create_lot(admin_client, name="Diner Lot", owner_poi_id=poi["id"])
        assert lot["is_standalone"] is False
        assert lot["owner_poi_id"] == poi["id"]
        assert lot["owner"]["name"] == "Corner Diner"
        assert lot["owner"]["poi_type"] == "BUSINESS"

    def test_create_owned_lot_rejects_unknown_owner(self, admin_client):
        resp = admin_client.post(
            "/api/parking-lots/",
            json=_lot_payload("Orphan", owner_poi_id=str(uuid.uuid4())),
        )
        assert resp.status_code == 400

    def test_update_changes_fields_and_moves_updated_at(self, admin_client):
        lot = _create_lot(admin_client)
        resp = admin_client.put(
            f"/api/parking-lots/{lot['id']}",
            json={"name": "Renamed Deck", "expect_to_pay": "sometimes",
                  "latitude": 36.0, "longitude": -80.0},
        )
        assert resp.status_code == 200
        updated = resp.json()
        assert updated["name"] == "Renamed Deck"
        assert updated["expect_to_pay"] == "sometimes"
        assert updated["latitude"] == pytest.approx(36.0)
        assert updated["updated_at"] >= lot["updated_at"]

    def test_check_constraint_violations_are_400_not_500(self, admin_client):
        bad_pay = admin_client.post(
            "/api/parking-lots/", json=_lot_payload("Bad Pay", expect_to_pay="maybe")
        )
        assert bad_pay.status_code == 400

        bad_status = admin_client.post(
            "/api/parking-lots/", json=_lot_payload("Bad Status", publication_status="live")
        )
        assert bad_status.status_code == 400

    def test_delete_with_links_is_409_then_force_succeeds(self, admin_client):
        lot = _create_lot(admin_client)
        poi = create_business(admin_client, name="Linker")
        admin_client.put(
            f"/api/pois/{poi['id']}", json={"parking_lot_links": [lot["id"]]}
        )

        blocked = admin_client.delete(f"/api/parking-lots/{lot['id']}")
        assert blocked.status_code == 409
        assert blocked.json()["detail"]["linked_poi_count"] == 1

        forced = admin_client.delete(f"/api/parking-lots/{lot['id']}?force=true")
        assert forced.status_code == 204
        assert admin_client.get(f"/api/parking-lots/{lot['id']}").status_code == 404

    def test_unlinked_lot_deletes_without_force(self, admin_client):
        lot = _create_lot(admin_client)
        assert admin_client.delete(f"/api/parking-lots/{lot['id']}").status_code == 204

    def test_search_by_q_standalone_only_and_proximity(self, admin_client):
        poi = create_business(admin_client, name="Owner POI")
        near = _create_lot(admin_client, name="Riverside Deck", latitude=35.80, longitude=-79.00)
        _create_lot(admin_client, name="Faraway Garage", latitude=40.00, longitude=-75.00)
        owned = _create_lot(admin_client, name="Riverside Annex", owner_poi_id=poi["id"],
                            latitude=35.80, longitude=-79.00)

        by_q = admin_client.get("/api/parking-lots/?q=riverside").json()
        assert {r["name"] for r in by_q} == {"Riverside Deck", "Riverside Annex"}

        standalone = admin_client.get("/api/parking-lots/?standalone_only=true").json()
        assert owned["id"] not in {r["id"] for r in standalone}
        assert near["id"] in {r["id"] for r in standalone}

        by_owner = admin_client.get(f"/api/parking-lots/?owner_poi_id={poi['id']}").json()
        assert [r["id"] for r in by_owner] == [owned["id"]]

        nearby = admin_client.get(
            "/api/parking-lots/?near_lat=35.80&near_lng=-79.00&radius_m=5000"
        ).json()
        names = {r["name"] for r in nearby}
        assert "Riverside Deck" in names
        assert "Faraway Garage" not in names

    def test_linked_pois_endpoint_lists_who_would_be_affected(self, admin_client):
        lot = _create_lot(admin_client)
        poi = create_business(admin_client, name="Theater")
        admin_client.put(f"/api/pois/{poi['id']}", json={
            "parking_lot_links": [{"parking_lot_id": lot["id"], "label": "free after 5pm"}]
        })

        resp = admin_client.get(f"/api/parking-lots/{lot['id']}/linked-pois")
        assert resp.status_code == 200
        rows = resp.json()
        assert len(rows) == 1
        assert rows[0]["name"] == "Theater"
        assert rows[0]["label"] == "free after 5pm"


# --------------------------------------------------------------------------- #
# 6. Permissions
# --------------------------------------------------------------------------- #
class TestParkingLotPermissions:
    def test_editor_may_write_owned_but_not_standalone(self, admin_client):
        poi = create_business(admin_client, name="Editor POI")
        owned = _create_lot(admin_client, name="Owned", owner_poi_id=poi["id"])
        standalone = _create_lot(admin_client, name="Shared")

        _as_role("editor")
        assert admin_client.put(
            f"/api/parking-lots/{owned['id']}", json={"name": "Owned Renamed"}
        ).status_code == 200
        assert admin_client.put(
            f"/api/parking-lots/{standalone['id']}", json={"name": "Nope"}
        ).status_code == 403
        assert admin_client.delete(f"/api/parking-lots/{standalone['id']}").status_code == 403
        # Creating a standalone lot is admin-only too.
        assert admin_client.post(
            "/api/parking-lots/", json=_lot_payload("Editor Standalone")
        ).status_code == 403
        # But an editor can still FIND lots, otherwise it could never link one.
        assert admin_client.get("/api/parking-lots/").status_code == 200

    def test_editor_may_not_turn_an_owned_lot_into_a_shared_one(self, admin_client):
        poi = create_business(admin_client, name="Editor POI 2")
        owned = _create_lot(admin_client, name="Owned 2", owner_poi_id=poi["id"])

        _as_role("editor")
        resp = admin_client.put(
            f"/api/parking-lots/{owned['id']}", json={"owner_poi_id": None}
        )
        assert resp.status_code == 403

    def test_viewer_is_403_everywhere(self, admin_client):
        lot = _create_lot(admin_client)

        _as_role("viewer")
        assert admin_client.get("/api/parking-lots/").status_code == 403
        assert admin_client.get(f"/api/parking-lots/{lot['id']}").status_code == 403
        assert admin_client.post("/api/parking-lots/", json=_lot_payload("V")).status_code == 403
        assert admin_client.put(
            f"/api/parking-lots/{lot['id']}", json={"name": "V"}
        ).status_code == 403
        assert admin_client.delete(f"/api/parking-lots/{lot['id']}").status_code == 403


# --------------------------------------------------------------------------- #
# 7. Linking from the POI payload
# --------------------------------------------------------------------------- #
class TestParkingLotLinking:
    def test_links_round_trip_in_sort_order(self, admin_client):
        a = _create_lot(admin_client, name="Lot A")
        b = _create_lot(admin_client, name="Lot B")
        poi = create_business(admin_client, name="Linker", parking_lot_links=[
            {"parking_lot_id": b["id"], "sort_order": 0, "label": "closest"},
            {"parking_lot_id": a["id"], "sort_order": 1},
        ])

        links = poi["parking_lot_links"]
        assert [link["parking_lot_id"] for link in links] == [b["id"], a["id"]]
        assert links[0]["label"] == "closest"
        assert links[1]["label"] is None

    def test_bare_uuid_list_is_accepted_and_ordered_by_index(self, admin_client):
        a = _create_lot(admin_client, name="Lot A")
        b = _create_lot(admin_client, name="Lot B")
        poi = create_business(admin_client, name="Bare", parking_lot_links=[a["id"], b["id"]])
        assert [link["sort_order"] for link in poi["parking_lot_links"]] == [0, 1]
        assert [link["parking_lot_id"] for link in poi["parking_lot_links"]] == [a["id"], b["id"]]

    def test_reorder_and_unlink_persist(self, admin_client):
        a = _create_lot(admin_client, name="Lot A")
        b = _create_lot(admin_client, name="Lot B")
        poi = create_business(admin_client, name="Reorder", parking_lot_links=[a["id"], b["id"]])

        reordered = admin_client.put(
            f"/api/pois/{poi['id']}", json={"parking_lot_links": [b["id"], a["id"]]}
        ).json()
        assert [link["parking_lot_id"] for link in reordered["parking_lot_links"]] == [
            b["id"], a["id"]
        ]

        cleared = admin_client.put(
            f"/api/pois/{poi['id']}", json={"parking_lot_links": []}
        ).json()
        assert cleared["parking_lot_links"] == []

    def test_put_omitting_the_field_leaves_links_untouched(self, admin_client):
        lot = _create_lot(admin_client)
        poi = create_business(admin_client, name="Partial", parking_lot_links=[lot["id"]])

        after = admin_client.put(f"/api/pois/{poi['id']}", json={"name": "Partial Renamed"}).json()
        assert [link["parking_lot_id"] for link in after["parking_lot_links"]] == [lot["id"]]

    def test_unknown_lot_id_is_skipped_not_500(self, admin_client):
        lot = _create_lot(admin_client)
        poi = create_business(admin_client, name="Ghost", parking_lot_links=[
            lot["id"], str(uuid.uuid4()),
        ])
        assert [link["parking_lot_id"] for link in poi["parking_lot_links"]] == [lot["id"]]

    def test_autosave_persists_links(self, admin_client):
        lot = _create_lot(admin_client)
        poi = create_business(admin_client, name="Autosaved")
        resp = admin_client.patch(
            f"/api/pois/{poi['id']}/autosave", json={"parking_lot_links": [lot["id"]]}
        )
        assert resp.status_code == 200
        after = admin_client.get(f"/api/pois/{poi['id']}").json()
        assert [l["parking_lot_id"] for l in after["parking_lot_links"]] == [lot["id"]]

    def test_autosave_without_links_key_leaves_links_alone(self, admin_client):
        lot = _create_lot(admin_client)
        poi = create_business(admin_client, name="Autosave Untouched",
                              parking_lot_links=[lot["id"]])
        resp = admin_client.patch(
            f"/api/pois/{poi['id']}/autosave", json={"description_short": "edited"}
        )
        assert resp.status_code == 200
        after = admin_client.get(f"/api/pois/{poi['id']}").json()
        assert [l["parking_lot_id"] for l in after["parking_lot_links"]] == [lot["id"]]

    def test_duplicate_lot_ids_collapse_to_one_link(self, admin_client):
        lot = _create_lot(admin_client)
        poi = create_business(admin_client, name="Dupe", parking_lot_links=[
            lot["id"], lot["id"],
        ])
        assert len(poi["parking_lot_links"]) == 1

    def test_deleting_the_poi_cascades_its_links(self, admin_client, db_session):
        lot = _create_lot(admin_client)
        poi = create_business(admin_client, name="Doomed", parking_lot_links=[lot["id"]])

        admin_client.delete(f"/api/pois/{poi['id']}")
        db_session.expire_all()
        assert db_session.query(POIParkingLink).count() == 0
        # The LOT survives its linker: it is shared infrastructure.
        assert db_session.query(ParkingLot).filter(ParkingLot.id == uuid.UUID(lot["id"])).count() == 1

    def test_deleting_the_lot_cascades_its_links(self, admin_client, db_session):
        lot = _create_lot(admin_client)
        poi = create_business(admin_client, name="Survivor", parking_lot_links=[lot["id"]])

        admin_client.delete(f"/api/parking-lots/{lot['id']}?force=true")
        db_session.expire_all()
        assert db_session.query(POIParkingLink).count() == 0
        refetched = admin_client.get(f"/api/pois/{poi['id']}").json()
        assert refetched["parking_lot_links"] == []
        assert refetched["parking_lots"] == []

    def test_deleting_the_owner_poi_cascades_its_owned_lot(self, admin_client, db_session):
        owner = create_business(admin_client, name="Lot Owner")
        lot = _create_lot(admin_client, name="Owned", owner_poi_id=owner["id"])

        admin_client.delete(f"/api/pois/{owner['id']}")
        db_session.expire_all()
        assert db_session.query(ParkingLot).filter(
            ParkingLot.id == uuid.UUID(lot["id"])
        ).count() == 0


# --------------------------------------------------------------------------- #
# 8-9. The unified read
# --------------------------------------------------------------------------- #
class TestUnifiedParkingRead:
    def test_own_pins_come_first_then_linked_lots(self, admin_client):
        shared_lot = _create_lot(admin_client, name="Shared Deck")
        poi = create_business(
            admin_client, name="Both Kinds",
            parking_locations=[
                _parking_pin("North Lot", 35.80, -79.00),
                _parking_pin("South Lot", 35.79, -79.00),
            ],
            parking_lot_links=[{"parking_lot_id": shared_lot["id"], "label": "2 min walk"}],
        )

        lots = poi["parking_lots"]
        assert [entry["name"] for entry in lots] == ["North Lot", "South Lot", "Shared Deck"]
        assert [entry["origin"] for entry in lots] == ["own", "own", "linked"]
        assert [entry["sort_order"] for entry in lots] == [0, 1, 2]
        assert lots[0]["label"] is None
        assert lots[0]["is_standalone"] is False
        assert lots[2]["label"] == "2 min walk"
        assert lots[2]["is_standalone"] is True
        assert lots[2]["owner"] is None
        assert lots[0]["lat"] == pytest.approx(35.80)
        assert lots[2]["lng"] == pytest.approx(-79.01)

    def test_linked_owned_lot_carries_its_owner(self, admin_client, db_session):
        owner = create_business(admin_client, name="Hardware Store", published=True)
        lot = _create_lot(admin_client, name="Hardware Lot", owner_poi_id=owner["id"])
        neighbor = create_business(admin_client, name="Neighbor", parking_lot_links=[lot["id"]])

        entry = neighbor["parking_lots"][0]
        assert entry["origin"] == "linked"
        assert entry["is_standalone"] is False
        assert entry["owner"]["name"] == "Hardware Store"

        public = read_parking_lots(db_session, uuid.UUID(neighbor["id"]), audience="public")
        assert public[0]["owner"]["name"] == "Hardware Store"

    def test_public_hides_draft_lots_and_lots_owned_by_draft_pois(self, admin_client, db_session):
        draft_lot = _create_lot(admin_client, name="Draft Deck", publication_status="draft")
        draft_owner = create_business(admin_client, name="Draft Owner")  # not published
        owned_by_draft = _create_lot(
            admin_client, name="Draft Owner Lot", owner_poi_id=draft_owner["id"]
        )
        visible = _create_lot(admin_client, name="Visible Deck")

        poi = create_business(admin_client, name="Reader", parking_lot_links=[
            draft_lot["id"], owned_by_draft["id"], visible["id"],
        ])

        # Admin sees everything (drafts are what the editor is working on).
        assert len(poi["parking_lots"]) == 3

        public = read_parking_lots(db_session, uuid.UUID(poi["id"]), audience="public")
        assert [entry["name"] for entry in public] == ["Visible Deck"]

    def test_public_audience_still_keeps_own_pins_first(self, db_session, admin_client):
        lot = _create_lot(admin_client, name="App Deck")
        poi = create_business(
            admin_client, name="App POI", published=True,
            parking_locations=[_parking_pin("Own Pin", 35.80, -79.00)],
            parking_lot_links=[lot["id"]],
        )
        payload = read_parking_lots(db_session, uuid.UUID(poi["id"]), audience="public")
        assert [entry["origin"] for entry in payload] == ["own", "linked"]
        assert [entry["sort_order"] for entry in payload] == [0, 1]

    def test_sync_helper_is_authoritative_and_idempotent(self, admin_client, db_session):
        lot_a = _create_lot(admin_client, name="A")
        lot_b = _create_lot(admin_client, name="B")
        poi = create_business(admin_client, name="Helper")
        poi_id = uuid.UUID(poi["id"])

        assert sync_parking_links(db_session, poi_id, [lot_a["id"], lot_b["id"]]) == 2
        assert sync_parking_links(db_session, poi_id, [lot_b["id"]]) == 1
        db_session.commit()
        assert db_session.query(POIParkingLink).filter(
            POIParkingLink.poi_id == poi_id
        ).count() == 1


# --------------------------------------------------------------------------- #
# 10. Own-parking regression gate
# --------------------------------------------------------------------------- #
class TestOwnParkingUntouched:
    """Adding lots and links must not perturb the own-parking path by one byte."""

    def test_parking_locations_round_trip_is_byte_identical(self, admin_client, db_session):
        pins = [
            _parking_pin("North Lot", 35.801, -79.001, notes="gravel", w3w="a.b.c"),
            _parking_pin("Middle Lot", 35.802, -79.002),
            _parking_pin("South Lot", 35.803, -79.003, accessible_parking_details=["Van accessible"]),
        ]
        lot = _create_lot(admin_client, name="Extra Shared")
        other = _create_lot(admin_client, name="Extra Shared 2")

        poi = create_business(
            admin_client, name="Regression", published=True,
            parking_locations=[dict(p) for p in pins],
            parking_lot_links=[lot["id"], other["id"]],
        )
        poi_id = uuid.UUID(poi["id"])

        def _rows():
            return db_session.execute(
                text(
                    "SELECT ST_Y(geom), ST_X(geom), meta FROM poi_points "
                    "WHERE poi_id = :p AND kind = 'parking' "
                    "ORDER BY COALESCE((meta->>'_pos')::int, 0), id"
                ),
                {"p": str(poi_id)},
            ).fetchall()

        before_rows = _rows()
        assert len(before_rows) == 3
        assert [r[2]["_pos"] for r in before_rows] == [0, 1, 2]

        # The admin response reconstructs the ORIGINAL shape, unchanged.
        assert poi["parking_locations"] == pins

        # Re-saving only the links must not touch a single poi_points row.
        again = admin_client.put(
            f"/api/pois/{poi['id']}", json={"parking_lot_links": [other["id"]]}
        ).json()
        db_session.expire_all()
        assert _rows() == before_rows
        assert again["parking_locations"] == pins

    def test_own_entries_project_pins_without_rewriting_them(self, admin_client, db_session):
        poi = create_park(
            admin_client, name="Pin Park",
            parking_locations=[_parking_pin("Trailhead Lot", 35.9, -79.1, notes="muddy")],
        )
        poi_id = uuid.UUID(poi["id"])
        before = db_session.execute(
            text("SELECT meta FROM poi_points WHERE poi_id = :p AND kind = 'parking'"),
            {"p": str(poi_id)},
        ).fetchall()

        entries = read_parking_lots(db_session, poi_id, audience="public")
        assert entries[0]["origin"] == "own"
        assert entries[0]["name"] == "Trailhead Lot"
        assert entries[0]["notes"] == "muddy"

        db_session.expire_all()
        after = db_session.execute(
            text("SELECT meta FROM poi_points WHERE poi_id = :p AND kind = 'parking'"),
            {"p": str(poi_id)},
        ).fetchall()
        assert after == before


# --------------------------------------------------------------------------- #
# 11. Photos
# --------------------------------------------------------------------------- #
class TestParkingLotPhotos:
    def test_caption_round_trips_inside_the_lot_entry(self, admin_client, db_session):
        lot = _create_lot(admin_client, name="Photo Deck")
        _add_lot_image(db_session, uuid.UUID(lot["id"]))
        poi = create_business(admin_client, name="Photo Linker", parking_lot_links=[lot["id"]])

        entry = poi["parking_lots"][0]
        assert len(entry["images"]) == 1
        assert entry["images"][0]["caption"] == "Look for the blue awning"
        assert entry["images"][0]["type"] == "parking"

    def test_standalone_lot_photo_is_invisible_to_every_poi_image_path(
        self, admin_client, db_session
    ):
        lot = _create_lot(admin_client, name="Invisible Deck")
        _add_lot_image(db_session, uuid.UUID(lot["id"]))
        poi = create_business(admin_client, name="Photo POI", parking_lot_links=[lot["id"]])

        resp = admin_client.get(f"/api/images/poi/{poi['id']}")
        assert resp.status_code == 200
        assert resp.json() == []
        # The row exists, it just has no POI owner.
        assert db_session.query(Image).count() == 1
        assert db_session.query(Image).filter(Image.poi_id.isnot(None)).count() == 0
        # ... and it is still reachable through the lot entry.
        assert len(poi["parking_lots"][0]["images"]) == 1

    def test_owned_lot_photo_still_belongs_to_its_owner_poi(self, admin_client, db_session):
        owner = create_business(admin_client, name="Owner With Photos")
        lot = _create_lot(admin_client, name="Owned Photo Lot", owner_poi_id=owner["id"])
        _add_lot_image(db_session, uuid.UUID(lot["id"]), poi_id=uuid.UUID(owner["id"]))

        owned = db_session.query(Image).filter(
            Image.poi_id == uuid.UUID(owner["id"]),
            Image.image_type == "parking",
        ).all()
        assert len(owned) == 1
        assert owned[0].parking_lot_id == uuid.UUID(lot["id"])


# --------------------------------------------------------------------------- #
# 12. Cross-app read
# --------------------------------------------------------------------------- #
def test_public_detail_emits_parking_lots(db_session, app_client):
    """Admin-written lots surface on the app's public POI detail.

    Data is created via the ORM helpers (not admin_client) because the app_client
    fixture swaps sys.modules; see test_crossapp_read.py.
    """
    poi = orm_create_business(db_session, name="Cross App POI", published=True)
    lot = ParkingLot(
        id=uuid.uuid4(),
        name="Cross App Deck",
        parking_types=["Lot"],
        publication_status="published",
    )
    db_session.add(lot)
    db_session.flush()
    db_session.add(POIParkingLink(poi_id=poi.id, parking_lot_id=lot.id, sort_order=0,
                                  label="across the street"))
    db_session.commit()
    orm_publish_poi(db_session, poi)

    resp = app_client.get(f"/api/pois/{poi.id}")
    assert resp.status_code == 200
    body = resp.json()
    assert "parking_lots" in body
    assert len(body["parking_lots"]) == 1
    entry = body["parking_lots"][0]
    assert entry["name"] == "Cross App Deck"
    assert entry["origin"] == "linked"
    assert entry["is_standalone"] is True
    assert entry["label"] == "across the street"
    # No PII on a lot by construction.
    assert not {k for k in entry if "contact" in k or "emergency" in k}
