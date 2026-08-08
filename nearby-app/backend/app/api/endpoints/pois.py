# app/api/endpoints/pois.py
import logging
import os
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import date as date_type, datetime, timezone
import uuid
from slowapi import Limiter
from slowapi.util import get_remote_address
from ... import schemas, crud, models
from ...database import get_db
from ...schemas.poi import PointGeometry
from ...models.image import Image
from ...search import multi_signal_search
from ...serialization.poi_serializer import (
    serialize_poi_detail,
    serialize_poi_card,
    structural_registry_keys_for,
)
from ...serialization.parity import diff_serializers
from shared.utils.hours_resolution import get_effective_hours_for_date

logger = logging.getLogger(__name__)

router = APIRouter()

# Serializer cutover flag (phase B3). Read ONCE at import.
#   legacy   -> the original POIDetail.model_validate(all-columns) path.
#   registry -> registry-driven serialize_poi_detail (public-only; the new default).
#   shadow   -> build BOTH, log the parity diff, RETURN legacy (prod observation).
POI_SERIALIZER = os.getenv("POI_SERIALIZER", "registry").strip().lower()

# Per-IP throttle on the search surface. The semantic + hybrid endpoints run a
# 1GB embedding model on each request, so unbounded query rates / very long
# input strings are an easy DoS. 60/min is enough for normal page-load traffic
# (Home + Nearby + Explore each fire ~1 search per nav).
limiter = Limiter(key_func=get_remote_address)
SEARCH_QUERY_MAX_LEN = 500

# Statuses that are excluded from browse/search results
_EXCLUDED_EVENT_STATUSES = ("Canceled", "Rescheduled")


def _event_is_past(event, cutoff):
    """True when an event is over as of `cutoff`.

    A repeating event is judged by its recurrence, not by the first occurrence:
    a weekly market that started last year is still running unless its
    recurrence_end_date has passed.
    """
    if getattr(event, 'is_repeating', False):
        recurrence_end = getattr(event, 'recurrence_end_date', None)
        return bool(recurrence_end and recurrence_end < cutoff)

    end = getattr(event, 'end_datetime', None)
    start = getattr(event, 'start_datetime', None)
    ref_dt = end if end else start
    return bool(ref_dt and ref_dt < cutoff)


def _exclude_past_and_cancelled_events(pois, include_past=False, include_cancelled=False):
    """Filter a list of POI objects to exclude past and cancelled/rescheduled events.

    Non-event POIs always pass through.

    "Past" is measured from the START OF TODAY (UTC), not the current instant,
    so an event that began this morning is still "happening today" (#127).
    """
    today_start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    result = []
    for poi in pois:
        poi_type = poi.poi_type.value if hasattr(poi.poi_type, 'value') else poi.poi_type
        if poi_type != "EVENT":
            result.append(poi)
            continue

        event = getattr(poi, 'event', None)
        if event is None:
            result.append(poi)
            continue

        # Check cancelled/rescheduled
        if not include_cancelled and getattr(event, 'event_status', None) in _EXCLUDED_EVENT_STATUSES:
            continue

        # Check past
        if not include_past and _event_is_past(event, today_start):
            continue

        result.append(poi)
    return result


def get_poi_images(db: Session, poi_id: uuid.UUID) -> List[dict]:
    """Get all images for a POI, returning only original images (not variants)"""
    # Get original images
    images = db.query(Image).filter(
        Image.poi_id == poi_id,
        Image.parent_image_id.is_(None)  # Only original images, not variants
    ).order_by(Image.display_order).all()

    result = []
    for img in images:
        if not img.storage_url:
            continue

        # Try to find thumbnail variant
        thumbnail_url = None
        thumbnail = db.query(Image).filter(
            Image.parent_image_id == img.id,
            Image.image_size_variant == 'thumbnail'
        ).first()
        if thumbnail and thumbnail.storage_url:
            thumbnail_url = thumbnail.storage_url

        result.append({
            'id': str(img.id),
            'url': img.storage_url,
            'thumbnail_url': thumbnail_url,
            'type': img.image_type.value if hasattr(img.image_type, 'value') else img.image_type,
            'alt_text': img.alt_text,
            'caption': img.caption,
            'width': img.width,
            'height': img.height
        })

    return result


def _apply_event_search_filters(pois, date_from=None, date_to=None, event_status_filter=None):
    """Post-filter search results by event-specific date and status params."""
    if not date_from and not date_to and not event_status_filter:
        return pois

    dt_from = None
    dt_to = None
    if date_from:
        try:
            dt_from = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    if date_to:
        try:
            dt_to = datetime.strptime(date_to, "%Y-%m-%d").replace(
                hour=23, minute=59, second=59, tzinfo=timezone.utc
            )
        except ValueError:
            pass

    result = []
    for poi in pois:
        poi_type = poi.poi_type.value if hasattr(poi.poi_type, 'value') else poi.poi_type
        if poi_type != "EVENT":
            result.append(poi)
            continue

        event = getattr(poi, 'event', None)
        if not event:
            result.append(poi)
            continue

        start = getattr(event, 'start_datetime', None)

        if dt_from and start and start < dt_from:
            continue
        if dt_to and start and start > dt_to:
            continue
        if event_status_filter and getattr(event, 'event_status', None) != event_status_filter:
            continue

        result.append(poi)
    return result


