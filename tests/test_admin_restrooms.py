"""Issue #117 — restroom data loss: only photos survived a save/reopen cycle
(restroom name, coordinates, description, features were all lost).

Root cause: `toilet_locations` entries persist as `poi_points` rows (Task 2.3,
shared/poi_points.py). That table's `geom` column is NOT NULL, so an entry
with no parseable lat/lng is silently dropped in its ENTIRE (name,
description, features included, not just the pin) — while a restroom's
photos, stored independently in the images table, survive untouched. Editors
very often skip re-pinning the exact GPS position of an indoor restroom, so
this was easy to hit in practice.

Fix: default a restroom entry's missing lat/lng to the POI's own coordinates
before syncing to poi_points, both on create and on update/autosave
(app/crud/crud_poi.py: `_default_missing_restroom_coords` /
`_poi_location_lat_lng`, wired into create_poi, update_poi, and the
/pois/{id}/autosave endpoint).
"""

from conftest import create_business


FULL_ROW = {
    "restroom_name": "Front Desk Restroom",
    "lat": 35.81, "lng": -79.01, "w3w": "filled.count.soap",
    "description": "<p>For paying customers only</p>",
    "photos": "",
    "toilet_types": ["Flush Toilets", "Baby Changing Station"],
    "accessible_restroom": True,
    "accessible_restroom_details": ["Grab bars", "Wide stall"],
}
SECOND_ROW = {
    "restroom_name": "Back Restroom",
    "lat": 35.82, "lng": -79.02, "w3w": "",
    "description": "<p>Back of building</p>",
    "photos": "",
    "toilet_types": ["Flush Toilets"],
    "accessible_restroom": False,
    "accessible_restroom_details": [],
}
NO_COORDS_ROW = {
    "restroom_name": "Employee Restroom",
    "lat": None, "lng": None, "w3w": "",
    "description": "<p>Staff only</p>",
    "photos": "",
    "toilet_types": ["Flush Toilets"],
    "accessible_restroom": False,
    "accessible_restroom_details": [],
}


class TestRestroomFullRoundtrip:
    def test_create_with_two_full_restrooms_roundtrips_on_get(self, admin_client):
        """Every field of every restroom row (not just photos) survives a GET
        after create, matching the admin form's exact row shape."""
        biz = create_business(
            admin_client, name="Restroom Roundtrip Biz",
            toilet_locations=[FULL_ROW, SECOND_ROW],
        )
        assert biz["toilet_locations"] == [FULL_ROW, SECOND_ROW]

        got = admin_client.get(f"/api/pois/{biz['id']}").json()
        assert got["toilet_locations"] == [FULL_ROW, SECOND_ROW]

    def test_update_preserves_full_restroom_data(self, admin_client):
        """A PUT that re-saves restroom rows (as the edit form does on every
        save) still round-trips every field on the next GET."""
        biz = create_business(admin_client, name="Restroom Update Biz")

        resp = admin_client.put(
            f"/api/pois/{biz['id']}",
            json={"toilet_locations": [FULL_ROW, SECOND_ROW]},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["toilet_locations"] == [FULL_ROW, SECOND_ROW]

        got = admin_client.get(f"/api/pois/{biz['id']}").json()
        assert got["toilet_locations"] == [FULL_ROW, SECOND_ROW]

    def test_autosave_preserves_full_restroom_data(self, admin_client):
        """The Google-Docs-style autosave path (PATCH /autosave) also round
        trips every field, not just the coordinates."""
        biz = create_business(admin_client, name="Restroom Autosave Biz")

        resp = admin_client.patch(
            f"/api/pois/{biz['id']}/autosave",
            json={"toilet_locations": [FULL_ROW]},
        )
        assert resp.status_code == 200, resp.text

        got = admin_client.get(f"/api/pois/{biz['id']}").json()
        assert got["toilet_locations"] == [FULL_ROW]


class TestRestroomMissingCoordsNoLongerDropsRow:
    """Issue #117's actual trigger: an editor fills in name/description/
    features but never touches the lat/lng inputs. Before the fix, the whole
    row (including name/description/features) vanished, leaving nothing but
    the independently-stored photos behind."""

    def test_create_without_coords_keeps_the_row(self, admin_client, db_session):
        biz = create_business(
            admin_client, name="No Coords Biz", toilet_locations=[NO_COORDS_ROW],
        )
        assert len(biz["toilet_locations"]) == 1
        row = biz["toilet_locations"][0]
        assert row["restroom_name"] == "Employee Restroom"
        assert row["description"] == "<p>Staff only</p>"
        assert row["toilet_types"] == ["Flush Toilets"]
        # Defaulted to the POI's own coordinates rather than being dropped.
        assert row["lat"] is not None
        assert row["lng"] is not None

        got = admin_client.get(f"/api/pois/{biz['id']}").json()
        assert got["toilet_locations"] == biz["toilet_locations"]

    def test_update_without_coords_keeps_the_row(self, admin_client):
        biz = create_business(admin_client, name="No Coords Update Biz")

        resp = admin_client.put(
            f"/api/pois/{biz['id']}",
            json={"toilet_locations": [NO_COORDS_ROW]},
        )
        assert resp.status_code == 200, resp.text
        row = resp.json()["toilet_locations"][0]
        assert row["restroom_name"] == "Employee Restroom"
        assert row["lat"] is not None and row["lng"] is not None

    def test_autosave_without_coords_keeps_the_row(self, admin_client):
        biz = create_business(admin_client, name="No Coords Autosave Biz")

        resp = admin_client.patch(
            f"/api/pois/{biz['id']}/autosave",
            json={"toilet_locations": [NO_COORDS_ROW]},
        )
        assert resp.status_code == 200, resp.text

        got = admin_client.get(f"/api/pois/{biz['id']}").json()
        assert len(got["toilet_locations"]) == 1
        assert got["toilet_locations"][0]["restroom_name"] == "Employee Restroom"
