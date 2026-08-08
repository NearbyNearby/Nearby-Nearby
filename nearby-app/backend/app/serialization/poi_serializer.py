"""Registry-driven serializer for public POI responses (phase B3).

The output is built STRICTLY from the shared field registry
(``shared/poi_fields.json`` via :mod:`shared.constants.poi_registry`). For a
given ``poi_type`` we iterate ``public_fields_for(poi_type)`` — which already
filters to ``audience == "public"``, ``poi_type in applies_to`` and
``not deprecated`` — and read each field's value via its declared ``source``.

CRITICAL invariant (the structural PII fix):
    We NEVER iterate ``poi.__table__.columns``. We build the dict only from the
    registry's public field list. Admin-audience fields (``contact_info``,
    ``compliance``, ``admin_notes``, ``main_contact_*``, ``offsite_emergency_contact``,
    ``emergency_protocols``) are excluded by ``public_fields_for`` and therefore
    can NEVER appear in the response, regardless of model columns.

Source dispatch (``entry["source"]``):
    * ``poi.<col>``        -> ``getattr(poi, col, None)``
    * ``<subtype>.<col>``  -> ``sub = getattr(poi, subtype); getattr(sub, col)``
                              where ``subtype`` ∈ {business, park, trail, event}.
                              This is the ``trail.trail_markings`` fix — the field
                              lives on the subtype row, not the POI row.
    * ``computed.<fn>``    -> the underlying stored boolean column, read by the
                              entry ``key`` (``icon_*`` / ``accessible_restroom`` /
                              ``inclusive_playground`` are real boolean columns on
                              the POI model). If no such column exists, ``None``.
    * ``images:<type>``    -> ``[img for img in images if img.type == <type>]``

Tier gating ports ``nearby-app/app/src/utils/poiTier.js`` exactly: a POI is PAID
iff ``is_sponsor is True`` OR ``listing_type`` ∈
{``paid``, ``paid_founding``, ``community_comped``}. Entries with
``tier == "paid"`` are dropped for non-paid POIs.
"""

from __future__ import annotations

from decimal import Decimal
from datetime import datetime, date
from typing import Any, Dict, List, Optional

from shared.constants.poi_registry import public_fields_for, all_entries

# Ported verbatim from nearby-app/app/src/utils/poiTier.js (PAID_LISTING_TYPES).
_PAID_LISTING_TYPES = frozenset({"paid", "paid_founding", "community_comped"})

# Subtype relationship attribute names on the POI model.
_SUBTYPES = frozenset({"business", "park", "trail", "event"})

# Structural keys the serializer / caller attach explicitly (not read via the
# generic source dispatch). ``location`` is registry-listed but rendered bespoke;
# the subtype/category/image keys are nested objects assembled like the legacy
# endpoint.
_STRUCTURAL_KEYS = frozenset(
    {"id", "location", "images", "categories", "main_category", "secondary_categories"}
) | _SUBTYPES


def _poi_type_str(poi) -> str:
    """Return the POI type as a plain string (handles SQLAlchemy enum)."""
    pt = getattr(poi, "poi_type", None)
    return pt.value if hasattr(pt, "value") else pt


def _tier_is_paid(poi) -> bool:
    """Port of ``isPaidTier`` from ``poiTier.js``.

    PAID iff ``is_sponsor is True`` OR ``listing_type`` is one of the paid types.
    Everything else (including ``None``) is FREE.
    """
    if poi is None:
        return False
    if getattr(poi, "is_sponsor", None) is True:
        return True
    return getattr(poi, "listing_type", None) in _PAID_LISTING_TYPES


def _coerce(value: Any) -> Any:
    """Coerce a raw column value to a JSON-friendly form matching POIDetail.

    Mirrors the serialization Pydantic v2 applied to the kept POIDetail keys so
    that JSON output is byte-for-byte unchanged for those keys:
      * ``Decimal`` (Numeric columns)        -> ``float``
      * ``datetime`` / ``date``              -> ISO-8601 string
    Everything else (str, bool, int, float, None, list, dict) passes through.
    JSONB list/dict values are already JSON-native.
    """
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return value


