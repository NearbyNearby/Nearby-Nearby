from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_, func
from fastapi import HTTPException
import uuid
import re
from typing import Dict, Any

from app import models, schemas
from app.crud.crud_category import get_category
from app.utils.html_sanitizer import sanitize_poi_fields
from app.utils.poi_revision import record_poi_revision
from geoalchemy2.types import Geography
from shared.constants.field_options import EVENT_STATUS_EXPLANATION_REQUIRED
from shared.poi_geometry import geojson_to_wkt
from shared.utils.event_status import validate_status_transition


# Sentinel distinguishing "key absent from the update payload" (leave the column
# untouched) from "key present with value null" (clear the column). Task 2.4.
_UNSET = object()


def _poi_location_lat_lng(location):
    """Return (lat, lng) for a POI ``location`` column value, or (None, None).

    Handles both a persisted geometry (WKBElement, read from the DB) and a
    freshly assigned ``'POINT(lng lat)'`` WKT string (update_poi assigns the
    column this way, pre-flush, when the request also updates location).
    """
    if location is None:
        return None, None
    if isinstance(location, str):
        m = re.match(r'POINT\(([-\d.]+)\s+([-\d.]+)\)', location)
        return (float(m.group(2)), float(m.group(1))) if m else (None, None)
    try:
        from geoalchemy2.shape import to_shape
        point = to_shape(location)
        return point.y, point.x
    except Exception:
        return None, None


def _default_missing_restroom_coords(entries, fallback_lat, fallback_lng):
    """Default a restroom entry's missing lat/lng to the POI's own location.

    Issue #117: editors very often skip re-pinning the exact GPS position of
    an indoor restroom. ``shared/poi_points.py`` requires a parseable
    coordinate per entry (``geom`` is NOT NULL) or it drops the ENTIRE row
    (name, description, features included, not just the pin), leaving only the
    restroom's photos (stored independently in the images table) behind.
    Defaulting to the POI's own coordinates keeps everything the editor typed.
    """
    if not isinstance(entries, list) or fallback_lat is None or fallback_lng is None:
        return
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        if entry.get('lat') in (None, ''):
            entry['lat'] = fallback_lat
        if entry.get('lng') in (None, ''):
            entry['lng'] = fallback_lng


def _set_optional_geometries(db_obj, *, geom_line=None, geom_area=None,
                             set_line=True, set_area=True):
    """Validate + assign the Task 2.4 geom_line / geom_area columns.

    Each geometry is a GeoJSON dict, None (clear the column), or is skipped
    entirely when ``set_*`` is False (the field was absent from an update). A
    valid dict becomes plain WKT (the column typmod tags SRID 4326, exactly like
    ``location``); an invalid geometry raises HTTP 400.
    """
    if set_line:
        if geom_line is None:
            db_obj.geom_line = None
        else:
            try:
                db_obj.geom_line = geojson_to_wkt(geom_line, "LineString")
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=f"Invalid geom_line: {exc}")
    if set_area:
        if geom_area is None:
            db_obj.geom_area = None
        else:
            try:
                db_obj.geom_area = geojson_to_wkt(geom_area, "Polygon")
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=f"Invalid geom_area: {exc}")


def compute_icon_booleans(poi: dict) -> dict:
    wifi_opts = poi.get('wifi_options') or []
    amenities = poi.get('amenities') or {}
    poi['icon_free_wifi'] = (
        'Free Public Wifi' in wifi_opts or 'Free Wifi' in wifi_opts
        or amenities.get('wifi') == 'Free Wifi'
    )
    # Issue #48: pet_options list no longer contains negative items
    # (handled by the "Are pets allowed?" Yes/No gate). Any non-empty list
    # of pet_options means the POI is pet friendly.
    pets = poi.get('pet_options') or []
    poi['icon_pet_friendly'] = bool(pets)
    toilets = poi.get('public_toilets') or []
    poi['icon_public_restroom'] = bool(toilets) and toilets != ['No Public Restroom'] and toilets != ['No']
    acc_parking = poi.get('accessible_parking_details') or []
    # mobility_access is now a top-level dict ({step_free_entry, main_area_accessible,
    # ground_level_service} with 'yes'/'no'/'unknown'); fall back to the legacy
    # amenities.mobility_access / list shapes for older rows.
    mobility = (
        poi.get('mobility_access')
        or amenities.get('mobility_access')
        or amenities.get('accessibility')
        or []
    )
    mobility_dict_accessible = isinstance(mobility, dict) and any(
        str(v).lower() == 'yes' for v in mobility.values()
    )
    poi['icon_wheelchair_accessible'] = (
        bool(poi.get('accessible_restroom'))
        or bool(acc_parking)
        or bool(poi.get('inclusive_playground'))
        or (isinstance(mobility, list) and len(mobility) > 0)
        or (isinstance(mobility, bool) and mobility)
        or mobility_dict_accessible
    )
    return poi

