# app/search/constants.py
"""Tunable weights, pattern dictionaries, and configuration for the search engine."""

# --- Signal weights (must sum to 1.0) ---
SIGNAL_WEIGHTS = {
    "semantic": 0.45,
    "keyword_name": 0.15,
    "fulltext": 0.10,
    "exact_name": 0.15,
    "structured_filter": 0.10,
    "type_city_boost": 0.05,
}

# Minimum absolute score to keep a result
# Low enough to allow single-signal matches (e.g. fulltext-only = 0.10 max)
MIN_ABSOLUTE_SCORE = 0.02

# Results below this fraction of the top score are dropped
RELATIVE_SCORE_THRESHOLD = 0.20

# pg_trgm similarity threshold for name matching
TRIGRAM_SIMILARITY_THRESHOLD = 0.15

# Minimum raw cosine similarity for a pgvector neighbour to count as a match
# at all (Issue #140). Without it the nearest-neighbour query returns its LIMIT
# worth of rows no matter how bad they are, so a type-filtered search behaved
# like a full type listing. EmbeddingGemma (with the query/document prompt
# prefixes the shared client applies) puts unrelated pairs in roughly the
# 0.20-0.45 band and topically related pairs above ~0.55, so 0.45 sits in the
# trough. This is THE knob to turn if semantic recall ever feels too tight:
# lower it toward 0.35 for more recall, raise it toward 0.55 for more precision.
SEMANTIC_SIMILARITY_THRESHOLD = 0.45

# --- Amenity phrases that are really filters, not text (Issue #137) ---
# A query that IS one of these phrases (case-, hyphen- and punctuation-
# insensitive, see amenity_flag_column()) filters on the matching computed
# boolean instead of hoping text similarity lands on pet-friendly places.
# The icon_* columns are computed on every admin write from the underlying
# option lists (compute_icon_booleans), and are the same source the /pois/counts
# facets and the Nearby facet filters use.
AMENITY_FLAG_PHRASES = {
    "pet friendly": "icon_pet_friendly",
    "pets allowed": "icon_pet_friendly",
    "dog friendly": "icon_pet_friendly",
    "dogs allowed": "icon_pet_friendly",
    "wheelchair": "icon_wheelchair_accessible",
    "wheelchair accessible": "icon_wheelchair_accessible",
    "wheelchair access": "icon_wheelchair_accessible",
    "wifi": "icon_free_wifi",
    "wi fi": "icon_free_wifi",
    "free wifi": "icon_free_wifi",
    "free wi fi": "icon_free_wifi",
    "public wifi": "icon_free_wifi",
    "restroom": "icon_public_restroom",
    "restrooms": "icon_public_restroom",
    "public restroom": "icon_public_restroom",
    "public restrooms": "icon_public_restroom",
    "bathroom": "icon_public_restroom",
    "bathrooms": "icon_public_restroom",
}

# --- POI type synonyms ---
# Maps query words to POIType enum values
POI_TYPE_SYNONYMS = {
    # BUSINESS
    "restaurant": "BUSINESS",
    "restaurants": "BUSINESS",
    "cafe": "BUSINESS",
    "cafes": "BUSINESS",
    "coffee": "BUSINESS",
    "shop": "BUSINESS",
    "shops": "BUSINESS",
    "store": "BUSINESS",
    "stores": "BUSINESS",
    "business": "BUSINESS",
    "businesses": "BUSINESS",
    "bar": "BUSINESS",
    "bars": "BUSINESS",
    "brewery": "BUSINESS",
    "bakery": "BUSINESS",
    "salon": "BUSINESS",
    "spa": "BUSINESS",
    "gym": "BUSINESS",
    "hotel": "BUSINESS",
    "motel": "BUSINESS",
    "inn": "BUSINESS",
    "diner": "BUSINESS",
    "food": "BUSINESS",
    "eat": "BUSINESS",
    "dining": "BUSINESS",
    "lunch": "BUSINESS",
    "dinner": "BUSINESS",
    "breakfast": "BUSINESS",
    "brunch": "BUSINESS",
    # PARK
    "park": "PARK",
    "parks": "PARK",
    "playground": "PARK",
    "garden": "PARK",
    "gardens": "PARK",
    "lake": "PARK",
    "reservoir": "PARK",
    "recreation": "PARK",
    "picnic": "PARK",
    # TRAIL
    "trail": "TRAIL",
    "trails": "TRAIL",
    "hiking": "TRAIL",
    "hike": "TRAIL",
    "hikes": "TRAIL",
    "walk": "TRAIL",
    "walking": "TRAIL",
    "biking": "TRAIL",
    "path": "TRAIL",
    "paths": "TRAIL",
    "greenway": "TRAIL",
    # EVENT
    "event": "EVENT",
    "events": "EVENT",
    "festival": "EVENT",
    "concert": "EVENT",
    "show": "EVENT",
    "market": "EVENT",
    "fair": "EVENT",
    "workshop": "EVENT",
    "class": "EVENT",
    "meetup": "EVENT",
}