def _serialize_image(img) -> Dict[str, Any]:
    """Serialize one image record to the POIImage-shaped dict.

    Accepts either the dict shape produced by ``get_poi_images`` (keys: id, url,
    thumbnail_url, type, alt_text, caption, width, height) or an ORM Image
    object. Returns the same shape the legacy endpoint emitted.
    """
    if isinstance(img, dict):
        img_type = img.get("type")
        return {
            "id": str(img.get("id")) if img.get("id") is not None else None,
            "url": img.get("url"),
            "thumbnail_url": img.get("thumbnail_url"),
            "type": img_type.value if hasattr(img_type, "value") else img_type,
            "alt_text": img.get("alt_text"),
            "caption": img.get("caption"),
            "width": img.get("width"),
            "height": img.get("height"),
        }
    img_type = getattr(img, "image_type", None)
    return {
        "id": str(getattr(img, "id", None)) if getattr(img, "id", None) is not None else None,
        "url": getattr(img, "storage_url", None) or getattr(img, "url", None),
        "thumbnail_url": getattr(img, "thumbnail_url", None),
        "type": img_type.value if hasattr(img_type, "value") else img_type,
        "alt_text": getattr(img, "alt_text", None),
        "caption": getattr(img, "caption", None),
        "width": getattr(img, "width", None),
        "height": getattr(img, "height", None),
    }


def _image_type_of(img) -> Optional[str]:
    """Return the normalized image type string for a dict-or-ORM image."""
    if isinstance(img, dict):
        t = img.get("type")
    else:
        t = getattr(img, "image_type", None)
    return t.value if hasattr(t, "value") else t


def _read_source(db, poi, entry: Dict[str, Any], images: List[Any]) -> Any:
    """Resolve a single registry entry's value from its declared ``source``.

    ``db`` is accepted for forward-compatibility (e.g. computed fields that need
    a query). The current sources are all attribute / image-list reads and do
    not touch ``db``.
    """
    source = entry.get("source") or ""
    key = entry["key"]

    # images:<type>
    if source.startswith("images:"):
        image_type = source.split(":", 1)[1]
        return [
            _serialize_image(img)
            for img in (images or [])
            if _image_type_of(img) == image_type
        ]

    # edges:<relationship_type> — Task 2.1 POI-to-POI links resolved from the
    # poi_relationships edge table (published targets only), as RelationLink-shaped
    # summaries. Needs ``db``; the card path (db=None) never carries these fields.
    if source.startswith("edges:"):
        if db is None:
            return []
        from shared.relationship_links import read_edges_public
        rel_type = source.split(":", 1)[1]
        return read_edges_public(db, poi.id, rel_type)

    # points:<kind> — Task 2.3 point geometry resolved from the poi_points table,
    # reconstructed in the field's original JSONB shape (the JSONB columns are
    # retained but no longer written). Needs ``db``; every points field is
    # card:false so the card path (db=None) never carries them.
    if source.startswith("points:"):
        if db is None:
            return None
        from shared.poi_points import read_points_by_kind
        kind = source.split(":", 1)[1]
        return read_points_by_kind(db, poi.id, kind)

    # lots:<kind> (issues #90/#161). The unified parking read: the POI's own pins
    # (poi_points kind='parking') followed by the SHAREABLE lots it links, each
    # entry tagged with an ``origin``. Needs ``db``; the field is card:false so
    # the card path (db=None) never carries it.
    if source.startswith("lots:"):
        if db is None:
            return []
        from shared.parking_lots import read_parking_lots
        return read_parking_lots(db, poi.id, audience="public")

    # computed.<fn> — read the stored column by entry key (icon_*,
    # accessible_restroom, inclusive_playground are real boolean columns).
    if source.startswith("computed."):
        return _coerce(getattr(poi, key, None))

    # <subtype>.<col> — business/park/trail/event relationship row.
    head, _, col = source.partition(".")
    if head in _SUBTYPES and col:
        sub = getattr(poi, head, None)
        if sub is None:
            return None
        return _coerce(getattr(sub, col, None))

    # poi.<col>
    if head == "poi" and col:
        return _coerce(getattr(poi, col, None))

    # Unknown / null source — defensively read by key off the POI row.
    return _coerce(getattr(poi, key, None))