def compute_accessible_restroom(poi: dict) -> dict:
    """Strict ALL-THREE accessible-restroom rule (Wave 3 #47).

    A restroom is marked accessible only when the admin has checked all three
    of:
      1. Wide door — minimum 32 inches clear width
      2. Either Side grab bar installed OR Rear grab bar installed
      3. Level entry — no lip or step

    The checklist field `accessible_restroom_details` stores the exact label
    strings from `shared.constants.field_options.RESTROOM_ADA_CHECKLIST`. We
    substring-match because legacy data may have minor whitespace/punctuation
    drift. Both list (current) and dict (legacy) shapes are supported.
    """
    cl = poi.get('accessible_restroom_details')
    if isinstance(cl, list):
        checked = [str(x) for x in cl if x]
    elif isinstance(cl, dict):
        # Legacy shape: {label: bool} or {group: [labels]}.
        checked = []
        for k, v in cl.items():
            if isinstance(v, bool) and v:
                checked.append(str(k))
            elif isinstance(v, list):
                checked.extend(str(x) for x in v if x)
            elif isinstance(v, str):
                checked.append(v)
    else:
        checked = []

    def _has(needle: str) -> bool:
        n = needle.lower()
        return any(n in s.lower() for s in checked)

    wide_door = _has('Wide door')
    grab_bar = _has('Side grab bar') or _has('Rear grab bar')
    level_entry = _has('Level entry')

    poi['accessible_restroom'] = bool(wide_door and grab_bar and level_entry)
    return poi

def compute_inclusive_playground(poi: dict) -> dict:
    cl = poi.get('playground_ada_checklist') or []
    required = {'Accessible route to play area','Ground-level play components accessible',
                'Unitary surface (poured-rubber/tiles)'}
    if isinstance(cl, list):
        poi['inclusive_playground'] = required.issubset(set(cl))
    elif isinstance(cl, dict):
        flat = {item for items in cl.values() for item in (items or [])}
        poi['inclusive_playground'] = required.issubset(flat)
    else:
        poi['inclusive_playground'] = False
    return poi

def compute_wifi_mirror(poi: dict) -> dict:
    amenities = poi.get('amenities') or {}
    if amenities.get('wifi'):
        return poi
    wifi_opts = poi.get('wifi_options') or []
    mapping = {'Free Public Wifi':'Free Wifi','Paid Public Wifi':'Paid Wifi',
               'No Public Wifi':'No Public Wifi'}
    for src, dst in mapping.items():
        if src in wifi_opts:
            amenities['wifi'] = dst
            break
    poi['amenities'] = amenities
    return poi

def apply_sponsor_rule(poi: dict) -> dict:
    if poi.get('is_sponsor'):
        poi['listing_type'] = 'paid'
    return poi


_IDEAL_FOR_GROUP_MAP = None

def _get_ideal_for_map():
    global _IDEAL_FOR_GROUP_MAP
    if _IDEAL_FOR_GROUP_MAP is None:
        from shared.constants.field_options import (
            IDEAL_FOR_ATMOSPHERE, IDEAL_FOR_AGE_GROUP,
            IDEAL_FOR_SOCIAL_SETTINGS, IDEAL_FOR_LOCAL_SPECIAL,
        )
        m = {}
        for v in IDEAL_FOR_ATMOSPHERE: m[v] = 'atmosphere'
        for v in IDEAL_FOR_AGE_GROUP: m[v] = 'age_group'
        for v in IDEAL_FOR_SOCIAL_SETTINGS: m[v] = 'social_settings'
        for v in IDEAL_FOR_LOCAL_SPECIAL: m[v] = 'local_special'
        _IDEAL_FOR_GROUP_MAP = m
    return _IDEAL_FOR_GROUP_MAP

def normalize_ideal_for(poi: dict) -> dict:
    val = poi.get('ideal_for')
    if val is None or isinstance(val, dict):
        return poi
    if isinstance(val, list):
        m = _get_ideal_for_map()
        out = {'atmosphere': [], 'age_group': [], 'social_settings': [],
               'local_special': [], '_legacy': []}
        for item in val:
            out[m.get(item, '_legacy')].append(item)
        poi['ideal_for'] = out
    return poi

def apply_phase1_computed(poi: dict) -> dict:
    normalize_ideal_for(poi)
    compute_wifi_mirror(poi)
    compute_accessible_restroom(poi)
    compute_inclusive_playground(poi)
    compute_icon_booleans(poi)
    apply_sponsor_rule(poi)
    # Task 2.5: payment_methods column wins — never persist a duplicate copy under
    # amenities.payment_methods (runs in create/update/autosave via this helper).
    from shared.poi_contact_payments import strip_amenities_payment_methods
    strip_amenities_payment_methods(poi)
    return poi


def generate_slug(name: str, city: str = None) -> str:
    """Generate URL-friendly slug from name and city"""
    slug = name.lower() if name else ''
    if city:
        slug = f"{slug} {city.lower()}"

    # Remove special characters and replace spaces with hyphens
    slug = re.sub(r'[^\w\s-]', '', slug)
    slug = re.sub(r'[\s_]+', '-', slug)
    slug = re.sub(r'^-+|-+$', '', slug)

    return slug


