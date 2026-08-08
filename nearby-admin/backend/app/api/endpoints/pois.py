from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime
import uuid

# The __init__.py files now allow these cleaner imports
from app import crud, schemas, models
from app.database import get_db
from app.core.security import get_current_user
from app.core.permissions import require_admin_or_editor
from app.utils.autosave_whitelist import AUTOSAVE_ALLOWED_FIELDS, AUTOSAVE_DENIED_FIELDS
from app.utils.poi_revision import record_poi_revision
from app.crud.crud_poi import apply_phase1_computed
from app.schemas._coercers import coerce_empty_literals

router = APIRouter()


def _enrich_link_fields(db: Session, poi):
    """Task 2.1: reconstruct the six POI-to-POI link fields from
    poi_relationships edges onto the ORM instance so the admin response serializes
    them from edges (they are no longer stored in JSONB). In-memory only — never
    committed (get_db does not commit; any autoflush is rolled back on close)."""
    if poi is None:
        return poi
    from shared.relationship_links import LINK_FIELDS, read_link_field_admin
    for field, info in LINK_FIELDS.items():
        value = read_link_field_admin(db, poi.id, field)
        if info["owner"] == "event":
            if getattr(poi, "event", None) is not None:
                poi.event.vendor_poi_links = value
        else:
            setattr(poi, field, value)
    return poi


def _enrich_response_fields(db: Session, poi):
    """Enrich an admin POI response: Task 2.1 link fields (from edges), Task 2.3
    point fields (from poi_points), Task 2.5 media fields (featured_image /
    photos / gallery_photos derived from the images table), and the #90/#161
    parking fields (parking_lot_links from the edges, plus the unified
    parking_lots array), none of which dirty the instance."""
    if poi is None:
        return poi
    from shared.poi_points import enrich_poi_point_fields
    from shared.poi_media import enrich_poi_media_fields
    from shared.parking_lots import enrich_poi_parking
    return enrich_poi_parking(
        db,
        enrich_poi_media_fields(db, enrich_poi_point_fields(db, _enrich_link_fields(db, poi))),
        audience="admin",
    )


@router.post("/pois/", response_model=schemas.PointOfInterest, status_code=201)
def create_poi(
    poi: schemas.PointOfInterestCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin_or_editor())
):
    if poi.poi_type == 'BUSINESS' and poi.business is None:
        raise HTTPException(status_code=400, detail="Business data required for poi_type 'BUSINESS'")
    if poi.poi_type == 'PARK' and poi.park is None:
        raise HTTPException(status_code=400, detail="Park data required for poi_type 'PARK'")
    if poi.poi_type == 'TRAIL' and poi.trail is None:
        raise HTTPException(status_code=400, detail="Trail data required for poi_type 'TRAIL'")
    if poi.poi_type == 'EVENT' and poi.event is None:
        raise HTTPException(status_code=400, detail="Event data required for poi_type 'EVENT'")

    result = crud.create_poi(db=db, poi=poi, user_id=getattr(current_user, 'id', None))
    return _enrich_response_fields(db, result)


def _coerce_poi_types(poi_type: Optional[List[str]]):
    """
    Coerce raw poi_type query strings (e.g. ["BUSINESS"]) into POIType enum
    members for the SQLAlchemy filter. Unknown values are ignored so a bad
    param degrades to "no type filter" instead of a 500. Returns None when
    nothing valid was supplied (preserves the unfiltered default behavior).
    """
    if not poi_type:
        return None
    from app.models.poi import POIType
    resolved = []
    for raw in poi_type:
        try:
            resolved.append(POIType(raw))
        except (ValueError, KeyError):
            continue
    return resolved or None


@router.get("/pois/", response_model=List[schemas.PointOfInterest])
def read_pois(
    skip: int = 0,
    limit: int = 100,
    search: str = Query(None, description="Search query for POI names"),
    poi_type: Optional[List[str]] = Query(None, description="Restrict results to one or more POI types (e.g. BUSINESS)"),
    db: Session = Depends(get_db),
    current_user: Optional[str] = Depends(lambda: None)  # Try to get current user but don't require it
):
    # Public view - only show published POIs
    poi_types = _coerce_poi_types(poi_type)
    if search:
        return crud.search_pois(db=db, query_str=search, include_drafts=False, poi_types=poi_types)
    pois = crud.get_pois(db, skip=skip, limit=limit, include_drafts=False, poi_types=poi_types)
    return pois