@router.get("/pois/search", response_model=List[schemas.poi.POISearchResult])
@limiter.limit("60/minute")
def api_search_pois(
    request: Request,
    q: str = Query(..., min_length=1, max_length=SEARCH_QUERY_MAX_LEN),
    poi_type: Optional[str] = Query(None, description="Filter by POI type (BUSINESS, PARK, TRAIL, EVENT)"),
    date_from: Optional[str] = Query(None, description="Filter events starting after (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Filter events starting before (YYYY-MM-DD)"),
    event_status: Optional[str] = Query(None, description="Filter by event status"),
    db: Session = Depends(get_db),
):
    """Keyword + multi-signal search for POIs."""
    embedding_client = getattr(request.app.state, 'embedding_client', None)
    results = multi_signal_search(db, query=q, limit=10, poi_type=poi_type, client=embedding_client)
    results = _exclude_past_and_cancelled_events(results)
    return _apply_event_search_filters(results, date_from, date_to, event_status)

@router.get("/pois/semantic-search", response_model=List[schemas.poi.POISearchResult])
@limiter.limit("30/minute")
def api_semantic_search_pois(
    request: Request,
    q: str = Query(..., min_length=1, max_length=SEARCH_QUERY_MAX_LEN, description="Natural language search query"),
    limit: int = Query(10, ge=1, le=50, description="Number of results to return"),
    poi_type: Optional[str] = Query(None, description="Filter by POI type"),
    date_from: Optional[str] = Query(None, description="Filter events starting after (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Filter events starting before (YYYY-MM-DD)"),
    event_status: Optional[str] = Query(None, description="Filter by event status"),
    db: Session = Depends(get_db),
):
    """Semantic search — now routed through the multi-signal engine."""
    embedding_client = getattr(request.app.state, 'embedding_client', None)
    results = multi_signal_search(db, query=q, limit=limit, poi_type=poi_type, client=embedding_client)
    results = _exclude_past_and_cancelled_events(results)
    return _apply_event_search_filters(results, date_from, date_to, event_status)

@router.get("/pois/hybrid-search", response_model=List[schemas.poi.POISearchResult])
@limiter.limit("30/minute")
def api_hybrid_search_pois(
    request: Request,
    q: str = Query(..., min_length=1, max_length=SEARCH_QUERY_MAX_LEN, description="Search query"),
    limit: int = Query(10, ge=1, le=50, description="Number of results to return"),
    poi_type: Optional[str] = Query(None, description="Filter by POI type (BUSINESS, PARK, TRAIL, EVENT)"),
    date_from: Optional[str] = Query(None, description="Filter events starting after (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Filter events starting before (YYYY-MM-DD)"),
    event_status: Optional[str] = Query(None, description="Filter by event status"),
    db: Session = Depends(get_db),
):
    """
    Multi-signal hybrid search combining exact match, trigram, full-text,
    semantic, and structured filter signals.
    """
    embedding_client = getattr(request.app.state, 'embedding_client', None)
    results = multi_signal_search(db, query=q, limit=limit, poi_type=poi_type, client=embedding_client)
    # Search feeds the homepage suggestion dropdown, Explore and the Nearby
    # search box; none of them should surface events that already happened (#127).
    results = _exclude_past_and_cancelled_events(results)
    return _apply_event_search_filters(results, date_from, date_to, event_status)