def ensure_unique_slug(db: Session, base_slug: str, exclude_id: uuid.UUID = None) -> str:
    """Ensure slug is unique, appending a number if necessary"""
    slug = base_slug
    counter = 1

    while True:
        # Check if slug exists
        query = db.query(models.PointOfInterest).filter(
            models.PointOfInterest.slug == slug
        )
        if exclude_id:
            query = query.filter(models.PointOfInterest.id != exclude_id)

        if not query.first():
            return slug

        # Append counter and try again
        slug = f"{base_slug}-{counter}"
        counter += 1


def get_poi(db: Session, poi_id: uuid.UUID):
    return db.query(models.PointOfInterest).options(
        joinedload(models.PointOfInterest.business),
        joinedload(models.PointOfInterest.park),
        joinedload(models.PointOfInterest.trail),
        joinedload(models.PointOfInterest.event),
        joinedload(models.PointOfInterest.categories)
    ).filter(models.PointOfInterest.id == poi_id).first()


def get_pois(db: Session, skip: int = 0, limit: int = 100, include_drafts: bool = False, poi_types=None):
    query = db.query(models.PointOfInterest)

    # Filter by publication status for public view
    if not include_drafts:
        query = query.filter(models.PointOfInterest.publication_status == 'published')

    # Optional POI-type filter (accepts a list of type strings). No filter keeps
    # the original behavior for backward compatibility.
    if poi_types:
        query = query.filter(models.PointOfInterest.poi_type.in_(poi_types))

    return query.order_by(
        models.PointOfInterest.last_updated.desc()
    ).offset(skip).limit(limit).all()


def get_poi_by_slug(db: Session, slug: str):
    return db.query(models.PointOfInterest).filter(models.PointOfInterest.slug == slug).first()


def search_pois(db: Session, query_str: str, include_drafts: bool = False, poi_types=None):
    search = f"%{query_str}%"
    query = db.query(models.PointOfInterest)

    # Filter by publication status for public view
    if not include_drafts:
        query = query.filter(models.PointOfInterest.publication_status == 'published')

    # Optional POI-type filter (accepts a list of type strings). No filter keeps
    # the original behavior for backward compatibility.
    if poi_types:
        query = query.filter(models.PointOfInterest.poi_type.in_(poi_types))

    return query.filter(
        or_(
            models.PointOfInterest.name.ilike(search),
            models.PointOfInterest.description_long.ilike(search),
            models.PointOfInterest.description_short.ilike(search)
        )
    ).limit(20).all()


def search_pois_by_location(db: Session, location_str: str, limit: int = 8, include_drafts: bool = False):
    """
    A simplified location search. It finds a POI that matches the location string
    and then finds other POIs near that one.
    """
    search = f"%{location_str}%"
    query = db.query(models.PointOfInterest)

    # Filter by publication status for public view
    if not include_drafts:
        query = query.filter(models.PointOfInterest.publication_status == 'published')

    # Find a POI that matches the text query
    first_match_poi = query.filter(
        or_(
            models.PointOfInterest.address_city.ilike(search),
            models.PointOfInterest.address_street.ilike(search),
            models.PointOfInterest.address_zip.ilike(search)
        )
    ).first()

    if not first_match_poi:
        return []

    # Now find POIs near this location's coordinates
    distance_meters = 20000  # 20km radius for a general area search

    nearby_query = db.query(models.PointOfInterest)

    # Filter by publication status for public view
    if not include_drafts:
        nearby_query = nearby_query.filter(models.PointOfInterest.publication_status == 'published')

    nearby_pois = nearby_query.filter(
        func.ST_DWithin(
            models.PointOfInterest.location,
            first_match_poi.location,
            distance_meters,
            use_spheroid=False  # Use faster box comparison for broad search
        )
    ).limit(limit).all()

    return nearby_pois


def get_pois_nearby(db: Session, *, poi_id: uuid.UUID, distance_km: float = 5.0, limit: int = 12, include_drafts: bool = False):
    origin_poi = get_poi(db, poi_id)
    if not origin_poi:
        raise HTTPException(status_code=404, detail="Origin POI not found.")

    origin_point = origin_poi.location
    distance_meters = distance_km * 1000

    query = db.query(models.PointOfInterest)

    # Filter by publication status for public view
    if not include_drafts:
        query = query.filter(models.PointOfInterest.publication_status == 'published')

    nearby_pois = query.filter(
        func.ST_DWithin(
            origin_point,
            models.PointOfInterest.location,
            distance_meters,
            use_spheroid=True
        )
    ).filter(
        models.PointOfInterest.id != origin_poi.id
    ).limit(limit).all()

    return nearby_pois


