"""Task 2.2: facet filters on GET /api/pois/{poi_id}/nearby.

Each test creates an origin POI plus one nearby POI that HAS the facet attribute
and one that does NOT, then calls the nearby endpoint with the facet param and
asserts inclusion of the matching POI and exclusion of the non-matching one.

Column mappings under test (see nearby-app crud_poi._apply_nearby_facets):
  pet_friendly          -> icon_pet_friendly = true
  restrooms             -> icon_public_restroom = true
  wheelchair_accessible -> icon_wheelchair_accessible = true
  free_wifi             -> icon_free_wifi = true
  playground            -> playground_available = true
  alcohol               -> alcohol_available IS NOT NULL AND != 'no_alcohol'
  kid_friendly          -> ideal_for @> {"age_group": ["Families"]}
  payment=<method>      -> payment_methods @> ["<method>"]
"""

from conftest import orm_create_business, orm_create_park

# Origin and two candidates, all well within a 10-mile radius.
_ORIGIN = "POINT(-79.0 35.8)"
_NEAR_A = "POINT(-79.001 35.8)"
_NEAR_B = "POINT(-79.002 35.8)"


def _nearby(app_client, origin_id, **params):
    params.setdefault("radius_miles", "10")
    resp = app_client.get(f"/api/pois/{origin_id}/nearby", params=params)
    assert resp.status_code == 200, resp.text
    return {p["name"] for p in resp.json()}


def _origin(db_session):
    return orm_create_business(db_session, name="Origin", location=_ORIGIN, published=True)


class TestBooleanFacets:
    def test_pet_friendly(self, db_session, app_client):
        origin = _origin(db_session)
        orm_create_business(db_session, name="Pet Yes", location=_NEAR_A,
                            published=True, icon_pet_friendly=True)
        orm_create_business(db_session, name="Pet No", location=_NEAR_B,
                            published=True, icon_pet_friendly=False)
        db_session.commit()
        names = _nearby(app_client, origin.id, facet="pet_friendly")
        assert "Pet Yes" in names and "Pet No" not in names

    def test_restrooms(self, db_session, app_client):
        origin = _origin(db_session)
        orm_create_business(db_session, name="Restroom Yes", location=_NEAR_A,
                            published=True, icon_public_restroom=True)
        orm_create_business(db_session, name="Restroom No", location=_NEAR_B,
                            published=True, icon_public_restroom=False)
        db_session.commit()
        names = _nearby(app_client, origin.id, facet="restrooms")
        assert "Restroom Yes" in names and "Restroom No" not in names

    def test_wheelchair_accessible(self, db_session, app_client):
        origin = _origin(db_session)
        orm_create_business(db_session, name="Wheel Yes", location=_NEAR_A,
                            published=True, icon_wheelchair_accessible=True)
        orm_create_business(db_session, name="Wheel No", location=_NEAR_B,
                            published=True, icon_wheelchair_accessible=False)
        db_session.commit()
        names = _nearby(app_client, origin.id, facet="wheelchair_accessible")
        assert "Wheel Yes" in names and "Wheel No" not in names

    def test_free_wifi(self, db_session, app_client):
        origin = _origin(db_session)
        orm_create_business(db_session, name="Wifi Yes", location=_NEAR_A,
                            published=True, icon_free_wifi=True)
        orm_create_business(db_session, name="Wifi No", location=_NEAR_B,
                            published=True, icon_free_wifi=False)
        db_session.commit()
        names = _nearby(app_client, origin.id, facet="free_wifi")
        assert "Wifi Yes" in names and "Wifi No" not in names

    def test_playground(self, db_session, app_client):
        origin = _origin(db_session)
        orm_create_park(db_session, name="Play Yes", location=_NEAR_A,
                        published=True, playground_available=True)
        orm_create_park(db_session, name="Play No", location=_NEAR_B,
                        published=True, playground_available=False)
        db_session.commit()
        names = _nearby(app_client, origin.id, facet="playground")
        assert "Play Yes" in names and "Play No" not in names


class TestAlcoholFacet:
    def test_alcohol(self, db_session, app_client):
        origin = _origin(db_session)
        orm_create_business(db_session, name="Bar", location=_NEAR_A,
                            published=True, alcohol_available="full_bar")
        orm_create_business(db_session, name="Dry", location=_NEAR_B,
                            published=True, alcohol_available="no_alcohol")
        orm_create_business(db_session, name="Unset", location=_NEAR_B,
                            published=True, alcohol_available=None)
        db_session.commit()
        names = _nearby(app_client, origin.id, facet="alcohol")
        assert "Bar" in names
        assert "Dry" not in names and "Unset" not in names