@router.get("/admin/pois/", response_model=List[schemas.PointOfInterest])
def read_pois_admin(
    skip: int = 0,
    limit: int = 100,
    search: str = Query(None, description="Search query for POI names"),
    poi_type: Optional[List[str]] = Query(None, description="Restrict results to one or more POI types (e.g. BUSINESS)"),
    db: Session = Depends(get_db),
    current_user = Depends(require_admin_or_editor())  # Require admin or editor role
):
    # Admin view - show all POIs including drafts
    poi_types = _coerce_poi_types(poi_type)
    if search:
        return crud.search_pois(db=db, query_str=search, include_drafts=True, poi_types=poi_types)
    pois = crud.get_pois(db, skip=skip, limit=limit, include_drafts=True, poi_types=poi_types)
    return pois


@router.get("/pois/search", response_model=List[schemas.PointOfInterest], summary="Search for POIs by text")
def search_pois_endpoint(q: str = Query(..., min_length=3, description="Search query string"), db: Session = Depends(get_db)):
    # Public search - only published POIs
    return crud.search_pois(db=db, query_str=q, include_drafts=False)

@router.get("/admin/pois/search", response_model=List[schemas.PointOfInterest], summary="Admin search for POIs by text")
def search_pois_admin_endpoint(
    q: str = Query(..., min_length=3, description="Search query string"),
    db: Session = Depends(get_db),
    current_user = Depends(require_admin_or_editor())
):
    # Admin search - include drafts
    return crud.search_pois(db=db, query_str=q, include_drafts=True)

@router.get("/pois/search-by-location", response_model=List[schemas.PointOfInterest], summary="Search for POIs by location text")
def search_pois_by_location_endpoint(q: str = Query(..., min_length=3, description="Search location string"), db: Session = Depends(get_db)):
    # Public search - only published POIs
    return crud.search_pois_by_location(db=db, location_str=q, include_drafts=False)


@router.get("/pois/{poi_id}", response_model=schemas.PointOfInterest)
def read_poi(poi_id: uuid.UUID, db: Session = Depends(get_db)):
    db_poi = crud.get_poi(db, poi_id=poi_id)
    if db_poi is None:
        raise HTTPException(status_code=404, detail="Point of Interest not found")
    return _enrich_response_fields(db, db_poi)


@router.get("/pois/{poi_id}/nearby", response_model=List[schemas.PointOfInterest], summary="Find nearby POIs")
def get_nearby_pois_endpoint(
    poi_id: uuid.UUID,
    distance_km: float = Query(5.0, description="Search radius in kilometers"),
    limit: int = Query(12, description="Maximum number of results to return"),
    db: Session = Depends(get_db)
):
    # Public endpoint - only show published nearby POIs
    return crud.get_pois_nearby(db=db, poi_id=poi_id, distance_km=distance_km, limit=limit, include_drafts=False)


@router.put("/pois/{poi_id}", response_model=schemas.PointOfInterest)
def update_poi(
    poi_id: uuid.UUID,
    poi_in: schemas.PointOfInterestUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin_or_editor())
):
    db_poi = crud.get_poi(db, poi_id=poi_id)
    if not db_poi:
        raise HTTPException(status_code=404, detail="Point of Interest not found")
    
    updated_poi = crud.update_poi(db=db, db_obj=db_poi, obj_in=poi_in, user_id=getattr(current_user, 'id', None))
    return _enrich_response_fields(db, updated_poi)