def create_poi(db: Session, poi: schemas.PointOfInterestCreate, user_id=None):
    # Create the POI with location
    # Exclude deprecated photo columns that have been moved to the Images table
    deprecated_photo_fields = {
        'business_entry_photo', 'park_entry_photo', 'event_entry_photo',
        'parking_lot_photo', 'parking_photos', 'rental_photos',
        'playground_photos', 'trailhead_photo', 'trail_exit_photo'
    }
    # Task 2.5: one representation per concept — the write path stops writing the
    # legacy photo columns (images table wins) and contact_info (main_contact_*
    # columns win). Dropping them here means they are never persisted from the
    # payload; reads derive featured_image/photos/gallery_photos from images.
    from shared.poi_media import LEGACY_PHOTO_FIELDS
    from shared.poi_contact_payments import LEGACY_CONTACT_FIELD
    one_rep_stripped = set(LEGACY_PHOTO_FIELDS) | {LEGACY_CONTACT_FIELD}
    poi_data = poi.model_dump(exclude={'location', 'geom_line', 'geom_area', 'business', 'park', 'trail', 'event', 'category_ids', 'main_category_id'} | deprecated_photo_fields | one_rep_stripped)

    # Task 2.1: POI-to-POI link fields persist as poi_relationships edges, NOT as
    # JSONB. Pull the top-level link fields out of poi_data so they are never
    # written to their JSONB columns; they are synced as edges once the POI (and
    # any target POIs) exist. vendor_poi_links (event subtype) is pulled below.
    from shared.relationship_links import LINK_FIELDS as _LINK_FIELDS, sync_link_edges as _sync_link_edges
    _link_values = {
        _f: poi_data.pop(_f, None)
        for _f, _i in _LINK_FIELDS.items() if _i["owner"] == "poi"
    }

    # Task 2.3: point-geometry fields persist as poi_points rows, NOT as JSONB.
    # Pull the top-level point fields out of poi_data so they are never written
    # to their JSONB columns; they are synced as rows once the POI exists. The
    # trail-owned point fields (access_points, trailhead_location) are pulled
    # from trail_data below.
    from shared.poi_points import POINT_FIELDS as _POINT_FIELDS, sync_point_rows as _sync_point_rows
    _point_values = {
        _f: poi_data.pop(_f, None)
        for _f, _i in _POINT_FIELDS.items() if _i["owner"] == "poi"
    }

    # Parking lots (#90/#161): links to SHAREABLE lots persist as
    # poi_parking_links edges. There is no column, so pop it out of poi_data
    # before the model is constructed; it is synced once the POI exists.
    from shared.parking_lots import LINK_FIELD as _PARKING_LINK_FIELD, sync_parking_links as _sync_parking_links
    _parking_link_value = poi_data.pop(_PARKING_LINK_FIELD, None)
    # Issue #117: default missing restroom lat/lng to the POI's own coordinates
    # so a row with no pin doesn't get silently dropped in its entirety.
    _default_missing_restroom_coords(
        _point_values.get('toilet_locations'),
        poi.location.coordinates[1], poi.location.coordinates[0],
    )

    # Sanitize HTML content in the POI data
    poi_data = sanitize_poi_fields(poi_data)

    # Auto-generate slug if not provided
    if not poi_data.get('slug'):
        base_slug = generate_slug(poi_data.get('name', ''), poi_data.get('address_city'))
        poi_data['slug'] = ensure_unique_slug(db, base_slug)

    # Apply Phase 1 computed fields (icon booleans, accessible_restroom,
    # inclusive_playground, amenities.wifi mirror, sponsor listing_type)
    apply_phase1_computed(poi_data)

    db_poi = models.PointOfInterest(**poi_data)

    # Set the location geometry
    db_poi.location = f'POINT({poi.location.coordinates[0]} {poi.location.coordinates[1]})'

    # Task 2.4: optional line/area geometries. Validate the GeoJSON -> WKT (the
    # column typmod tags SRID 4326, exactly like location above); invalid -> 400.
    _set_optional_geometries(db_poi, geom_line=poi.geom_line, geom_area=poi.geom_area)

    # First save the POI to get an ID
    try:
        db.add(db_poi)
        db.flush()  # Get the ID without committing
    except IntegrityError as e:
        # A CHECK/constraint violation on a base column (e.g. a Task 2.6
        # enum-like column) is a client error: surface it as 400, not 500.
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Database integrity error: {e.orig}")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error creating POI: {e}")

    # Handle main category via poi_categories table with is_main=True.
    # Issue #42: enforce that the chosen main category is one of the POI's
    # selected categories (membership), not just any category in the tree.
    if hasattr(poi, 'main_category_id') and poi.main_category_id:
        main_category = get_category(db, poi.main_category_id)
        if not main_category:
            raise HTTPException(status_code=400, detail="Invalid main category")
        selected_category_ids = set(getattr(poi, 'category_ids', None) or [])
        if selected_category_ids and poi.main_category_id not in selected_category_ids:
            raise HTTPException(
                status_code=422,
                detail="main_category_id must be one of the POI's selected category_ids",
            )
        from app.models.category import poi_category_association
        db.execute(poi_category_association.insert().values(
            poi_id=db_poi.id,
            category_id=poi.main_category_id,
            is_main=True
        ))

    # Validate free business category limit. Only a FREE BUSINESS is capped at one
    # category; paid business and every other POI type may have multiple.
    if poi.category_ids:
        poi_type_str = poi.poi_type.value if hasattr(poi.poi_type, 'value') else str(poi.poi_type)
        listing_type = poi_data.get('listing_type', 'free')
        if poi_type_str == 'BUSINESS' and listing_type == 'free' and len(poi.category_ids) > 1:
            raise HTTPException(status_code=400, detail="Free business listings are limited to 1 category")

    # Add secondary categories via poi_categories table with is_main=False.
    # Issue #42: skip the main category — it's already inserted above as
    # is_main=True; re-inserting would either violate the (poi_id, category_id)
    # unique constraint or duplicate the row depending on schema.
    main_cat_id_create = getattr(poi, 'main_category_id', None)
    if poi.category_ids:
        from app.models.category import poi_category_association
        for cat_id in poi.category_ids:
            if cat_id == main_cat_id_create:
                continue
            category = get_category(db, cat_id)
            if category:
                # Insert into poi_categories with is_main=False
                db.execute(poi_category_association.insert().values(
                    poi_id=db_poi.id,
                    category_id=cat_id,
                    is_main=False
                ))

    # Create subtype based on poi_type with HTML sanitization
    if poi.poi_type == 'BUSINESS' and poi.business:
        db_poi.business = models.Business(**poi.business.model_dump())
    elif poi.poi_type == 'PARK' and poi.park:
        db_poi.park = models.Park(**poi.park.model_dump())
    elif poi.poi_type == 'TRAIL' and poi.trail:
        trail_data = poi.trail.model_dump()
        trail_data = sanitize_poi_fields({'trail': trail_data}).get('trail', {})
        # Task 2.3: trail-owned point fields persist as poi_points rows, not JSONB.
        _point_values['access_points'] = trail_data.pop('access_points', None)
        _point_values['trailhead_location'] = trail_data.pop('trailhead_location', None)
        db_poi.trail = models.Trail(**trail_data)
    elif poi.poi_type == 'EVENT' and poi.event:
        event_data = poi.event.model_dump()
        event_data = sanitize_poi_fields({'event': event_data}).get('event', {})
        # Task 2.1: vendor_poi_links is a link field — persist as edges, not JSONB.
        _link_values['vendor_poi_links'] = event_data.pop('vendor_poi_links', None)
        # Duplicate prevention: check same venue + date + name
        venue_id = event_data.get('venue_poi_id')
        start_dt = event_data.get('start_datetime')
        if venue_id and start_dt:
            existing = db.query(models.PointOfInterest).join(
                models.Event, models.PointOfInterest.id == models.Event.poi_id
            ).filter(
                func.lower(models.PointOfInterest.name) == func.lower(poi_data.get('name', '')),
                models.Event.venue_poi_id == venue_id,
                models.Event.start_datetime == start_dt,
            ).first()
            if existing:
                raise HTTPException(
                    status_code=409,
                    detail=f"Duplicate event: an event with the same name, venue, and start time already exists (ID: {existing.id})."
                )
        db_poi.event = models.Event(**event_data)

    try:
        db.add(db_poi)
        # Task 2.1: sync POI-to-POI link fields into poi_relationships edges,
        # BEFORE the revision snapshot (so its relationship summary reflects the
        # new edges) and INSIDE this try so a premature flush from an invalid FK
        # (e.g. a bad venue_poi_id) surfaces as an IntegrityError -> 400, not 500.
        for _f, _v in _link_values.items():
            _sync_link_edges(db, db_poi.id, _f, _v)
        # Task 2.3: sync point-geometry fields into poi_points rows (same txn).
        for _f, _v in _point_values.items():
            _sync_point_rows(db, db_poi.id, _f, _v)
        # Parking lots (#90/#161): sync links into poi_parking_links (same txn).
        _sync_parking_links(db, db_poi.id, _parking_link_value)
        # Append-only audit row, in the SAME transaction as the create (Task 1.1).
        record_poi_revision(db, db_poi, 'create', user_id)
        db.commit()
        db.refresh(db_poi)
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Database integrity error: {e.orig}")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")

    # Best-effort embed-on-write (A7): AFTER the commit above, never before.
    # Fully contained — a writer bug must never break a successful POI create.
    try:
        from app.crud.embedding_writer import write_embedding_best_effort
        write_embedding_best_effort(db, db_poi.id)
    except Exception:
        pass

    return db_poi


