import uuid
import re
from datetime import datetime
from typing import Optional, List, Any, Literal, Dict, Union

from pydantic import BaseModel, field_validator, model_validator, field_serializer, Field, ConfigDict

def strip_html_tags(html: str) -> str:
    """Strip HTML tags and return visible text only."""
    return re.sub(r'<[^>]+>', '', html).strip()
from geoalchemy2.elements import WKBElement
from geoalchemy2.shape import to_shape

from .category import Category
from .primary_type import PrimaryType
from .parking_lot import ParkingLotLink
from ._coercers import EmptyStringToNoneMixin


def normalize_parking_lot_links(links: Optional[List[Any]]) -> Optional[List[Dict[str, Any]]]:
    """Accept a bare ``[uuid, ...]`` list as well as the full dict shape.

    The link picker sends dicts (it owns sort_order and the per-link label), but
    a plain UUID list is the natural payload for a simple "attach these lots"
    call, so both are supported. ``sort_order`` defaults to the list index.
    """
    if links is None:
        return None
    result: List[Dict[str, Any]] = []
    for idx, link in enumerate(links):
        if isinstance(link, dict):
            entry = dict(link)
            entry.setdefault("sort_order", idx)
            result.append(entry)
        else:
            result.append({"parking_lot_id": link, "sort_order": idx, "label": None})
    return result

# Type for titled links - supports both old string format and new dict format
TitledLink = Union[str, Dict[str, str]]

def normalize_titled_links(links: Optional[List[TitledLink]]) -> Optional[List[Dict[str, str]]]:
    """Convert old string format to new dict format for titled links."""
    if links is None:
        return None
    result = []
    for link in links:
        if isinstance(link, str):
            # Old format: just a URL string - convert to dict with empty title
            result.append({"title": "", "url": link})
        elif isinstance(link, dict):
            # New format: already a dict
            result.append(link)
    return result


def coerce_amenities_dict(v):
    # Migration p1_001 used JSONB || on rows whose amenities was already an
    # array, producing shapes like [None, {"wifi": null}]. Collapse to dict so
    # response validation succeeds; keep the malformed value out of the API.
    if isinstance(v, list):
        merged: Dict[str, Any] = {}
        for item in v:
            if isinstance(item, dict):
                merged.update(item)
        return merged or None
    return v

# Helper for slug generation
def generate_slug(value: str) -> str:
    s = value.lower().strip()
    s = re.sub(r'[^\w\s-]', '', s)
    s = re.sub(r'[\s_-]+', '-', s)
    s = re.sub(r'^-+|-+$', '', s)
    return s

# GeoJSON-like structure for coordinates
class PointGeometry(BaseModel):
    type: str = "Point"
    coordinates: List[float]

    @field_validator('coordinates')
    def validate_coordinates(cls, v):
        if len(v) != 2:
            raise ValueError('Coordinates must be a list of two floats [longitude, latitude]')
        return v

    @model_validator(mode='before')
    @classmethod
    def parse_wkb(cls, v):
        if isinstance(v, WKBElement):
            point = to_shape(v)
            return {"type": "Point", "coordinates": list(point.coords)[0]}
        return v


# Task 2.4: LineString / Polygon GeoJSON structures for the geom_line / geom_area
# columns. Response-side only (create/update accept a loose GeoJSON dict validated
# in the CRUD so invalid geometry -> 400). ``parse_wkb`` converts a stored
# geoalchemy2 WKBElement to a GeoJSON dict so the value serializes JSON-safely —
# and therefore appears JSON-safely in poi_revisions snapshots — exactly like
# PointGeometry does for ``location``.
class LineStringGeometry(BaseModel):
    type: str = "LineString"
    coordinates: List[List[float]]

    @model_validator(mode='before')
    @classmethod
    def parse_wkb(cls, v):
        if isinstance(v, WKBElement):
            from shared.poi_geometry import wkb_to_geojson
            return wkb_to_geojson(v) or v
        return v


class PolygonGeometry(BaseModel):
    type: str = "Polygon"
    coordinates: List[List[List[float]]]

    @model_validator(mode='before')
    @classmethod
    def parse_wkb(cls, v):
        if isinstance(v, WKBElement):
            from shared.poi_geometry import wkb_to_geojson
            return wkb_to_geojson(v) or v
        return v


# Business Schemas
PRICE_RANGES = Literal['$', '$$', '$$$', '$$$$']

class BusinessBase(EmptyStringToNoneMixin, BaseModel):
    price_range: Optional[PRICE_RANGES] = None

class BusinessCreate(BusinessBase): pass
class Business(BusinessBase):
    poi_id: uuid.UUID
    model_config = ConfigDict(from_attributes=True)

# Park Schemas
class ParkBase(BaseModel):
    drone_usage_policy: Optional[str] = None

class ParkCreate(ParkBase): pass
class Park(ParkBase):
    poi_id: uuid.UUID
    model_config = ConfigDict(from_attributes=True)

# Trail Schemas
TRAIL_DIFFICULTY = Literal['easy','moderate','difficult','expert']
ROUTE_TYPES = Literal['loop','out_and_back','point_to_point','lollipop','stacked_loops','thru_trail','water_trail','connecting_network']
LISTING_TYPES = Literal['free', 'paid', 'paid_founding', 'community_comped']
SPONSOR_LEVELS = Literal['platform','state','county','town']
ALCOHOL_AVAILABLE = Literal['full_bar','beer_wine','byob','no_alcohol','seasonal','nearby']
TRAIL_LIGHTING = Literal['partial','full','seasonal','dusk_to_dawn']

