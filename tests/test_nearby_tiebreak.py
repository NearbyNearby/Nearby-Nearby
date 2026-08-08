"""Deterministic ordering for equidistant nearby POIs (issue #160, backend half).

Two published POIs at the exact same coordinates (in prod: Doherty's Irish Pub
and the Pub Trivia event it hosts) have identical ST_Distance from any origin.
Both nearby endpoints used to sort by distance alone, so Postgres was free to
return the tied rows in either order and their card/marker numbers swapped
between page loads. The fix adds an id tie-break; these tests pin it.
"""

import uuid

from conftest import orm_create_business, db_session, app_client


ORIGIN = "POINT(-79.1780 35.7220)"
SHARED_POINT = "POINT(-79.17814 35.71947)"


def _make_origin_and_twins(db):
    origin = orm_create_business(db, name="Origin Mill", published=True, location=ORIGIN)
    twins = [
        orm_create_business(
            db, name=f"Twin {letter}", published=True, location=SHARED_POINT
        )
        for letter in ("A", "B")
    ]
    db.commit()
    return origin, twins


class TestNearbyTiebreak:
    def test_equidistant_pois_keep_a_stable_order(self, db_session, app_client):
        origin, twins = _make_origin_and_twins(db_session)

        orders = []
        for _ in range(3):
            resp = app_client.get(f"/api/pois/{origin.id}/nearby", params={"radius_miles": 5})
            assert resp.status_code == 200
            names = [p["name"] for p in resp.json() if p["name"].startswith("Twin")]
            assert len(names) == 2
            orders.append(names)

        assert orders[0] == orders[1] == orders[2]

    def test_tied_rows_are_id_sorted_after_distance(self, db_session, app_client):
        origin, twins = _make_origin_and_twins(db_session)

        resp = app_client.get(f"/api/pois/{origin.id}/nearby", params={"radius_miles": 5})
        assert resp.status_code == 200
        tied = [p for p in resp.json() if p["name"].startswith("Twin")]

        by_id = sorted(twins, key=lambda p: str(p.id))
        assert [p["id"] for p in tied] == [str(p.id) for p in by_id]