@router.delete("/pois/{poi_id}", response_model=schemas.PointOfInterest)
def delete_poi(
    poi_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin_or_editor())
):
    db_poi = crud.get_poi(db, poi_id=poi_id)
    if db_poi is None:
        raise HTTPException(status_code=404, detail="Point of Interest not found")
    if db_poi.has_been_published:
        raise HTTPException(status_code=409, detail={
            "detail": "POI has been published; archive instead of deleting.",
            "action": "archive"
        })
    db_poi = crud.delete_poi(db, poi_id=poi_id, user_id=getattr(current_user, 'id', None))
    if db_poi is None:
        raise HTTPException(status_code=404, detail="Point of Interest not found")
    return db_poi


@router.patch("/pois/{poi_id}/autosave")
def autosave_poi(
    poi_id: uuid.UUID,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user = Depends(require_admin_or_editor())
):
    """
    Partial autosave: whitelist-filter the payload, setattr onto the POI (and
    its Trail/Event subtype if applicable), run the computed-field helper, and
    commit. Anything outside AUTOSAVE_ALLOWED_FIELDS (or inside
    AUTOSAVE_DENIED_FIELDS) is silently dropped.
    """
    poi = db.query(models.PointOfInterest).filter(
        models.PointOfInterest.id == poi_id
    ).first()
    if not poi:
        raise HTTPException(status_code=404, detail="POI not found")

    filtered = {
        k: v for k, v in (payload or {}).items()
        if k in AUTOSAVE_ALLOWED_FIELDS and k not in AUTOSAVE_DENIED_FIELDS
    }
    coerce_empty_literals(filtered, schemas.PointOfInterestUpdate)

    # Task 2.1: POI-to-POI link fields persist as poi_relationships edges, not
    # JSONB. Pull any provided link fields out of the autosave payload so they are
    # never setattr'd onto their JSONB columns; sync them as edges before commit.
    from shared.relationship_links import LINK_FIELDS as _LINK_FIELDS, sync_link_edges as _sync_link_edges
    _link_values = {k: filtered.pop(k) for k in list(filtered) if k in _LINK_FIELDS}

    # Task 2.3: point-geometry fields persist as poi_points rows, not JSONB. Pull
    # them out likewise (none of them feed apply_phase1_computed, so removing them
    # from the merged snapshot is safe); sync them as rows before commit.
    from shared.poi_points import POINT_FIELDS as _POINT_FIELDS, sync_point_rows as _sync_point_rows
    _point_values = {k: filtered.pop(k) for k in list(filtered) if k in _POINT_FIELDS}
    # Issue #117: default missing restroom lat/lng to the POI's own coordinates
    # (location isn't autosave-editable, so `poi.location` is always current) so
    # a row with no pin doesn't get silently dropped in its entirety.
    if 'toilet_locations' in _point_values:
        from app.crud.crud_poi import _poi_location_lat_lng, _default_missing_restroom_coords
        _fallback_lat, _fallback_lng = _poi_location_lat_lng(poi.location)
        _default_missing_restroom_coords(_point_values['toilet_locations'], _fallback_lat, _fallback_lng)

    # Parking lots (#90/#161): links to SHAREABLE lots persist as
    # poi_parking_links edges, not a column. Pull them out of the autosave
    # payload so the setattr loop never sees them; sync them before commit.
    from shared.parking_lots import LINK_FIELD as _PARKING_LINK_FIELD, sync_parking_links as _sync_parking_links
    from app.crud.crud_poi import _UNSET as _UNSET_AUTOSAVE
    _parking_link_value = filtered.pop(_PARKING_LINK_FIELD, _UNSET_AUTOSAVE)

    # #143: autosave persists `name` directly, which is what leaves a draft
    # stuck on its new-poi[-N] placeholder slug. Repair a placeholder on any
    # POI, and let an UNPUBLISHED draft keep tracking its name (draft URLs are
    # never public, and a mid-typing autosave must not lock in a partial-name
    # slug). A published POI with a real slug is never re-slugged here, so
    # live URLs cannot change under the client.
    from app.crud.crud_poi import generate_slug, ensure_unique_slug, slug_is_placeholder
    if 'name' in filtered and (
        slug_is_placeholder(poi.slug) or poi.publication_status != 'published'
    ):
        _slug_base = generate_slug(filtered['name'] or poi.name, filtered.get('address_city', poi.address_city))
        _already_derived = bool(_slug_base) and (
            poi.slug == _slug_base or (poi.slug or '').startswith(_slug_base + '-')
        )
        if _slug_base and not slug_is_placeholder(_slug_base) and not _already_derived:
            poi.slug = ensure_unique_slug(db, _slug_base, exclude_id=poi.id)

    # Task 2.5: stop writing the legacy photo columns (images table wins) and
    # contact_info (main_contact_* columns win). Drop them from the autosave
    # payload so they are never setattr'd onto their retained legacy columns.
    # (amenities.payment_methods is stripped by apply_phase1_computed below.)
    from shared.poi_media import LEGACY_PHOTO_FIELDS as _LEGACY_PHOTO_FIELDS
    from shared.poi_contact_payments import LEGACY_CONTACT_FIELD as _LEGACY_CONTACT_FIELD
    for _k in (*_LEGACY_PHOTO_FIELDS, _LEGACY_CONTACT_FIELD):
        filtered.pop(_k, None)

    # Build a merged snapshot so the computed helper can read current values.
    merged: Dict[str, Any] = {c.name: getattr(poi, c.name) for c in poi.__table__.columns}
    for sub_attr in ('business', 'park', 'trail', 'event'):
        sub = getattr(poi, sub_attr, None)
        if sub is not None:
            for c in sub.__table__.columns:
                if c.name == 'poi_id':
                    continue
                merged[c.name] = getattr(sub, c.name)
    merged.update(filtered)
    coerce_empty_literals(merged, schemas.PointOfInterestUpdate)

    apply_phase1_computed(merged)

    # Fields the computed helper may mutate, in addition to whatever was passed.
    computed_fields = {
        'icon_free_wifi', 'icon_pet_friendly', 'icon_public_restroom',
        'icon_wheelchair_accessible', 'accessible_restroom',
        'inclusive_playground', 'listing_type', 'amenities',
    }
    allow = set(filtered.keys()) | computed_fields

    poi_cols = {c.name for c in poi.__table__.columns}
    subtype_objs = {
        'business': getattr(poi, 'business', None),
        'park':     getattr(poi, 'park', None),
        'trail':    getattr(poi, 'trail', None),
        'event':    getattr(poi, 'event', None),
    }

    for k in allow:
        if k not in merged:
            continue
        if k in AUTOSAVE_DENIED_FIELDS:
            continue
        if k in poi_cols:
            setattr(poi, k, merged[k])
            continue
        # Fall through to subtype tables
        for sub in subtype_objs.values():
            if sub is None:
                continue
            sub_cols = {c.name for c in sub.__table__.columns}
            if k in sub_cols and k != 'poi_id':
                setattr(sub, k, merged[k])
                break

    # Task 2.1: sync any provided POI-to-POI link fields into edges (same txn).
    for _f, _v in _link_values.items():
        _sync_link_edges(db, poi.id, _f, _v)

    # Task 2.3: sync any provided point-geometry fields into poi_points (same txn).
    for _f, _v in _point_values.items():
        _sync_point_rows(db, poi.id, _f, _v)

    # Parking lots (#90/#161): sync links only when this autosave provided them.
    if _parking_link_value is not _UNSET_AUTOSAVE:
        _sync_parking_links(db, poi.id, _parking_link_value)

    # Append-only audit row, in the SAME transaction as the autosave (Task 1.1).
    record_poi_revision(db, poi, 'update', user_id=getattr(current_user, 'id', None))
    db.commit()

    # Best-effort embed-on-write (A7): AFTER the commit above, never before.
    # Only re-embed when a field that feeds the searchable text actually changed
    # (so a keystroke-batch that only touched irrelevant fields skips the TEI
    # round-trip). Fully contained — a writer bug must never break an autosave.
    try:
        from app.crud.embedding_writer import should_reembed, write_embedding_best_effort
        if should_reembed(set(filtered.keys())):
            write_embedding_best_effort(db, poi_id)
    except Exception:
        pass

    return {
        "status": "ok",
        "id": str(poi.id),
        "saved_at": datetime.utcnow().isoformat(),
    }