class TrailBase(EmptyStringToNoneMixin, BaseModel):
    length_text: Optional[str] = None
    length_segments: Optional[List[Dict[str, str]]] = None
    difficulty: Optional[str] = None
    difficulty_description: Optional[str] = None
    route_type: Optional[str] = None
    
    # Trailhead Information
    trailhead_location: Optional[Dict[str, Any]] = None
    trailhead_latitude: Optional[float] = None
    trailhead_longitude: Optional[float] = None
    # Legacy trailhead/exit photo URL columns and exit coordinate columns dropped
    # by migration w63c_001. Photos now live in the Images table; exit
    # coordinates live inside ``access_points`` JSONB entries.
    trail_markings: Optional[str] = None
    trailhead_access_details: Optional[str] = None
    downloadable_trail_map: Optional[str] = None
    
    # Trail Surface & Experience
    trail_surfaces: Optional[List[str]] = None
    trail_conditions: Optional[List[str]] = None
    trail_experiences: Optional[List[str]] = None

    # Phase 1 additions
    mile_markers: Optional[bool] = False
    trailhead_signage: Optional[bool] = False
    audio_guide_available: Optional[bool] = False
    qr_trail_guide: Optional[bool] = False
    trail_guide_notes: Optional[str] = None
    trail_lighting: Optional[TRAIL_LIGHTING] = None
    access_points: Optional[List[Dict[str, Any]]] = None
    trail_entry_notes: Optional[str] = None

class TrailCreate(TrailBase): pass
class Trail(TrailBase):
    poi_id: uuid.UUID
    model_config = ConfigDict(from_attributes=True)

# Event Schemas
class EventBase(EmptyStringToNoneMixin, BaseModel):
    start_datetime: datetime
    end_datetime: Optional[datetime] = None
    is_repeating: bool = False
    repeat_pattern: Optional[Dict[str, Any]] = None  # {"frequency": "weekly|daily|monthly|yearly", ...}
    # Venue inheritance (Task 45)
    venue_poi_id: Optional[uuid.UUID] = None
    venue_inheritance: Optional[Dict[str, Any]] = None
    # Recurring events (Task 50)
    series_id: Optional[uuid.UUID] = None
    parent_event_id: Optional[uuid.UUID] = None
    excluded_dates: Optional[List[str]] = None
    recurrence_end_date: Optional[datetime] = None
    # Manual (one-off) dates. Each entry is either a legacy "YYYY-MM-DD" string
    # or an object {date, start_time, end_time} carrying a per-date time override.
    manual_dates: Optional[List[Union[str, Dict[str, Any]]]] = None
    # Event-specific fields
    organizer_name: Optional[str] = None
    venue_settings: Optional[List[str]] = None
    event_entry_notes: Optional[str] = None
    food_and_drink_info: Optional[str] = None
    coat_check_options: Optional[List[str]] = None
    has_vendors: bool = False
    vendor_types: Optional[List[str]] = None
    vendor_application_deadline: Optional[datetime] = None
    vendor_application_info: Optional[str] = None
    vendor_fee: Optional[str] = None
    vendor_requirements: Optional[str] = None
    vendor_poi_links: Optional[List[Dict[str, Any]]] = None  # [{"poi_id": "...", "vendor_type": "Food"}]
    # Task 134-136: Event Status
    event_status: Optional[str] = 'Scheduled'
    status_explanation: Optional[str] = None
    cancellation_paragraph: Optional[str] = None

    @field_validator('status_explanation', mode='before')
    @classmethod
    def validate_status_explanation_length(cls, v):
        if v is not None and isinstance(v, str) and len(v) > 80:
            raise ValueError('status_explanation must be 80 characters or fewer')
        return v
    contact_organizer_toggle: bool = False
    new_event_link: Optional[str] = None
    rescheduled_from_event_id: Optional[uuid.UUID] = None
    # Task 137: Primary Display Category — DEPRECATED (Issue #42).
    # The canonical primary-category mechanism is the UUID-based
    # `main_category_id` / `is_main` on `poi_categories`. This string field is
    # no longer accepted on Event payloads; the column is renamed to
    # `_deprecated_primary_display_category` by Alembic migration g42_001.
    # Task 138: Extended Organizer
    organizer_email: Optional[str] = None
    organizer_phone: Optional[str] = None
    organizer_website: Optional[str] = None
    organizer_social_media: Optional[Dict[str, str]] = None
    organizer_poi_id: Optional[uuid.UUID] = None
    # Task 139: Cost & Ticketing
    cost_type: Optional[str] = None
    ticket_links: Optional[List[Dict[str, str]]] = None
    # Task 140: Sponsors
    sponsors: Optional[List[Dict[str, Any]]] = None

    # Issue #51: every sponsor must have a tier in Tier 1..Tier 5
    @field_validator('sponsors')
    @classmethod
    def validate_sponsor_tiers(cls, v):
        if v is None:
            return v
        valid_tiers = {'Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Tier 5'}
        for idx, sponsor in enumerate(v):
            if not isinstance(sponsor, dict):
                raise ValueError(f'Sponsor at position {idx + 1} must be an object')
            tier = sponsor.get('tier')
            if not tier:
                raise ValueError(
                    f'Sponsor at position {idx + 1} is missing required Tier value'
                )
            if tier not in valid_tiers:
                raise ValueError(
                    f'Sponsor at position {idx + 1} has invalid Tier value: {tier!r} '
                    f'(must be one of Tier 1, Tier 2, Tier 3, Tier 4, Tier 5)'
                )
        return v