class TestKidFriendlyFacet:
    def test_kid_friendly(self, db_session, app_client):
        origin = _origin(db_session)
        orm_create_business(db_session, name="Families Ok", location=_NEAR_A,
                            published=True,
                            ideal_for={"age_group": ["Families", "All Ages"]})
        orm_create_business(db_session, name="Adults Only", location=_NEAR_B,
                            published=True,
                            ideal_for={"age_group": ["Ages 21+"]})
        db_session.commit()
        names = _nearby(app_client, origin.id, facet="kid_friendly")
        assert "Families Ok" in names and "Adults Only" not in names


class TestPaymentFacet:
    def test_payment_containment(self, db_session, app_client):
        origin = _origin(db_session)
        orm_create_business(db_session, name="Takes Cash", location=_NEAR_A,
                            published=True, payment_methods=["Cash", "Credit Cards"])
        orm_create_business(db_session, name="Card Only", location=_NEAR_B,
                            published=True, payment_methods=["Credit Cards"])
        db_session.commit()
        names = _nearby(app_client, origin.id, payment="Cash")
        assert "Takes Cash" in names and "Card Only" not in names


class TestFacetComposition:
    def test_facet_radius_and_type(self, db_session, app_client):
        """facet (server) + radius (server) + type (client-side, via poi_type)."""
        origin = _origin(db_session)
        # pet-friendly, in radius, two different types
        orm_create_business(db_session, name="Pet Biz", location=_NEAR_A,
                            published=True, icon_pet_friendly=True)
        orm_create_park(db_session, name="Pet Park", location=_NEAR_B,
                        published=True, icon_pet_friendly=True)
        # in radius but not pet-friendly -> excluded by facet
        orm_create_business(db_session, name="No Pet Biz", location=_NEAR_A,
                            published=True, icon_pet_friendly=False)
        # pet-friendly but far outside the radius -> excluded by radius
        orm_create_business(db_session, name="Far Pet", location="POINT(-80.5 35.8)",
                            published=True, icon_pet_friendly=True)
        db_session.commit()

        resp = app_client.get(
            f"/api/pois/{origin.id}/nearby",
            params={"radius_miles": "10", "facet": "pet_friendly"},
        )
        assert resp.status_code == 200, resp.text
        results = resp.json()
        names = {p["name"] for p in results}
        assert names == {"Pet Biz", "Pet Park"}, names
        assert "No Pet Biz" not in names  # facet excluded
        assert "Far Pet" not in names     # radius excluded

        # The type pills filter client-side on poi_type; simulate that dimension.
        businesses = {p["name"] for p in results if p["poi_type"] == "BUSINESS"}
        assert businesses == {"Pet Biz"}


class TestSearchWithinNearbyRespectsFacets:
    def test_hybrid_search_scope_is_facet_filtered(self, db_session, app_client):
        """search-within-nearby intersects hybrid-search results against the
        facet-filtered nearby id set client-side, so a POI that matches the query
        but NOT the facet is excluded from that scope."""
        origin = _origin(db_session)
        pet = orm_create_business(db_session, name="Pet Friendly Cafe", location=_NEAR_A,
                                  published=True, icon_pet_friendly=True)
        nopet = orm_create_business(db_session, name="Regular Cafe", location=_NEAR_B,
                                    published=True, icon_pet_friendly=False)
        db_session.commit()

        # Global hybrid-search finds the non-pet cafe (it IS searchable).
        search = app_client.get("/api/pois/hybrid-search",
                                params={"q": "Regular Cafe", "limit": "50"})
        assert search.status_code == 200, search.text
        search_ids = {p["id"] for p in search.json()}
        assert str(nopet.id) in search_ids

        # The facet-filtered nearby set (what scopes search) excludes it.
        resp = app_client.get(f"/api/pois/{origin.id}/nearby",
                              params={"radius_miles": "10", "facet": "pet_friendly"})
        assert resp.status_code == 200, resp.text
        nearby_ids = {p["id"] for p in resp.json()}
        assert str(pet.id) in nearby_ids
        assert str(nopet.id) not in nearby_ids