def _apply_venue_inheritance(db: Session, poi_dict: dict, event) -> dict:
    """If event has venue_poi_id, resolve venue inheritance and merge into poi_dict."""
    if not event or not getattr(event, 'venue_poi_id', None):
        return poi_dict

    venue_poi = crud.crud_poi.get_poi(db, poi_id=str(event.venue_poi_id))
    if not venue_poi:
        return poi_dict

    # Task 2.3: the inheritable parking_locations / toilet_locations now live in
    # poi_points; reconstruct them onto the venue instance (set_committed_value,
    # never dirties) so inheritance reads real data, not the stale JSONB columns.
    from shared.poi_points import enrich_poi_point_fields
    enrich_poi_point_fields(db, venue_poi)

    from shared.utils.venue_inheritance import resolve_venue_inheritance

    venue_data = {
        column.name: getattr(venue_poi, column.name)
        for column in venue_poi.__table__.columns
    }
    event_data = {
        column.name: getattr(poi_dict, column.name)
        if hasattr(poi_dict, column.name)
        else poi_dict.get(column.name)
        for column in venue_poi.__table__.columns
    }

    # Build a simpler dict from poi_dict for the fields we care about
    inheritable_fields = [
        "parking_types", "parking_locations", "parking_notes", "expect_to_pay_parking",
        # public_transit_info removed (Migration A #33 — renamed to _deprecated_public_transit_info)
        "public_toilets", "toilet_locations", "toilet_description",
        # wheelchair_accessible removed (Issue #45 PR2 Migration B — column dropped)
        "wheelchair_details", "hours", "amenities",
        "pet_options", "pet_policy", "drone_usage", "drone_policy",
    ]
    event_fields = {f: poi_dict.get(f) for f in inheritable_fields}
    venue_fields = {f: getattr(venue_poi, f, None) for f in inheritable_fields}

    config = getattr(event, 'venue_inheritance', None)
    resolved = resolve_venue_inheritance(event_fields, venue_fields, config)

    # Merge resolved fields back into poi_dict
    for field in inheritable_fields:
        if field in resolved:
            poi_dict[field] = resolved[field]
    if "_venue_source" in resolved:
        poi_dict["_venue_source"] = resolved["_venue_source"]

    return poi_dict


def _attach_structural_objects(db_poi, poi_dict: dict, images: list) -> dict:
    """Attach the structural objects the detail response always nests.

    Shared by BOTH the legacy and registry assembly paths so the wire shape is
    identical: subtype objects (business/park/trail/event), the flat categories
    list, and the S3 images list. ``main_category`` / ``secondary_categories``
    are read from the instance attributes ``crud_poi.get_poi`` enriched onto the
    POI (see ``_enrich_poi_with_category_info``); when absent they fall to the
    POIDetail schema defaults (None / []), matching legacy behavior.
    """
    poi_dict['business'] = db_poi.business
    poi_dict['park'] = db_poi.park
    poi_dict['trail'] = db_poi.trail
    poi_dict['event'] = db_poi.event
    poi_dict['categories'] = db_poi.categories
    main_cat = db_poi.__dict__.get('main_category')
    if main_cat is not None:
        poi_dict['main_category'] = main_cat
    secondary = db_poi.__dict__.get('secondary_categories')
    if secondary is not None:
        poi_dict['secondary_categories'] = secondary
    poi_dict['images'] = images
    return poi_dict


# Declared top-level fields on POIDetail. Used to prune the legacy all-columns
# dict so the legacy/shadow path NEVER leaks admin/PII columns now that POIDetail
# carries extra="allow" (pre-B3 this pruning was implicit via extra="ignore").
_POI_DETAIL_FIELDS = frozenset(schemas.poi.POIDetail.model_fields.keys())


def _build_legacy_detail_dict(db: Session, db_poi, images: list) -> dict:
    """Legacy assembly: all model columns -> dict, pruned to POIDetail fields.

    Pre-B3 the unknown (admin/PII) columns were dropped by POIDetail's implicit
    ``extra="ignore"``. POIDetail now uses ``extra="allow"`` (so the registry
    path can restore public fields), so we prune EXPLICITLY here to preserve the
    legacy contract — no PII column survives into the legacy/shadow response.
    """
    poi_dict = {
        column.name: getattr(db_poi, column.name)
        for column in db_poi.__table__.columns
        if column.name in _POI_DETAIL_FIELDS
    }
    poi_dict['location'] = PointGeometry.from_wkb(db_poi.location)
    if hasattr(db_poi.poi_type, 'value'):
        poi_dict['poi_type'] = db_poi.poi_type.value
    _attach_structural_objects(db_poi, poi_dict, images)
    poi_dict = _apply_venue_inheritance(db, poi_dict, db_poi.event)
    # Venue inheritance may add the non-schema marker ``_venue_source``; pre-B3
    # it was dropped by extra="ignore". Drop it explicitly so legacy is unchanged.
    poi_dict.pop("_venue_source", None)
    return poi_dict


def _build_registry_detail_dict(db: Session, db_poi, images: list) -> dict:
    """Registry assembly: public-only flat fields + the SAME structural objects.

    ``serialize_poi_detail`` returns a dict built STRICTLY from the public
    registry (never from model columns), so no PII column can appear. It emits
    EVERY public field flat (including subtype- and image-sourced keys, which the
    parity test relies on). For the HTTP response those subtype/image values are
    surfaced via the nested structural objects instead, so we strip their flat
    keys before attaching the structural objects — keeping the wire shape
    identical to legacy + the restored public flat fields.
    """
    poi_type = db_poi.poi_type.value if hasattr(db_poi.poi_type, 'value') else db_poi.poi_type
    poi_dict = serialize_poi_detail(db, db_poi, images=images, audience='public')
    # Drop subtype-sourced and image-sourced flat keys; they are surfaced under
    # the structural subtype objects / images collection attached below.
    for key in structural_registry_keys_for(poi_type):
        poi_dict.pop(key, None)
    _attach_structural_objects(db_poi, poi_dict, images)
    poi_dict = _apply_venue_inheritance(db, poi_dict, db_poi.event)
    return poi_dict


