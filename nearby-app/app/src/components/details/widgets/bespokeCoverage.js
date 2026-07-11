// Per-POI-type list of registry render:"auto" field keys that a detail page
// ALREADY renders in a hand-built (curated, "bespoke-style") section.
//
// AttributeSections excludes these so the registry-driven auto-renderer fills
// only the GAP — the curated UX of each detail page stays intact and no field
// is double-rendered. As detail pages shed their hand-built sections in favor
// of the auto-renderer, shrink the matching list here.
//
// NOTE: truly render:"bespoke" registry fields (name, description_long, hours,
// location, images, event datetimes, sponsors, etc.) are NEVER in groupsFor, so
// they don't need to be listed here — only AUTO fields a page hand-renders do.

// Address / contact / parking shown in the shared Address+Parking+Contact
// accordions on most detail pages.
const COMMON_CONTACT_PARKING = [
  'address_street', 'address_city', 'address_state', 'address_zip',
  'address_county', 'address_full',
  'phone_number', 'website_url', 'email',
  'parking_types', 'parking_notes', 'accessible_parking_details',
];

const COMMON_ACCESS = [
  'wheelchair_details', 'mobility_access',
  'public_toilets', 'toilet_description',
  'accessible_restroom', 'accessible_restroom_details',
  'pet_options', 'pet_policy',
];

const COMMON_PLAYGROUND = [
  'playground_types', 'playground_surface_types', 'playground_age_groups',
  'playground_ada_checklist', 'inclusive_playground',
];

export const BESPOKE_AUTO_KEYS = {
  BUSINESS: [
    ...COMMON_CONTACT_PARKING, ...COMMON_ACCESS, ...COMMON_PLAYGROUND,
    'amenities', 'ideal_for', 'ideal_for_key', 'price_range_per_person',
    'pricing', 'pricing_details', 'cost', 'price_range', 'discounts',
    'payment_methods',
    'menu_link', 'reservation_links', 'delivery_links',
    'appointment_links', 'online_ordering_links',
    'alcohol_available', 'alcohol_availability', 'alcohol_options',
    'byob_allowed', 'alcohol_notes',
    'alcohol_policy_details', 'smoking_options', 'smoking_details',
    'playground_notes',
  ],
  EVENT: [
    ...COMMON_CONTACT_PARKING, ...COMMON_ACCESS, ...COMMON_PLAYGROUND,
    'amenities', 'ideal_for', 'cost', 'cost_type', 'discounts',
    'organizer_name', 'organizer_email', 'organizer_phone', 'organizer_website',
    'vendor_types', 'has_vendors', 'drone_policy', 'drone_usage',
    'alcohol_available', 'alcohol_availability', 'byob_allowed', 'alcohol_notes',
    'smoking_options', 'smoking_details',
    'available_for_rent', 'rental_info', 'rental_pricing', 'rental_link',
    'community_impact', 'playground_notes',
  ],
  PARK: [
    ...COMMON_CONTACT_PARKING, ...COMMON_ACCESS, ...COMMON_PLAYGROUND,
    'amenities', 'ideal_for', 'outdoor_types', 'things_to_do',
    'cost', 'discounts', 'membership_passes', 'membership_details',
    'pricing_details', 'payment_methods',
    'alcohol_available', 'alcohol_options', 'alcohol_policy_details',
    'alcohol_availability', 'byob_allowed', 'alcohol_notes',
    'smoking_options', 'smoking_details',
    'drone_usage', 'drone_policy',
    'park_entry_notes', 'playground_notes',
    'available_for_rent', 'rental_info', 'rental_pricing', 'rental_link',
    'night_sky_viewing', 'birding_wildlife',
    'hunting_fishing_allowed', 'fishing_allowed', 'hunting_types', 'fishing_types',
    'licenses_required', 'hunting_fishing_info',
    'history_paragraph', 'community_impact', 'locally_found_at',
  ],
  TRAIL: [
    ...COMMON_CONTACT_PARKING, ...COMMON_ACCESS,
    'amenities', 'ideal_for', 'outdoor_types',
    'cost', 'discounts', 'pricing_details', 'payment_methods',
    'drone_policy', 'drone_usage',
    'history_paragraph', 'community_impact',
  ],
  GENERIC: [
    // GenericDetail hand-renders cost + pets in its QuickInfoRow strip.
    ...COMMON_CONTACT_PARKING, 'amenities', 'cost', 'pet_options',
  ],
};

// Generic / non-bespoke POI types all use GenericDetail.
const GENERIC_TYPES = ['SERVICES', 'YOUTH_ACTIVITIES', 'JOBS', 'VOLUNTEER_OPPORTUNITIES', 'DISASTER_HUBS'];

/** Resolve the bespoke-covered auto keys for a POI type. */
export function bespokeAutoKeysFor(type) {
  if (BESPOKE_AUTO_KEYS[type]) return BESPOKE_AUTO_KEYS[type];
  if (GENERIC_TYPES.includes(type)) return BESPOKE_AUTO_KEYS.GENERIC;
  return BESPOKE_AUTO_KEYS.GENERIC;
}
