"""Issue #130: "Don't display location" must reach every map-bearing payload.

A POI marked ``dont_display_location`` (service-based businesses that want to be
found in search but not pinned on a map) still showed a marker on the Explore
map and on the Nearby map under a POI. The frontend map already skips such POIs,
but the flag was never emitted on the card / browse payloads those maps consume,
so the guard could never fire.

These tests pin the flag onto the browse + nearby responses.
"""

import pytest
from conftest import (
    orm_create_business, orm_create_park, orm_create_category,
    orm_assign_main_category, db_session, app_client,
)


@pytest.fixture
def hidden_and_visible(db_session):
    """A hidden-location POI and a normal one, both published and co-located."""
    hidden = orm_create_business(
        db_session,
        name="Hidden Location Market",
        published=True,
        slug="hidden-location-market",
        dont_display_location=True,
        address_city="Pittsboro",
        address_state="NC",
        location="POINT(-79.177397 35.720303)",
    )
    visible = orm_create_business(
        db_session,
        name="Visible Location Shop",
        published=True,
        slug="visible-location-shop",
        address_city="Pittsboro",
        address_state="NC",
        location="POINT(-79.177400 35.720310)",
    )
    db_session.commit()
    return hidden, visible


def _by_name(rows, name):
    for row in rows:
        if row["name"] == name:
            return row
    raise AssertionError(f"{name!r} not in {[r['name'] for r in rows]}")


class TestBrowseEndpointsCarryTheFlag:
    def test_by_type_includes_dont_display_location(self, hidden_and_visible, app_client):
        resp = app_client.get("/api/pois/by-type/BUSINESS")
        assert resp.status_code == 200
        rows = resp.json()
        assert _by_name(rows, "Hidden Location Market")["dont_display_location"] is True
        assert _by_name(rows, "Visible Location Shop")["dont_display_location"] is False

    def test_by_category_includes_dont_display_location(self, db_session, app_client):
        cat = orm_create_category(db_session, name="Farm Services")
        hidden = orm_create_business(
            db_session, name="Category Hidden Co", published=True,
            slug="category-hidden-co", dont_display_location=True,
        )
        shown = orm_create_business(
            db_session, name="Category Shown Co", published=True,
            slug="category-shown-co",
        )
        orm_assign_main_category(db_session, hidden.id, cat.id)
        orm_assign_main_category(db_session, shown.id, cat.id)
        db_session.commit()

        resp = app_client.get(f"/api/pois/by-category/{cat.slug}")
        assert resp.status_code == 200
        rows = resp.json()["pois"]
        assert _by_name(rows, "Category Hidden Co")["dont_display_location"] is True
        assert _by_name(rows, "Category Shown Co")["dont_display_location"] is False


class TestNearbyEndpointsCarryTheFlag:
    def test_nearby_by_id_includes_dont_display_location(self, hidden_and_visible, db_session, app_client):
        origin = orm_create_park(
            db_session, name="Origin Park", published=True, slug="origin-park",
            location="POINT(-79.177500 35.720400)",
        )
        db_session.commit()

        resp = app_client.get(f"/api/pois/{origin.id}/nearby?radius_miles=5")
        assert resp.status_code == 200
        rows = resp.json()
        assert _by_name(rows, "Hidden Location Market")["dont_display_location"] is True
        assert _by_name(rows, "Visible Location Shop")["dont_display_location"] is False

    def test_latlng_nearby_includes_dont_display_location(self, hidden_and_visible, app_client):
        resp = app_client.get("/api/nearby?latitude=35.720303&longitude=-79.177397")
        assert resp.status_code == 200
        rows = resp.json()
        assert _by_name(rows, "Hidden Location Market")["dont_display_location"] is True
        assert _by_name(rows, "Visible Location Shop")["dont_display_location"] is False


class TestDetailStillCarriesTheFlag:
    """Regression guard: the detail payload already carried it; keep it that way."""

    def test_detail_by_slug_includes_dont_display_location(self, hidden_and_visible, app_client):
        resp = app_client.get("/api/pois/by-slug/hidden-location-market")
        assert resp.status_code == 200
        assert resp.json()["dont_display_location"] is True


class TestSearchResultsCarryTheFlag:
    """#130: Explore's search mode draws map pins from hybrid-search results.

    The query avoids the word "market": TYPE_KEYWORDS infers poi_type EVENT
    from it and would filter these BUSINESS fixtures out entirely.
    """

    def test_hybrid_search_results_carry_dont_display_location(self, hidden_and_visible, app_client):
        resp = app_client.get("/api/pois/hybrid-search", params={"q": "Hidden Location"})
        assert resp.status_code == 200
        rows = resp.json()
        assert _by_name(rows, "Hidden Location Market")["dont_display_location"] is True
        assert _by_name(rows, "Visible Location Shop")["dont_display_location"] is False