def _serialize_detail_response(db: Session, db_poi, images: list):
    """Return the POI detail payload honoring the POI_SERIALIZER flag.

    * legacy   -> validate the (PII-pruned) all-columns dict through POIDetail and
      let ``response_model`` serialize it (unchanged pre-B3 wire shape).
    * registry -> validate the public-only registry dict through POIDetail
      (``extra="allow"`` keeps the restored public flat fields that POIDetail does
      not declare), then return a ``JSONResponse`` of the JSON dump filtered to the
      TOP-LEVEL keys that were actually provided.
      Returning a Response bypasses ``response_model`` filtering so the extra
      public keys reach the wire. The filtering is the key: POIDetail DECLARES
      ~every POI field, so a plain ``model_dump`` / ``jsonable_encoder`` would emit
      EVERY declared field (as ``None``) regardless of ``poi_type`` — polluting
      the per-type response. We instead keep only ``model.model_fields_set``,
      which in Pydantic v2 (with ``extra="allow"``) is exactly (a) declared fields
      that were provided in the registry dict + (b) all extra (registry) keys, and
      EXCLUDES declared-but-not-provided fields. So the response == the per-type
      public registry keys + structural keys.

      We dump with ``mode="json"`` (so datetimes -> ISO, UUID -> str,
      PointGeometry -> ``{type, coordinates}``, nested subtype / category / image
      sub-schemas serialize exactly as Pydantic would) and then filter at the TOP
      LEVEL only — NOT ``exclude_unset=True``, which would also strip nested model
      DEFAULTS (e.g. ``location.type == "Point"``, which ``PointGeometry.from_wkb``
      leaves at its default), corrupting the structural shape.
    * shadow   -> build BOTH, log the diff at WARNING, RETURN legacy unchanged.
    """
    # Task 2.3: point-geometry fields live in poi_points now; the retained JSONB
    # columns are stale. Reconstruct all six onto the ORM instance (via
    # set_committed_value — never dirties the session) so the nested ``trail``
    # structural object (access_points / trailhead_location — what TrailDetail.jsx
    # renders) and the legacy/shadow flat reads reflect poi_points. The registry
    # path additionally reads the four flat fields via its ``points:`` source.
    from shared.poi_points import enrich_poi_point_fields
    enrich_poi_point_fields(db, db_poi)

    # Task 2.5: featured_image / photos / gallery_photos are derived from the
    # images table (the single source of truth); the retained legacy columns are
    # no longer written. Reconstruct all three onto the ORM instance from the
    # already-loaded ``images`` list (via set_committed_value — never dirties the
    # session) so the registry flat fields and the legacy/shadow reads reflect
    # images, not the stale columns. The frontend hero chain already prefers the
    # images collection; this keeps featured_image (OG/SEO + cards) correct too.
    from shared.poi_media import enrich_poi_media_fields
    enrich_poi_media_fields(db, db_poi, images=images)

    # Task 2.4: derive the trail's length_miles from geom_line (ST_Length over
    # geography) and attach it to the nested trail object. length_text stays the
    # display fallback when no line exists (length_miles is then None). One indexed
    # single-row query; detail path only (no N+1 on list/card responses).
    from shared.poi_geometry import enrich_trail_length
    enrich_trail_length(db, db_poi)

    if POI_SERIALIZER == "legacy":
        legacy_dict = _build_legacy_detail_dict(db, db_poi, images)
        return schemas.poi.POIDetail.model_validate(legacy_dict)

    if POI_SERIALIZER == "shadow":
        legacy_dict = _build_legacy_detail_dict(db, db_poi, images)
        try:
            registry_dict = _build_registry_detail_dict(db, db_poi, images)
            diff = diff_serializers(
                jsonable_encoder(legacy_dict), jsonable_encoder(registry_dict)
            )
            if diff["keys_added"] or diff["keys_removed"] or diff["value_mismatches"]:
                logger.warning(
                    "POI serializer shadow diff poi_id=%s keys_added=%s "
                    "keys_removed=%s value_mismatches=%s",
                    db_poi.id,
                    diff["keys_added"],
                    diff["keys_removed"],
                    [m["key"] for m in diff["value_mismatches"]],
                )
        except Exception:  # observation must never break the response
            logger.exception("POI serializer shadow diff failed poi_id=%s", db_poi.id)
        # Zero behavior change: return the legacy payload.
        return schemas.poi.POIDetail.model_validate(legacy_dict)

    # Default: registry. Validate through POIDetail (extra="allow" keeps the
    # restored public fields) then JSON-encode so datetimes/UUIDs/geometry are
    # serialized identically to the legacy path.
    registry_dict = _build_registry_detail_dict(db, db_poi, images)
    model = schemas.poi.POIDetail.model_validate(registry_dict)
    # Keep only the TOP-LEVEL keys that were actually provided (declared-provided +
    # extra registry keys) so the wire shape is the clean per-type public registry
    # set + structural keys, NOT every POIDetail-declared field as None. Filtering by
    # model_fields_set (rather than exclude_unset=True) preserves nested model
    # defaults like location.type=="Point". See the docstring above for rationale.
    full = model.model_dump(mode="json")
    provided = model.model_fields_set
    content = {key: value for key, value in full.items() if key in provided}
    return JSONResponse(content=content)