@router.get("/pois/venues/list", response_model=List[schemas.PointOfInterest])
def get_available_venues(
    skip: int = 0,
    limit: int = 500,
    search: str = Query(None, description="Search query for venue names"),
    db: Session = Depends(get_db),
    current_user = Depends(require_admin_or_editor())
):
    """
    Get all POIs that can be used as venues (BUSINESS, PARK, and TRAIL types).
    Used for venue selection when creating events.
    """
    from app.models.poi import PointOfInterest, POIType

    query = db.query(PointOfInterest).filter(
        PointOfInterest.poi_type.in_([POIType.BUSINESS, POIType.PARK, POIType.TRAIL])
    )

    if search:
        search_term = f"%{search}%"
        query = query.filter(PointOfInterest.name.ilike(search_term))

    return query.order_by(PointOfInterest.name).offset(skip).limit(limit).all()


@router.get("/pois/{poi_id}/venue-data", response_model=schemas.VenueDataForEvent)
def get_venue_data_for_event(
    poi_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin_or_editor())
):
    """
    Get venue data that can be copied to an event.
    Only works for BUSINESS, PARK and TRAIL POI types.
    Returns address, contact, parking, accessibility, restrooms, playground,
    pet, alcohol/smoking, amenities and photos. Hours are excluded (#124).
    """
    from app.models.image import Image, ImageType
    from app.services.image_service import image_service
    from geoalchemy2.shape import to_shape
    from shared.constants.venue_sections import venue_entry_notes

    db_poi = crud.get_poi(db, poi_id=poi_id)
    if db_poi is None:
        raise HTTPException(status_code=404, detail="POI not found")

    # Validate POI type - BUSINESS, PARK, and TRAIL can be venues
    poi_type = db_poi.poi_type.value if hasattr(db_poi.poi_type, 'value') else str(db_poi.poi_type)
    if poi_type not in ['BUSINESS', 'PARK', 'TRAIL']:
        raise HTTPException(
            status_code=400,
            detail=f"POI type '{poi_type}' cannot be used as a venue. Only BUSINESS, PARK, and TRAIL are valid."
        )

    # Get copyable images (entry, parking, restroom, playground)
    copyable_image_types = [
        ImageType.entry, ImageType.parking, ImageType.restroom, ImageType.playground,
    ]
    images = db.query(Image).filter(
        Image.poi_id == poi_id,
        Image.image_type.in_(copyable_image_types),
        Image.parent_image_id.is_(None)  # Only original images, not variants
    ).order_by(Image.image_type, Image.display_order).all()

    copyable_images = []
    for img in images:
        urls = image_service.get_image_urls(img)
        copyable_images.append({
            "id": str(img.id),
            "image_type": img.image_type.value,
            "filename": img.filename,
            "url": urls.get("url"),
            "thumbnail_url": urls.get("thumbnail_url")
        })

    # Build location geometry
    location = None
    if db_poi.location:
        point = to_shape(db_poi.location)
        coords = list(point.coords)[0]
        location = {"type": "Point", "coordinates": [coords[0], coords[1]]}

    return schemas.VenueDataForEvent(
        venue_id=db_poi.id,
        venue_name=db_poi.name,
        venue_type=poi_type,
        address_full=db_poi.address_full,
        address_street=db_poi.address_street,
        address_city=db_poi.address_city,
        address_state=db_poi.address_state,
        address_zip=db_poi.address_zip,
        address_county=db_poi.address_county,
        location=location,
        front_door_latitude=float(db_poi.front_door_latitude) if db_poi.front_door_latitude else None,
        front_door_longitude=float(db_poi.front_door_longitude) if db_poi.front_door_longitude else None,
        what3words_address=db_poi.what3words_address,
        arrival_methods=db_poi.arrival_methods,
        entry_notes=venue_entry_notes(db_poi),
        phone_number=db_poi.phone_number,
        email=db_poi.email,
        website_url=db_poi.website_url,
        parking_types=db_poi.parking_types,
        parking_notes=db_poi.parking_notes,
        parking_locations=db_poi.parking_locations,
        expect_to_pay_parking=db_poi.expect_to_pay_parking,
        accessible_parking_details=db_poi.accessible_parking_details,
        # public_transit_info removed (Migration A #33 — renamed to _deprecated_public_transit_info)
        # wheelchair_accessible removed (Issue #45 PR2 Migration B — column dropped)
        wheelchair_details=db_poi.wheelchair_details,
        mobility_access=db_poi.mobility_access,
        public_toilets=db_poi.public_toilets,
        toilet_description=db_poi.toilet_description,
        toilet_locations=db_poi.toilet_locations,
        accessible_restroom=db_poi.accessible_restroom,
        accessible_restroom_details=db_poi.accessible_restroom_details,
        playground_available=db_poi.playground_available,
        playground_types=db_poi.playground_types,
        playground_surface_types=db_poi.playground_surface_types,
        playground_notes=db_poi.playground_notes,
        playground_locations=db_poi.playground_locations,
        playground_age_groups=db_poi.playground_age_groups,
        playground_ada_checklist=db_poi.playground_ada_checklist,
        inclusive_playground=db_poi.inclusive_playground,
        pet_options=db_poi.pet_options,
        pet_policy=db_poi.pet_policy,
        alcohol_available=db_poi.alcohol_available,
        alcohol_availability=db_poi.alcohol_availability,
        alcohol_options=db_poi.alcohol_options,
        alcohol_policy_details=db_poi.alcohol_policy_details,
        alcohol_notes=db_poi.alcohol_notes,
        byob_allowed=db_poi.byob_allowed,
        smoking_options=db_poi.smoking_options,
        smoking_details=db_poi.smoking_details,
        amenities=db_poi.amenities,
        payment_methods=db_poi.payment_methods,
        cell_service=db_poi.cell_service,
        payphone_locations=db_poi.payphone_locations,
        # hours deliberately not returned (#124)
        copyable_images=copyable_images
    )


