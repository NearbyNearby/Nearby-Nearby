"""
PII leak regression test (B0 PII hotfix).

The public POI detail API (GET /api/pois/{id} and /api/pois/by-slug/{slug})
must NOT expose admin-only contact / emergency fields. These five fields are
stored on the POI but are intended for admin use only:

  - main_contact_name
  - main_contact_email
  - main_contact_phone
  - offsite_emergency_contact
  - emergency_protocols

Data is created directly via SQLAlchemy ORM (admin models imported at
conftest module level), then read via the nearby-app TestClient — the same
pattern used by test_crossapp_read.py.
"""

import pytest
from conftest import (
    orm_create_business,
    orm_create_park,
)

# The five admin-only fields that must never appear in a public response.
PII_KEYS = [
    "main_contact_name",
    "main_contact_email",
    "main_contact_phone",
    "offsite_emergency_contact",
    "emergency_protocols",
]

# Sentinel values written to those columns. If any of these strings show up
# anywhere in the response body, PII has leaked.
PII_VALUES = {
    "main_contact_name": "SENTINEL_CONTACT_NAME_pii",
    "main_contact_email": "sentinel_contact_pii@example.com",
    "main_contact_phone": "919-555-PIIX",
    "offsite_emergency_contact": "SENTINEL_OFFSITE_EMERGENCY_pii",
    "emergency_protocols": "SENTINEL_EMERGENCY_PROTOCOLS_pii",
}


def _assert_no_pii(data, body_text):
    """Assert none of the five PII keys are present and no sentinel leaks."""
    # 1. None of the five keys may appear in the JSON object.
    for key in PII_KEYS:
        assert key not in data, f"PII key '{key}' leaked into public response"

    # 2. None of the sentinel values may appear anywhere in the raw body.
    for key, value in PII_VALUES.items():
        assert value not in body_text, (
            f"PII value for '{key}' ({value!r}) leaked into public response body"
        )


class TestPiiNotLeakedById:
    def test_pii_not_leaked_by_id(self, db_session, app_client):
        """GET /api/pois/{id} must not expose admin-only contact/emergency PII."""
        poi = orm_create_business(
            db_session,
            name="PII Leak Test Biz",
            published=True,
            main_contact_name=PII_VALUES["main_contact_name"],
            main_contact_email=PII_VALUES["main_contact_email"],
            main_contact_phone=PII_VALUES["main_contact_phone"],
            offsite_emergency_contact=PII_VALUES["offsite_emergency_contact"],
            emergency_protocols=PII_VALUES["emergency_protocols"],
        )
        db_session.commit()

        resp = app_client.get(f"/api/pois/{str(poi.id)}")
        assert resp.status_code == 200, resp.text

        _assert_no_pii(resp.json(), resp.text)


class TestPiiNotLeakedInParkingLots:
    def test_parking_lot_entries_carry_no_contact_fields(self, db_session, app_client):
        """The #90/#161 ``parking_lots`` array must stay PII-free.

        A lot has no contact columns by construction, and the ``owner`` summary
        is deliberately only {id, name, slug, poi_type}. This guards against a
        future "just add the owner's phone number" convenience.
        """
        import uuid as _uuid
        from shared.models.parking_lot import ParkingLot, POIParkingLink

        owner = orm_create_business(
            db_session,
            name="Lot Owner With PII",
            slug="lot-owner-with-pii",
            published=True,
            main_contact_name=PII_VALUES["main_contact_name"],
            main_contact_email=PII_VALUES["main_contact_email"],
            main_contact_phone=PII_VALUES["main_contact_phone"],
        )
        reader = orm_create_business(
            db_session, name="Lot Reader", slug="lot-reader", published=True
        )
        lot = ParkingLot(
            id=_uuid.uuid4(),
            owner_poi_id=owner.id,
            name="Shared Deck",
            publication_status="published",
        )
        db_session.add(lot)
        db_session.flush()
        db_session.add(POIParkingLink(poi_id=reader.id, parking_lot_id=lot.id))
        db_session.commit()

        resp = app_client.get(f"/api/pois/{str(reader.id)}")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert len(body["parking_lots"]) == 1
        entry = body["parking_lots"][0]
        assert set(entry["owner"]) == {"id", "name", "slug", "poi_type"}
        for key in PII_KEYS:
            assert key not in entry
            assert key not in entry["owner"]
        _assert_no_pii(body, resp.text)


class TestPiiNotLeakedBySlug:
    def test_pii_not_leaked_by_slug(self, db_session, app_client):
        """GET /api/pois/by-slug/{slug} must not expose admin-only PII either."""
        poi = orm_create_park(
            db_session,
            name="PII Leak Test Park",
            slug="pii-leak-test-park",
            published=True,
            main_contact_name=PII_VALUES["main_contact_name"],
            main_contact_email=PII_VALUES["main_contact_email"],
            main_contact_phone=PII_VALUES["main_contact_phone"],
            offsite_emergency_contact=PII_VALUES["offsite_emergency_contact"],
            emergency_protocols=PII_VALUES["emergency_protocols"],
        )
        db_session.commit()

        resp = app_client.get("/api/pois/by-slug/pii-leak-test-park")
        assert resp.status_code == 200, resp.text

        _assert_no_pii(resp.json(), resp.text)