@router.get("/pois/counts")
def api_get_poi_counts(db: Session = Depends(get_db)):
    """Return published POI counts by type and by amenity (pet-friendly / icon_wheelchair_accessible)."""
    POI = models.poi.PointOfInterest
    base = db.query(POI).filter(POI.publication_status == 'published')
    by_type = {
        t: base.filter(POI.poi_type == t).count()
        for t in ['BUSINESS', 'PARK', 'TRAIL', 'EVENT']
    }
    return {
        "by_type": by_type,
        "by_amenity": {
            "pet_friendly": base.filter(POI.icon_pet_friendly.is_(True)).count(),
            "wheelchair_accessible": base.filter(POI.icon_wheelchair_accessible.is_(True)).count(),
        },
    }


@router.get("/pois/{poi_id}", response_model=schemas.poi.POIDetail)
def api_get_poi(poi_id: uuid.UUID, db: Session = Depends(get_db)):
    db_poi = crud.crud_poi.get_poi(db, poi_id=str(poi_id))
    if db_poi is None:
        raise HTTPException(status_code=404, detail="Point of Interest not found")

    images = get_poi_images(db, poi_id)
    # Honors the POI_SERIALIZER flag (legacy | registry | shadow). Registry is
    # the default and returns a public-only payload (no PII) via the registry
    # serializer; legacy/shadow preserve the pre-B3 behavior.
    return _serialize_detail_response(db, db_poi, images)

@router.get("/pois/by-slug/{slug}", response_model=schemas.poi.POIDetail)
def api_get_poi_by_slug(slug: str, db: Session = Depends(get_db)):
    """
    Get POI by slug for SEO-friendly URLs
    Example: /api/pois/by-slug/best-coffee-shop-downtown
    """
    db_poi = db.query(models.poi.PointOfInterest).filter(
        models.poi.PointOfInterest.slug == slug,
        models.poi.PointOfInterest.publication_status == 'published'
    ).first()

    if db_poi is None:
        raise HTTPException(status_code=404, detail="Point of Interest not found")

    images = get_poi_images(db, db_poi.id)
    # Same POI_SERIALIZER flag handling as GET /pois/{id} (registry default).
    return _serialize_detail_response(db, db_poi, images)

@router.get("/nearby", response_model=List[schemas.poi.POINearbyResult])
def api_get_nearby_pois(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    include_past_events: bool = Query(False, description="Include past events in results"),
    db: Session = Depends(get_db),
):
    from sqlalchemy import literal_column
    from sqlalchemy.orm import joinedload

    # Use geography type for accurate distance in meters
    distance_expr = literal_column(
        f"ST_Distance(location::geography, ST_MakePoint({longitude}, {latitude})::geography)"
    )

    # Find the 8 nearest published POIs (fetch more to account for filtering)
    nearby_pois_with_distance = db.query(
        models.poi.PointOfInterest,
        distance_expr.label('distance_meters')
    ).options(
        joinedload(models.poi.PointOfInterest.event)
    ).filter(
        models.poi.PointOfInterest.publication_status == 'published'
    ).order_by(
        # Tie-break on id so equidistant POIs keep a stable order and the
        # limit-20 cut is deterministic (#160).
        'distance_meters', models.poi.PointOfInterest.id
    ).limit(20).all()

    # Filter past/cancelled events, then limit to 8
    filtered_pairs = []
    for poi, distance in nearby_pois_with_distance:
        filtered = _exclude_past_and_cancelled_events([poi], include_past=include_past_events)
        if filtered:
            filtered_pairs.append((poi, distance))
    filtered_pairs = filtered_pairs[:8]

    # Task 2.5: the card hero (featured_image) is derived from the images table
    # (single source of truth) in ONE batched query rather than the retained,
    # no-longer-written column. Attach it before serializing the cards.
    from shared.poi_media import attach_hero_images
    attach_hero_images(db, [p for p, _ in filtered_pairs])

    # Format results with distance. Card body is built by the registry-driven
    # serialize_poi_card (public-only); the per-query distance is attached on top.
    results = []
    for poi, distance in filtered_pairs:
        poi_dict = serialize_poi_card(poi)
        poi_dict['distance_meters'] = distance
        results.append(schemas.poi.POINearbyResult.model_validate(poi_dict))

    return results