def update_poi(db: Session, *, db_obj: models.PointOfInterest, obj_in: schemas.PointOfInterestUpdate, user_id=None) -> models.PointOfInterest:
    update_data = obj_in.model_dump(exclude_unset=True)

    # Task 2.1: POI-to-POI link fields persist as poi_relationships edges, NOT as
    # JSONB. Pop the top-level link fields that were provided in THIS request so
    # they are never setattr'd onto their JSONB columns; sync them as edges below.
    # A field absent from update_data is left untouched (partial-update safe).
    from shared.relationship_links import LINK_FIELDS as _LINK_FIELDS, sync_link_edges as _sync_link_edges
    _link_values = {
        _f: update_data.pop(_f)
        for _f, _i in _LINK_FIELDS.items()
        if _i["owner"] == "poi" and _f in update_data
    }

    # Task 2.3: point-geometry fields persist as poi_points rows, NOT as JSONB.
    # Pop the top-level point fields provided in THIS request so they are never
    # setattr'd onto their JSONB columns; sync them as rows below. A field absent
    # from update_data is left untouched (partial-update safe). The trail-owned
    # point fields are popped from trail_data below.
    from shared.poi_points import POINT_FIELDS as _POINT_FIELDS, sync_point_rows as _sync_point_rows
    _point_values = {
        _f: update_data.pop(_f)
        for _f, _i in _POINT_FIELDS.items()
        if _i["owner"] == "poi" and _f in update_data
    }

    # Parking lots (#90/#161): links to SHAREABLE lots persist as
    # poi_parking_links edges. Pop it only when THIS request provided it, so a
    # PUT that omits the field leaves the existing links untouched.
    from shared.parking_lots import LINK_FIELD as _PARKING_LINK_FIELD, sync_parking_links as _sync_parking_links
    _parking_link_value = update_data.pop(_PARKING_LINK_FIELD, _UNSET)

    # Remove deprecated photo columns that have been moved to the Images table
    deprecated_photo_fields = [
        'business_entry_photo', 'park_entry_photo', 'event_entry_photo',
        'parking_lot_photo', 'parking_photos', 'rental_photos',
        'playground_photos', 'trailhead_photo', 'trail_exit_photo'
    ]
    for field in deprecated_photo_fields:
        update_data.pop(field, None)

    # Task 2.5: stop writing the legacy photo columns (images table wins) and
    # contact_info (main_contact_* columns win). Popping them here (partial-update
    # safe) means a field absent from the request is left untouched, and a field
    # present is dropped rather than persisted to its retained legacy column.
    from shared.poi_media import LEGACY_PHOTO_FIELDS
    from shared.poi_contact_payments import LEGACY_CONTACT_FIELD
    for field in (*LEGACY_PHOTO_FIELDS, LEGACY_CONTACT_FIELD):
        update_data.pop(field, None)

    # Sanitize HTML content in the update data
    update_data = sanitize_poi_fields(update_data)

    # Apply Phase 1 computed fields (icon booleans, accessible_restroom,
    # inclusive_playground, amenities.wifi mirror, sponsor listing_type).
    # Only touches keys the helpers know about; safe for partial updates.
    apply_phase1_computed(update_data)

    # Regenerate slug if name or city changed
    name_changed = 'name' in update_data and update_data['name'] != db_obj.name
    city_changed = 'address_city' in update_data and update_data['address_city'] != db_obj.address_city

    if name_changed or city_changed:
        new_name = update_data.get('name', db_obj.name)
        new_city = update_data.get('address_city', db_obj.address_city)
        base_slug = generate_slug(new_name, new_city)
        update_data['slug'] = ensure_unique_slug(db, base_slug, exclude_id=db_obj.id)

    # Handle location update
    if 'location' in update_data:
        location_data = update_data.pop('location')
        # Accept both dict and object with coordinates
        if isinstance(location_data, dict):
            coords = location_data.get('coordinates')
        else:
            coords = location_data.coordinates
        db_obj.location = f'POINT({coords[0]} {coords[1]})'

    # Issue #117: default missing restroom lat/lng to the POI's own coordinates
    # (the just-updated location above, else the existing one) so a row with no
    # pin doesn't get silently dropped in its entirety.
    if 'toilet_locations' in _point_values:
        _fallback_lat, _fallback_lng = _poi_location_lat_lng(db_obj.location)
        _default_missing_restroom_coords(_point_values['toilet_locations'], _fallback_lat, _fallback_lng)

    # Task 2.4: line/area geometry update (partial-update safe). A key present in
    # update_data means the client sent it: a GeoJSON dict is validated -> WKT
    # (invalid -> 400), an explicit null clears the column. A key absent is left
    # untouched. Pop so it is never setattr'd onto the column as a raw dict below.
    _geom_line = update_data.pop('geom_line', _UNSET)
    _geom_area = update_data.pop('geom_area', _UNSET)
    _set_optional_geometries(
        db_obj,
        geom_line=_geom_line if _geom_line is not _UNSET else None,
        geom_area=_geom_area if _geom_area is not _UNSET else None,
        set_line=_geom_line is not _UNSET,
        set_area=_geom_area is not _UNSET,
    )

    # Handle subtype updates
    # Note: db_obj.poi_type may be a POIType enum or a string depending on context
    poi_type_str = db_obj.poi_type.value if hasattr(db_obj.poi_type, 'value') else str(db_obj.poi_type)

    if 'business' in update_data and poi_type_str == 'BUSINESS':
        business_data = update_data.pop('business')
        if db_obj.business:
            for key, value in business_data.items():
                setattr(db_obj.business, key, value)
        else:
            db_obj.business = models.Business(**business_data)

    if 'park' in update_data and poi_type_str == 'PARK':
        park_data = update_data.pop('park')
        if db_obj.park:
            for key, value in park_data.items():
                setattr(db_obj.park, key, value)
        else:
            db_obj.park = models.Park(**park_data)

    if 'trail' in update_data and poi_type_str == 'TRAIL':
        trail_data = update_data.pop('trail')
        # Task 2.3: trail-owned point fields persist as poi_points rows, not JSONB.
        for _f in ('access_points', 'trailhead_location'):
            if _f in trail_data:
                _point_values[_f] = trail_data.pop(_f)
        if db_obj.trail:
            for key, value in trail_data.items():
                setattr(db_obj.trail, key, value)
        else:
            db_obj.trail = models.Trail(**trail_data)

    if 'event' in update_data and poi_type_str == 'EVENT':
        event_data = update_data.pop('event')
        # Task 2.1: vendor_poi_links is a link field — persist as edges, not JSONB.
        if 'vendor_poi_links' in event_data:
            _link_values['vendor_poi_links'] = event_data.pop('vendor_poi_links')
        # Task 157: Date Change Guard
        date_changing = event_data.get('start_datetime') or event_data.get('end_datetime')
        current_status = getattr(db_obj.event, 'event_status', None) if db_obj.event else None
        new_status = event_data.get('event_status', current_status)
        if date_changing and current_status == 'Updated Date and/or Time' and new_status != 'Rescheduled':
            raise HTTPException(
                400,
                "Changing event dates when status is 'Updated Date and/or Time' requires selecting 'Rescheduled' status first."
            )
        # Validate status transition
        if new_status and current_status and new_status != current_status:
            valid, msg = validate_status_transition(current_status, new_status)
            if not valid:
                raise HTTPException(400, msg)
        # Require status_explanation for certain status transitions
        if new_status and new_status != current_status and new_status in EVENT_STATUS_EXPLANATION_REQUIRED:
            explanation = event_data.get('status_explanation')
            if not explanation:
                raise HTTPException(
                    400,
                    f"status_explanation is required when setting event_status to '{new_status}'."
                )
        if db_obj.event:
            for key, value in event_data.items():
                setattr(db_obj.event, key, value)
        else:
            db_obj.event = models.Event(**event_data)

    # Handle main category update via poi_categories table.
    # Issue #42: validate membership — the chosen main category must be one
    # of the POI's selected categories (either the incoming category_ids in
    # this same request, or the existing rows on poi_categories).
    if 'main_category_id' in update_data:
        main_category_id = update_data.pop('main_category_id')
        from app.models.category import poi_category_association

        # Clear is_main flag from current main category (don't delete, just demote to secondary)
        db.execute(poi_category_association.update().where(
            poi_category_association.c.poi_id == db_obj.id,
            poi_category_association.c.is_main == True
        ).values(is_main=False))

        # Add/update new main category if provided
        if main_category_id:
            main_category = get_category(db, main_category_id)
            if not main_category:
                raise HTTPException(status_code=400, detail="Invalid main category")

            # Enforce "main ∈ selected" ONLY when category_ids is being set in THIS
            # request (consistency check, mirroring the create path). A main-only
            # update is allowed to introduce a NEW main category — it is added to the
            # membership as is_main=True in the block below — so it must not be
            # rejected for not already being a selected category. (Issue #42 was
            # over-strict here: it 422'd every partial {"main_category_id": ...} PUT,
            # contradicting the very insert logic that follows.)
            if 'category_ids' in update_data:
                effective_category_ids = set(update_data.get('category_ids') or [])
                if effective_category_ids and main_category_id not in effective_category_ids:
                    raise HTTPException(
                        status_code=422,
                        detail="main_category_id must be one of the POI's selected category_ids",
                    )

            # Check if this category already exists for this POI
            existing = db.execute(poi_category_association.select().where(
                poi_category_association.c.poi_id == db_obj.id,
                poi_category_association.c.category_id == main_category_id
            )).fetchone()

            if existing:
                # Update existing to be main
                db.execute(poi_category_association.update().where(
                    poi_category_association.c.poi_id == db_obj.id,
                    poi_category_association.c.category_id == main_category_id
                ).values(is_main=True))
            else:
                # Insert new main category
                db.execute(poi_category_association.insert().values(
                    poi_id=db_obj.id,
                    category_id=main_category_id,
                    is_main=True
                ))

    # Handle secondary category updates via poi_categories table
    if 'category_ids' in update_data:
        category_ids = update_data.pop('category_ids')

        # Validate free business category limit. Evaluate the poi_type / listing_type
        # being SAVED in this request (falling back to the stored values), NOT the
        # stale stored type — otherwise changing a free business into a park/trail/
        # event, or upgrading it to a paid tier, in the same save is wrongly blocked
        # by the old type. Only a FREE BUSINESS is capped at one category; paid
        # business and every other POI type may have multiple.
        effective_type = update_data.get('poi_type', poi_type_str)
        effective_type = effective_type.value if hasattr(effective_type, 'value') else str(effective_type)
        listing_type = update_data.get('listing_type', getattr(db_obj, 'listing_type', 'free'))
        if effective_type == 'BUSINESS' and listing_type == 'free' and len(category_ids) > 1:
            raise HTTPException(status_code=400, detail="Free business listings are limited to 1 category")

        from app.models.category import poi_category_association

        # Get current main category to preserve it
        main_cat_row = db.execute(poi_category_association.select().where(
            poi_category_association.c.poi_id == db_obj.id,
            poi_category_association.c.is_main == True
        )).fetchone()
        main_cat_id = main_cat_row.category_id if main_cat_row else None

        # Remove existing secondary categories
        db.execute(poi_category_association.delete().where(
            poi_category_association.c.poi_id == db_obj.id,
            poi_category_association.c.is_main == False
        ))

        # Add new secondary categories (skip if it's the main category)
        for cat_id in category_ids:
            if cat_id == main_cat_id:
                continue  # Skip - this is already the main category
            category = get_category(db, cat_id)
            if category:
                db.execute(poi_category_association.insert().values(
                    poi_id=db_obj.id,
                    category_id=cat_id,
                    is_main=False
                ))
        db.flush()

    # Update remaining fields (subtype dicts already popped above when type matches)
    # Skip any subtype relationship fields that weren't popped (e.g. type mismatch)
    subtype_fields = {"event", "business", "park", "trail"}
    for field, value in update_data.items():
        if field in subtype_fields:
            continue
        setattr(db_obj, field, value)

    try:
        db.add(db_obj)
        # Task 2.1: sync provided POI-to-POI link fields into poi_relationships
        # edges (BEFORE the revision snapshot, in the same transaction).
        for _f, _v in _link_values.items():
            _sync_link_edges(db, db_obj.id, _f, _v)
        # Task 2.3: sync provided point-geometry fields into poi_points rows.
        for _f, _v in _point_values.items():
            _sync_point_rows(db, db_obj.id, _f, _v)
        # Parking lots (#90/#161): sync links only when the request provided them.
        if _parking_link_value is not _UNSET:
            _sync_parking_links(db, db_obj.id, _parking_link_value)
        # Append-only audit row, in the SAME transaction as the update (Task 1.1).
        record_poi_revision(db, db_obj, 'update', user_id)
        db.commit()
        db.refresh(db_obj)
    except IntegrityError as e:
        # Mirror create_poi: a constraint violation (e.g. a Task 2.6 CHECK on an
        # enum-like column, or a bad FK) is a client error, surface it as 400.
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Database integrity error: {e.orig}")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"An error occurred during update: {e}")

    # Best-effort embed-on-write (A7): AFTER the commit above, never before.
    # Fully contained — a writer bug must never break a successful POI update.
    try:
        from app.crud.embedding_writer import write_embedding_best_effort
        write_embedding_best_effort(db, db_obj.id)
    except Exception:
        pass

    return db_obj


