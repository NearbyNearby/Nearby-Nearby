"""Serializer parity / cutover-gate test (phase B3).

For each POI type (BUSINESS / PARK / TRAIL / EVENT) we:

  1. Build a FULLY-populated PUBLISHED POI via the conftest ORM helpers —
     every relevant public column is set, PLUS the admin-only PII columns
     (contact_info, compliance, main_contact_*, offsite_emergency_contact,
     emergency_protocols), PLUS a PAID ``listing_type`` so paid-tier fields
     appear in the registry output.

  2. Build the PRE-B3 PUBLIC API SURFACE baseline — what users actually
     received before phase B3. The pre-B3 endpoint built the raw all-columns
     dict and then validated it through ``POIDetail`` (whose implicit
     ``extra="ignore"`` DROPPED every column it did not declare, including all
     PII columns AND the public fields POIDetail simply never declared). So the
     meaningful baseline is::

         POIDetail.model_validate(all_columns_dict)
                 .model_dump(mode="json", exclude_unset=True)

     i.e. the public allowlist payload the old API actually emitted — NOT the
     raw all-columns dict (which would put every column in BOTH payloads and
     make ``keys_added`` unsatisfiable).

  3. Build the REGISTRY payload via ``serialize_poi_detail``.

  4. Assert via ``diff_serializers``:
       * ``keys_added``   ⊇ a representative set of previously-DROPPED-by-POIDetail
         PUBLIC keys valid for the type (alcohol_available, accessible_restroom,
         what3words_address, arrival_methods, the icon_* booleans, the paid
         is_sponsor / sponsor_level, the subtype-sourced price_range /
         trail_markings / start_datetime, …) — the fields POIDetail never
         declared but the registry now serves.
       * every key present in BOTH has EQUAL values (no silent value change).
       * NONE of the PII keys nor contact_info/compliance/admin_notes appear in
         the registry output (the real cutover guarantee — asserted directly on
         ``serialize_poi_detail``'s dict). PII was already removed from the
         POIDetail baseline by the B0 hotfix, so it is not in ``keys_removed``;
         the guarantee is "no PII in the NEW output", which this covers.

This test must PASS — it is the cutover gate, not an xfail probe.

NOTE on imports: ``app.serialization`` is imported LAZILY inside the test (not at
module level). The ``app_client`` fixture swaps ``app.*`` in ``sys.modules`` for
the nearby-app harness; a module-level import here would bind a stale module and
pollute the cross-file run order (flipping ``test_poi_field_contract``'s
PII-absence test). Importing inside the test body re-resolves against whatever
``app`` is live, so both files pass in EITHER order.
"""

import sys
import os
import uuid
from decimal import Decimal
from datetime import datetime, date, timezone

import pytest

# conftest already puts MONEREPO_ROOT + ADMIN_BACKEND on sys.path. The serializer
# lives under the APP backend; add it so the lazy in-test imports resolve.
_MONOREPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_APP_BACKEND = os.path.join(_MONOREPO_ROOT, "nearby-app", "backend")
if _APP_BACKEND not in sys.path:
    sys.path.insert(0, _APP_BACKEND)

from conftest import (  # noqa: E402
    orm_create_business,
    orm_create_park,
    orm_create_trail,
    orm_create_event,
    AdminPOI,
)


def _load_serializer_helpers():
    """Import the registry serializer + parity helpers LAZILY (see module docstring).

    Resolves against the nearby-app backend (``_APP_BACKEND`` is on ``sys.path``)
    regardless of whether ``test_poi_field_contract``'s ``app_client`` fixture has
    swapped ``app.*`` in ``sys.modules`` earlier in the session. ``app.serialization``
    exists only under the app backend (admin has no such submodule), so the
    namespace-package resolution finds it there.
    """
    from app.serialization.poi_serializer import serialize_poi_detail, _tier_is_paid
    from app.serialization.parity import diff_serializers
    return serialize_poi_detail, _tier_is_paid, diff_serializers


