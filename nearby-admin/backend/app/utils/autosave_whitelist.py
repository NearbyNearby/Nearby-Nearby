"""
Whitelist/denylist for the PATCH /pois/{id}/autosave endpoint.

AUTOSAVE_ALLOWED_FIELDS enumerates every PointOfInterest / Trail / Event /
Business / Park column that may be updated via autosave. Anything outside this
set (and anything in AUTOSAVE_DENIED_FIELDS) is silently dropped so partial
payloads never fail validation.

Keep in sync with:
- app/models/poi.py (PointOfInterest, Business, Park, Trail, Event)
"""

AUTOSAVE_DENIED_FIELDS: set[str] = {
    'id',
    'created_at',
    'last_updated',
    'updated_at',
    'location',
    'has_been_published',
    'poi_type',
}

AUTOSAVE_ALLOWED_FIELDS: set[str] = {
    # --- PointOfInterest core ---
    'name',
    'slug',
    'description_long',
    'description_short',
    'teaser_paragraph',
    'primary_type_id',

    # Address
    'dont_display_location',
    'address_full',
    'address_street',
    'address_city',
    'address_state',
    'address_zip',
    'address_county',
    'front_door_latitude',
    'front_door_longitude',
    'arrival_methods',
    'what3words_address',

    # Status / verification
    'status',
    'status_message',
    'is_verified',
    'is_disaster_hub',
    'lat_long_most_accurate',
    'icon_free_wifi',
    'icon_pet_friendly',
    'icon_public_restroom',
    'icon_wheelchair_accessible',
    'publication_status',

    # Contact
    'website_url',
    'phone_number',
    'email',
    'instagram_username',
    'facebook_username',
    'x_username',
    'tiktok_username',
    'linkedin_username',
    'other_socials',

    # Listing
    'listing_type',
    'is_sponsor',
    'sponsor_level',
    'admin_notes',

    # Cost
    'cost',
    'pricing_details',

    # Parking
    'parking_types',
    'parking_locations',
    'parking_notes',
    # 'public_transit_info' removed — renamed to _deprecated_public_transit_info (Migration A #33)
    'expect_to_pay_parking',
    # Links to SHAREABLE lots (#90/#161). Not a column: the autosave handler
    # pulls it out and syncs it into poi_parking_links, like the Task 2.1 link
    # fields and the Task 2.3 point fields.
    'parking_lot_links',

    # Additional info
    'downloadable_maps',
    'payment_methods',
    # 'key_facilities' removed — renamed to _deprecated_key_facilities (Migration A #34)
    'alcohol_options',
    'alcohol_policy_details',
    'alcohol_available',
    'alcohol_availability',  # Issue #69 — granular alcohol types
    'byob_allowed',          # Issue #69
    'alcohol_notes',         # Issue #69
    # 'wheelchair_accessible' removed — column dropped (Issue #45 PR2 Migration B)
    'wheelchair_details',
    'accessible_parking_details',
    'accessible_restroom',
    'accessible_restroom_details',
    'mobility_access',
    'smoking_options',
    'smoking_details',
    'wifi_options',
    'drone_usage',
    'drone_policy',
    'pet_options',
    'pet_policy',

    # Public toilets
    'public_toilets',
    'toilet_locations',
    'toilet_description',

    # Rentals
    'available_for_rent',
    'rental_info',
    'rental_pricing',
    'rental_link',

    # History / featured
    'history_paragraph',
    'featured_image',

    # Main contact / emergency
    'main_contact_name',
    'main_contact_email',
    'main_contact_phone',
    'offsite_emergency_contact',
    'emergency_protocols',

    # Ideal for
    'ideal_for_key',
    'ideal_for',

    # Business details
    'price_range_per_person',
    'pricing',
    'discounts',
    'gift_cards',
    'youth_amenities',
    'business_amenities',
    'entertainment_options',

    # Menu / booking
    'menu_photos',
    'menu_link',
    'delivery_links',
    'reservation_links',
    'appointment_links',
    'online_ordering_links',

    # Gallery
    'gallery_photos',

    # Business entry
    'business_entry_notes',

    # Hours
    'appointment_booking_url',
    'hours_but_appointment_required',
    'hours',
    # 'holiday_hours' — DEPRECATED (Issue #70). Use hours.holidays inside
    # the `hours` JSONB blob instead.

    # Services / community
    'service_locations',
    'locally_found_at',
    'article_links',
    'community_impact',
    'organization_memberships',

    # Playground
    'playground_available',
    'playground_types',
    'playground_surface_types',
    'playground_notes',
    'playground_locations',
    'playground_age_groups',
    'playground_ada_checklist',
    'inclusive_playground',

    # Parks & trails additional
    'payphone_locations',
    'cell_service',
    'park_entry_notes',
    'facilities_options',
    'night_sky_viewing',
    'natural_features',
    'outdoor_types',
    'things_to_do',
    'birding_wildlife',

    # Hunting & fishing
    'hunting_fishing_allowed',
    'hunting_types',
    'fishing_allowed',
    'fishing_types',
    'licenses_required',
    'hunting_fishing_info',

    # Memberships / trails
    'membership_passes',
    'membership_details',
    'associated_trails',
    'camping_lodging',

    # JSONB flexible
    'photos',
    'amenities',
    'contact_info',
    'compliance',
    'custom_fields',

    # --- Business subtype ---
    'price_range',

    # --- Park subtype ---
    'drone_usage_policy',

    # --- Trail subtype ---
    'length_text',
    'length_segments',
    'difficulty',
    'difficulty_description',
    'route_type',
    'trailhead_location',
    'trailhead_latitude',
    'trailhead_longitude',
    # trailhead_entrance_photo / trailhead_exit_photo / trailhead_exit_location /
    # trail_exit_latitude / trail_exit_longitude dropped by migration w63c_001.
    'trail_markings',
    'trailhead_access_details',
    'downloadable_trail_map',
    'trail_surfaces',
    'trail_conditions',
    'trail_experiences',
    'mile_markers',
    'trailhead_signage',
    'audio_guide_available',
    'qr_trail_guide',
    'trail_guide_notes',
    'trail_lighting',
    'access_points',
    'trail_entry_notes',

    # --- Event subtype ---
    'start_datetime',
    'end_datetime',
    'is_repeating',
    'repeat_pattern',
    'venue_poi_id',
    'venue_inheritance',
    'series_id',
    'parent_event_id',
    'excluded_dates',
    'recurrence_end_date',
    'manual_dates',
    'organizer_name',
    'venue_settings',
    'event_entry_notes',
    'food_and_drink_info',
    'coat_check_options',
    'has_vendors',
    'vendor_types',
    'vendor_application_deadline',
    'vendor_application_info',
    'vendor_fee',
    'vendor_requirements',
    'vendor_poi_links',
    'event_status',
    'status_explanation',
    'cancellation_paragraph',
    'contact_organizer_toggle',
    'new_event_link',
    'rescheduled_from_event_id',
    # 'primary_display_category' — DEPRECATED (Issue #42). Use main_category_id
    # via the canonical POI categories association instead.
    'organizer_email',
    'organizer_phone',
    'organizer_website',
    'organizer_social_media',
    'organizer_poi_id',
    'cost_type',
    'ticket_links',
    'sponsors',
}