def delete_poi(db: Session, poi_id: uuid.UUID, user_id=None):
    db_poi = get_poi(db, poi_id)
    if db_poi:
        # Snapshot BEFORE anything is removed. The revision (poi_id has no FK)
        # must outlive the POI it describes (Task 1.1).
        record_poi_revision(db, db_poi, 'delete', user_id)
        # First, delete all relationships that reference this POI
        from app.models.poi import POIRelationship
        relationships_to_delete = db.query(POIRelationship).filter(
            or_(
                POIRelationship.source_poi_id == poi_id,
                POIRelationship.target_poi_id == poi_id
            )
        ).all()
        
        for relationship in relationships_to_delete:
            db.delete(relationship)
        
        # Now delete the POI
        db.delete(db_poi)
        db.commit()
    return db_poi


def create_poi_relationship(db: Session, source_poi_id: uuid.UUID, target_poi_id: uuid.UUID, relationship_type: str):
    """Create a relationship between two POIs"""
    relationship = models.POIRelationship(
        source_poi_id=source_poi_id,
        target_poi_id=target_poi_id,
        relationship_type=relationship_type
    )
    db.add(relationship)
    db.commit()
    return relationship


def get_poi_relationships(db: Session, poi_id: uuid.UUID):
    """Get all relationships for a POI"""
    return db.query(models.POIRelationship).filter(
        or_(
            models.POIRelationship.source_poi_id == poi_id,
            models.POIRelationship.target_poi_id == poi_id
        )
    ).all()