# --- Trail difficulty synonyms ---
TRAIL_DIFFICULTY_SYNONYMS = {
    "easy": ["easy", "beginner"],
    "moderate": ["moderate", "intermediate"],
    "hard": ["hard", "difficult", "strenuous", "challenging"],
}

# --- Amenity filter patterns ---
# Maps query phrases to (database_field, matching_values) pairs.
# This is the static fallback; at startup, build_amenity_patterns() generates
# a richer version from shared/constants/field_options.py.
AMENITY_PATTERNS_STATIC = {
    "pet friendly": ("pet_options", ["Allowed", "Any Well Behaved Pet", "Dogs Allowed", "Cats Allowed"]),
    "dog friendly": ("pet_options", ["Allowed", "Any Well Behaved Pet", "Dogs Allowed"]),
    "cat friendly": ("pet_options", ["Allowed", "Any Well Behaved Pet", "Cats Allowed"]),
    "off leash": ("pet_options", ["Off Leash"]),
    "wifi": ("wifi_options", ["Free Public Wifi", "Paid Public Wifi"]),
    "free wifi": ("wifi_options", ["Free Public Wifi"]),
    # "wheelchair" / "wheelchair accessible" patterns removed — wheelchair_accessible column dropped (Issue #45 PR2)
    "restroom": ("public_toilets", ["Yes", "Family", "Baby Changing Station"]),
    "restrooms": ("public_toilets", ["Yes", "Family", "Baby Changing Station"]),
    "bathroom": ("public_toilets", ["Yes", "Family", "Baby Changing Station"]),
    "live music": ("entertainment_options", ["Live Music"]),
    "karaoke": ("entertainment_options", ["Karaoke"]),
    "outdoor seating": ("business_amenities", ["Outdoor Seating", "Covered Outdoor Seating", "Heated Outdoor Seating", "Cooled Outdoor Seating"]),
    "indoor seating": ("business_amenities", ["Indoor Seating"]),
    "catering": ("business_amenities", ["Catering"]),
    "takeout": ("business_amenities", ["Takeout"]),
    "delivery": ("business_amenities", ["Local Delivery"]),
    "drive through": ("business_amenities", ["Drive Through"]),
    "reservations": ("business_amenities", ["Takes Reservations"]),
    "walk ins": ("business_amenities", ["Walk Ins Welcome"]),
    "private events": ("business_amenities", ["Private Events"]),
    "byob": ("alcohol_options", ["BYOB"]),
    "happy hour": ("alcohol_options", ["Good For Happy Hour", "Happy Hour Specials"]),
    "full bar": ("alcohol_options", ["Full Bar"]),
    "camping": ("camping_lodging", None),  # text field, just check non-empty
    "playground": ("playground_available", [True]),
    "fishing": ("fishing_allowed", ["Yes"]),
    "hunting": ("hunting_fishing_allowed", ["Yes"]),
    "free parking": ("parking_types", ["Free Parking"]),
    "free admission": ("cost", ["Free", "free"]),
    "free": ("cost", ["Free", "free"]),
    "boat ramp": ("facilities_options", ["Boat Ramp or Launch"]),
    "boat launch": ("facilities_options", ["Boat Ramp or Launch"]),
    "picnic area": ("facilities_options", ["Picnic Area - Uncovered", "Picnic Area - Covered"]),
    "grill": ("facilities_options", ["Grill"]),
    "fire pit": ("facilities_options", ["Fire Pit"]),
    "amphitheater": ("facilities_options", ["Amphitheater"]),
}


def build_amenity_patterns():
    """
    Build amenity filter patterns dynamically from shared/constants/field_options.py.
    Falls back to static patterns if import fails.
    """
    patterns = dict(AMENITY_PATTERNS_STATIC)

    try:
        from shared.constants import field_options

        # Map field_options lists to database columns
        option_mappings = {
            "pet_options": field_options.PET_OPTIONS,
            "wifi_options": field_options.WIFI_OPTIONS,
            "business_amenities": field_options.BUSINESS_AMENITIES,
            "entertainment_options": field_options.ENTERTAINMENT_OPTIONS,
            "youth_amenities": field_options.YOUTH_AMENITIES,
            "parking_types": field_options.PARKING_OPTIONS,
            "alcohol_options": field_options.ALCOHOL_OPTIONS,
            "public_toilets": field_options.PUBLIC_TOILET_OPTIONS,
            "facilities_options": field_options.PARK_FACILITIES,
        }

        # For each option value, create a lowercased lookup pattern
        for db_field, options in option_mappings.items():
            for opt in options:
                opt_lower = opt.lower()
                # Skip very short or generic options like "Yes", "No", "Other"
                if len(opt_lower) <= 3 or opt_lower in ("yes", "no", "other", "none of the above"):
                    continue
                # Don't overwrite manually-curated patterns
                if opt_lower not in patterns:
                    patterns[opt_lower] = (db_field, [opt])

    except ImportError:
        pass

    return patterns


# Location pattern prefix/suffix words
LOCATION_PREFIXES = {"near", "in", "around", "by"}