@router.get("/pois/{poi_id}/effective-hours")
def api_get_effective_hours(
    poi_id: uuid.UUID,
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format (defaults to today)"),
    db: Session = Depends(get_db),
):
    """Get the effective hours for a POI on a specific date, applying override precedence."""
    db_poi = crud.crud_poi.get_poi(db, poi_id=str(poi_id))
    if db_poi is None:
        raise HTTPException(status_code=404, detail="Point of Interest not found")

    if date:
        try:
            target_date = date_type.fromisoformat(date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")
    else:
        target_date = date_type.today()

    hours_data = db_poi.hours
    result = get_effective_hours_for_date(hours_data, target_date)
    return result


@router.get("/pois/{poi_id}/nearby", response_model=List[schemas.poi.POINearbyResult])
def api_get_nearby_pois_by_id(
    poi_id: uuid.UUID,
    radius_miles: float = Query(5.0, description="Search radius in miles"),
    include_past_events: bool = Query(False, description="Include past events in results"),
    facet: Optional[List[str]] = Query(
        None,
        description="Repeatable attribute facet: pet_friendly, restrooms, "
        "wheelchair_accessible, free_wifi, playground, alcohol, kid_friendly",
    ),
    payment: Optional[str] = Query(
        None, description="Filter to POIs accepting this payment method (e.g. Cash)"
    ),
    db: Session = Depends(get_db),
):
    # Facets compose with radius + publication gating in SQL. The search-within-
    # nearby path (SearchBar) intersects hybrid-search results against this
    # already-facet-filtered id set client-side, so facets flow through search
    # without touching the global hybrid-search endpoint.
    nearby_pois = crud.crud_poi.get_nearby_pois(
        db, poi_id=str(poi_id), radius_miles=radius_miles,
        facets=facet, payment=payment,
    )
    nearby_pois = _exclude_past_and_cancelled_events(nearby_pois, include_past=include_past_events)

    # Task 2.5: attach the card hero (featured_image) from the images table in one
    # batched query (the retained column is no longer written).
    from shared.poi_media import attach_hero_images
    attach_hero_images(db, list(nearby_pois))

    # Convert location data for each POI. Card body is built by the registry-driven
    # serialize_poi_card (public-only); the per-query distance and the {id,name,slug}
    # categories list this endpoint surfaces are attached on top.
    results = []
    for poi in nearby_pois:
        # Get categories for this POI (id/name/slug shape used by the cards)
        categories_data = []
        if hasattr(poi, 'categories') and poi.categories:
            for cat in poi.categories:
                categories_data.append({
                    'id': str(cat.id),
                    'name': cat.name,
                    'slug': cat.slug
                })

        poi_dict = serialize_poi_card(poi)
        poi_dict['distance_meters'] = poi.distance_meters
        poi_dict['categories'] = categories_data
        results.append(schemas.poi.POINearbyResult.model_validate(poi_dict))

    return results

@router.get("/categories")
def api_get_categories(db: Session = Depends(get_db)):
    """Get all active categories with POI counts"""
    # Get all active main categories (parent categories only)
    categories = db.query(models.poi.Category).filter(
        models.poi.Category.is_active == True,
        models.poi.Category.parent_id == None
    ).order_by(models.poi.Category.sort_order, models.poi.Category.name).all()

    result = []
    for cat in categories:
        # Count published POIs for this category
        poi_count = db.query(models.poi.PointOfInterest).join(
            models.poi.poi_category_association
        ).filter(
            models.poi.poi_category_association.c.category_id == cat.id,
            models.poi.PointOfInterest.publication_status == 'published'
        ).count()

        category_data = {
            'id': str(cat.id),
            'name': cat.name,
            'slug': cat.slug,
            'poi_count': poi_count,
            'is_main_category': cat.parent_id is None,
            'sort_order': cat.sort_order
        }
        result.append(category_data)

    return result

@router.get("/pois/by-category/{category_slug}")
def api_get_pois_by_category(
    category_slug: str,
    include_past_events: bool = Query(False, description="Include past events in results"),
    db: Session = Depends(get_db),
):
    """Get all POIs for a specific category"""
    # Find the category by slug
    category = db.query(models.poi.Category).filter(
        models.poi.Category.slug == category_slug,
        models.poi.Category.is_active == True
    ).first()

    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    # Get all published POIs for this category
    from sqlalchemy.orm import joinedload
    pois = db.query(models.poi.PointOfInterest).options(
        joinedload(models.poi.PointOfInterest.event)
    ).join(
        models.poi.poi_category_association
    ).filter(
        models.poi.poi_category_association.c.category_id == category.id,
        models.poi.PointOfInterest.publication_status == 'published'
    ).all()

    # Filter past/cancelled events
    pois = _exclude_past_and_cancelled_events(pois, include_past=include_past_events)

    # Format results
    results = []
    for poi in pois:
        poi_dict = {
            'id': poi.id,
            'name': poi.name,
            'poi_type': poi.poi_type.value if hasattr(poi.poi_type, 'value') else poi.poi_type,
            'address_city': poi.address_city,
            'address_street': poi.address_street,
            'description_short': poi.description_short,
            'location': PointGeometry.from_wkb(poi.location) if poi.location else None,
            'hours': poi.hours,
            # wheelchair_accessible removed (Issue #45 PR2 Migration B — column dropped)
        }

        # Add event-specific data if it's an event
        if poi.event:
            poi_dict['event'] = {
                'start_datetime': poi.event.start_datetime.isoformat() if poi.event.start_datetime else None,
                'end_datetime': poi.event.end_datetime.isoformat() if poi.event.end_datetime else None,
                'is_repeating': poi.event.is_repeating,
                'event_status': poi.event.event_status,
                'organizer_name': poi.event.organizer_name,
                'venue_poi_id': str(poi.event.venue_poi_id) if poi.event.venue_poi_id else None,
                'cost_type': poi.event.cost_type,
            }

        results.append(poi_dict)

    return {
        'category': {
            'id': str(category.id),
            'name': category.name,
            'slug': category.slug
        },
        'pois': results
    }

@router.get("/pois/by-type/{poi_type}")
def api_get_pois_by_type(
    poi_type: str,
    include_past_events: bool = Query(False, description="Include past events in results"),
    db: Session = Depends(get_db),
):
    """Get all POIs for a specific type (BUSINESS, PARK, TRAIL, EVENT)"""
    # Validate poi_type
    valid_types = ['BUSINESS', 'PARK', 'TRAIL', 'EVENT']
    if poi_type.upper() not in valid_types:
        raise HTTPException(status_code=400, detail="Invalid POI type")

    # Get all published POIs for this type
    from sqlalchemy.orm import joinedload
    pois = db.query(models.poi.PointOfInterest).options(
        joinedload(models.poi.PointOfInterest.event)
    ).filter(
        models.poi.PointOfInterest.poi_type == poi_type.upper(),
        models.poi.PointOfInterest.publication_status == 'published'
    ).all()

    # Filter past/cancelled events
    pois = _exclude_past_and_cancelled_events(pois, include_past=include_past_events)

    # Format results
    results = []
    for poi in pois:
        # Categories — list[{id,name,slug}] for client-side category-name rendering on cards.
        categories_data = []
        if hasattr(poi, 'categories') and poi.categories:
            for cat in poi.categories:
                categories_data.append({
                    'id': str(cat.id),
                    'name': cat.name,
                    'slug': cat.slug,
                })

        poi_dict = {
            'id': str(poi.id),
            'name': poi.name,
            'slug': poi.slug,
            'poi_type': poi.poi_type.value if hasattr(poi.poi_type, 'value') else poi.poi_type,
            'address_city': poi.address_city,
            'address_state': poi.address_state,
            'address_county': poi.address_county,
            'address_street': poi.address_street,
            'description_short': poi.description_short,
            'location': PointGeometry.from_wkb(poi.location) if poi.location else None,
            'hours': poi.hours,
            'pet_options': poi.pet_options,
            'wifi_options': poi.wifi_options,
            # wheelchair_accessible removed (Issue #45 PR2 Migration B — column dropped)
            'public_toilets': poi.public_toilets,
            'categories': categories_data,
        }
        results.append(poi_dict)

    return results


@router.get("/events/in-range")
def api_get_events_in_range(
    date_from: str = Query(..., description="Start date (YYYY-MM-DD)"),
    date_to: str = Query(..., description="End date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
):
    """Get all events (including expanded recurring instances) within a date range."""
    from shared.utils.recurring_events import expand_recurring_dates
    from sqlalchemy.orm import joinedload

    try:
        dt_from = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        dt_to = datetime.strptime(date_to, "%Y-%m-%d").replace(
            hour=23, minute=59, second=59, tzinfo=timezone.utc
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    # Query all published, non-cancelled EVENT POIs
    pois = db.query(models.poi.PointOfInterest).options(
        joinedload(models.poi.PointOfInterest.event)
    ).filter(
        models.poi.PointOfInterest.poi_type == "EVENT",
        models.poi.PointOfInterest.publication_status == "published",
    ).all()

    # Filter cancelled/rescheduled
    pois = _exclude_past_and_cancelled_events(pois, include_past=True)

    results = []
    for poi in pois:
        event = poi.event
        if not event:
            continue

        if event.is_repeating and event.repeat_pattern:
            dates = expand_recurring_dates(
                start_datetime=event.start_datetime,
                repeat_pattern=event.repeat_pattern,
                date_from=dt_from,
                date_to=dt_to,
                excluded_dates=event.excluded_dates,
                manual_dates=event.manual_dates,
                recurrence_end_date=event.recurrence_end_date,
            )
        else:
            # Non-repeating: check if start_datetime is in range
            if dt_from <= event.start_datetime <= dt_to:
                dates = [event.start_datetime]
            else:
                dates = []

        for occurrence_dt in dates:
            results.append({
                "id": str(poi.id),
                "name": poi.name,
                "slug": poi.slug,
                "occurrence_datetime": occurrence_dt.isoformat(),
                "address_city": poi.address_city,
                "event_status": event.event_status,
            })

    # Sort by occurrence datetime
    results.sort(key=lambda r: r["occurrence_datetime"])
    return results


@router.get("/pois/{poi_id}/vendors")
def get_event_vendors(
    poi_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Resolve event vendor links to published POI summaries.

    Task 2.1: vendor links now live in the ``poi_relationships`` edge table
    (relationship_type ``vendor``, source = the event POI); the per-vendor
    ``vendor_type`` is carried in the edge's ``meta``. The response shape is
    unchanged from the legacy vendor_poi_links JSONB path.
    """
    poi = db.query(models.poi.PointOfInterest).filter(
        models.poi.PointOfInterest.id == poi_id,
        models.poi.PointOfInterest.publication_status == "published",
    ).first()
    if not poi:
        raise HTTPException(status_code=404, detail="POI not found")

    edges = db.query(models.poi.POIRelationship).filter(
        models.poi.POIRelationship.source_poi_id == poi.id,
        models.poi.POIRelationship.relationship_type == "vendor",
    ).all()
    if not edges:
        return []

    target_ids = [e.target_poi_id for e in edges]
    vendor_pois = db.query(models.poi.PointOfInterest).filter(
        models.poi.PointOfInterest.id.in_(target_ids),
        models.poi.PointOfInterest.publication_status == "published",
    ).all()
    # Task 2.5: vendor thumbnails read featured_image, now derived from images.
    from shared.poi_media import attach_hero_images
    attach_hero_images(db, vendor_pois)
    vendor_map = {vp.id: vp for vp in vendor_pois}

    results = []
    for edge in edges:
        vp = vendor_map.get(edge.target_poi_id)
        if not vp:
            continue
        poi_type = vp.poi_type.value if hasattr(vp.poi_type, 'value') else vp.poi_type
        meta = edge.meta or {}
        results.append({
            "id": str(vp.id),
            "name": vp.name,
            "slug": vp.slug,
            "poi_type": poi_type,
            "address_city": vp.address_city,
            "featured_image": vp.featured_image,
            "vendor_type": meta.get("vendor_type"),
        })

    return results


@router.get("/pois/{poi_id}/sponsors")
def get_event_sponsors(
    poi_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Resolve sponsors JSONB — linked POIs get enriched, manual entries pass through."""
    from sqlalchemy.orm import joinedload

    poi = db.query(models.poi.PointOfInterest).options(
        joinedload(models.poi.PointOfInterest.event)
    ).filter(
        models.poi.PointOfInterest.id == poi_id,
        models.poi.PointOfInterest.publication_status == "published",
    ).first()
    if not poi:
        raise HTTPException(status_code=404, detail="POI not found")

    event = poi.event
    if not event:
        return []

    sponsors = event.sponsors
    if not sponsors or not isinstance(sponsors, list):
        return []

    # Collect POI IDs from linked sponsors
    linked_ids = [
        s["poi_id"] for s in sponsors
        if isinstance(s, dict) and s.get("poi_id")
    ]

    # Batch-fetch linked sponsor POIs
    sponsor_map = {}
    if linked_ids:
        sponsor_pois = db.query(models.poi.PointOfInterest).filter(
            models.poi.PointOfInterest.id.in_(linked_ids),
            models.poi.PointOfInterest.publication_status == "published",
        ).all()
        # Task 2.5: sponsor thumbnails read featured_image, now derived from images.
        from shared.poi_media import attach_hero_images
        attach_hero_images(db, sponsor_pois)
        sponsor_map = {str(sp.id): sp for sp in sponsor_pois}

    results = []
    for entry in sponsors:
        if not isinstance(entry, dict):
            continue

        if entry.get("poi_id"):
            # Linked sponsor — resolve from DB
            sp = sponsor_map.get(entry["poi_id"])
            if not sp:
                continue
            poi_type = sp.poi_type.value if hasattr(sp.poi_type, 'value') else sp.poi_type
            results.append({
                "poi_id": str(sp.id),
                "name": sp.name,
                "slug": sp.slug,
                "poi_type": poi_type,
                "address_city": sp.address_city,
                "featured_image": sp.featured_image,
                "tier": entry.get("tier"),
            })
        else:
            # Manual sponsor — pass through
            results.append({
                "name": entry.get("name", ""),
                "tier": entry.get("tier"),
                "website": entry.get("website"),
                "logo_url": entry.get("logo_url"),
            })

    return results