def _load_app_poidetail():
    """Load the nearby-app ``POIDetail`` / ``PointGeometry`` from the app backend.

    conftest imports the ADMIN app at module level (via ``app.main``), which caches
    ADMIN's ``app.schemas.poi`` in ``sys.modules`` — and ADMIN's module has NO
    ``POIDetail``. A plain ``from app.schemas.poi import POIDetail`` would therefore
    return the cached admin module and fail. To get the app backend's schema
    deterministically (in EITHER cross-file order), load its file directly via
    importlib under a private module name. The app schema only imports stdlib /
    pydantic / geoalchemy2 (no ``app.*``), so this is side-effect-free and does not
    disturb the admin ``app.*`` modules.
    """
    import importlib.util

    cache = getattr(_load_app_poidetail, "_cache", None)
    if cache is not None:
        return cache

    schema_path = os.path.join(_APP_BACKEND, "app", "schemas", "poi.py")
    spec = importlib.util.spec_from_file_location("_app_schemas_poi_for_parity", schema_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    result = (module.POIDetail, module.PointGeometry)
    _load_app_poidetail._cache = result
    return result


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
PII_KEYS = {
    "main_contact_name",
    "main_contact_email",
    "main_contact_phone",
    "offsite_emergency_contact",
    "emergency_protocols",
}
ADMIN_ONLY_KEYS = PII_KEYS | {"contact_info", "compliance", "admin_notes"}

# Common public POI-column values applied to every type (paid tier so paid fields
# surface in the registry output).
_COMMON_POI_FIELDS = dict(
    listing_type="paid",  # PAID tier — makes tier=="paid" registry fields appear
    is_sponsor=True,
    sponsor_level="state",
    description_long="Long description",
    description_short="Short description",
    teaser_paragraph="Teaser",
    history_paragraph="History",
    status="Fully Open",
    status_message="All good",
    is_verified=True,
    is_disaster_hub=False,
    lat_long_most_accurate=True,
    has_been_published=True,
    address_full="123 Main St, Pittsboro, NC 27312",
    address_street="123 Main St",
    address_city="Pittsboro",
    address_state="NC",
    address_zip="27312",
    address_county="Chatham County",
    front_door_latitude=Decimal("35.8000000"),
    front_door_longitude=Decimal("-79.0000000"),
    arrival_methods=["walk_in", "drive"],
    what3words_address="filled.count.soap",
    dont_display_location=False,
    website_url="https://example.com",
    phone_number="919-555-0001",
    email="hello@example.com",
    instagram_username="ig_handle",
    facebook_username="fb_handle",
    x_username="x_handle",
    tiktok_username="tt_handle",
    linkedin_username="li_handle",
    other_socials={"threads": "th_handle"},
    hours={"monday": {"open": "09:00", "close": "17:00"}},
    hours_but_appointment_required=False,
    appointment_booking_url="https://book.example.com",
    cost="$10",
    pricing_details="Pricing details",
    discounts=["senior"],
    payment_methods=["cash", "card"],
    parking_types=["Lot"],
    parking_locations=["front"],
    parking_notes="Parking notes",
    expect_to_pay_parking="yes",
    accessible_parking_details=["van_accessible"],
    amenities={"wifi": True},
    ideal_for=["families"],
    ideal_for_key=["family_friendly"],
    wheelchair_details="Step-free entry",
    mobility_access={"step_free_entry": True},
    cell_service=["Good"],
    icon_free_wifi=True,
    icon_pet_friendly=True,
    icon_public_restroom=True,
    icon_wheelchair_accessible=True,
    accessible_restroom=True,
    accessible_restroom_details=["grab_bars"],
    inclusive_playground=True,
    public_toilets=["flush"],
    toilet_locations=["main building"],
    toilet_description="Clean restrooms",
    alcohol_options=["beer"],
    alcohol_available="full_bar",
    alcohol_policy_details="Policy",
    alcohol_availability={"beer": True},
    byob_allowed=True,
    alcohol_notes="BYOB ok",
    smoking_options=["outdoor"],
    smoking_details="Outdoor only",
    wifi_options=["free"],
    pet_options=["leashed"],
    pet_policy="Leashed only",
    drone_usage="No",
    drone_policy="Drone policy",
    available_for_rent=True,
    rental_info="Rental info",
    rental_pricing="$50/hr",
    rental_link="https://rent.example.com",
    natural_features=["river"],
    outdoor_types=["picnic"],
    things_to_do=["hike"],
    birding_wildlife="Many birds",
    night_sky_viewing="Great",
    membership_passes=["annual"],
    membership_details="Membership details",
    associated_trails=["trail-a"],
    service_locations=["onsite"],
    locally_found_at=["market"],
    article_links=["https://news.example.com"],
    community_impact="High",
    organization_memberships=["chamber"],
    photos=["p1.jpg"],
    gallery_photos=["g1.jpg"],
    featured_image="https://img.example.com/feat.jpg",
    downloadable_maps=["map.pdf"],
    facilities_options=["benches"],
    custom_fields={"foo": "bar"},
    # --- Admin-only PII columns (must be DROPPED by the registry serializer) ---
    contact_info={"best": {"name": "Rhonda", "phone": "919-555-9999"}},
    compliance={"pre_approval_required": True},
    admin_notes="Internal note — do not expose",
    main_contact_name="Rhonda Secret",
    main_contact_email="rhonda@internal.example.com",
    main_contact_phone="919-555-7777",
    offsite_emergency_contact="Call 911",
    emergency_protocols="Evacuate north",
)


def _coerce(value):
    """Replicate poi_serializer._coerce so the baseline is comparable."""
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return value


def _pre_b3_public_payload(poi, registry_dict):
    """Build the PRE-B3 PUBLIC API SURFACE baseline (what users actually received).

    The pre-B3 endpoint validated the raw all-columns dict through ``POIDetail``,
    whose implicit ``extra="ignore"`` DROPPED every column it did not declare
    (all PII columns AND the public fields it simply never declared). So the
    public surface users saw was the POIDetail allowlist payload, NOT the raw
    all-columns dict. Reconstruct it exactly::

        POIDetail.model_validate(all_columns_dict)
                .model_dump(mode="json", exclude_unset=True)

    Using the raw all-columns dict as the baseline (the old approach) is
    unsatisfiable: real columns like ``alcohol_available`` / ``what3words_address``
    / the ``icon_*`` booleans would sit in BOTH payloads and could never appear in
    ``keys_added``. This allowlist baseline is the meaningful one.

    The structural ``id`` / ``location`` keys are aligned to the registry output's
    shapes so they do not register as spurious value-mismatches (the registry
    emits ``location`` as a ``PointGeometry`` object while ``mode="json"`` emits a
    dict; both are tested structurally elsewhere — this test is about the public
    field surface).
    """
    # Load the nearby-app POIDetail/PointGeometry from the app backend directly
    # (the cached ``app.schemas.poi`` is ADMIN's and has no POIDetail). See
    # _load_app_poidetail for why importlib is used here.
    POIDetail, PointGeometry = _load_app_poidetail()

    all_columns = {col.name: getattr(poi, col.name) for col in poi.__table__.columns}
    # POIDetail requires ``location`` (a PointGeometry) — supply it from the WKB
    # column the same way the endpoint did so model_validate succeeds.
    if all_columns.get("location") is not None:
        all_columns["location"] = PointGeometry.from_wkb(all_columns["location"])
    if hasattr(poi.poi_type, "value"):
        all_columns["poi_type"] = poi.poi_type.value

    # IMPORTANT: the CURRENT POIDetail uses ``extra="allow"`` (so the registry path
    # can restore public fields). The PRE-B3 POIDetail used implicit
    # ``extra="ignore"`` — it DROPPED every column it did not declare. Replicate
    # that here by feeding ONLY the declared fields, otherwise ``extra="allow"``
    # would keep all the public columns the registry restores (alcohol_available,
    # what3words_address, icon_*, …) in the baseline and they could never appear in
    # ``keys_added``.
    declared = set(POIDetail.model_fields.keys())
    filtered = {k: v for k, v in all_columns.items() if k in declared}

    model = POIDetail.model_validate(filtered)
    payload = model.model_dump(mode="json", exclude_unset=True)

    # Align structural keys to the registry output's shapes.
    payload["id"] = registry_dict["id"]
    payload["location"] = registry_dict["location"]
    return payload


def _normalize_for_compare(value):
    """Make values comparable across the JSON-dumped baseline and the python-coerced
    registry dict, ignoring REPRESENTATION-only differences that are not field-surface
    drift:

      * Enums  -> their ``.value`` (registry emits the raw ``POIType`` enum for
        ``poi_type``; the baseline's ``mode="json"`` dump emits the str value).
      * Datetime ISO strings -> a canonical UTC instant (the baseline emits
        ``...Z`` while the registry's ``_coerce`` emits ``...+00:00`` for the same
        ``created_at`` / ``last_updated`` instant).

    Real value drift (different content) still compares unequal.
    """
    if hasattr(value, "value") and not isinstance(value, (str, bytes, bool, int, float)):
        return value.value
    if isinstance(value, str):
        # Canonicalize ISO-8601 timestamps so 'Z' and '+00:00' compare equal.
        s = value
        try:
            parsed = datetime.fromisoformat(s.replace("Z", "+00:00"))
            return parsed.astimezone(timezone.utc).isoformat()
        except (ValueError, AttributeError):
            return value
    return value


def _build_full_poi(db_session, poi_type):
    """Create a fully-populated, published, PAID POI of the given type."""
    if poi_type == "BUSINESS":
        poi = orm_create_business(
            db_session,
            name="Parity Business",
            published=True,
            price_range="$$$",
            price_range_per_person="$15 and under",
            pricing="Varies",
            gift_cards="yes_this_only",
            youth_amenities=["kids_menu"],
            business_amenities=["meeting_room"],
            entertainment_options=["live_music"],
            menu_photos=["menu.jpg"],
            menu_link="https://menu.example.com",
            delivery_links=["https://delivery.example.com"],
            reservation_links=["https://res.example.com"],
            appointment_links=["https://appt.example.com"],
            online_ordering_links=["https://order.example.com"],
            business_entry_notes="Enter via front",
            **_COMMON_POI_FIELDS,
        )
    elif poi_type == "PARK":
        poi = orm_create_park(
            db_session,
            name="Parity Park",
            published=True,
            playground_available=True,
            playground_types=["swings"],
            playground_surface_types=["rubber"],
            playground_notes="Fun playground",
            playground_locations=["north end"],
            playground_age_groups=["2-5"],
            playground_ada_checklist=["transfer_station"],
            # NOTE: outdoor_types is supplied by _COMMON_POI_FIELDS (["picnic"]).
            # Do NOT pass it again here or orm_create_park() raises
            # "multiple values for keyword 'outdoor_types'".
            hunting_fishing_allowed="no",
            hunting_types=["deer"],
            fishing_allowed="catch_release",
            fishing_types=["bass"],
            licenses_required=["state"],
            hunting_fishing_info="Info",
            camping_lodging="Tent camping",
            payphone_locations=["entrance"],
            park_entry_notes="Enter via gate",
            **_COMMON_POI_FIELDS,
        )
    elif poi_type == "TRAIL":
        poi = orm_create_trail(
            db_session,
            name="Parity Trail",
            published=True,
            playground_age_groups=["2-5"],
            playground_ada_checklist=["transfer_station"],
            payphone_locations=["trailhead"],
            trail_fields={
                "length_text": "3 miles",
                "length_segments": [{"name": "seg1", "length": "1mi"}],
                "difficulty": "moderate",
                "difficulty_description": "Some hills",
                "route_type": "loop",
                "trail_markings": "Blue blazes",  # the subtype-source fix
                "downloadable_trail_map": "https://map.example.com/trail.pdf",
                "trail_surfaces": ["dirt"],
                "trail_conditions": ["dry"],
                "trail_experiences": ["scenic"],
                "mile_markers": True,
                "trailhead_signage": True,
                "audio_guide_available": True,
                "qr_trail_guide": True,
                "trail_guide_notes": "Follow signs",
                # ck_trails_trail_lighting_valid allows only
                # ('partial','full','seasonal','dusk_to_dawn') — 'none' violates it.
                "trail_lighting": "full",
                "trailhead_location": {"lat": 35.8, "lon": -79.0},
                "trailhead_latitude": Decimal("35.8000000"),
                "trailhead_longitude": Decimal("-79.0000000"),
                "trailhead_access_details": "Gravel lot",
                "access_points": [{"name": "north"}],
                "trail_entry_notes": "Start at the kiosk",
            },
            **_COMMON_POI_FIELDS,
        )
    elif poi_type == "EVENT":
        poi = orm_create_event(
            db_session,
            name="Parity Event",
            published=True,
            event_fields={
                "start_datetime": datetime(2030, 8, 1, 10, 0, 0, tzinfo=timezone.utc),
                "end_datetime": datetime(2030, 8, 1, 18, 0, 0, tzinfo=timezone.utc),
                "is_repeating": False,
                "organizer_name": "Org",
                "organizer_email": "org@example.com",
                "organizer_phone": "919-555-2222",
                "organizer_website": "https://org.example.com",
                "organizer_social_media": {"ig": "org"},
                "event_entry_notes": "Enter at gate B",
                "food_and_drink_info": "Food trucks",
                "coat_check_options": ["free"],
                "event_status": "Scheduled",
                "cost_type": "paid",
                "ticket_links": ["https://tickets.example.com"],
                "sponsors": [{"name": "ACME"}],
                "has_vendors": True,
                "vendor_types": ["food"],
                "vendor_fee": "$50",
                "venue_settings": [{"name": "main"}],
            },
            **_COMMON_POI_FIELDS,
        )
    else:  # pragma: no cover - defensive
        raise ValueError(poi_type)

    db_session.commit()
    # Re-fetch through the ORM so relationships (business/park/trail/event) load.
    return db_session.query(AdminPOI).filter(AdminPOI.id == poi.id).one()


# Representative previously-dropped PUBLIC keys we expect the registry to RESTORE,
# per type. Subset of the full added-set so the assertion is stable.
_EXPECTED_ADDED = {
    "BUSINESS": {
        "alcohol_available",
        "accessible_restroom",
        "what3words_address",
        "arrival_methods",
        "icon_free_wifi",
        "icon_pet_friendly",
        "icon_public_restroom",
        "icon_wheelchair_accessible",
        "is_sponsor",
        "sponsor_level",
        "mobility_access",
        "cell_service",
        "price_range",  # subtype-sourced (business.price_range)
    },
    "PARK": {
        "alcohol_available",
        "accessible_restroom",
        "what3words_address",
        "arrival_methods",
        "icon_free_wifi",
        "icon_wheelchair_accessible",
        "inclusive_playground",
        "drone_usage_policy",  # subtype-sourced (park.drone_usage_policy)
    },
    "TRAIL": {
        "alcohol_available",
        "accessible_restroom",
        "what3words_address",
        "arrival_methods",
        "icon_free_wifi",
        "icon_public_restroom",
        "length_text",       # subtype-sourced (trail.length_text)
        "difficulty",        # subtype-sourced (trail.difficulty)
        "trail_markings",    # THE subtype-source fix (trail.trail_markings)
        "trail_lighting",    # subtype-sourced
    },
    "EVENT": {
        "alcohol_available",
        "accessible_restroom",
        "what3words_address",
        "arrival_methods",
        "icon_free_wifi",
        "start_datetime",    # subtype-sourced (event.start_datetime)
        "cost_type",         # subtype-sourced (event.cost_type)
        "event_status",      # subtype-sourced
    },
}


@pytest.mark.parametrize("poi_type", ["BUSINESS", "PARK", "TRAIL", "EVENT"])
def test_serializer_parity(db_session, poi_type):
    # Lazy import (see module docstring) — resolves against the live ``app``.
    serialize_poi_detail, _tier_is_paid, diff_serializers = _load_serializer_helpers()

    poi = _build_full_poi(db_session, poi_type)

    # Sanity: the fixture is the PAID tier so paid fields are emitted.
    assert _tier_is_paid(poi) is True

    registry_dict = serialize_poi_detail(db_session, poi, images=[])
    baseline_dict = _pre_b3_public_payload(poi, registry_dict)

    # Normalize representation-only differences (enum vs str poi_type, 'Z' vs
    # '+00:00' on the auto-managed timestamps) so the value-drift assertion below
    # catches REAL content drift, not formatting. Key SETS are untouched, so
    # keys_added / keys_removed are unaffected.
    norm_baseline = {k: _normalize_for_compare(v) for k, v in baseline_dict.items()}
    norm_registry = {k: _normalize_for_compare(v) for k, v in registry_dict.items()}

    diff = diff_serializers(norm_baseline, norm_registry)

    # Task 2.1: the six POI-to-POI link fields are now sourced from the
    # poi_relationships edge table ("edges:<type>"), no longer from their JSONB
    # columns. This parity fixture sets the legacy JSONB attrs but creates NO
    # edges, so the registry serializer correctly emits [] for them while the
    # POIDetail baseline still reflects the raw JSONB. That is an EXPECTED,
    # intentional source change (verified end-to-end in test_ghost_refs.py), not
    # silent value drift — exclude these keys from the value-drift assertion.
    _EDGE_LINK_KEYS = {
        "service_locations", "locally_found_at", "associated_trails",
        "membership_passes", "vendor_poi_links", "organization_memberships",
    }
    # Task 2.3: same story for the six point-geometry fields — now sourced from
    # the poi_points table ("points:<kind>"), no longer from their retained JSONB
    # columns. This fixture sets the legacy JSONB attrs but creates NO poi_points
    # rows, so the registry serializer correctly emits None while the baseline
    # still reflects the raw JSONB. Intentional source change (verified
    # end-to-end in test_poi_points.py), not silent value drift.
    _POINT_KEYS = {
        "parking_locations", "toilet_locations", "playground_locations",
        "payphone_locations", "access_points", "trailhead_location",
    }
    _INTENTIONAL_SOURCE_CHANGES = _EDGE_LINK_KEYS | _POINT_KEYS
    value_mismatches = [
        m for m in diff["value_mismatches"]
        if m["key"] not in _INTENTIONAL_SOURCE_CHANGES
    ]

    # --- 1. Previously-DROPPED-by-POIDetail public keys are RESTORED. ---
    # The pre-B3 baseline is the POIDetail allowlist (PII already removed by the
    # B0 hotfix), so the meaningful guarantee is "the registry RESTORES the public
    # fields POIDetail never declared" — asserted here — plus "no PII in the new
    # output" (assertion 3 below). We do NOT assert ``keys_removed ⊇ PII`` because
    # PII is not in the POIDetail baseline to begin with, so it can never be in
    # ``keys_removed``; the real protection is the direct PII-absence check.
    added = set(diff["keys_added"])
    expected_added = _EXPECTED_ADDED[poi_type]
    assert expected_added.issubset(added), (
        f"[{poi_type}] registry must restore public keys POIDetail dropped: "
        f"{sorted(expected_added - added)}"
    )

    # --- 2. No silent value change for any key present in BOTH payloads. ---
    assert value_mismatches == [], (
        f"[{poi_type}] value drift on kept keys: {value_mismatches}"
    )

    # --- 3. Explicit (the real cutover guarantee): NONE of the PII keys nor
    #        contact_info/compliance/admin_notes appear in the registry output. ---
    for key in ADMIN_ONLY_KEYS:
        assert key not in registry_dict, (
            f"[{poi_type}] admin/PII key leaked into registry output: {key}"
        )

    # The serializer must NOT iterate model columns — confirm the registry output
    # is a STRICT subset (by key) of the public registry surface, i.e. it never
    # carries an admin-only column even though the model defines it.
    assert "admin_notes" not in registry_dict
