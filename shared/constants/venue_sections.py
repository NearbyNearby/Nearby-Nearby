"""Single source of truth for event venue inheritance sections (issue #124).

An event linked to a venue POI can inherit data section by section. This module
owns the ONE mapping from a section key to the POI columns that section covers.
Every consumer derives from it:

  * ``shared/utils/venue_inheritance.py`` (read-time resolution)
  * ``nearby-app`` detail endpoint (the flat list of inheritable fields)
  * ``nearby-admin`` GET /pois/{id}/venue-data (the copyable payload)
  * ``nearby-admin`` frontend ``VENUE_INHERITANCE_SECTIONS`` (mirrored by hand,
    keyed to the EventLayout accordion values)

Section keys match the admin EventLayout accordions so a mode control can live
inside each panel:
  address -> s8, parking -> s9, accessibility -> s10, restrooms -> s11,
  playground -> s12, amenities -> s13, pet_policy -> s14,
  alcohol_smoking -> s15, contact -> s19.

HOURS IS DELIBERATELY ABSENT. Per issue #124 an event's hours are its own; a
venue's opening hours are not the event's schedule. Existing prod rows carrying
{"hours": "..."} become inert on their own because the resolver skips unknown
sections, so no data migration is needed.
"""

# Section key -> POI columns the section inherits.
# Ordered as they appear in the admin Event form.
SECTION_FIELDS = {
    "address": [
        "address_full",
        "address_street",
        "address_city",
        "address_state",
        "address_zip",
        "address_county",
        "location",
        "front_door_latitude",
        "front_door_longitude",
        "what3words_address",
        "arrival_methods",
    ],
    "parking": [
        "parking_types",
        "parking_locations",
        "parking_notes",
        "expect_to_pay_parking",
        "accessible_parking_details",
    ],
    "accessibility": [
        "wheelchair_details",
        "mobility_access",
    ],
    "restrooms": [
        "public_toilets",
        "toilet_locations",
        "toilet_description",
        "accessible_restroom",
        "accessible_restroom_details",
    ],
    "playground": [
        "playground_available",
        "playground_types",
        "playground_surface_types",
        "playground_notes",
        "playground_locations",
        "playground_age_groups",
        "playground_ada_checklist",
        "inclusive_playground",
    ],
    "amenities": [
        "amenities",
        "payment_methods",
        "cell_service",
        "payphone_locations",
    ],
    "pet_policy": [
        "pet_options",
        "pet_policy",
    ],
    "alcohol_smoking": [
        "alcohol_available",
        "alcohol_availability",
        "alcohol_options",
        "alcohol_policy_details",
        "alcohol_notes",
        "byob_allowed",
        "smoking_options",
        "smoking_details",
    ],
    "contact": [
        "phone_number",
        "email",
        "website_url",
    ],
    # Not surfaced in the event form (Wave 4 #59 decision) but kept resolvable
    # so events already configured with it keep working.
    "drone_policy": [
        "drone_usage",
        "drone_policy",
    ],
}

# Sections that get a mode control in the admin Event form, in form order.
UI_SECTIONS = [
    "address",
    "parking",
    "accessibility",
    "restrooms",
    "playground",
    "amenities",
    "pet_policy",
    "alcohol_smoking",
    "contact",
]

# Flat union of every inheritable column, de-duplicated, order preserved.
INHERITABLE_FIELDS = list(
    dict.fromkeys(field for fields in SECTION_FIELDS.values() for field in fields)
)

# Entry notes live in a per-POI-type place on the venue and always land in the
# event's own ``event_entry_notes``. Part of the address section.
# Business and park keep them on points_of_interest; trail and event keep them
# on their subtype table, hence the (relationship, column) pairs.
ENTRY_NOTES_SOURCE_BY_TYPE = {
    "BUSINESS": (None, "business_entry_notes"),
    "PARK": (None, "park_entry_notes"),
    "TRAIL": ("trail", "trail_entry_notes"),
    "EVENT": ("event", "event_entry_notes"),
}


def venue_entry_notes(venue):
    """Return a venue POI's entry notes, wherever its type keeps them."""
    poi_type = getattr(venue, "poi_type", None)
    poi_type = poi_type.value if hasattr(poi_type, "value") else str(poi_type or "")
    source = ENTRY_NOTES_SOURCE_BY_TYPE.get(poi_type)
    if source is None:
        return None
    relationship, column = source
    owner = venue if relationship is None else getattr(venue, relationship, None)
    return getattr(owner, column, None) if owner is not None else None
