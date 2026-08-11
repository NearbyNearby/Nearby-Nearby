#!/usr/bin/env python3
"""Generate the POI field registry — single source of truth for every POI field.

This is a READ-ONLY generator. It reflects the admin ORM column superset
(PointOfInterest + Business/Park/Trail/Event subtype tables), emits a draft
registry entry per column, applies an explicit override map encoding the field
audit (audience, tier, computed, deprecated, value_source, card, group/order),
and writes the deterministic JSON artifact to shared/poi_fields.json.

It is re-runnable: running it again produces byte-identical output.

The admin POI model is the SUPERSET of columns. The API serializer (and later
the frontend / admin form) derive from this registry.

Reflection strategy
--------------------
We prefer importing the admin SQLAlchemy models to iterate __table__.columns.
That requires a live DB/env (geoalchemy2, app.database, settings). When that
import fails (the common case in a bare checkout), we FALL BACK to statically
parsing the ``<name> = Column(...)`` definitions out of the model source file.
Both paths feed the same override + emit pipeline.

Usage
-----
    python scripts/gen_poi_registry.py            # write shared/poi_fields.json
    python scripts/gen_poi_registry.py --stdout   # print JSON to stdout only
    python scripts/gen_poi_registry.py --check     # print, do not write
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# --------------------------------------------------------------------------- #
# Paths
# --------------------------------------------------------------------------- #
REPO_ROOT = Path(__file__).resolve().parent.parent
# The POI ORM is now defined once in shared/models/poi.py (Task 1.2); reflect
# over it. The admin/app model modules are thin re-export shims.
MODEL_FILE = REPO_ROOT / "shared" / "models" / "poi.py"
ENUMS_FILE = REPO_ROOT / "shared" / "models" / "enums.py"
OUTPUT_FILE = REPO_ROOT / "shared" / "poi_fields.json"
# The Vite frontend build context only includes nearby-app/app/, so it cannot
# import the repo-root shared/ file. We write a byte-identical mirror here and a
# drift test (tests/test_registry_valid.py) asserts the two stay equal.
FRONTEND_MIRROR = REPO_ROOT / "nearby-app" / "app" / "src" / "data" / "poi_fields.json"

# POIType enum values (literal strings used in applies_to). Read live from the
# enums module so this list never drifts.
def _load_poi_types() -> list[str]:
    text = ENUMS_FILE.read_text()
    # Grab the body of `class POIType(enum.Enum): ... ` up to the next class.
    m = re.search(r"class POIType\(enum\.Enum\):(.*?)(?:\nclass |\Z)", text, re.S)
    body = m.group(1) if m else ""
    vals = re.findall(r'^\s*\w+\s*=\s*"([^"]+)"', body, re.M)
    return vals


POI_TYPES = _load_poi_types()
ALL_TYPES = list(POI_TYPES)
# Convenience subsets used by overrides.
BUSINESSY = ["BUSINESS", "SERVICES", "YOUTH_ACTIVITIES", "JOBS",
             "VOLUNTEER_OPPORTUNITIES", "DISASTER_HUBS"]
OUTDOOR = ["PARK", "TRAIL"]

# --------------------------------------------------------------------------- #
# Column reflection — try ORM import, else static parse
# --------------------------------------------------------------------------- #
# Each reflected column => (table_key, column_name, sql_type_token)
# table_key in {"poi","business","park","trail","event"}.

TABLE_FOR_CLASS = {
    "PointOfInterest": "poi",
    "Business": "business",
    "Park": "park",
    "Trail": "trail",
    "Event": "event",
}
# Columns we never surface as registry fields (PK/FK plumbing, relationships).
SKIP_COLUMNS = {
    "id", "poi_id", "primary_type_id",
    # event-internal FK plumbing already represented by relations
    "parent_event_id", "rescheduled_from_event_id",
}


def _sql_type_token_from_static(rhs: str) -> str:
    """Pick a canonical SQLAlchemy type token out of a Column(...) RHS string."""
    # Geometry first (geoalchemy2)
    if "Geometry(" in rhs:
        return "Geometry"
    # Order matters: TIMESTAMP / DateTime before Date; JSONB / ARRAY; Numeric etc.
    for token in ("JSONB", "ARRAY", "TIMESTAMP", "DateTime", "Date",
                  "Boolean", "Numeric", "Float", "Integer", "Text",
                  "Enum", "UUID", "String"):
        if re.search(rf"\b{token}\b", rhs):
            return token
    return "String"


def reflect_static() -> list[tuple[str, str, str]]:
    """Parse `<name> = Column(...)` lines out of the model source."""
    src = MODEL_FILE.read_text()
    cols: list[tuple[str, str, str]] = []
    current_table: str | None = None
    # Match class declarations and column assignments line by line, but Column
    # RHS can span multiple physical lines — join logical statements first.
    lines = src.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        cls_m = re.match(r"^class (\w+)\(Base\):", line)
        if cls_m:
            current_table = TABLE_FOR_CLASS.get(cls_m.group(1))
            i += 1
            continue
        # Column assignment (possibly multi-line until balanced parens).
        col_m = re.match(r"^\s{4}(\w+)\s*=\s*Column\(", line)
        if col_m and current_table is not None:
            name = col_m.group(1)
            # Accumulate until parentheses balance.
            buff = line
            depth = buff.count("(") - buff.count(")")
            while depth > 0 and i + 1 < len(lines):
                i += 1
                buff += "\n" + lines[i]
                depth += lines[i].count("(") - lines[i].count(")")
            token = _sql_type_token_from_static(buff)
            cols.append((current_table, name, token))
        i += 1
    return cols


def reflect_orm() -> list[tuple[str, str, str]] | None:
    """Try to import the models and read __table__.columns. Returns None if the
    import environment is unavailable (falls back to static parse). The admin
    ``app.models.poi`` path is a thin re-export of the shared ORM (Task 1.2)."""
    try:
        sys.path.insert(0, str(REPO_ROOT))
        sys.path.insert(0, str(REPO_ROOT / "nearby-admin" / "backend"))
        from app.models.poi import (  # type: ignore
            PointOfInterest, Business, Park, Trail, Event,
        )
    except Exception:
        return None

    out: list[tuple[str, str, str]] = []
    for cls, table_key in (
        (PointOfInterest, "poi"), (Business, "business"),
        (Park, "park"), (Trail, "trail"), (Event, "event"),
    ):
        for col in cls.__table__.columns:  # type: ignore[attr-defined]
            type_name = type(col.type).__name__
            out.append((table_key, col.name, type_name))
    return out


# Map a SQL type token -> registry "type".
def map_type(token: str, col_name: str) -> str:
    token = token.upper()
    if token == "GEOMETRY":
        return "geo"
    if token == "BOOLEAN":
        return "boolean"
    if token in ("TIMESTAMP", "DATETIME"):
        return "datetime"
    if token == "DATE":
        return "date"
    if token in ("NUMERIC", "FLOAT", "INTEGER"):
        return "number"
    if token == "TEXT":
        return "richtext"
    if token in ("JSONB", "ARRAY"):
        # Distinguish dict-shaped JSONB from list-shaped via DICT_FIELDS below.
        return "dict" if col_name in DICT_FIELDS else "multi"
    if token == "ENUM":
        return "enum"
    if token == "UUID":
        return "relation"
    # String, default
    return "text"


# JSONB columns that store a dict/object (not a list/multi-select).
DICT_FIELDS = {
    "other_socials", "mobility_access", "repeat_pattern", "venue_inheritance",
    "organizer_social_media", "amenities", "contact_info", "compliance",
    "custom_fields", "photos", "hours", "trailhead_location",
}

# --------------------------------------------------------------------------- #
# Group + order seeding (admin POIForm sections)
# --------------------------------------------------------------------------- #
# Map a column -> (group, order). Order is the section order; fields inherit
# their group's base order then sort by declaration index for stability.
GROUP_BY_FIELD: dict[str, str] = {}
# Section ordering (lower = earlier in the form).
GROUP_ORDER = {
    "Core Information": 10,
    "Categories": 20,
    "Location": 30,
    "Contact": 40,
    "Hours": 50,
    "Business Details": 60,
    "Pricing": 70,
    "Menu & Ordering": 80,
    "Parking": 90,
    "Accessibility": 100,
    "Restrooms": 110,
    # NOTE: rendered accordion titles — keep Barry's "X + Y" title style
    # (nn-templates/single-poi-page-01.html) rather than "&".
    "Alcohol + Smoking": 120,
    "Pets": 130,
    "Playground": 140,
    "Outdoor Features": 150,
    "Hunting + Fishing": 160,
    "Trail Details": 170,
    "Trailhead & Access": 180,
    "Event Details": 190,
    "Event Vendors": 200,
    "Event Organizer": 210,
    "Rentals": 220,
    "Memberships": 230,
    "Community": 240,
    "Images & Media": 250,
    "Maps + Guides": 255,
    "Disaster Response": 260,
    "Admin Only": 270,
    "Metadata": 280,
}

# Explicit field -> group assignment, seeded from the admin POIForm sections.
_GROUPS_RAW = {
    "Core Information": [
        "poi_type", "name", "slug", "teaser_paragraph", "description_short",
        "description_long", "history_paragraph", "status", "status_message",
        "is_verified", "lat_long_most_accurate",
        "listing_type", "is_sponsor", "sponsor_level", "primary_type_id",
        "publication_status", "has_been_published",
    ],
    "Location": [
        "dont_display_location", "address_full", "address_street",
        "address_city", "address_state", "address_zip", "address_county",
        "front_door_latitude", "front_door_longitude", "arrival_methods",
        "what3words_address", "location", "geom_line", "geom_area",
    ],
    "Contact": [
        "website_url", "phone_number", "email", "instagram_username",
        "facebook_username", "x_username", "tiktok_username",
        "linkedin_username", "other_socials", "contact_info",
    ],
    "Hours": [
        "hours", "hours_but_appointment_required", "appointment_booking_url",
    ],
    "Business Details": [
        "price_range_per_person", "pricing", "business_amenities",
        "youth_amenities", "entertainment_options", "gift_cards",
        "ideal_for", "ideal_for_key", "amenities",
    ],
    "Pricing": [
        "cost", "pricing_details", "discounts", "payment_methods",
        "cost_type", "price_range",
    ],
    "Menu & Ordering": [
        "menu_photos", "menu_link", "delivery_links", "reservation_links",
        "appointment_links", "online_ordering_links", "appointment_booking_url",
    ],
    "Parking": [
        "parking_types", "parking_locations", "parking_notes",
        "expect_to_pay_parking", "accessible_parking_details",
    ],
    "Accessibility": [
        "icon_wheelchair_accessible", "wheelchair_details", "mobility_access",
        "cell_service",
    ],
    "Restrooms": [
        "icon_public_restroom", "public_toilets", "toilet_locations",
        "toilet_description", "accessible_restroom",
        "accessible_restroom_details",
        "payphone_locations",
    ],
    "Alcohol + Smoking": [
        "alcohol_options", "alcohol_policy_details", "alcohol_available",
        "alcohol_availability", "byob_allowed", "alcohol_notes",
        "smoking_options", "smoking_details",
    ],
    "Pets": [
        "icon_pet_friendly", "pet_options", "pet_policy",
    ],
    "Playground": [
        "playground_available", "playground_types", "playground_surface_types",
        "playground_notes", "playground_locations", "playground_age_groups",
        "playground_ada_checklist", "inclusive_playground",
    ],
    "Outdoor Features": [
        "facilities_options", "night_sky_viewing", "natural_features",
        "outdoor_types", "things_to_do", "birding_wildlife", "drone_usage",
        "drone_policy", "drone_usage_policy",
    ],
    "Hunting + Fishing": [
        "hunting_fishing_allowed", "hunting_types", "fishing_allowed",
        "fishing_types", "licenses_required", "hunting_fishing_info",
    ],
    "Trail Details": [
        "length_text", "length_segments", "difficulty",
        "difficulty_description", "route_type", "trail_markings",
        "downloadable_trail_map", "trail_surfaces", "trail_conditions",
        "trail_experiences", "mile_markers", "trailhead_signage",
        "audio_guide_available", "qr_trail_guide", "trail_guide_notes",
        "trail_lighting", "associated_trails", "camping_lodging",
    ],
    "Trailhead & Access": [
        "trailhead_location", "trailhead_latitude", "trailhead_longitude",
        "trailhead_access_details", "access_points", "trail_entry_notes",
    ],
    "Event Details": [
        "start_datetime", "end_datetime", "is_repeating", "repeat_pattern",
        "venue_poi_id", "venue_inheritance", "series_id", "parent_event_id",
        "excluded_dates", "recurrence_end_date", "manual_dates",
        "venue_settings", "event_entry_notes", "food_and_drink_info",
        "coat_check_options", "event_status", "status_explanation",
        "cancellation_paragraph", "contact_organizer_toggle", "new_event_link",
        "rescheduled_from_event_id", "ticket_links", "sponsors",
        "wifi_options",
    ],
    "Event Vendors": [
        "has_vendors", "vendor_types", "vendor_application_deadline",
        "vendor_application_info", "vendor_fee", "vendor_requirements",
        "vendor_poi_links",
    ],
    "Event Organizer": [
        "organizer_name", "organizer_email", "organizer_phone",
        "organizer_website", "organizer_social_media", "organizer_poi_id",
    ],
    "Rentals": [
        "available_for_rent", "rental_info", "rental_pricing", "rental_link",
    ],
    "Memberships": [
        "membership_passes", "membership_details",
    ],
    "Community": [
        "service_locations", "locally_found_at", "article_links",
        "community_impact", "organization_memberships",
        # a disaster-hub designation is community info, not a "Core
        # Information" row (kills the junk Core Information accordion)
        "is_disaster_hub",
    ],
    "Images & Media": [
        "featured_image", "gallery_photos", "photos",
        "business_entry_notes", "park_entry_notes",
    ],
    "Maps + Guides": [
        "downloadable_maps",
    ],
    "Disaster Response": [
        "compliance",
    ],
    "Admin Only": [
        "admin_notes", "main_contact_name", "main_contact_email",
        "main_contact_phone", "offsite_emergency_contact",
        "emergency_protocols",
    ],
    "Metadata": [
        "created_at", "last_updated", "custom_fields",
    ],
}
for _group, _fields in _GROUPS_RAW.items():
    for _f in _fields:
        GROUP_BY_FIELD[_f] = _group


# --------------------------------------------------------------------------- #
# applies_to seeding — which POI types surface a given field
# --------------------------------------------------------------------------- #
def applies_to_for(table_key: str, name: str) -> list[str]:
    if table_key == "business":
        return ["BUSINESS"]
    if table_key == "park":
        return ["PARK"]
    if table_key == "trail":
        return ["TRAIL"]
    if table_key == "event":
        return ["EVENT"]
    # Top-level POI columns: most apply to all types. A few are type-specific.
    business_only = {
        "price_range_per_person", "pricing", "business_amenities",
        "youth_amenities", "entertainment_options", "gift_cards",
        "menu_photos", "menu_link", "delivery_links", "reservation_links",
        "appointment_links", "online_ordering_links", "business_entry_notes",
        "service_locations", "locally_found_at",
    }
    outdoor_only = {
        "facilities_options", "night_sky_viewing", "natural_features",
        "outdoor_types", "things_to_do", "birding_wildlife",
        "hunting_fishing_allowed", "hunting_types", "fishing_allowed",
        "fishing_types", "licenses_required", "hunting_fishing_info",
        "membership_passes", "membership_details", "associated_trails",
        "camping_lodging", "park_entry_notes",
        "payphone_locations", "drone_usage", "drone_policy",
    }
    if name in business_only:
        return ["BUSINESS"]
    if name in outdoor_only:
        return list(OUTDOOR)
    if name == "wifi_options":  # Events only per model comment
        return ["EVENT"]
    # Task 2.4: trails carry lines, parks carry areas.
    if name == "geom_line":
        return ["TRAIL"]
    if name == "geom_area":
        return ["PARK"]
    return list(ALL_TYPES)


# --------------------------------------------------------------------------- #
# value_source mapping — column -> constant name in field_options.py
# --------------------------------------------------------------------------- #
VALUE_SOURCE = {
    "arrival_methods": "ARRIVAL_METHOD_OPTIONS",
    "listing_type": "LISTING_TYPES",
    "sponsor_level": "SPONSOR_LEVEL_OPTIONS",
    "parking_types": "PARKING_OPTIONS",
    "accessible_parking_details": "PARKING_ADA_CHECKLIST",
    "payment_methods": "PAYMENT_METHODS",
    "discounts": "DISCOUNT_TYPES",
    "wifi_options": "WIFI_OPTIONS",
    "alcohol_available": "ALCOHOL_AVAILABLE_OPTIONS",
    "alcohol_options": "ALCOHOL_OPTIONS",
    "alcohol_availability": "ALCOHOL_AVAILABLE_OPTIONS",
    "smoking_options": "SMOKING_OPTIONS",
    "cell_service": "CELL_SERVICE_OPTIONS",
    "pet_options": "PET_OPTIONS",
    "public_toilets": "PUBLIC_TOILET_OPTIONS",
    "accessible_restroom_details": "RESTROOM_ADA_CHECKLIST",
    "playground_types": "PLAYGROUND_TYPES",
    "playground_surface_types": "PLAYGROUND_SURFACE_TYPES",
    "playground_age_groups": "PLAYGROUND_AGE_GROUPS",
    "playground_ada_checklist": "PLAYGROUND_ADA_CHECKLIST",
    "ideal_for_key": "IDEAL_FOR_KEY_OPTIONS",
    "route_type": "TRAIL_ROUTE_TYPES",
    "trail_lighting": "TRAIL_LIGHTING_OPTIONS",
    "gift_cards": "GIFT_CARD_OPTIONS",
    "youth_amenities": "YOUTH_AMENITIES",
    "business_amenities": "BUSINESS_AMENITIES",
    "entertainment_options": "ENTERTAINMENT_OPTIONS",
    "facilities_options": "PARK_FACILITIES",
    "venue_settings": "VENUE_SETTINGS",
    "coat_check_options": "COAT_CHECK_OPTIONS",
    "status": "BUSINESS_STATUS_OPTIONS",
    "event_status": "EVENT_STATUS_OPTIONS",
    "cost_type": "EVENT_COST_TYPES",
    "price_range_per_person": "PRICE_RANGE_OPTIONS",
    "price_range": "PRICE_RANGE_OPTIONS",
    "drone_usage": "DRONE_USAGE_OPTIONS",
    "drone_usage_policy": "DRONE_USAGE_OPTIONS",
    "expect_to_pay_parking": "EXPECT_TO_PAY_PARKING_OPTIONS",
}


# --------------------------------------------------------------------------- #
# schema.org mapping (a useful subset)
# --------------------------------------------------------------------------- #
SCHEMA_ORG = {
    "name": "name",
    "description_long": "description",
    "description_short": "description",
    "website_url": "url",
    "phone_number": "telephone",
    "email": "email",
    "featured_image": "image",
    "address_full": "address",
    "address_street": "streetAddress",
    "address_city": "addressLocality",
    "address_state": "addressRegion",
    "address_zip": "postalCode",
    "price_range": "priceRange",
    "start_datetime": "startDate",
    "end_datetime": "endDate",
    "organizer_name": "organizer",
}


# --------------------------------------------------------------------------- #
# Audit overrides
# --------------------------------------------------------------------------- #
# (1) PII / internal: NEVER public.
ADMIN_FIELDS = {
    "main_contact_name", "main_contact_email", "main_contact_phone",
    "offsite_emergency_contact", "emergency_protocols", "admin_notes",
    # contact_info is a JSONB {"best": {"name": ...}, "emergency": {...}} — the
    # same contact-person / emergency PII class the B0 hotfix removed from the
    # public schema. compliance holds internal operational pre-approval data.
    # Both must never reach the public API (the registry-driven serializer emits
    # every audience==public field regardless of render).
    "contact_info", "compliance",
    # Task 2.4: raw line/area geometries. Kept admin-audience so no public endpoint
    # dumps a WKB/GeoJSON geometry blob — the public app has no line/polygon
    # renderer yet (the draw UI + public map rendering is Task 4.3). The only
    # public geometry derivation is the trail's computed length_miles. Flip to
    # audience=public with a structural GeoJSON handler when Task 4.3 lands.
    "geom_line", "geom_area",
}
# (2) computed icon booleans (server-derived from underlying data) + the two
#     accessibility roll-ups. These stay audience=public but are computed.
COMPUTED_FIELDS = {
    "icon_free_wifi": "computed.icon_free_wifi",
    "icon_pet_friendly": "computed.icon_pet_friendly",
    "icon_public_restroom": "computed.icon_public_restroom",
    "icon_wheelchair_accessible": "computed.icon_wheelchair_accessible",
    "accessible_restroom": "computed.accessible_restroom",
    "inclusive_playground": "computed.inclusive_playground",
}
# (3) deprecated -> replaced_by. None means "no successor" (note documents it).
DEPRECATED = {
    # The following legacy names may or may not still be ORM-mapped; if present
    # they are flagged. Their data has migrated elsewhere.
    # payphone_location + holiday_hours dropped in migration p_drop_deprecated_001.
    "key_facilities": "facilities_options",
    "public_transit_info": "arrival_methods",
    "wheelchair_accessible": "icon_wheelchair_accessible",
}
# (4) paid-tier-only fields (gated by isPaidTier in the per-type detail views).
#     History, community/about extras, menu/ordering, gallery, ideal_for,
#     amenities roll-ups are paid-listing surfaces.
PAID_FIELDS = {
    "history_paragraph", "community_impact", "article_links",
    "organization_memberships", "locally_found_at", "service_locations",
    # ``ideal_for_key`` (the curated "Featured Ideal For" subset) is deliberately
    # tier "any", NOT paid: free listings also pick up to 3 featured traits, so
    # the public API must emit it for free POIs too. The app decides display.
    "ideal_for", "gallery_photos",
    "business_amenities", "youth_amenities", "entertainment_options",
    "menu_photos", "menu_link", "delivery_links", "reservation_links",
    "appointment_links", "online_ordering_links",
    "price_range_per_person", "price_range",
    "sponsors", "membership_passes", "membership_details",
}
# (5) nearby-card fields (POINearbyResult key set + the obvious card needs).
CARD_FIELDS = {
    "name", "poi_type", "slug", "address_city", "address_state",
    "address_county", "address_street", "description_short", "location",
    "featured_image", "listing_type", "is_sponsor",
    "icon_free_wifi", "icon_pet_friendly", "icon_public_restroom",
    "icon_wheelchair_accessible",
    "wifi_options", "pet_options", "public_toilets", "hours",
    # trail card bits
    "length_text", "difficulty",
    # event card bits
    "start_datetime",
}
# (6) icon hints (lucide/tabler-ish names; null when none).
ICON_BY_FIELD = {
    "icon_free_wifi": "wifi",
    "icon_pet_friendly": "paw-print",
    "icon_public_restroom": "toilet",
    "icon_wheelchair_accessible": "accessibility",
    "phone_number": "phone",
    "email": "mail",
    "website_url": "globe",
    "address_full": "map-pin",
    "location": "map-pin",
    "start_datetime": "calendar",
    "end_datetime": "calendar",
    "cost": "dollar-sign",
    "parking_types": "square-parking",
    "playground_available": "blocks",
    "difficulty": "trending-up",
    "length_text": "ruler",
    "alcohol_available": "wine",
}
# (7) label overrides (humanize where auto-title is wrong/awkward).
LABEL_OVERRIDES = {
    "icon_free_wifi": "Free WiFi",
    "icon_pet_friendly": "Pet Friendly",
    "icon_public_restroom": "Public Restroom",
    "icon_wheelchair_accessible": "Wheelchair Accessible",
    "what3words_address": "what3words Address",
    "x_username": "X (Twitter) Username",
    "tiktok_username": "TikTok Username",
    "qr_trail_guide": "QR Trail Guide",
    "byob_allowed": "BYOB Allowed",
    "poi_type": "POI Type",
    "slug": "URL Slug",
    "wifi_options": "WiFi Options",
    "length_miles": "Length (miles)",
}
# (8) bespoke renderers (fields too complex for the auto serializer/UI).
BESPOKE_FIELDS = {
    "location", "hours", "repeat_pattern", "venue_inheritance",
    "parking_locations", "toilet_locations", "playground_locations",
    "access_points", "length_segments", "payphone_locations",
    "manual_dates", "excluded_dates", "ticket_links", "sponsors",
    "organizer_social_media", "contact_info", "custom_fields", "compliance",
    "venue_settings",
}
# (8a) Render taxonomy curation (B4). The render mode ONLY controls FRONTEND
# grouping (auto = generic field-row renderer; bespoke = a dedicated component
# already paints it; hidden = never a display row). It does NOT affect the API
# payload — the serializer emits every audience=="public" field regardless of
# render. Default stays "auto".
#
# RENDER_BESPOKE: public fields that a dedicated detail component already
# renders (hero title/prose, image galleries, hours, location/map, trail-stats
# hero, event datetime/status banners, recurrence internals, location sublists,
# sponsor/ticket/organizer-social blocks). Each key here MUST be covered by a
# real component (reconciled against the B4 bespoke_covered map) — otherwise it
# would silently vanish from the UI, in which case it is downgraded to "auto"
# (see DOWNGRADED_TO_AUTO below).
RENDER_BESPOKE = {
    # hero / prose bodies painted by PoiHeader + dedicated description blocks
    "name", "description_short", "description_long", "history_paragraph",
    # trail-stats hero (TrailDetail subtitle / routeType)
    "length_text", "difficulty", "route_type", "length_segments",
    # event datetime hero + status banner + recurrence/venue internals
    "start_datetime", "end_datetime", "is_repeating", "repeat_pattern",
    "venue_inheritance", "venue_settings", "excluded_dates", "manual_dates",
    "event_status", "status_explanation", "cancellation_paragraph",
    "ticket_links", "sponsors", "organizer_social_media",
    # geo / hours bespoke
    "location", "hours",
    # location sublists rendered bespoke (lat/long aware)
    "parking_locations", "toilet_locations", "playground_locations",
    "payphone_locations", "access_points",
    # hero / gallery imagery; photos / gallery_photos / menu_photos are flat
    # projections of the poi.images gallery already painted by
    # QuickInfoPhotosBox + PhotoLightbox on every detail page
    "featured_image", "photos", "gallery_photos", "menu_photos",
    # operational status painted in the PoiHeader poi_status slot (Barry's
    # single-poi template); status_message renders directly under it
    "status", "status_message",
    # teaser painted as the intro line of every About accordion
    "teaser_paragraph",
    # "Last updated <date>" line painted by PoiHeader
    "last_updated",
    # server-computed amenity icon booleans + playground flag painted by the
    # AmenitiesBox/AmenityPillStrip pill row on every detail page
    "icon_public_restroom", "icon_free_wifi", "icon_wheelchair_accessible",
    "icon_pet_friendly", "playground_available",
    # social handles painted by SocialLinksGroup inside every Contact accordion
    "instagram_username", "facebook_username", "x_username",
    "tiktok_username", "linkedin_username", "other_socials",
    # arrival / entry / parking-fee facts painted inside every Address +
    # Parking accordion (business_entry_notes is BUSINESS-only)
    "arrival_methods", "expect_to_pay_parking", "business_entry_notes",
    # appointment / booking surfaced inside the bespoke HoursDisplay panel on
    # every detail page (Business/Trail/Park/Generic/Event) — not a standalone row.
    "appointment_booking_url", "hours_but_appointment_required",
    # free-form custom fields rendered bespoke
    "custom_fields",
}
# DOWNGRADED_TO_AUTO: keys the render audit proposed as "bespoke" but which no
# detail component actually paints (verified against bespoke_covered + a source
# grep). Auto-rendering is safer than letting them silently disappear.
#   recurrence_end_date  - feeds recurrence logic but is not rendered as a row
DOWNGRADED_TO_AUTO = {
    "recurrence_end_date",
}
# RENDER_HIDDEN: public-audience fields that must never be a display row —
# internal routing/moderation/workflow flags, raw coordinates that only feed the
# map/directions, and POI-id relations resolved server-side.
RENDER_HIDDEN = {
    "poi_type", "slug", "is_verified", "lat_long_most_accurate",
    "publication_status", "has_been_published", "listing_type",
    "is_sponsor", "sponsor_level",
    "front_door_latitude", "front_door_longitude",
    "trailhead_latitude", "trailhead_longitude",
    "venue_poi_id", "series_id", "organizer_poi_id", "new_event_link",
    # internal display-control toggle (hides exact location on the map); it is a
    # moderation flag, not a user-facing attribute row.
    "dont_display_location",
    # system timestamp — workflow metadata, never a display row (last_updated
    # IS displayed, by PoiHeader — see RENDER_BESPOKE).
    "created_at",
    # what3words is backend-only per spec (#41) — never rendered publicly.
    "what3words_address",
    # Task 2.1: event vendors are rendered by the dedicated EventVendors component
    # (via /pois/{id}/vendors), not the generic auto field-row — hide the flat
    # vendor_poi_links row to avoid a double render.
    "vendor_poi_links",
}
# (9) relation-typed multi/JSONB columns that hold POI-id links.
RELATION_LINK_FIELDS = {
    "service_locations", "locally_found_at", "associated_trails",
    "membership_passes", "organization_memberships", "vendor_poi_links",
    "venue_poi_id", "organizer_poi_id",
}
# (9b) Task 2.1: the six POI-to-POI link fields are now served from the
# poi_relationships edge table, not their (retained) JSONB columns. Their
# registry ``source`` is "edges:<relationship_type>" so the serializer resolves
# linked POIs from edges. Keep in sync with shared/relationship_links.py
# (LINK_FIELDS). ``vendor_poi_links`` is additionally render-hidden (see
# RENDER_HIDDEN) because the app renders event vendors via the dedicated
# ``/pois/{id}/vendors`` endpoint, not the generic auto field-row.
SOURCE_OVERRIDE = {
    "service_locations":        "edges:service_location",
    "locally_found_at":         "edges:locally_found_at",
    "associated_trails":        "edges:associated_trail",
    "membership_passes":        "edges:membership_pass",
    "organization_memberships": "edges:organization_membership",
    "vendor_poi_links":         "edges:vendor",
    # (9c) Task 2.3: the six point-geometry fields are now served from the
    # GIST-indexed poi_points table, not their (retained) JSONB columns. Their
    # source is "points:<kind>" so the serializer reconstructs the original
    # JSONB shape from poi_points rows. Keep in sync with shared/poi_points.py
    # (POINT_FIELDS). The two trail-owned fields (access_points,
    # trailhead_location) remain STRUCTURAL on the wire — surfaced via the
    # nested trail object, which the detail path enriches from poi_points.
    "parking_locations":    "points:parking",
    "toilet_locations":     "points:restroom",
    "playground_locations": "points:playground",
    "payphone_locations":   "points:payphone",
    "access_points":        "points:access_point",
    "trailhead_location":   "points:trailhead",
}
# (10b) explicit registry-type overrides (column SQL type doesn't imply the widget).
TYPE_OVERRIDE = {
    "cell_service": "enum",   # JSONB but a single option (Good/Limited/Unknown/None)
}
# (10) image-backed pseudo-fields (image_type buckets), appended after columns.
IMAGE_FIELDS = [
    ("main_image", "Main Image", "main", ALL_TYPES),
    ("gallery_images", "Gallery Images", "gallery", ALL_TYPES),
    ("entry_images", "Entry Images", "entry", ALL_TYPES),
    ("parking_images", "Parking Images", "parking", ALL_TYPES),
    ("restroom_images", "Restroom Images", "restroom", ALL_TYPES),
    ("rental_images", "Rental Images", "rental", ALL_TYPES),
    ("playground_images", "Playground Images", "playground", ALL_TYPES),
    ("menu_images", "Menu Images", "menu", ["BUSINESS"]),
    ("trail_head_images", "Trailhead Images", "trail_head", ["TRAIL"]),
    ("trail_exit_images", "Trail Exit Images", "trail_exit", ["TRAIL"]),
    ("access_point_images", "Access Point Images", "access_point", ["TRAIL"]),
    ("map_images", "Map Images", "map", OUTDOOR),
    ("downloadable_map_images", "Downloadable Map Images",
     "downloadable_map", OUTDOOR),
]


# --------------------------------------------------------------------------- #
# Humanize a column name -> label
# --------------------------------------------------------------------------- #
def humanize(name: str) -> str:
    if name in LABEL_OVERRIDES:
        return LABEL_OVERRIDES[name]
    words = name.replace("_", " ").split()
    small = {"url", "id", "ada", "qr", "byob", "wifi"}
    out = []
    for w in words:
        if w.lower() == "url":
            out.append("URL")
        elif w.lower() == "id":
            out.append("ID")
        elif w.lower() in small:
            out.append(w.upper())
        else:
            out.append(w.capitalize())
    return " ".join(out)


# --------------------------------------------------------------------------- #
# Build one entry
# --------------------------------------------------------------------------- #
def build_entry(table_key: str, name: str, sql_token: str, decl_index: int) -> dict:
    rtype = map_type(sql_token, name)

    # Type refinements via name heuristics.
    if name in RELATION_LINK_FIELDS:
        rtype = "relation"
    elif name == "featured_image":
        rtype = "image"
    elif rtype == "text":
        low = name.lower()
        if low.endswith("_url") or low.endswith("_link") or low == "website_url":
            rtype = "url"
        elif "email" in low:
            rtype = "email"
        elif low in ("phone_number", "main_contact_phone", "organizer_phone"):
            rtype = "phone"

    # Explicit type overrides where the SQL type doesn't imply the widget.
    # cell_service is JSONB but stores a SINGLE option (Good/Limited/Unknown/None),
    # rendered as a single-select in the admin form — so it's an enum, not multi.
    if name in TYPE_OVERRIDE:
        rtype = TYPE_OVERRIDE[name]

    group = GROUP_BY_FIELD.get(name, "Core Information")
    base_order = GROUP_ORDER.get(group, 999)
    order = base_order * 100 + decl_index

    audience = "public"
    if name in ADMIN_FIELDS or "admin_note" in name or "internal" in name:
        audience = "admin"

    tier = "any"
    if name in PAID_FIELDS:
        tier = "paid"

    computed = name in COMPUTED_FIELDS
    # Task 2.1 edge-sourced link fields and Task 2.3 points-sourced geometry
    # fields take precedence over the default "<table>.<column>" source (they are
    # read from poi_relationships / poi_points, not JSONB).
    source = SOURCE_OVERRIDE.get(name) or COMPUTED_FIELDS.get(name, f"{table_key}.{name}")

    # Render taxonomy (B4): admin fields are always hidden. Otherwise apply the
    # curated RENDER_HIDDEN / RENDER_BESPOKE overrides; default is "auto".
    # DOWNGRADED_TO_AUTO keys are intentionally absent from every bespoke set so
    # they fall through to "auto".
    render = "auto"
    if audience == "admin":
        render = "hidden"
    elif name in RENDER_HIDDEN:
        render = "hidden"
    elif name in BESPOKE_FIELDS or name in RENDER_BESPOKE:
        render = "bespoke"

    deprecated = name in DEPRECATED
    replaced_by = DEPRECATED.get(name) if deprecated else None

    entry = {
        "key": name,
        "label": humanize(name),
        "type": rtype,
        "group": group,
        "order": order,
        "applies_to": applies_to_for(table_key, name),
        "tier": tier,
        "audience": audience,
        "render": render,
        "icon": ICON_BY_FIELD.get(name),
        "value_source": VALUE_SOURCE.get(name),
        "schema_org": SCHEMA_ORG.get(name),
        "source": source,
        "computed": computed,
        "card": name in CARD_FIELDS,
        "deprecated": deprecated,
        "replaced_by": replaced_by,
    }
    return entry


def build_image_entry(key: str, label: str, image_type: str,
                      applies: list[str], order_base: int) -> dict:
    return {
        "key": key,
        "label": label,
        "type": "image[]",
        "group": "Images & Media",
        "order": GROUP_ORDER["Images & Media"] * 100 + order_base,
        "applies_to": list(applies),
        "tier": "any",
        "audience": "public",
        "render": "bespoke",
        "icon": "image",
        "value_source": None,
        "schema_org": "image" if image_type in ("main", "gallery") else None,
        "source": f"images:{image_type}",
        "computed": False,
        "card": image_type == "main",
        "deprecated": False,
        "replaced_by": None,
    }


# --------------------------------------------------------------------------- #
# Synthetic (non-column) fields
# --------------------------------------------------------------------------- #
# Fields with NO backing ORM column, so they are injected rather than reflected.
# Task 2.4: ``length_miles`` is DERIVED from geom_line via ST_Length(geography)
# and attached to the trail object by shared.poi_geometry.enrich_trail_length.
# Sourced from the trail subtype so the serializer/contract surface it under the
# nested ``trail`` object (like length_text), NOT as a flat top-level key.
SYNTHETIC_FIELDS = [
    {
        "key": "length_miles",
        "type": "number",
        "group": "Trail Details",
        "applies_to": ["TRAIL"],
        "tier": "any",
        "audience": "public",
        "render": "bespoke",
        "icon": "ruler",
        "value_source": None,
        "schema_org": None,
        "source": "trail.length_miles",
        "computed": True,
        "card": False,
    },
    {
        # Issues #90/#161. The unified parking read: the POI's own pins
        # (poi_points kind='parking') followed by the SHAREABLE lots it links,
        # every entry the same shape with an "origin" discriminator. Not a
        # column, so it has to be synthetic. The write-side input
        # (parking_lot_links) is admin-only and deliberately NOT a registry
        # field. Carries no PII by construction.
        "key": "parking_lots",
        "type": "list",
        "group": "Parking",
        "applies_to": ["BUSINESS", "SERVICES", "PARK", "TRAIL", "EVENT",
                       "YOUTH_ACTIVITIES", "JOBS", "VOLUNTEER_OPPORTUNITIES",
                       "DISASTER_HUBS"],
        "tier": "any",
        "audience": "public",
        "render": "bespoke",
        "icon": "parking",
        "value_source": None,
        "schema_org": None,
        "source": "lots:parking",
        "computed": True,
        "card": False,
    },
]


def build_synthetic_entry(spec: dict, order_base: int) -> dict:
    group = spec["group"]
    return {
        "key": spec["key"],
        "label": humanize(spec["key"]),
        "type": spec["type"],
        "group": group,
        # Sort AFTER every reflected field in the group (real decl indices are the
        # global column index, < ~300); 900+ keeps synthetics last, deterministically.
        "order": GROUP_ORDER[group] * 100 + 900 + order_base,
        "applies_to": list(spec["applies_to"]),
        "tier": spec["tier"],
        "audience": spec["audience"],
        "render": spec["render"],
        "icon": spec["icon"],
        "value_source": spec["value_source"],
        "schema_org": spec["schema_org"],
        "source": spec["source"],
        "computed": spec["computed"],
        "card": spec["card"],
        "deprecated": False,
        "replaced_by": None,
    }


# --------------------------------------------------------------------------- #
# Assemble registry
# --------------------------------------------------------------------------- #
def build_registry() -> list[dict]:
    cols = reflect_orm()
    reflection_mode = "orm"
    if cols is None:
        cols = reflect_static()
        reflection_mode = "static"
    # Stash for the self-check report (printed by main()).
    build_registry.reflection_mode = reflection_mode  # type: ignore[attr-defined]

    entries: list[dict] = []
    seen: set[str] = set()
    for idx, (table_key, name, sql_token) in enumerate(cols):
        if name in SKIP_COLUMNS:
            continue
        if name in seen:
            continue
        seen.add(name)
        entries.append(build_entry(table_key, name, sql_token, idx))

    # Append image-backed pseudo-fields.
    for i, (key, label, image_type, applies) in enumerate(IMAGE_FIELDS):
        if key in seen:
            continue
        seen.add(key)
        entries.append(build_image_entry(key, label, image_type, applies, i))

    # Append synthetic (non-column) fields (Task 2.4: length_miles).
    for i, spec in enumerate(SYNTHETIC_FIELDS):
        if spec["key"] in seen:
            continue
        seen.add(spec["key"])
        entries.append(build_synthetic_entry(spec, i))

    # Deterministic ordering: by (order, key).
    entries.sort(key=lambda e: (e["order"], e["key"]))
    return entries


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stdout", action="store_true",
                        help="print JSON to stdout instead of writing the file")
    parser.add_argument("--check", action="store_true",
                        help="print JSON, do not write the artifact")
    args = parser.parse_args()

    registry = build_registry()
    payload = json.dumps(registry, indent=2, sort_keys=False) + "\n"

    if args.stdout or args.check:
        sys.stdout.write(payload)
        if args.check:
            return 0

    if not (args.stdout):
        OUTPUT_FILE.write_text(payload)
        FRONTEND_MIRROR.write_text(payload)
        mode = getattr(build_registry, "reflection_mode", "?")
        sys.stderr.write(
            f"wrote {OUTPUT_FILE} and {FRONTEND_MIRROR} "
            f"({len(registry)} entries, reflection={mode})\n"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