class EventCreate(EventBase): pass
class EventUpdate(EmptyStringToNoneMixin, BaseModel):
    start_datetime: Optional[datetime] = None
    end_datetime: Optional[datetime] = None
    is_repeating: Optional[bool] = None
    repeat_pattern: Optional[Dict[str, Any]] = None
    # Venue inheritance (Task 45)
    venue_poi_id: Optional[uuid.UUID] = None
    venue_inheritance: Optional[Dict[str, Any]] = None
    # Recurring events (Task 50)
    series_id: Optional[uuid.UUID] = None
    parent_event_id: Optional[uuid.UUID] = None
    excluded_dates: Optional[List[str]] = None
    recurrence_end_date: Optional[datetime] = None
    # Manual (one-off) dates. Each entry is either a legacy "YYYY-MM-DD" string
    # or an object {date, start_time, end_time} carrying a per-date time override.
    manual_dates: Optional[List[Union[str, Dict[str, Any]]]] = None
    # Event-specific fields
    organizer_name: Optional[str] = None
    venue_settings: Optional[List[str]] = None
    event_entry_notes: Optional[str] = None
    food_and_drink_info: Optional[str] = None
    coat_check_options: Optional[List[str]] = None
    has_vendors: Optional[bool] = None
    vendor_types: Optional[List[str]] = None
    vendor_application_deadline: Optional[datetime] = None
    vendor_application_info: Optional[str] = None
    vendor_fee: Optional[str] = None
    vendor_requirements: Optional[str] = None
    vendor_poi_links: Optional[List[Dict[str, Any]]] = None  # [{"poi_id": "...", "vendor_type": "Food"}]
    # Task 134-136: Event Status
    event_status: Optional[str] = None
    status_explanation: Optional[str] = None
    cancellation_paragraph: Optional[str] = None
    contact_organizer_toggle: Optional[bool] = None
    new_event_link: Optional[str] = None
    rescheduled_from_event_id: Optional[uuid.UUID] = None
    # Task 137: Primary Display Category — DEPRECATED (Issue #42), see EventBase.
    # Task 138: Extended Organizer
    organizer_email: Optional[str] = None
    organizer_phone: Optional[str] = None
    organizer_website: Optional[str] = None
    organizer_social_media: Optional[Dict[str, str]] = None
    organizer_poi_id: Optional[uuid.UUID] = None
    # Task 139: Cost & Ticketing
    cost_type: Optional[str] = None
    ticket_links: Optional[List[Dict[str, str]]] = None
    # Task 140: Sponsors
    sponsors: Optional[List[Dict[str, Any]]] = None

    # Issue #51: every sponsor must have a tier in Tier 1..Tier 5
    @field_validator('sponsors')
    @classmethod
    def validate_sponsor_tiers(cls, v):
        if v is None:
            return v
        valid_tiers = {'Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Tier 5'}
        for idx, sponsor in enumerate(v):
            if not isinstance(sponsor, dict):
                raise ValueError(f'Sponsor at position {idx + 1} must be an object')
            tier = sponsor.get('tier')
            if not tier:
                raise ValueError(
                    f'Sponsor at position {idx + 1} is missing required Tier value'
                )
            if tier not in valid_tiers:
                raise ValueError(
                    f'Sponsor at position {idx + 1} has invalid Tier value: {tier!r} '
                    f'(must be one of Tier 1, Tier 2, Tier 3, Tier 4, Tier 5)'
                )
        return v
class Event(EventBase):
    poi_id: uuid.UUID
    # Issue #124: "once saved, the event doesn't remember the venue". venue_poi_id
    # persists fine, but the form had nothing to display. There is no ORM
    # relationship to the venue POI, so resolve its name/type at read time.
    # Read-only, response-only (EventCreate/EventUpdate do not carry them).
    venue_name: Optional[str] = None
    venue_type: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode='before')
    @classmethod
    def _resolve_venue_display(cls, data):
        """Fill venue_name/venue_type from the linked venue POI when serializing an ORM row.

        session.get() hits the identity map first, but on list endpoints an
        event whose venue is not in the page pays one extra SELECT per row
        (bounded by page size). If event-heavy list views grow, eager-load the
        venue in crud.get_pois instead.
        """
        if isinstance(data, dict):
            return data
        venue_id = getattr(data, 'venue_poi_id', None)
        if not venue_id or getattr(data, 'venue_name', None) is not None:
            return data
        from sqlalchemy.orm import object_session
        session = object_session(data)
        if session is None:
            return data
        from app.models.poi import PointOfInterest
        with session.no_autoflush:
            venue = session.get(PointOfInterest, venue_id)
        if venue is not None:
            data.venue_name = venue.name
            data.venue_type = (
                venue.poi_type.value if hasattr(venue.poi_type, 'value')
                else str(venue.poi_type)
            )
        return data

# Point of Interest Schemas
POI_TYPES = Literal['BUSINESS', 'SERVICES', 'PARK', 'TRAIL', 'EVENT', 'YOUTH_ACTIVITIES', 'JOBS', 'VOLUNTEER_OPPORTUNITIES', 'DISASTER_HUBS']
PUBLICATION_STATUS = Literal['draft', 'published', 'archived']

# Different status types for different POI types
BUSINESS_STATUS_TYPES = Literal[
    'Fully Open', 'Partly Open', 'Temporary Hour Changes', 'Temporarily Closed',
    'Call Ahead', 'Permanently Closed', 'Warning', 'Limited Capacity',
    'Coming Soon', 'Under Development', 'Alert'
]

EVENT_STATUS_TYPES = Literal[
    'Scheduled', 'Canceled', 'Postponed', 'Updated Date and/or Time',
    'Rescheduled', 'Moved Online', 'Unofficial Proposed Date'
]

OTHER_STATUS_TYPES = Literal[
    'Fully Open', 'Partly Open', 'Temporarily Closed', 'Permanently Closed',
    'Warning', 'Limited Capacity', 'Coming Soon', 'Under Development', 'Alert'
]

