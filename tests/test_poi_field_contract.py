"""POI field contract ("derivation") tests.

For each POIType we build a fully-populated, published fixture POI, read it back
through the public ``GET /api/pois/{id}`` endpoint, and assert that the response
key set equals the public-registry key set for that type (plus the structural
keys the serializer always nests: location / images / categories / the subtype
object). This is the test that will fail loudly the day the serializer drifts
from ``shared/poi_fields.json``.

As of phase B3 the serializer IS registry-driven (default ``POI_SERIALIZER`` is
``registry``), so the key-equality assertions now PASS — the xfail has been
removed and they gate the contract.

The PII-absence assertion has always been required: the B0 hotfix removed those
five fields from the public schema, so it must pass.

Data is created directly via the admin ORM helpers in conftest (same pattern as
``test_crossapp_read.py``) and read via the nearby-app TestClient.
"""

import os
import sys

import pytest

from conftest import (
    orm_create_business,
    orm_create_park,
    orm_create_trail,
    orm_create_event,
    orm_publish_poi,
)

# Make ``shared`` importable (conftest already puts MONOREPO_ROOT on sys.path,
# but be explicit so this file is robust if run in isolation).
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from shared.constants.poi_registry import public_fields_for  # noqa: E402


# ---------------------------------------------------------------------------
# The eight admin/PII keys (the five removed by the B0 hotfix plus the
# registry-era contact_info / compliance / admin_notes). None may EVER appear
# in a public API response. This assertion is NOT xfail — it guards a live fix.
# ---------------------------------------------------------------------------
PII_KEYS = {
    "main_contact_name",
    "main_contact_email",
    "main_contact_phone",
    "offsite_emergency_contact",
    "emergency_protocols",
    "contact_info",
    "compliance",
    "admin_notes",
}

# Structural keys the serializer always returns that are not flat registry
# fields (they nest objects / collections). These are allowed to be present in
# the response in addition to the flat public field keys.
STRUCTURAL_KEYS = {
    "id",
    "location",
    "images",
    "categories",
    "main_category",
    "secondary_categories",
    "business",
    "park",
    "trail",
    "event",
}


def _expected_public_keys(poi_type):
    """The set of flat top-level public field keys the response should expose.

    Registry entries sourced from ``poi.*`` (and computed icons) become flat
    top-level keys on the POI detail response. Entries sourced from a subtype
    table (``business.*`` / ``park.*`` / ``trail.*`` / ``event.*``) or from
    ``images:*`` are surfaced under their structural object instead, so they are
    excluded from the flat key-equality comparison. ``location`` is likewise a
    STRUCTURAL key (nested PointGeometry), so it is excluded here to match the
    ``STRUCTURAL_KEYS`` removal applied to the response side.
    """
    keys = set()
    for entry in public_fields_for(poi_type):
        if entry["key"] in STRUCTURAL_KEYS:
            continue
        source = entry["source"]
        if source.startswith("images:"):
            continue
        # Task 2.3: a points:<kind> field OWNED by a subtype table (access_points
        # / trailhead_location live on trails) stays nested under the trail
        # structural object, so it is excluded from the flat key set; the four
        # POI-owned point fields stay flat. Mirrors structural_registry_keys_for.
        if source.startswith("points:"):
            from shared.poi_points import KIND_TO_FIELD, POINT_FIELDS
            field = KIND_TO_FIELD.get(source.split(":", 1)[1])
            if field is not None and POINT_FIELDS[field]["owner"] != "poi":
                continue
            keys.add(entry["key"])
            continue
        prefix = source.split(".", 1)[0].split(":", 1)[0]
        if prefix in {"business", "park", "trail", "event"}:
            continue
        keys.add(entry["key"])
    return keys


# Fully-populated public columns common to every POI type. Only columns that
# exist on the admin PointOfInterest model are set here.
_COMMON_POI_FIELDS = dict(
    description_long="Long description",
    description_short="Short description",
    teaser_paragraph="Teaser",
    status="Fully Open",
    status_message="All good",
    is_verified=True,
    # PAID listing so tier=="paid" public fields are NOT dropped by the
    # server-side tier gate — the response then exposes the FULL public flat
    # surface and equals _expected_public_keys (which is tier-agnostic). With a
    # free listing the paid fields would be dropped and show up as `missing`.
    listing_type="paid",
    address_full="123 Main St, Town, NC 27000",
    address_street="123 Main St",
    address_city="Pittsboro",
    address_state="NC",
    address_zip="27312",
    address_county="Chatham",
    phone_number="919-555-0100",
    email="hello@example.com",
    website_url="https://example.com",
    instagram_username="example",
    facebook_username="example",
    x_username="example",
    tiktok_username="example",
    linkedin_username="example",
    hours={"monday": {"open": "09:00", "close": "17:00"}},
    cost="Free",
    pricing_details="No charge",
    parking_notes="Lot in back",
    wheelchair_details="Ramp at front",
    amenities={"wifi": True},
    toilet_description="Restroom inside",
)