@router.get("/event-statuses", summary="Get all event statuses with helper text and valid transitions")
def get_event_statuses(
    current_user=Depends(require_admin_or_editor())
):
    """Return all event statuses with helper text and valid transitions for admin UI."""
    from shared.constants.field_options import EVENT_STATUS_OPTIONS, EVENT_STATUS_HELPER_TEXT
    from shared.utils.event_status import EVENT_STATUS_TRANSITIONS

    result = []
    for status in EVENT_STATUS_OPTIONS:
        transitions = list(EVENT_STATUS_TRANSITIONS.get(status, []))
        # "Return to Scheduled" is always allowed (except from Scheduled itself)
        if status != "Scheduled" and "Scheduled" not in transitions:
            transitions.insert(0, "Scheduled")
        result.append({
            "status": status,
            "helper_text": EVENT_STATUS_HELPER_TEXT.get(status, ""),
            "valid_transitions": transitions,
        })
    return result


# Task 136: Reschedule endpoint
class RescheduleRequest(BaseModel):
    new_start_datetime: datetime
    new_end_datetime: Optional[datetime] = None


@router.post("/pois/{poi_id}/reschedule", response_model=schemas.PointOfInterest, status_code=201)
def reschedule_event(
    poi_id: uuid.UUID,
    body: RescheduleRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin_or_editor())
):
    """
    Reschedule an event: clone the POI+Event with new dates, mark original as Rescheduled.
    """
    from app.crud.crud_poi import generate_slug, ensure_unique_slug
    from geoalchemy2.shape import to_shape
    from shared.relationship_links import LINK_FIELDS, clone_outbound_edges
    from shared.poi_points import POINT_FIELDS, read_point_field, sync_point_rows
    from shared.poi_media import LEGACY_PHOTO_FIELDS, clone_images

    db_poi = crud.get_poi(db, poi_id=poi_id)
    if not db_poi:
        raise HTTPException(status_code=404, detail="POI not found")

    poi_type = db_poi.poi_type.value if hasattr(db_poi.poi_type, 'value') else str(db_poi.poi_type)
    if poi_type != 'EVENT' or not db_poi.event:
        raise HTTPException(status_code=400, detail="Only EVENT POIs can be rescheduled")

    # Clone base POI fields
    new_poi_id = uuid.uuid4()
    base_slug = generate_slug(db_poi.name, db_poi.address_city)
    new_slug = ensure_unique_slug(db, base_slug, exclude_id=None)

    # Dead-weight legacy JSONB columns (Phase 2): the live data now lives in
    # poi_relationships (links), poi_points (pins) and the images table (photos).
    # Exclude them from the raw column copy so the clone does not carry stale JSONB
    # dead data; the real edges / pins / photos are copied from those tables below.
    poi_link_cols = {f for f, i in LINK_FIELDS.items() if i["owner"] == "poi"}
    poi_point_cols = {f for f, i in POINT_FIELDS.items() if i["owner"] == "poi"}
    dead_jsonb_cols = poi_link_cols | poi_point_cols | set(LEGACY_PHOTO_FIELDS)

    # Get columns to copy from POI (exclude id, slug, timestamps, location, and the
    # dead legacy JSONB columns above).
    skip_cols = {'id', 'slug', 'created_at', 'last_updated', 'location'} | dead_jsonb_cols
    poi_data = {
        col.name: getattr(db_poi, col.name)
        for col in models.PointOfInterest.__table__.columns
        if col.name not in skip_cols
    }
    # Fix 1: a legacy '' in a CHECK-constrained enum column would trip the CHECK on
    # the clone insert; coerce blank/whitespace -> NULL first.
    coerce_empty_literals(poi_data, schemas.PointOfInterestUpdate)

    new_poi = models.PointOfInterest(id=new_poi_id, slug=new_slug, **poi_data)

    # Copy location geometry
    if db_poi.location:
        point = to_shape(db_poi.location)
        coords = list(point.coords)[0]
        new_poi.location = f'POINT({coords[0]} {coords[1]})'

    db.add(new_poi)
    db.flush()

    # Clone event fields (exclude poi_id and the event-owned legacy link column
    # vendor_poi_links — those vendor links are copied as edges below).
    event_link_cols = {f for f, i in LINK_FIELDS.items() if i["owner"] == "event"}
    event_skip = {'poi_id'} | event_link_cols
    event_data = {
        col.name: getattr(db_poi.event, col.name)
        for col in models.Event.__table__.columns
        if col.name not in event_skip
    }

    # Override with new dates and status
    event_data['start_datetime'] = body.new_start_datetime
    event_data['end_datetime'] = body.new_end_datetime
    event_data['event_status'] = 'Scheduled'
    event_data['rescheduled_from_event_id'] = poi_id
    event_data['new_event_link'] = None
    event_data['cancellation_paragraph'] = None
    event_data['contact_organizer_toggle'] = False

    new_event = models.Event(poi_id=new_poi_id, **event_data)
    db.add(new_event)

    # Update original event status
    db_poi.event.event_status = 'Rescheduled'
    db_poi.event.new_event_link = str(new_poi_id)

    # Fix 2: copy the source POI's edges / pins / photos onto the clone. These live
    # in poi_relationships / poi_points / images now, not the JSONB columns excluded
    # above, so the raw column copy alone would silently drop every vendor link,
    # other link kind, parking/restroom/playground/payphone pin, and photo. Same
    # transaction, BEFORE the revision snapshot so it captures the complete clone
    # (the snapshot's relationship summary reads the copied edges).
    clone_outbound_edges(db, poi_id, new_poi_id)
    for field, info in POINT_FIELDS.items():
        if info["owner"] != "poi":
            continue  # trail-owned pins never apply to an EVENT
        sync_point_rows(db, new_poi_id, field, read_point_field(db, poi_id, field))
    clone_images(db, poi_id, new_poi_id)

    # Append-only audit rows for both sides of the reschedule, in the SAME
    # transaction (Task 1.1): the cloned event is a create, the original is an
    # update (status -> Rescheduled).
    uid = getattr(current_user, 'id', None)
    record_poi_revision(db, new_poi, 'create', user_id=uid)
    record_poi_revision(db, db_poi, 'update', user_id=uid)

    db.commit()
    db.refresh(new_poi)
    return new_poi