class PointOfInterestBase(EmptyStringToNoneMixin, BaseModel):
    poi_type: POI_TYPES
    name: str
    slug: Optional[str] = None  # SEO-friendly URL slug (auto-generated from name + city)
    description_long: Optional[str] = None
    description_short: Optional[str] = None  # Business free listings only (200 char limit)
    teaser_paragraph: Optional[str] = None  # All POI types (120 visible char limit)
    primary_type_id: Optional[uuid.UUID] = None

    @field_validator('teaser_paragraph', mode='before')
    @classmethod
    def validate_teaser_length(cls, v):
        if v is not None and isinstance(v, str) and v.strip():
            visible_text = strip_html_tags(v)
            if len(visible_text) > 120:
                raise ValueError(f'Teaser paragraph must be 120 visible characters or fewer (currently {len(visible_text)})')
        return v

    @field_validator('description_short', mode='before')
    @classmethod
    def validate_short_description_length(cls, v):
        if v is not None and isinstance(v, str) and v.strip():
            visible_text = strip_html_tags(v)
            if len(visible_text) > 250:
                raise ValueError(f'Short description must be 250 visible characters or fewer (currently {len(visible_text)})')
        return v

    # Listing type for all POIs
    listing_type: LISTING_TYPES = 'free'
    
    # Cost fields (for Events, Parks, Trails)
    cost: Optional[str] = None  # Flexible format: "$1000" or "$0.00-$1000.00" or "0"
    pricing_details: Optional[str] = None  # Additional pricing details

    # History (for paid listings, parks, trails)
    history_paragraph: Optional[str] = None
    
    # Featured image
    featured_image: Optional[str] = None
    
    # Main contact (internal use - not public)
    main_contact_name: Optional[str] = None
    main_contact_email: Optional[str] = None
    main_contact_phone: Optional[str] = None
    
    # Emergency contact (admin only - disaster response)
    offsite_emergency_contact: Optional[str] = None
    emergency_protocols: Optional[str] = None
    
    # Ideal For Key Box options (smaller subset)
    ideal_for_key: Optional[List[str]] = None
    
    # Additional Business Details
    price_range_per_person: Optional[str] = None
    pricing: Optional[str] = None
    discounts: Optional[List[str]] = None
    gift_cards: Optional[str] = None
    youth_amenities: Optional[List[str]] = None
    business_amenities: Optional[List[str]] = None
    entertainment_options: Optional[List[str]] = None
    
    # Menu & Online Booking (Business only)
    # menu_photos - DEPRECATED: moved to Images table (image_type='menu')
    menu_link: Optional[str] = None
    delivery_links: Optional[List[TitledLink]] = None  # [{"title": "DoorDash", "url": "https://..."}]
    reservation_links: Optional[List[TitledLink]] = None  # [{"title": "OpenTable", "url": "https://..."}]
    appointment_links: Optional[List[TitledLink]] = None  # [{"title": "Calendly", "url": "https://..."}]
    online_ordering_links: Optional[List[TitledLink]] = None  # [{"title": "Order Direct", "url": "https://..."}]

    # Validators to normalize link formats (convert strings to dicts)
    @field_validator('delivery_links', 'reservation_links', 'appointment_links', 'online_ordering_links', mode='before')
    @classmethod
    def normalize_links(cls, v):
        return normalize_titled_links(v)

    # Gallery
    # gallery_photos - DEPRECATED: moved to Images table (image_type='gallery')

    # Business Entry
    business_entry_notes: Optional[str] = None
    # business_entry_photo - DEPRECATED: moved to Images table (image_type='entry')

    # Hours enhancements
    appointment_booking_url: Optional[str] = None
    hours_but_appointment_required: Optional[bool] = False
    
    # Service Relationships
    service_locations: Optional[List[uuid.UUID]] = None
    
    # Locally Found & Community
    locally_found_at: Optional[List[uuid.UUID]] = None
    article_links: Optional[List[Dict[str, str]]] = None
    community_impact: Optional[str] = None
    organization_memberships: Optional[List[Dict[str, Any]]] = None
    
    # Rental photos
    # rental_photos - DEPRECATED: moved to Images table (image_type='rental')

    # Address fields
    dont_display_location: bool = False  # For businesses that don't want exact location shown
    address_full: Optional[str] = None
    address_street: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None
    address_county: Optional[str] = None

    # Front door coordinates (separate from main location for map pin)
    front_door_latitude: Optional[float] = None
    front_door_longitude: Optional[float] = None
    
    # Status and verification
    status: Optional[str] = 'Fully Open'  # Will be validated based on POI type
    status_message: Optional[str] = None
    is_verified: bool = False
    is_disaster_hub: bool = False
    lat_long_most_accurate: bool = False

    # Publication status (draft, published, archived)
    publication_status: PUBLICATION_STATUS = 'draft'
    has_been_published: Optional[bool] = False

    # Phase 1 additions
    arrival_methods: Optional[List[str]] = []
    what3words_address: Optional[str] = None
    icon_free_wifi: Optional[bool] = False
    icon_pet_friendly: Optional[bool] = False
    icon_public_restroom: Optional[bool] = False
    icon_wheelchair_accessible: Optional[bool] = False
    is_sponsor: Optional[bool] = False
    sponsor_level: Optional[SPONSOR_LEVELS] = None
    admin_notes: Optional[str] = None
    accessible_parking_details: Optional[List[str]] = None
    accessible_restroom: Optional[bool] = False
    # Current shape is a list of checklist labels (like accessible_parking_details /
    # playground_ada_checklist); legacy rows may still hold the old {label: bool}
    # dict. Accept BOTH so the admin list response never fails validation — a strict
    # Dict here 500s the whole /api/admin/pois/ list on any list-shaped row.
    accessible_restroom_details: Optional[Union[List[str], Dict[str, Any]]] = None
    playground_age_groups: Optional[List[str]] = None
    playground_ada_checklist: Optional[List[str]] = None
    inclusive_playground: Optional[bool] = False
    alcohol_available: Optional[ALCOHOL_AVAILABLE] = None


    # Contact info
    website_url: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    
    # Social media fields (usernames only)
    instagram_username: Optional[str] = None
    facebook_username: Optional[str] = None
    x_username: Optional[str] = None
    tiktok_username: Optional[str] = None
    linkedin_username: Optional[str] = None
    other_socials: Optional[Dict[str, str]] = None
    
    # Parking Information
    parking_types: Optional[List[str]] = None
    parking_locations: Optional[List[Dict[str, Any]]] = None
    parking_notes: Optional[str] = None
    # parking_photos - DEPRECATED: moved to Images table (image_type='parking')
    # public_transit_info - DEPRECATED: renamed _deprecated_public_transit_info (Migration A #33)
    expect_to_pay_parking: Optional[Literal['yes', 'no', 'sometimes']] = None
    # Shareable lots this POI surfaces. Write-only input: persisted as
    # poi_parking_links edges (never a column), and what the reader gets back is
    # the unified `parking_lots` array below. A bare [uuid, ...] is accepted.
    parking_lot_links: Optional[List[ParkingLotLink]] = None

    @field_validator('parking_lot_links', mode='before')
    @classmethod
    def coerce_parking_lot_links(cls, v):
        return normalize_parking_lot_links(v)

    # Additional Info
    downloadable_maps: Optional[List[Dict[str, str]]] = None
    payment_methods: Optional[List[str]] = None
    # key_facilities - DEPRECATED: renamed _deprecated_key_facilities (Migration A #34)
    alcohol_options: Optional[List[str]] = None
    alcohol_policy_details: Optional[str] = None
    # Issue #69 — granular alcohol detail.
    alcohol_availability: Optional[List[str]] = None
    byob_allowed: Optional[bool] = False
    alcohol_notes: Optional[str] = None
    # wheelchair_accessible - DROPPED (Issue #45 PR2 Migration B)
    wheelchair_details: Optional[str] = None
    mobility_access: Optional[Dict[str, Any]] = None
    cell_service: Optional[str] = None  # single value: Good/Limited/Unknown/None
    smoking_options: Optional[List[str]] = None
    smoking_details: Optional[str] = None
    wifi_options: Optional[List[str]] = None
    drone_usage: Optional[str] = None
    drone_policy: Optional[str] = None
    pet_options: Optional[List[str]] = None
    pet_policy: Optional[str] = None

    # Public Toilets
    public_toilets: Optional[List[str]] = None
    toilet_locations: Optional[List[Dict[str, Any]]] = None
    toilet_description: Optional[str] = None
    
    # Rentals
    available_for_rent: bool = False
    rental_info: Optional[str] = None
    rental_pricing: Optional[str] = None
    rental_link: Optional[str] = None
    # rental_photos - DEPRECATED (duplicate): moved to Images table (image_type='rental')

    # Playground Information (All POIs)
    playground_available: bool = False
    playground_types: Optional[List[str]] = None
    playground_surface_types: Optional[List[str]] = None
    playground_notes: Optional[str] = None
    # playground_photos - DEPRECATED: moved to Images table (image_type='playground')
    playground_locations: Optional[Any] = None  # List of dicts (multiple playgrounds). Accepts a single dict for backward-compat; migration g67_001 wraps legacy singular rows.

    # Parks & Trails Additional Info
    # payphone_location (singular) removed — deprecated to _deprecated_payphone_location
    # in migration m_payphone_001; data consolidated into the plural array below.
    # (Leaving it here would crash create_poi's PointOfInterest(**poi_data) since the
    # column no longer exists on the model.)
    payphone_locations: Optional[List[Dict[str, Any]]] = None
    park_entry_notes: Optional[str] = None
    # park_entry_photo - DEPRECATED: moved to Images table (image_type='entry')
    # parking_lot_photo - DEPRECATED: moved to Images table (image_type='parking')
    facilities_options: Optional[List[str]] = None
    night_sky_viewing: Optional[str] = None
    natural_features: Optional[List[str]] = None
    outdoor_types: Optional[List[str]] = None
    things_to_do: Optional[List[str]] = None
    birding_wildlife: Optional[str] = None
    
    # Hunting & Fishing
    hunting_fishing_allowed: Optional[str] = None
    hunting_types: Optional[List[str]] = None
    fishing_allowed: Optional[str] = None
    fishing_types: Optional[List[str]] = None
    licenses_required: Optional[List[str]] = None
    hunting_fishing_info: Optional[str] = None
    
    # Memberships & Passes
    membership_passes: Optional[List[uuid.UUID]] = None
    membership_details: Optional[str] = None
    
    # Trail connections
    associated_trails: Optional[List[uuid.UUID]] = None
    camping_lodging: Optional[str] = None
    
    # JSONB fields
    photos: Optional[Dict[str, Any]] = None
    hours: Optional[Dict[str, Any]] = None  # Complex hours with multiple periods, seasonal, and holidays (nested at hours.holidays)
    # holiday_hours — DEPRECATED (Issue #70). Holiday hours now live under
    # `hours.holidays`. Schema no longer exposes the top-level field; the
    # column is renamed to `_deprecated_holiday_hours` by migration g70_001.
    amenities: Optional[Dict[str, Any]] = None
    ideal_for: Optional[Union[Dict[str, List[str]], List[str]]] = None  # Grouped dict preferred; flat list accepted for back-compat
    contact_info: Optional[Dict[str, Any]] = None
    compliance: Optional[Dict[str, Any]] = None
    custom_fields: Optional[Dict[str, Any]] = None

    @field_validator('amenities', mode='before')
    @classmethod
    def _coerce_amenities(cls, v):
        return coerce_amenities_dict(v)