def serialize_poi_detail(
    db,
    poi,
    *,
    images: Optional[List[Any]] = None,
    audience: str = "public",
) -> Dict[str, Any]:
    """Serialize a POI to the public detail payload, registry-driven.

    Only ``audience == "public"`` is supported (the registry's public view).
    The ``audience`` parameter is accepted so callers can be explicit and so a
    future admin view can hang off the same signature; anything other than
    ``"public"`` currently behaves identically (public-only) because that is the
    only safe audience to emit from the public API.

    Parameters
    ----------
    db : Session
        Passed through to ``_read_source`` for forward-compatibility.
    poi : PointOfInterest ORM object
    images : list, optional
        Image records (dicts from ``get_poi_images`` or ORM Image rows). Used to
        populate ``images:<type>`` registry fields. The caller still attaches the
        flat ``images`` list separately (see below), matching the legacy schema.

    Returns
    -------
    dict
        The public payload. Built STRICTLY from ``public_fields_for(poi_type)``
        plus the structural keys (``id``, ``location``). The caller attaches the
        flat ``images`` list, ``categories`` / ``main_category`` /
        ``secondary_categories`` and the subtype objects exactly as the legacy
        endpoint does.
    """
    images = images or []
    poi_type = _poi_type_str(poi)
    is_paid = _tier_is_paid(poi)

    out: Dict[str, Any] = {}
    for entry in public_fields_for(poi_type):
        # Server-side tier gate — paid-only fields are dropped for free POIs.
        if entry.get("tier") == "paid" and not is_paid:
            continue
        key = entry["key"]
        # ``location`` and ``id`` are structural; set them once below with the
        # exact shapes the legacy endpoint emits (PointGeometry / str(uuid)).
        if key in ("location", "id"):
            continue
        out[key] = _read_source(db, poi, entry, images)

    # --- Structural keys, emitted exactly as the legacy endpoint does. ---
    out["id"] = str(poi.id)
    out["location"] = _build_location(poi)

    return out


def structural_registry_keys_for(poi_type: str) -> frozenset:
    """Registry keys whose VALUE is surfaced via a structural object, not flat.

    ``serialize_poi_detail`` emits EVERY public registry field as a flat
    top-level key (the parity test depends on this — e.g. ``price_range``,
    ``trail_markings``, ``start_datetime`` must appear in ``keys_added``). But on
    the HTTP detail response those same fields are surfaced nested under their
    subtype object (``business`` / ``park`` / ``trail`` / ``event``) or under the
    image collections — exactly as the legacy endpoint did. The detail endpoint
    therefore STRIPS these keys from the flat registry dict before attaching the
    structural objects, so the wire shape stays identical to legacy.

    Returns the set of registry keys sourced from a subtype table
    (``business.*`` / ``park.*`` / ``trail.*`` / ``event.*``) or from
    ``images:<type>`` for the given ``poi_type``. This mirrors exactly the
    exclusion logic in ``tests/test_poi_field_contract.py::_expected_public_keys``.
    """
    keys = set()
    for entry in public_fields_for(poi_type):
        source = entry.get("source") or ""
        if source.startswith("images:"):
            keys.add(entry["key"])
            continue
        # points:<kind> (Task 2.3): a point field OWNED by a subtype table
        # (access_points / trailhead_location live on trails) is still surfaced
        # via the nested subtype object — the detail path enriches the ORM trail
        # from poi_points — so its flat key is structural. The four POI-owned
        # point fields stay flat, exactly as before.
        if source.startswith("points:"):
            from shared.poi_points import KIND_TO_FIELD, POINT_FIELDS
            field = KIND_TO_FIELD.get(source.split(":", 1)[1])
            if field is not None and POINT_FIELDS[field]["owner"] in _SUBTYPES:
                keys.add(entry["key"])
            continue
        prefix = source.split(".", 1)[0].split(":", 1)[0]
        if prefix in _SUBTYPES:
            keys.add(entry["key"])
    return frozenset(keys)