def _create_fixture(db_session, poi_type):
    """Create + publish a fully-populated POI of the given type. Returns id str."""
    if poi_type == "BUSINESS":
        poi = orm_create_business(
            db_session,
            name="Contract Business",
            price_range="$$",
            **_COMMON_POI_FIELDS,
        )
    elif poi_type == "PARK":
        poi = orm_create_park(
            db_session,
            name="Contract Park",
            **_COMMON_POI_FIELDS,
        )
    elif poi_type == "TRAIL":
        poi = orm_create_trail(
            db_session,
            name="Contract Trail",
            trail_fields={
                "length_text": "3 miles",
                "difficulty": "moderate",
                "route_type": "loop",
            },
            **_COMMON_POI_FIELDS,
        )
    elif poi_type == "EVENT":
        from datetime import datetime, timezone

        poi = orm_create_event(
            db_session,
            name="Contract Event",
            event_fields={
                "start_datetime": datetime(2026, 8, 1, 10, 0, 0, tzinfo=timezone.utc),
                "end_datetime": datetime(2026, 8, 1, 18, 0, 0, tzinfo=timezone.utc),
            },
            **_COMMON_POI_FIELDS,
        )
    else:
        pytest.skip(f"No ORM fixture helper for poi_type {poi_type}")

    orm_publish_poi(db_session, poi)
    db_session.commit()
    return str(poi.id)


# Only the four POI types that have ORM + serializer support today are
# parametrized. SERVICES / YOUTH_ACTIVITIES / JOBS / VOLUNTEER_OPPORTUNITIES /
# DISASTER_HUBS share the BUSINESS table and gain coverage in B3.
CONTRACT_TYPES = ["BUSINESS", "PARK", "TRAIL", "EVENT"]


class TestPOIFieldContract:
    @pytest.mark.parametrize("poi_type", CONTRACT_TYPES)
    def test_public_response_has_no_pii(self, db_session, app_client, poi_type):
        """PII fields must be absent from the public response (B0 hotfix). NOT xfail."""
        poi_id = _create_fixture(db_session, poi_type)

        resp = app_client.get(f"/api/pois/{poi_id}")
        assert resp.status_code == 200, resp.text
        data = resp.json()

        leaked = PII_KEYS & set(data.keys())
        assert not leaked, f"{poi_type}: public response leaked PII keys: {sorted(leaked)}"

        # Defensive: also ensure they aren't nested inside the subtype object.
        for struct in ("business", "park", "trail", "event"):
            sub = data.get(struct)
            if isinstance(sub, dict):
                leaked_sub = PII_KEYS & set(sub.keys())
                assert not leaked_sub, (
                    f"{poi_type}: PII leaked under '{struct}': {sorted(leaked_sub)}"
                )

    @pytest.mark.parametrize("poi_type", CONTRACT_TYPES)
    def test_public_response_keys_match_registry(
        self, db_session, app_client, poi_type, monkeypatch
    ):
        """Flat response keys == registry public key set (+ structural keys).

        Passes as of B3: the serializer is registry-driven. Force the registry
        path explicitly so the test is independent of the ambient env flag.
        ``POI_SERIALIZER`` is read once at import, so patch both the env var and
        the already-bound module constant.
        """
        monkeypatch.setenv("POI_SERIALIZER", "registry")
        import app.api.endpoints.pois as pois_module
        monkeypatch.setattr(pois_module, "POI_SERIALIZER", "registry")
        poi_id = _create_fixture(db_session, poi_type)

        resp = app_client.get(f"/api/pois/{poi_id}")
        assert resp.status_code == 200, resp.text
        data = resp.json()

        response_keys = set(data.keys())
        flat_response_keys = response_keys - STRUCTURAL_KEYS
        expected_keys = _expected_public_keys(poi_type)

        missing = expected_keys - flat_response_keys
        extra = flat_response_keys - expected_keys
        assert not missing and not extra, (
            f"{poi_type}: serializer drifted from registry.\n"
            f"  missing (in registry, not response): {sorted(missing)}\n"
            f"  extra (in response, not registry): {sorted(extra)}"
        )