class PointOfInterestCreate(PointOfInterestBase):
    location: PointGeometry
    # Task 2.4: optional GeoJSON line/area geometries. Accepted as a loose dict so
    # a malformed geometry is caught in the CRUD (via geojson_to_wkt) and returned
    # as HTTP 400, not a Pydantic 422; a valid dict is validated + converted to WKT
    # there. Not autosave — only the explicit create/update paths carry these.
    geom_line: Optional[Dict[str, Any]] = None
    geom_area: Optional[Dict[str, Any]] = None
    business: Optional[BusinessCreate] = None
    park: Optional[ParkCreate] = None
    trail: Optional[TrailCreate] = None
    event: Optional[EventCreate] = None
    main_category_id: Optional[uuid.UUID] = None  # Single main category
    category_ids: Optional[List[uuid.UUID]] = []  # Secondary categories

    @model_validator(mode='before')
    @classmethod
    def validate_poi_type_and_subtype(cls, values):
        if isinstance(values, dict):
            poi_type = values.get('poi_type')
            if poi_type == 'BUSINESS' and values.get('business') is None:
                raise ValueError("Business data required for poi_type 'BUSINESS'")
            elif poi_type == 'PARK' and values.get('park') is None:
                raise ValueError("Park data required for poi_type 'PARK'")
            elif poi_type == 'TRAIL' and values.get('trail') is None:
                raise ValueError("Trail data required for poi_type 'TRAIL'")
            elif poi_type == 'EVENT' and values.get('event') is None:
                raise ValueError("Event data required for poi_type 'EVENT'")
        return values

