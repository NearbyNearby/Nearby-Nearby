import uuid
from sqlalchemy import Column, String, Text, ForeignKey, Numeric, TIMESTAMP, Boolean, Enum, CheckConstraint, text
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from geoalchemy2 import Geometry
import enum

from shared.models.base import Base
from shared.models.category import poi_category_association  # Import the association table

from shared.models.enums import POIType

class PointOfInterest(Base):
    __tablename__ = "points_of_interest"
    __table_args__ = (
        CheckConstraint(
            "alcohol_available IS NULL OR alcohol_available IN "
            "('full_bar','beer_wine','byob','no_alcohol','seasonal','nearby')",
            name="ck_points_of_interest_alcohol_available_valid",
        ),
        CheckConstraint(
            "expect_to_pay_parking IS NULL OR expect_to_pay_parking IN "
            "('yes','no','sometimes')",
            name="ck_points_of_interest_expect_to_pay_parking_valid",
        ),
        CheckConstraint(
            "listing_type IS NULL OR listing_type IN "
            "('free','paid','paid_founding','community_comped')",
            name="ck_points_of_interest_listing_type_valid",
        ),
        CheckConstraint(
            "publication_status IS NULL OR publication_status IN "
            "('draft','published','archived')",
            name="ck_points_of_interest_publication_status_valid",
        ),
        CheckConstraint(
            "sponsor_level IS NULL OR sponsor_level IN "
            "('platform','state','county','town')",
            name="ck_points_of_interest_sponsor_level_valid",
        ),
        # Task 2.6 — enum-like VARCHAR columns constrained to their vocab.
        CheckConstraint(
            "status IS NULL OR status IN "
            "('Fully Open','Partly Open','Temporary Hour Changes',"
            "'Temporarily Closed','Call Ahead','Permanently Closed','Warning',"
            "'Limited Capacity','Coming Soon','Under Development','Alert')",
            name="ck_points_of_interest_status_valid",
        ),
        CheckConstraint(
            "gift_cards IS NULL OR gift_cards IN "
            "('yes_this_only','no','yes_select_others')",
            name="ck_points_of_interest_gift_cards_valid",
        ),
        CheckConstraint(
            "drone_usage IS NULL OR drone_usage IN "
            "('Yes, follow all current Drone Laws','Yes, With Permit from Park','No')",
            name="ck_points_of_interest_drone_usage_valid",
        ),
        CheckConstraint(
            "hunting_fishing_allowed IS NULL OR hunting_fishing_allowed IN "
            "('no','seasonal','year_round')",
            name="ck_points_of_interest_hunting_fishing_allowed_valid",
        ),
        CheckConstraint(
            "fishing_allowed IS NULL OR fishing_allowed IN "
            "('no','catch_release','catch_keep','other')",
            name="ck_points_of_interest_fishing_allowed_valid",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    poi_type = Column(Enum(POIType), nullable=False)
    name = Column(String(255), nullable=False)
    slug = Column(String(300), unique=True, index=True)  # SEO-friendly URL slug (name-city)
    description_long = Column(Text)
    description_short = Column(Text)  # Business free listings only (250 visible char limit, validated in schema)
    teaser_paragraph = Column(Text)  # All POI types (120 visible char limit, validated in schema)

    # Primary Type (e.g., Food Truck, Ghost Kitchen, Pop-up)
    primary_type_id = Column(UUID(as_uuid=True), ForeignKey("primary_types.id"), nullable=True, index=True)

    # Address fields
    dont_display_location = Column(Boolean, default=False)  # For businesses that don't want exact location shown
    address_full = Column(String)
    address_street = Column(String)
    address_city = Column(String)
    address_state = Column(String)
    address_zip = Column(String)
    address_county = Column(String)

    # Front door coordinates (separate from main location for map pin)
    front_door_latitude = Column(Numeric(precision=10, scale=7))
    front_door_longitude = Column(Numeric(precision=10, scale=7))
    arrival_methods    = Column(JSONB, server_default='[]')
    what3words_address = Column(String(100))

    # Location (PostGIS)
    location = Column(Geometry(geometry_type='POINT', srid=4326), nullable=False)

    # Status and verification
    status = Column(String(50), default='Fully Open')
    status_message = Column(String(100))
    is_verified = Column(Boolean, default=False)
    is_disaster_hub = Column(Boolean, default=False)
    lat_long_most_accurate = Column(Boolean, default=False)
    icon_free_wifi             = Column(Boolean, nullable=False, server_default='false', default=False)
    icon_pet_friendly          = Column(Boolean, nullable=False, server_default='false', default=False)
    icon_public_restroom       = Column(Boolean, nullable=False, server_default='false', default=False)
    icon_wheelchair_accessible = Column(Boolean, nullable=False, server_default='false', default=False)

    # Publication status (draft, published, archived)
    publication_status = Column(String(20), default='draft', nullable=False)
    has_been_published = Column(Boolean, nullable=False, server_default='false', default=False)

    # Contact info
    website_url = Column(String)
    phone_number = Column(String)
    email = Column(String)

    # Social media fields (usernames only)
    instagram_username = Column(String)
    facebook_username = Column(String)
    x_username = Column(String)
    tiktok_username = Column(String)
    linkedin_username = Column(String)
    other_socials = Column(JSONB)  # {"youtube": "channel", "bluesky": "handle"}

    # Listing type for all POIs
    listing_type = Column(String(50), default='free')  # 'free', 'paid', 'paid_founding', 'sponsor', 'community_comped'
    is_sponsor    = Column(Boolean, nullable=False, server_default='false', default=False)
    sponsor_level = Column(String(30))
    admin_notes   = Column(Text)

    # Main category (required)
    # Main category is now handled through poi_categories table with is_main=True

    # Cost fields (for Events, Parks, Trails)
    cost = Column(String(100))  # Flexible format: "$1000" or "$0.00-$1000.00" or "0" (shows as Free)
    pricing_details = Column(Text)  # Additional pricing details like "Kids Under 2 are Free"

    # Parking Information (will be in Location accordion on frontend)
    parking_types = Column(JSONB)  # List of parking types selected
    parking_locations = Column(JSONB)  # [{"lat": 0, "lng": 0, "name": "Main lot"}]
    parking_notes = Column(Text)
    # parking_photos moved to Images table (image_type='parking')
    # public_transit_info renamed to _deprecated_public_transit_info (Migration A #33)
    expect_to_pay_parking = Column(String)  # 'yes', 'no', 'sometimes'

    # Additional Info
    downloadable_maps = Column(JSONB)  # [{"name": "Trail Map", "url": "..."}]
    payment_methods = Column(JSONB)  # List of accepted payment methods
    # key_facilities renamed to _deprecated_key_facilities (Migration A #34)
    alcohol_options = Column(JSONB)  # List of alcohol availability options
    alcohol_policy_details = Column(Text)  # Additional alcohol policy details
    alcohol_available = Column(String(50))
    # Issue #69 — granular alcohol detail surfaced inside the Alcohol accordion
    # only when alcohol_available != 'no_alcohol'.
    alcohol_availability = Column(JSONB)  # List of granular alcohol types (beer/wine/...)
    byob_allowed = Column(Boolean, nullable=False, server_default='false', default=False)
    alcohol_notes = Column(Text)
    # wheelchair_accessible removed — column dropped (Issue #45 PR2 Migration B)
    wheelchair_details = Column(Text)
    accessible_parking_details  = Column(JSONB)
    accessible_restroom         = Column(Boolean, nullable=False, server_default='false', default=False)
    accessible_restroom_details = Column(JSONB)
    mobility_access             = Column(JSONB)  # {step_free_entry, main_area_accessible, ground_level_service}
    cell_service                = Column(JSONB)  # single CELL_SERVICE_OPTIONS value (Good/Limited/Unknown/None)
    smoking_options = Column(JSONB)  # List of smoking options
    smoking_details = Column(Text)
    wifi_options = Column(JSONB)  # For Events only
    # Drone fields surface only in Park (s14) + Trail (s15) admin layouts.
    # Events deliberately render NO drone section (Wave 4 #59 spec — FAA
    # crowd-area rules), so drone_usage / drone_policy are write-orphans for
    # POI rows where poi_type='EVENT'. Reads still work; the columns stay.
    drone_usage = Column(String)
    drone_policy = Column(Text)
    pet_options = Column(JSONB)  # List of pet policy options
    pet_policy = Column(Text)

    # Public Toilets
    public_toilets = Column(JSONB)  # List of toilet options
    toilet_locations = Column(JSONB)  # [{"lat": 0, "lng": 0}]
    toilet_description = Column(Text)  # e.g., "For Paying Customers Only"

    # Rentals
    available_for_rent = Column(Boolean, default=False)
    rental_info = Column(Text)
    rental_pricing = Column(Text)
    rental_link = Column(String)
    # rental_photos moved to Images table (image_type='rental')

    # History (for paid listings, parks, trails)
    history_paragraph = Column(Text)

    # Featured image
    featured_image = Column(String)  # URL to featured image or logo

    # Main contact (internal use - not public)
    main_contact_name = Column(String)
    main_contact_email = Column(String)
    main_contact_phone = Column(String)

    # Emergency contact (admin only - disaster response)
    offsite_emergency_contact = Column(Text)  # Admin only field
    emergency_protocols = Column(Text)  # Admin only field

    # Ideal For Key Box options (smaller subset)
    ideal_for_key = Column(JSONB)  # List of key ideal_for options

    # Additional Business Details
    price_range_per_person = Column(String)  # "$10 and under", "$15 and under", etc.
    pricing = Column(String)  # General pricing text (all POIs)
    discounts = Column(JSONB)  # List of discount types offered
    gift_cards = Column(String)  # 'yes_this_only', 'no', 'yes_select_others'
    youth_amenities = Column(JSONB)  # List of youth amenities (Business only)
    business_amenities = Column(JSONB)  # List of business amenities/services
    entertainment_options = Column(JSONB)  # List of entertainment options

    # Menu & Online Booking (Business only)
    menu_photos = Column(JSONB)  # List of menu photo URLs
    menu_link = Column(String)  # Link to online menu
    delivery_links = Column(JSONB)  # List of delivery service links
    reservation_links = Column(JSONB)  # List of reservation links
    appointment_links = Column(JSONB)  # List of appointment scheduling links
    online_ordering_links = Column(JSONB)  # List of online ordering links

    # Gallery
    gallery_photos = Column(JSONB)

    # Business Entry
    business_entry_notes = Column(Text)
    # business_entry_photo moved to Images table (image_type='entry')

    # Hours enhancements
    appointment_booking_url = Column(String)
    hours_but_appointment_required = Column(Boolean, default=False)

    # Service Relationships
    service_locations = Column(JSONB)  # POI IDs where this business provides services

    # Locally Found & Community
    locally_found_at = Column(JSONB)  # POI IDs where products are sold
    article_links = Column(JSONB)  # Links to articles/blog posts
    community_impact = Column(Text)  # Community involvement description
    organization_memberships = Column(JSONB)  # Organization POI IDs and external links

    # Playground Information (All POIs)
    playground_available = Column(Boolean, default=False)
    playground_types = Column(JSONB)  # List of playground types
    playground_surface_types = Column(JSONB)  # List of surface types
    playground_notes = Column(Text)
    # playground_photos moved to Images table (image_type='playground')
    playground_locations = Column(JSONB)  # [{"lat": 0, "lng": 0, "types": [...], "surfaces": [...], "notes": ""}] — plural array, migration g67_001
    playground_age_groups    = Column(JSONB)
    playground_ada_checklist = Column(JSONB)
    inclusive_playground     = Column(Boolean, nullable=False, server_default='false', default=False)

    # Parks & Trails Additional Info
    # payphone_location renamed to _deprecated_payphone_location (Migration A, m_payphone_001).
    # Data consolidated into the plural payphone_locations array below; the legacy
    # column was dropped by migration p_drop_deprecated_001 (Task 1.3).
    payphone_locations = Column(JSONB)  # [{"lat": 0, "lng": 0, "description": "Near entrance"}] - multiple payphones
    park_entry_notes = Column(Text)  # Park entry description/notes
    # park_entry_photo moved to Images table (image_type='entry')
    # parking_lot_photo moved to Images table (image_type='parking')
    facilities_options = Column(JSONB)  # List of park facilities (separate from key_facilities)
    night_sky_viewing = Column(Text)
    natural_features = Column(JSONB)  # List of natural features
    outdoor_types = Column(JSONB)  # List of outdoor space types
    things_to_do = Column(JSONB)  # List of activities available
    birding_wildlife = Column(Text)

    # Hunting & Fishing
    hunting_fishing_allowed = Column(String)  # 'no', 'seasonal', 'year_round'
    hunting_types = Column(JSONB)  # List of hunting types allowed
    fishing_allowed = Column(String)  # 'no', 'catch_release', 'catch_keep', 'other'
    fishing_types = Column(JSONB)  # List of fishing types
    licenses_required = Column(JSONB)  # List of required licenses
    hunting_fishing_info = Column(Text)

    # Memberships & Passes
    membership_passes = Column(JSONB)  # POI IDs that share memberships
    membership_details = Column(Text)

    # Trail connections
    associated_trails = Column(JSONB)  # POI IDs of connected trails
    camping_lodging = Column(Text)

    # JSONB fields for flexible attributes
    photos = Column(JSONB)  # {"featured": "url", "gallery": ["url1", "url2"]}
    hours = Column(JSONB)   # Complex hours structure with multiple periods, seasonal, dawn/dusk, holidays
    # holiday_hours — DEPRECATED (Issue #70). Column renamed to
    # `_deprecated_holiday_hours` by Alembic migration g70_001. Holiday hours
    # now live under `hours.holidays`. Never mapped on the ORM; the data was
    # backfilled into hours.holidays by the migration and the legacy column was
    # dropped by migration p_drop_deprecated_001 (Task 1.3).
    amenities = Column(JSONB)  # {"payment_methods": ["Cash", "Credit Card"]}
    ideal_for = Column(JSONB)  # List of ideal_for options
    contact_info = Column(JSONB)  # {"best": {"name": "Rhonda", ...}, "emergency": {...}}
    compliance = Column(JSONB)  # {"pre_approval_required": true, "lead_time": "5 days"}
    custom_fields = Column(JSONB)  # {"Parking Tip": "Back lot is free after 5 PM."}

    # Timestamps
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    last_updated = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

    # NOTE: the pgvector `embedding vector(768)` column exists in the database
    # (migration k_embedding_001) but is intentionally NOT mapped here. If it were
    # mapped, every `SELECT *` would emit it and fail on older local DBs that lack
    # the pgvector extension / column. The semantic/hybrid search read path and the
    # admin embed-on-write path both read/write it via raw SQL, gated on column
    # existence, with a keyword fallback when the column or the embedding service
    # is unavailable. Keep it unmapped.

    # Relationships
    categories = relationship(
        "Category",
        secondary=poi_category_association,
        back_populates="pois"
    )

    # Primary type relationship
    primary_type = relationship("PrimaryType")

    # POI-to-POI relationships
    source_relationships = relationship(
        "POIRelationship",
        foreign_keys="POIRelationship.source_poi_id",
        back_populates="source_poi"
    )

    target_relationships = relationship(
        "POIRelationship",
        foreign_keys="POIRelationship.target_poi_id",
        back_populates="target_poi"
    )

    # Subtype relationships (one-to-one)
    business = relationship("Business", back_populates="poi", uselist=False, cascade="all, delete-orphan")
    park = relationship("Park", back_populates="poi", uselist=False, cascade="all, delete-orphan")
    trail = relationship("Trail", back_populates="poi", uselist=False, cascade="all, delete-orphan")
    event = relationship("Event", back_populates="poi", uselist=False, cascade="all, delete-orphan", foreign_keys="[Event.poi_id]")

    # Images relationship
    images = relationship("Image", back_populates="poi", cascade="all, delete-orphan")

    @property
    def poi_type_str(self):
        return self.poi_type.value if isinstance(self.poi_type, enum.Enum) else self.poi_type

    @property
    def main_category(self):
        """Get the main category for this POI (where is_main=True)"""
        # nearby-app pre-computes and stores this on the instance __dict__
        # (crud_poi._enrich_poi_with_category_info) so the value survives after
        # the read session closes. Honour that pre-enriched value first; admin
        # (which never sets it) falls through to the live session query.
        if 'main_category' in self.__dict__:
            return self.__dict__['main_category']
        from sqlalchemy import and_
        from shared.models.category import Category, poi_category_association
        if hasattr(self, '_sa_instance_state') and self._sa_instance_state.session:
            session = self._sa_instance_state.session
            return session.query(Category).join(poi_category_association).filter(
                and_(
                    poi_category_association.c.poi_id == self.id,
                    poi_category_association.c.is_main == True
                )
            ).first()
        return None

    @property
    def secondary_categories(self):
        """Get the secondary categories for this POI (where is_main=False)"""
        # See main_category: honour nearby-app's pre-enriched value first.
        if 'secondary_categories' in self.__dict__:
            return self.__dict__['secondary_categories']
        from sqlalchemy import and_
        from shared.models.category import Category, poi_category_association
        if hasattr(self, '_sa_instance_state') and self._sa_instance_state.session:
            session = self._sa_instance_state.session
            return session.query(Category).join(poi_category_association).filter(
                and_(
                    poi_category_association.c.poi_id == self.id,
                    poi_category_association.c.is_main == False
                )
            ).all()
        return []


class POIRelationship(Base):
    __tablename__ = "poi_relationships"

    # ON DELETE CASCADE: deleting a POI removes every edge that references it, in
    # BOTH directions (source and target). This is the referential-integrity fix
    # that kills the "ghost ref" left behind by the old untyped JSONB UUID arrays
    # (Task 2.1). The prod schema gains the cascade via migration r_ghost_refs_001;
    # the create_all test DB gets it straight from these ForeignKey definitions.
    source_poi_id = Column(UUID(as_uuid=True), ForeignKey("points_of_interest.id", ondelete="CASCADE"), primary_key=True)
    target_poi_id = Column(UUID(as_uuid=True), ForeignKey("points_of_interest.id", ondelete="CASCADE"), primary_key=True)
    # relationship_type is an unconstrained varchar (no DB enum, no CHECK). Known
    # values: the legacy generic set (venue, vendor, sponsor, related,
    # trail_in_park, service_provider) plus the Task 2.1 link-field types
    # (service_location, locally_found_at, associated_trail, membership_pass,
    # organization_membership; vendor is reused for event vendor links).
    relationship_type = Column(String, primary_key=True)
    # Per-edge metadata migrated out of the old JSONB entries (e.g. an event
    # vendor's vendor_type, or an organization-membership entry's display name /
    # external link). NULL for plain UUID-array links that carried no extra keys.
    meta = Column(JSONB, nullable=True)

    source_poi = relationship("PointOfInterest", foreign_keys=[source_poi_id], back_populates="source_relationships")
    target_poi = relationship("PointOfInterest", foreign_keys=[target_poi_id], back_populates="target_relationships")


class POIPoint(Base):
    """Task 2.3: per-POI point geometry moved OUT of JSONB into a PostGIS table.

    One row = one map pin. ``geom`` (Point, 4326, GIST-indexed) makes spatial
    queries ("nearest restroom to a coordinate", ST_DWithin/ST_Distance) possible;
    ``meta`` (JSONB) carries every non-coordinate key from the original JSONB entry
    verbatim (name, notes, parking/toilet/playground types, descriptions,
    what3words, photo_ids, ...) plus a reserved ``_pos`` ordinal for stable order.

    The six source columns (parking_locations / toilet_locations /
    playground_locations / payphone_locations on points_of_interest;
    access_points / trailhead_location on trails) are RETAINED this release
    (expand/contract); the write path stops writing them and the reads reconstruct
    the original shape from here — see ``shared/poi_points.py``.

    ``kind`` is an unconstrained varchar guarded by a CHECK (matching the schema's
    existing CHECK pattern; a native enum was deliberately avoided for the same
    deploy-hazard reasons as ``relationship_type``). The prod schema is created by
    migration ``s_poi_points_001``; the create_all test DB gets the table + CHECK
    + FK CASCADE + GIST index straight from this model.
    """

    __tablename__ = "poi_points"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('parking','restroom','playground','payphone','trailhead','access_point')",
            name="ck_poi_points_kind_valid",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # ON DELETE CASCADE: deleting a POI removes all its points (map pins are owned).
    poi_id = Column(
        UUID(as_uuid=True),
        ForeignKey("points_of_interest.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind = Column(String, nullable=False)
    geom = Column(Geometry(geometry_type="POINT", srid=4326), nullable=False)
    meta = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"), default=dict)


class Business(Base):
    __tablename__ = "businesses"
    __table_args__ = (
        CheckConstraint(
            "price_range IS NULL OR price_range IN ('$','$$','$$$','$$$$')",
            name="ck_businesses_price_range_valid",
        ),
    )

    poi_id = Column(UUID(as_uuid=True), ForeignKey("points_of_interest.id"), primary_key=True)
    price_range = Column(String)  # '$', '$$', '$$$', '$$$$'

    poi = relationship("PointOfInterest", back_populates="business")


class Park(Base):
    __tablename__ = "parks"

    poi_id = Column(UUID(as_uuid=True), ForeignKey("points_of_interest.id"), primary_key=True)
    drone_usage_policy = Column(String)

    poi = relationship("PointOfInterest", back_populates="park")


class Trail(Base):
    __tablename__ = "trails"
    __table_args__ = (
        CheckConstraint(
            "trail_lighting IS NULL OR trail_lighting IN "
            "('partial','full','seasonal','dusk_to_dawn')",
            name="ck_trails_trail_lighting_valid",
        ),
    )

    poi_id = Column(UUID(as_uuid=True), ForeignKey("points_of_interest.id"), primary_key=True)
    length_text = Column(String)  # e.g., "2.5 miles", "1.2 km"
    length_segments = Column(JSONB)  # For multiple loops: [{"name": "Top Loop", "length": "0.25 miles"}]
    difficulty = Column(String)  # 'easy', 'moderate', 'challenging', 'difficult', 'very_difficult', 'extreme'
    difficulty_description = Column(Text)  # Auto-populated based on difficulty
    route_type = Column(String)  # 'loop', 'out_and_back', 'point_to_point', 'connecting_network'

    # Trailhead Information
    trailhead_location = Column(JSONB)  # {"lat": 0, "lng": 0}
    trailhead_latitude = Column(Numeric(precision=10, scale=7))  # Separate lat field for trailhead
    trailhead_longitude = Column(Numeric(precision=10, scale=7))  # Separate lng field for trailhead
    # trailhead_entrance_photo / trailhead_exit_photo / trail_exit_* / trailhead_exit_location
    # were dropped by migration w63c_001. Photo URLs moved to the Images table
    # (image_type='trail_head' / 'access_point') and exit coordinates moved into
    # ``access_points`` JSONB entries — see w63b_001 for the data migration.
    # trailhead_photo / trail_exit_photo had previously moved to the Images table.
    trail_markings = Column(Text)
    trailhead_access_details = Column(Text)
    downloadable_trail_map = Column(String)  # URL to map file

    # Trail Surface
    trail_surfaces = Column(JSONB)  # List of surface types
    trail_conditions = Column(JSONB)  # List of condition warnings

    # Trail Experience
    trail_experiences = Column(JSONB)  # List of experience types

    mile_markers          = Column(Boolean, nullable=False, server_default='false', default=False)
    trailhead_signage     = Column(Boolean, nullable=False, server_default='false', default=False)
    audio_guide_available = Column(Boolean, nullable=False, server_default='false', default=False)
    qr_trail_guide        = Column(Boolean, nullable=False, server_default='false', default=False)
    trail_guide_notes     = Column(Text)
    trail_lighting        = Column(String(30))
    access_points         = Column(JSONB)
    trail_entry_notes     = Column(Text)

    poi = relationship("PointOfInterest", back_populates="trail")


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        # Task 2.6 — event_status constrained to EVENT_STATUS_OPTIONS vocab.
        CheckConstraint(
            "event_status IS NULL OR event_status IN "
            "('Scheduled','Canceled','Postponed','Updated Date and/or Time',"
            "'Rescheduled','Moved Online','Unofficial Proposed Date')",
            name="ck_events_event_status_valid",
        ),
    )

    poi_id = Column(UUID(as_uuid=True), ForeignKey("points_of_interest.id"), primary_key=True)
    start_datetime = Column(TIMESTAMP(timezone=True), nullable=False)
    end_datetime = Column(TIMESTAMP(timezone=True))
    # Repeating event fields
    is_repeating = Column(Boolean, default=False)
    repeat_pattern = Column(JSONB)  # {"frequency": "weekly|daily|monthly|yearly", "interval": 1, "days": [...]}

    # Venue inheritance (Task 45)
    venue_poi_id = Column(UUID(as_uuid=True), ForeignKey("points_of_interest.id"), nullable=True)
    venue_inheritance = Column(JSONB, nullable=True)  # Per-section inheritance config

    # Recurring events expansion (Task 50)
    series_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    parent_event_id = Column(UUID(as_uuid=True), ForeignKey("events.poi_id"), nullable=True)
    excluded_dates = Column(JSONB, nullable=True)  # ["2026-07-04", "2026-12-25"]
    recurrence_end_date = Column(TIMESTAMP(timezone=True), nullable=True)
    manual_dates = Column(JSONB, nullable=True)  # ["2026-03-01T18:00:00Z", ...]

    # Event-specific fields
    organizer_name = Column(String)
    venue_settings = Column(JSONB)  # List of venue settings: Indoor, Outdoor, Hybrid, Online Only
    event_entry_notes = Column(Text)  # Event entry description/notes
    # event_entry_photo moved to Images table (image_type='entry')
    food_and_drink_info = Column(Text)
    coat_check_options = Column(JSONB)  # List of coat check options

    # Vendor information
    has_vendors = Column(Boolean, default=False)
    vendor_types = Column(JSONB)  # List of vendor types present
    vendor_application_deadline = Column(TIMESTAMP(timezone=True))
    vendor_application_info = Column(Text)
    vendor_fee = Column(String)
    vendor_requirements = Column(Text)
    vendor_poi_links = Column(JSONB)  # List of POI IDs for vendors at this event

    # Task 134-136: Event Status
    event_status = Column(String(100), default='Scheduled')
    status_explanation = Column(String(80))
    cancellation_paragraph = Column(Text)
    contact_organizer_toggle = Column(Boolean, default=False)
    new_event_link = Column(String)  # Stores UUID string of the new event POI (not a FK for flexibility)
    rescheduled_from_event_id = Column(UUID(as_uuid=True), ForeignKey("events.poi_id"), nullable=True)

    # Task 137: Primary Display Category — DEPRECATED (Issue #42).
    # Column renamed to `_deprecated_primary_display_category` by Alembic
    # migration g42_001. Canonical primary-category storage is
    # `poi_categories.is_main` + `points_of_interest.main_category_id`.
    # Never mapped on the ORM model; the legacy column was dropped by
    # migration p_drop_deprecated_001 (Task 1.3).

    # Task 138: Extended Organizer
    organizer_email = Column(String)
    organizer_phone = Column(String)
    organizer_website = Column(String)
    organizer_social_media = Column(JSONB)
    organizer_poi_id = Column(UUID(as_uuid=True), ForeignKey("points_of_interest.id"), nullable=True)

    # Task 139: Cost & Ticketing
    cost_type = Column(String(50))
    ticket_links = Column(JSONB)

    # Task 140: Sponsors
    sponsors = Column(JSONB)

    poi = relationship("PointOfInterest", back_populates="event", foreign_keys=[poi_id])
    venue_poi = relationship("PointOfInterest", foreign_keys=[venue_poi_id])
    parent_event = relationship("Event", remote_side=[poi_id], foreign_keys=[parent_event_id])
    rescheduled_from_event = relationship("Event", remote_side=[poi_id], foreign_keys=[rescheduled_from_event_id])
    organizer_poi = relationship("PointOfInterest", foreign_keys=[organizer_poi_id])