def _build_location(poi):
    """Build the ``location`` value the same way the legacy endpoint does.

    Returns a ``PointGeometry`` (``{"type": "Point", "coordinates": [lon, lat]}``)
    or ``None``. Imported lazily so this module stays importable without the
    geo stack (the registry-only logic above is dependency-light).
    """
    loc = getattr(poi, "location", None)
    if loc is None:
        return None
    try:
        from ..schemas.poi import PointGeometry  # lazy: avoids geoalchemy2 at import
        return PointGeometry.from_wkb(loc)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Card serialization (POINearbyResult contract)
# ---------------------------------------------------------------------------

# The card/list response (``POINearbyResult``) is a small, fixed contract. The
# registry drives WHICH fields are eligible (card == true, public, applies_to),
# and this whitelist must stay a SUPERSET of every public ``card == true``
# registry field (minus ``DOCUMENTED_CARD_EXCLUSIONS`` below). The drift is
# guarded by ``tests/test_card_schema_drift.py`` — no more silent drops.
_CARD_SCHEMA_KEYS = frozenset(
    {
        "id",
        "name",
        "slug",
        "poi_type",
        "address_city",
        "address_state",
        "address_county",
        "address_street",
        "description_short",
        "location",
        "distance_meters",
        "hours",
        "wifi_options",
        "pet_options",
        "public_toilets",
        "categories",
        "main_category",
        "featured_image",
        # --- Task 1.4: card badges/tier that the registry marks card:true ---
        "listing_type",   # + is_sponsor drive the paid-tier card styling
        "is_sponsor",
        "difficulty",     # trail difficulty badge
        "length_text",    # trail length badge
        "start_datetime",  # event start-date badge
        "icon_free_wifi",  # amenity icons (computed booleans)
        "icon_pet_friendly",
        "icon_public_restroom",
        "icon_wheelchair_accessible",
    }
)

# Registry fields that are ``card == true`` / ``audience == "public"`` but are
# intentionally NOT emitted on the card, each with a one-line reason. The drift
# guard allows exactly these to be absent from ``_CARD_SCHEMA_KEYS``.
DOCUMENTED_CARD_EXCLUSIONS = frozenset(
    {
        # ``main_image`` (the images:main image[] collection) is not a card key.
        # Task 2.5 made the images table the single source of truth for photos, so
        # the card hero now comes from ``featured_image`` DERIVED from the main
        # image via ``shared.poi_media.attach_hero_images`` — one batched query per
        # nearby/card response (no per-result eager-load of the images relation).
        # The card still renders a single hero URL, not the image[] collection.
        "main_image",
    }
)


def serialize_poi_card(poi, *, images: Optional[List[Any]] = None) -> Dict[str, Any]:
    """Serialize a POI to the card / nearby-result payload.

    Emits only registry entries with ``card == true`` AND ``audience == "public"``
    AND ``poi_type in applies_to``, intersected with the keys the
    ``POINearbyResult`` schema actually declares, plus the structural keys
    (``id``, ``location``, featured image) the legacy card response carried.

    ``distance_meters`` is NOT a registry field; the caller attaches it after
    serialization (it is computed per-query). It is listed in the schema-key set
    so callers may set it without it being stripped.
    """
    images = images or []
    poi_type = _poi_type_str(poi)

    out: Dict[str, Any] = {}
    for entry in public_fields_for(poi_type):
        if not entry.get("card"):
            continue
        key = entry["key"]
        if key not in _CARD_SCHEMA_KEYS:
            continue
        if key in ("id", "location"):
            continue
        # images:* entries are not part of the card contract.
        source = entry.get("source") or ""
        if source.startswith("images:"):
            continue
        out[key] = _read_source(None, poi, entry, images)

    # Structural keys for the card.
    out["id"] = poi.id  # POINearbyResult.id is a UUID field (validated)
    out["location"] = _build_location(poi)
    if "featured_image" not in out:
        out["featured_image"] = getattr(poi, "featured_image", None)

    return out