class PointOfInterestUpdate(EmptyStringToNoneMixin, BaseModel):
    poi_type: Optional[POI_TYPES] = None
    name: Optional[str] = None
    slug: Optional[str] = None  # SEO-friendly URL slug
    description_long: Optional[str] = None
    description_short: Optional[str] = None
    teaser_paragraph: Optional[str] = None

    @field_validator('teaser_paragraph', mode='before')
    @classmethod
    def validate_teaser_length(cls, v):
        if v is not None and isinstance(v, str) and v.strip():
            visible_text = strip_html_tags(v)
            if len(visible_text) > 120:
                raise ValueError(f'Teaser paragraph must be 120 visible characters or fewer (currently {len(visible_text)})')
        return v

    @field_validator('description_short', mode='before')
    @classmethod
    def validate_short_description_length(cls, v):
        if v is not None and isinstance(v, str) and v.strip():
            visible_text = strip_html_tags(v)
            if len(visible_text) > 250:
                raise ValueError(f'Short description must be 250 visible characters or fewer (currently {len(visible_text)})')
        return v

    listing_type: Optional[LISTING_TYPES] = None
    cost: Optional[str] = None
    pricing_details: Optional[str] = None
    history_paragraph: Optional[str] = None
    featured_image: Optional[str] = None
    primary_type_id: Optional[uuid.UUID] = None
    main_contact_name: Optional[str] = None
    main_contact_email: Optional[str] = None
    main_contact_phone: Optional[str] = None
    offsite_emergency_contact: Optional[str] = None
    emergency_protocols: Optional[str] = None
    ideal_for_key: Optional[List[str]] = None
    price_range_per_person: Optional[str] = None
    pricing: Optional[str] = None
    discounts: Optional[List[str]] = None
    gift_cards: Optional[str] = None
    youth_amenities: Optional[List[str]] = None
    business_amenities: Optional[List[str]] = None
    entertainment_options: Optional[List[str]] = None
    # menu_photos - DEPRECATED: moved to Images table (image_type='menu')
    menu_link: Optional[str] = None
    delivery_links: Optional[List[TitledLink]] = None
    reservation_links: Optional[List[TitledLink]] = None
    appointment_links: Optional[List[TitledLink]] = None
    online_ordering_links: Optional[List[TitledLink]] = None
    # gallery_photos - DEPRECATED: moved to Images table (image_type='gallery')
    business_entry_notes: Optional[str] = None

    # Validators to normalize link formats (convert strings to dicts)
    @field_validator('delivery_links', 'reservation_links', 'appointment_links', 'online_ordering_links', mode='before')
    @classmethod
    def normalize_links(cls, v):
        return normalize_titled_links(v)
    # business_entry_photo - DEPRECATED: moved to Images table (image_type='entry')
    appointment_booking_url: Optional[str] = None
    hours_but_appointment_required: Optional[bool] = None
    service_locations: Optional[List[uuid.UUID]] = None
    locally_found_at: Optional[List[uuid.UUID]] = None
    article_links: Optional[List[Dict[str, str]]] = None
    community_impact: Optional[str] = None
    organization_memberships: Optional[List[Dict[str, Any]]] = None
    # rental_photos - DEPRECATED: moved to Images table (image_type='rental')
    dont_display_location: Optional[bool] = None
    address_full: Optional[str] = None
    address_street: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None
    address_county: Optional[str] = None
    front_door_latitude: Optional[float] = None
    front_door_longitude: Optional[float] = None
    status: Optional[str] = None
    status_message: Optional[str] = None
    is_verified: Optional[bool] = None
    is_disaster_hub: Optional[bool] = None
    lat_long_most_accurate: Optional[bool] = None
    publication_status: Optional[PUBLICATION_STATUS] = None
    website_url: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    instagram_username: Optional[str] = None
    facebook_username: Optional[str] = None
    x_username: Optional[str] = None
    tiktok_username: Optional[str] = None
    linkedin_username: Optional[str] = None
    other_socials: Optional[Dict[str, str]] = None
    parking_types: Optional[List[str]] = None
    parking_locations: Optional[List[Dict[str, Any]]] = None
    parking_notes: Optional[str] = None
    # parking_photos - DEPRECATED: moved to Images table (image_type='parking')
    # public_transit_info - DEPRECATED: renamed _deprecated_public_transit_info (Migration A #33)
    expect_to_pay_parking: Optional[Literal['yes', 'no', 'sometimes']] = None
    # See PointOfInterestBase: write-only, persisted as poi_parking_links edges.
    parking_lot_links: Optional[List[ParkingLotLink]] = None

    @field_validator('parking_lot_links', mode='before')
    @classmethod
    def coerce_parking_lot_links(cls, v):
        return normalize_parking_lot_links(v)

    downloadable_maps: Optional[List[Dict[str, str]]] = None
    payment_methods: Optional[List[str]] = None
    # key_facilities - DEPRECATED: renamed _deprecated_key_facilities (Migration A #34)
    alcohol_options: Optional[List[str]] = None
    alcohol_policy_details: Optional[str] = None
    # Issue #69 — granular alcohol detail.
    alcohol_availability: Optional[List[str]] = None
    byob_allowed: Optional[bool] = False
    alcohol_notes: Optional[str] = None
    # wheelchair_accessible - DROPPED (Issue #45 PR2 Migration B)
    wheelchair_details: Optional[str] = None
    mobility_access: Optional[Dict[str, Any]] = None
    cell_service: Optional[str] = None  # single value: Good/Limited/Unknown/None
    smoking_options: Optional[List[str]] = None
    smoking_details: Optional[str] = None
    wifi_options: Optional[List[str]] = None
    drone_usage: Optional[str] = None
    drone_policy: Optional[str] = None
    pet_options: Optional[List[str]] = None
    pet_policy: Optional[str] = None
    public_toilets: Optional[List[str]] = None
    toilet_locations: Optional[List[Dict[str, Any]]] = None
    toilet_description: Optional[str] = None
    available_for_rent: Optional[bool] = None
    rental_info: Optional[str] = None
    rental_pricing: Optional[str] = None
    rental_link: Optional[str] = None
    # rental_photos - DEPRECATED (duplicate): moved to Images table (image_type='rental')
    playground_available: Optional[bool] = None
    playground_types: Optional[List[str]] = None
    playground_surface_types: Optional[List[str]] = None
    playground_notes: Optional[str] = None
    # playground_photos - DEPRECATED: moved to Images table (image_type='playground')
    playground_locations: Optional[Any] = None  # List of dicts (multiple playgrounds). Accepts a single dict for backward-compat; migration g67_001 wraps legacy singular rows.
    # payphone_location (singular) removed — deprecated to _deprecated_payphone_location
    # in migration m_payphone_001; data consolidated into the plural array below.
    # (Leaving it here would crash create_poi's PointOfInterest(**poi_data) since the
    # column no longer exists on the model.)
    payphone_locations: Optional[List[Dict[str, Any]]] = None
    park_entry_notes: Optional[str] = None
    # park_entry_photo - DEPRECATED: moved to Images table (image_type='entry')
    # parking_lot_photo - DEPRECATED: moved to Images table (image_type='parking')
    facilities_options: Optional[List[str]] = None
    night_sky_viewing: Optional[str] = None
    natural_features: Optional[List[str]] = None
    outdoor_types: Optional[List[str]] = None
    things_to_do: Optional[List[str]] = None
    birding_wildlife: Optional[str] = None
    hunting_fishing_allowed: Optional[str] = None
    hunting_types: Optional[List[str]] = None
    fishing_allowed: Optional[str] = None
    fishing_types: Optional[List[str]] = None
    licenses_required: Optional[List[str]] = None
    hunting_fishing_info: Optional[str] = None
    membership_passes: Optional[List[uuid.UUID]] = None
    membership_details: Optional[str] = None
    associated_trails: Optional[List[uuid.UUID]] = None
    camping_lodging: Optional[str] = None
    photos: Optional[Dict[str, Any]] = None
    hours: Optional[Dict[str, Any]] = None
    # holiday_hours — DEPRECATED (Issue #70); use hours.holidays.
    amenities: Optional[Dict[str, Any]] = None
    ideal_for: Optional[Union[Dict[str, List[str]], List[str]]] = None
    contact_info: Optional[Dict[str, Any]] = None
    compliance: Optional[Dict[str, Any]] = None
    custom_fields: Optional[Dict[str, Any]] = None

    # Phase 1 additions
    has_been_published: Optional[bool] = None
    arrival_methods: Optional[List[str]] = None
    what3words_address: Optional[str] = None
    icon_free_wifi: Optional[bool] = None
    icon_pet_friendly: Optional[bool] = None
    icon_public_restroom: Optional[bool] = None
    icon_wheelchair_accessible: Optional[bool] = None
    is_sponsor: Optional[bool] = None
    sponsor_level: Optional[SPONSOR_LEVELS] = None
    admin_notes: Optional[str] = None
    accessible_parking_details: Optional[List[str]] = None
    accessible_restroom: Optional[bool] = None
    # Current shape is a list of checklist labels (like accessible_parking_details /
    # playground_ada_checklist); legacy rows may still hold the old {label: bool}
    # dict. Accept BOTH so the admin list response never fails validation — a strict
    # Dict here 500s the whole /api/admin/pois/ list on any list-shaped row.
    accessible_restroom_details: Optional[Union[List[str], Dict[str, Any]]] = None
    playground_age_groups: Optional[List[str]] = None
    playground_ada_checklist: Optional[List[str]] = None
    inclusive_playground: Optional[bool] = None
    alcohol_available: Optional[ALCOHOL_AVAILABLE] = None

    location: Optional[PointGeometry] = None
    # Task 2.4: loose GeoJSON (validated -> 400 in the CRUD, like create). Partial-
    # update safe — absent means "leave untouched", explicit null means "clear".
    geom_line: Optional[Dict[str, Any]] = None
    geom_area: Optional[Dict[str, Any]] = None
    business: Optional[BusinessCreate] = None
    park: Optional[ParkCreate] = None
    trail: Optional[TrailCreate] = None
    event: Optional[EventUpdate] = None
    main_category_id: Optional[uuid.UUID] = None  # Single main category
    category_ids: Optional[List[uuid.UUID]] = None  # Secondary categories

    model_config = ConfigDict(from_attributes=True)

