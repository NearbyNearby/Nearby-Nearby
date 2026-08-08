export const emptyInitialValues = {
  // Core POI Info
  name: '',
  poi_type: 'BUSINESS',
  listing_type: 'free',
  teaser_paragraph: '',
  description_long: '',
  description_short: '',
  status: 'Fully Open',
  status_message: '',
  is_verified: false,
  is_disaster_hub: false,
  lat_long_most_accurate: false,
  publication_status: 'draft',
  dont_display_location: false,
  // Address fields
  address_full: '',
  address_street: '',
  address_city: 'Pittsboro',
  address_state: 'NC',
  address_zip: '',
  address_county: 'Chatham County',
  // Front door coordinates
  front_door_latitude: null,
  front_door_longitude: null,
  // Contact info
  website_url: '',
  phone_number: '',
  email: '',
  // Social media
  instagram_username: '',
  facebook_username: '',
  x_username: '',
  tiktok_username: '',
  linkedin_username: '',
  other_socials: {},
  // Location coordinates
  longitude: -79.177397,
  latitude: 35.720303,
  // Cost fields
  cost: '',
  pricing_details: '',
  // ticket_link removed in Phase 1 — use event.ticket_links instead
  // History and featured image
  history_paragraph: '',
  featured_image: '',
  // Main contact (internal)
  main_contact_name: '',
  main_contact_email: '',
  main_contact_phone: '',
  // Emergency contact (admin only)
  offsite_emergency_contact: '',
  emergency_protocols: '',
  // Ideal For Key Box
  ideal_for_key: [],
  // Parking
  parking_types: [],
  parking_locations: [],
  // Links to reusable/shared lots (#90/#161): [{parking_lot_id, sort_order, label}]
  parking_lot_links: [],
  parking_notes: '',
  primary_parking_lat: null,
  primary_parking_lng: null,
  primary_parking_name: '',
  // parking_photos removed - use Images table with image_type='parking'
  // public_transit_info removed — renamed _deprecated_public_transit_info (Migration A #33)
  expect_to_pay_parking: 'no',
  // Additional Info
  downloadable_maps: [],
  payment_methods: [],
  // key_facilities removed — renamed _deprecated_key_facilities (Migration A #34)
  alcohol_available: null,
  alcohol_options: [],
  alcohol_policy_details: '',
  // Issue #69 — new persisted alcohol sub-fields (migration i69_001).
  alcohol_availability: [],
  byob_allowed: false,
  alcohol_notes: '',
  wheelchair_details: '',
  smoking_options: [],
  smoking_details: '',
  wifi_options: [],
  drone_usage: '',
  drone_policy: '',
  pets_allowed: 'no',
  pet_options: [],
  pet_policy: '',
  // Public Toilets
  public_toilets_available: 'no',
  public_toilets: [],
  toilet_locations: [],
  toilet_description: '',
  toilet_latitude: null,
  toilet_longitude: null,
  toilet_photos: '',
  // Rentals
  available_for_rent: false,
  rental_info: '',
  rental_pricing: '',
  rental_link: '',
  // rental_photos removed - use Images table with image_type='rental'
  // Additional Business Details
  price_range_per_person: '',
  pricing: '',
  discounts: [],
  gift_cards: 'no',
  youth_amenities: [],
  business_amenities: [],
  entertainment_options: [],
  // Menu & Online Booking (Business only)
  // menu_photos removed - use Images table with image_type='menu'
  menu_link: '',
  delivery_links: [],
  reservation_links: [],
  appointment_links: [],
  online_ordering_links: [],
  // gallery_photos removed - use Images table with image_type='gallery'
  // Business Entry
  business_entry_notes: '',
  // business_entry_photo removed - use Images table with image_type='entry'
  // Hours enhancements
  appointment_booking_url: '',
  hours_but_appointment_required: false,
  // Service Relationships
  service_locations: [],
  // Locally Found & Community
  locally_found_at: [],
  article_links: [],
  community_impact: '',
  organization_memberships: [],
  // Business subtype
  business: {
    price_range: ''
  },
  // Park subtype
  park: {
    drone_usage_policy: ''
  },
  // Trail subtype
  trail: {
    length_text: '',
    length_segments: [],
    difficulty: null,
    difficulty_description: null,
    route_type: null,
    trailhead_location: null,
    trailhead_latitude: null,
    trailhead_longitude: null,
    // trailhead_entrance_photo / trailhead_exit_photo / trailhead_exit_location /
    // trail_exit_latitude / trail_exit_longitude dropped by migration w63c_001.
    // Photos live in the Images table; exit data lives in access_points[].
    trail_markings: '',
    trailhead_access_details: '',
    downloadable_trail_map: '',
    trail_surfaces: [],
    trail_conditions: [],
    trail_experiences: []
  },
  // Playground (All POIs)
  playground_available: false,
  playground_types: [],
  playground_surface_types: [],
  playground_notes: '',
  // playground_photos removed - use Images table with image_type='playground'
  // #49: per-playground rows — { lat, lng, name?, age_groups[], ada_checklist{} }
  playground_locations: [],
  // Parks & Trails Additional
  payphone_locations: [],
  park_entry_notes: '',
  // park_entry_photo removed - use Images table with image_type='entry'
  // parking_lot_photo removed - use Images table with image_type='parking'
  facilities_options: [],
  night_sky_viewing: '',
  natural_features: [],
  outdoor_types: [],
  things_to_do: [],
  birding_wildlife: '',
  // Hunting & Fishing
  hunting_fishing_allowed: 'no',
  hunting_types: [],
  fishing_allowed: 'no',
  fishing_types: [],
  licenses_required: [],
  hunting_fishing_info: '',
  // Memberships & Connections
  membership_passes: [],
  membership_details: '',
  associated_trails: [],
  camping_lodging: '',
  // Event specific
  event: {
    start_datetime: null,
    end_datetime: null,
    is_repeating: false,
    repeat_pattern: null,
    // Venue inheritance (Task 45)
    venue_poi_id: null,
    venue_inheritance: null,
    // Recurring events (Task 50)
    series_id: null,
    parent_event_id: null,
    excluded_dates: [],
    recurrence_end_date: null,
    manual_dates: [],
    // Event-specific fields
    organizer_name: '',
    venue_settings: [],
    event_entry_notes: '',
    food_and_drink_info: '',
    coat_check_options: [],
    has_vendors: false,
    vendor_types: [],
    vendor_application_deadline: null,
    vendor_application_info: '',
    vendor_fee: '',
    vendor_requirements: '',
    vendor_poi_links: [],
    // Task 134-136: Event Status
    event_status: 'Scheduled',
    cancellation_paragraph: '',
    contact_organizer_toggle: false,
    new_event_link: '',
    rescheduled_from_event_id: null,
    status_explanation: '',
    online_event_url: '',
    rescheduled_start_datetime: null,
    rescheduled_end_datetime: null,
    // Task 137: Primary Display Category — DEPRECATED (Issue #42).
    // Use main_category_id (canonical, UUID-based) from MainCategorySelector
    // instead. The legacy column is being deprecated by Alembic migration
    // g42_001.
    // Task 138: Extended Organizer
    organizer_email: '',
    organizer_phone: '',
    organizer_website: '',
    organizer_social_media: {},
    organizer_poi_id: null,
    // Task 139: Cost & Ticketing
    cost_type: '',
    ticket_links: [],
    // Task 140: Sponsors
    sponsors: [],
  },
  // Other fields
  photos: { featured: null, gallery: [] },
  hours: {},
  // holiday_hours — DEPRECATED (Issue #70). Holiday hours now live under
  // `hours.holidays`; HoursSelector writes only there.
  amenities: {},
  // Phase 1 — ideal_for is now grouped (was flat list).
  // Issue #43 added the special_needs group (5th).
  ideal_for: { atmosphere: [], age_group: [], social_settings: [], local_special: [], special_needs: [] },
  contact_info: {},
  compliance: {},
  mobility_access: {},
  custom_fields: {},
  main_category_id: null,
  // Primary Type linkage (unidirectional)
  primary_type_id: null,
  category_ids: [],
  // ==========================================================================
  // Phase 1 (May Launch) defaults — new columns added by migration p1_001
  // ==========================================================================
  has_been_published: false,
  arrival_methods: [],
  what3words_address: '',
  icon_free_wifi: false,
  icon_pet_friendly: false,
  icon_public_restroom: false,
  icon_wheelchair_accessible: false,
  is_sponsor: false,
  sponsor_level: null,
  admin_notes: '',
  accessible_parking_details: [],
  accessible_restroom: false,
  accessible_restroom_details: [],
  // playground_age_groups + playground_ada_checklist removed from form bindings
  // (#49). Data now lives per-row inside playground_locations[].age_groups +
  // playground_locations[].ada_checklist. POI-level columns remain in the DB
  // as orphans; deprecation deferred to Wave 5.
  inclusive_playground: false,
  cell_service: null,
  // Trail — new Phase 1 columns
  mile_markers: false,
  trailhead_signage: false,
  audio_guide_available: false,
  qr_trail_guide: false,
  trail_guide_notes: '',
  trail_lighting: null,
  access_points: []
};