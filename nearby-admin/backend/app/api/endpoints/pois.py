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
    """Enrich an admin POI response: Task 2.1 link fields (from edges) plus
    Task 2.3 point fields (from poi_points, via set_committed_value so the
    instance is never dirtied)."""
    if poi is None:
        return poi
    from shared.poi_points import enrich_poi_point_fields
    return enrich_poi_point_fields(db, _enrich_link_fields(db, poi))


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
    Only works for BUSINESS and PARK POI types.
    Returns address, contact, parking, accessibility, restroom info, hours, amenities, and photos.
    """
    from app.models.image import Image, ImageType
    from app.services.image_service import image_service
    from geoalchemy2.shape import to_shape

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

    # Get copyable images (entry, parking, restroom)
    copyable_image_types = [ImageType.entry, ImageType.parking, ImageType.restroom]
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
        phone_number=db_poi.phone_number,
        email=db_poi.email,
        website_url=db_poi.website_url,
        parking_types=db_poi.parking_types,
        parking_notes=db_poi.parking_notes,
        parking_locations=db_poi.parking_locations,
        expect_to_pay_parking=db_poi.expect_to_pay_parking,
        # public_transit_info removed (Migration A #33 — renamed to _deprecated_public_transit_info)
        # wheelchair_accessible removed (Issue #45 PR2 Migration B — column dropped)
        wheelchair_details=db_poi.wheelchair_details,
        public_toilets=db_poi.public_toilets,
        toilet_description=db_poi.toilet_description,
        toilet_locations=db_poi.toilet_locations,
        hours=db_poi.hours,
        amenities=db_poi.amenities,
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

    # Get columns to copy from POI (exclude id, slug, timestamps, relationships)
    skip_cols = {'id', 'slug', 'created_at', 'last_updated', 'location'}
    poi_data = {}
    for col in models.PointOfInterest.__table__.columns:
        if col.name not in skip_cols:
            poi_data[col.name] = getattr(db_poi, col.name)

    new_poi = models.PointOfInterest(id=new_poi_id, slug=new_slug, **poi_data)

    # Copy location geometry
    if db_poi.location:
        point = to_shape(db_poi.location)
        coords = list(point.coords)[0]
        new_poi.location = f'POINT({coords[0]} {coords[1]})'

    db.add(new_poi)
    db.flush()

    # Clone event fields
    event_skip = {'poi_id'}
    event_data = {}
    for col in models.Event.__table__.columns:
        if col.name not in event_skip:
            event_data[col.name] = getattr(db_poi.event, col.name)

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

    # Append-only audit rows for both sides of the reschedule, in the SAME
    # transaction (Task 1.1): the cloned event is a create, the original is an
    # update (status -> Rescheduled).
    uid = getattr(current_user, 'id', None)
    record_poi_revision(db, new_poi, 'create', user_id=uid)
    record_poi_revision(db, db_poi, 'update', user_id=uid)

    db.commit()
    db.refresh(new_poi)
    return new_poi