class PointOfInterest(PointOfInterestBase):
    poi_type: str = Field(..., alias='poi_type')
    id: uuid.UUID
    location: PointGeometry
    # Task 2.4: serialized as GeoJSON (None when unset) so they round-trip on the
    # admin GET/POST/PUT responses and appear JSON-safely in poi_revisions snapshots.
    geom_line: Optional[LineStringGeometry] = None
    geom_area: Optional[PolygonGeometry] = None
    business: Optional[Business] = None
    park: Optional[Park] = None
    trail: Optional[Trail] = None
    event: Optional[Event] = None
    main_category: Optional[Category] = None  # Will be populated via property
    secondary_categories: List[Category] = []  # Will be populated via property
    categories: List[Category] = []  # All categories (for backward compatibility)
    # The unified parking read: the POI's own pins (origin "own") followed by its
    # linked shareable lots (origin "linked"). Derived, never stored; populated by
    # _enrich_response_fields via shared.parking_lots.enrich_poi_parking.
    parking_lots: List[Dict[str, Any]] = []
    created_at: datetime
    last_updated: datetime

    @field_validator('poi_type', mode='before')
    @classmethod
    def coerce_poi_type(cls, v):
        if hasattr(v, 'value'):
            return v.value
        return str(v)

    model_config = {'from_attributes': True, 'populate_by_name': True}

# POI Relationship Schema
class POIRelationshipBase(BaseModel):
    source_poi_id: uuid.UUID
    target_poi_id: uuid.UUID
    relationship_type: str

class POIRelationshipCreate(POIRelationshipBase):
    pass

class POIRelationship(POIRelationshipBase):
    model_config = ConfigDict(from_attributes=True)


# Venue Data for Event - used when pulling venue data into an event
class VenueDataForEvent(BaseModel):
    """Data from a venue (BUSINESS or PARK) that can be copied to an event"""
    venue_id: uuid.UUID
    venue_name: str
    venue_type: str  # BUSINESS or PARK

    # Address fields
    address_full: Optional[str] = None
    address_street: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None
    address_county: Optional[str] = None

    # Location
    location: Optional[PointGeometry] = None
    front_door_latitude: Optional[float] = None
    front_door_longitude: Optional[float] = None
    what3words_address: Optional[str] = None
    arrival_methods: Optional[List[str]] = None
    # Entry notes normalized across venue types (business/park/trail_entry_notes)
    # so the event form can drop them straight into event_entry_notes (#124 P11).
    entry_notes: Optional[str] = None

    # Contact info
    phone_number: Optional[str] = None
    email: Optional[str] = None
    website_url: Optional[str] = None

    # Parking
    parking_types: Optional[List[str]] = None
    parking_notes: Optional[str] = None
    parking_locations: Optional[List[Dict[str, Any]]] = None
    expect_to_pay_parking: Optional[str] = None
    accessible_parking_details: Optional[List[str]] = None
    # public_transit_info - DEPRECATED: renamed _deprecated_public_transit_info (Migration A #33)

    # Accessibility
    # wheelchair_accessible - DROPPED (Issue #45 PR2 Migration B)
    wheelchair_details: Optional[str] = None
    # {step_free_entry, main_area_accessible, ground_level_service} (#124)
    mobility_access: Optional[Dict[str, Any]] = None

    # Restroom
    public_toilets: Optional[List[str]] = None
    toilet_description: Optional[str] = None
    toilet_locations: Optional[List[Dict[str, Any]]] = None
    accessible_restroom: Optional[bool] = None
    accessible_restroom_details: Optional[List[str]] = None

    # Playground (#124)
    playground_available: Optional[bool] = None
    playground_types: Optional[List[str]] = None
    playground_surface_types: Optional[List[str]] = None
    playground_notes: Optional[str] = None
    playground_locations: Optional[List[Dict[str, Any]]] = None
    playground_age_groups: Optional[List[str]] = None
    playground_ada_checklist: Optional[List[str]] = None
    inclusive_playground: Optional[bool] = None

    # Pet policy (#124)
    pet_options: Optional[List[str]] = None
    pet_policy: Optional[str] = None

    # Alcohol + smoking (#124)
    alcohol_available: Optional[str] = None
    alcohol_availability: Optional[List[str]] = None
    alcohol_options: Optional[List[str]] = None
    alcohol_policy_details: Optional[str] = None
    alcohol_notes: Optional[str] = None
    byob_allowed: Optional[bool] = None
    smoking_options: Optional[List[str]] = None
    smoking_details: Optional[str] = None

    # Amenities
    amenities: Optional[Dict[str, Any]] = None
    payment_methods: Optional[List[str]] = None
    cell_service: Optional[Any] = None
    payphone_locations: Optional[List[Dict[str, Any]]] = None

    # Hours are NOT copyable (#124): an event's schedule is its own.

    @field_validator('amenities', mode='before')
    @classmethod
    def _coerce_amenities(cls, v):
        return coerce_amenities_dict(v)

    # Photos that can be copied (metadata only, not binary)
    copyable_images: List[Dict[str, Any]] = []

    model_config = ConfigDict(from_attributes=True)