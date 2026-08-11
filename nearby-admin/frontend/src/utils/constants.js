// Constants for POI system

// ---------------------------------------------------------------------------
// Phase 1 (May Launch) — new Ideal For groups. Flat union is exported below
// as IDEAL_FOR_KEY_OPTIONS so existing importers don't break.
// ---------------------------------------------------------------------------
export const IDEAL_FOR_ATMOSPHERE = [
  'Authentic + Local',
  'Casual + Welcoming',
  'Community Gathering Spot',
  'Cozy + Intimate',
  'Country + Rural',
  'Fast Paced + Energetic',
  'Formal + Refined',
  'Historic + Heritage',
  'Loud + Lively',
  'Modern + Trendy',
  'Nature Immersed',
  'Off the Beaten Path',
  'Open + Inclusive',
  'Outdoor Seating + Open Air',
  'Peaceful + Secluded',
  'Pet Friendly',
  'Quiet + Reflective',
  'Quirky + Unique',
  'Rustic + Natural',
  'Spiritual + Reflective',
  'Visitor Friendly',
  'Wide Open Spaces'
];

export const IDEAL_FOR_AGE_GROUP = [
  'All Ages',
  'Families',
  'Infant + Toddler',
  'Pre K',
  'Stroller Friendly',
  'Elementary School (Age 5-10)',
  'Middle School (Age 10-14)',
  'High School (Age 14-18)',
  'Ages 18+',
  'Ages 21+',
  'College Age',
  'Golden Years Ages 55+',
  'Seniors 65+'
];

export const IDEAL_FOR_SOCIAL_SETTINGS = [
  'Solo Friendly',
  'Small Groups',
  'School Groups + Field Trips',
  'Corporate + Team Building',
  'First Date',
  'Anniversary',
  'Birthday Celebration',
  'Reunion',
  'Bachelorette + Bachelor',
  'Wedding Related',
  'Networking'
];

export const IDEAL_FOR_LOCAL_SPECIAL = [
  'Award Winning',
  'By Appointment Only',
  'Budget Friendly',
  'Catering Available',
  'Community Centered',
  'Curbside Pickup',
  'Drive Through',
  'Eco Friendly',
  'Leave No Trace',
  'Local Artists',
  'Local Delivery',
  'Locally Sourced Ingredients',
  'Luxury',
  'Made in NC',
  'Night Owls Open Late (past 10pm)',
  'Photography Friendly',
  'Reservations',
  'Seasonal',
  'Ships Nationwide',
  'Stewardship + Conservation',
  'Supports Local Farms',
  'Takeout Available',
  'Veteran Owned',
  'Virtual Consults Available',
  'Virtual Services Available',
  'Walk Ins Welcome',
  'We Come to You',
  'Volunteer Opportunities'
];

// Issue #43 — 32 condition checkboxes. Multi-select. Stored under
// ideal_for.special_needs (JSONB). Backend label: "Supports These Special Needs".
// Frontend (public) label: "Special Needs Supported".
export const IDEAL_FOR_SPECIAL_NEEDS = [
  'Acquired Disability',
  'ADHD',
  'Anxiety Disorders',
  "Asperger's Syndrome",
  'Autism',
  'Behavioral Issues',
  'Blind + Low Vision',
  'Cerebral Palsy',
  'Chronic Illness',
  'Deaf or Hard of Hearing',
  'Dementia + Memory Care',
  'Developmental Issues',
  'Down Syndrome',
  'Epilepsy + Seizure Disorders',
  'Intellectual Disability',
  'Learning Issues',
  'Medical Issues',
  'Mental Health',
  'Mobility Impaired',
  'Multiple Sclerosis',
  'Muscular Dystrophy',
  'Nonverbal',
  'OCD',
  'ODD',
  'Processing Disorders',
  'PTSD',
  'Schizophrenia',
  'Selective Mutism',
  'Sensory Impaired',
  'Speech + Language Disorders',
  'Tourette Syndrome',
  'Traumatic Brain Injury'
];

// Ideal For Key Box options — flat union of all 5 Ideal For groups so existing
// importers (KeyIdealFor pickers, etc.) keep working. The admin form no longer
// surfaces this flat list as a checkbox UI — see IdealForGrouped.
export const IDEAL_FOR_KEY_OPTIONS = [
  ...IDEAL_FOR_ATMOSPHERE,
  ...IDEAL_FOR_AGE_GROUP,
  ...IDEAL_FOR_SOCIAL_SETTINGS,
  ...IDEAL_FOR_LOCAL_SPECIAL,
  ...IDEAL_FOR_SPECIAL_NEEDS
];

// Parking options — Phase 1 replaced list (24 values)
export const PARKING_OPTIONS = [
  'Accessible Parking',
  'ATV + UTV Trailer Parking',
  'Bike Rack + Bicycle Parking',
  'Boat Trailer Parking',
  'Bus + Charter Bus Parking',
  'Carpool + Rideshare Parking',
  'Day Use Only (no overnight parking)',
  'Dedicated On-Site Parking Lot',
  'Garage',
  'Horse Trailer Parking',
  'Motorcycle + Motorbike Parking',
  'Nearby Public Parking Lot',
  'Overflow Parking',
  'Overnight Parking Permitted',
  'Oversized + Wide Load Vehicle',
  'Pull-Through Parking',
  'RV Parking (parking only — no hookups)',
  'Seasonal Parking Only',
  'Semi Truck + 18 Wheeler (cab and trailer)',
  'Semi Truck Cab Only (no trailer)',
  'Street Parking',
  'Trailer Parking — General',
  'Unpaved + Gravel Parking',
  'Valet Parking'
];

// Phase 1 — ADA parking checklist
export const PARKING_ADA_CHECKLIST = [
  'Dedicated accessible parking spaces on site',
  'Accessible spaces closest to main entrance',
  'Van accessible space available (8 foot access aisle)',
  'Accessible parking within reasonable distance',
  'Accessible route from parking to main entrance',
  'Accessible parking on firm stable surface'
];

// Phase 1 — arrival methods (how users physically get to a POI)
export const ARRIVAL_METHOD_OPTIONS = [
  'Bike-In Access',
  'Boat Access',
  'Dedicated Parking On Site',
  'Gate Access + Controlled Entry',
  'Nearby Public Parking',
  'Public Transit',
  'Roadside Pull-Off',
  'Shuttle + Drop-Off',
  'Street Parking'
];

// Payment methods — Phase 1 replaced list (17 values)
export const PAYMENT_METHODS = [
  'Cash',
  'Check',
  'Online Payments',
  'Credit Cards',
  'Coin Operated',
  'Apple Pay',
  'Google Pay',
  'Samsung Pay',
  'Cryptocurrency',
  'Contactless Payments',
  'PayPal',
  'Venmo',
  'Zelle',
  'Payment Plans',
  'Fee Station + Self-Pay Envelope',
  'Varies with Vendors',
  'Once Entered there is no place to spend money'
];

// Key facilities for all POI types
export const KEY_FACILITIES = [
  'Public Restroom',
  'Wheelchair Friendly',
  'Wifi',
  'Pet Friendly',
  'None of the above'
];

// Alcohol options
export const ALCOHOL_OPTIONS = [
  'Yes',
  'BYOB',
  'Available for Purchase',
  'Bar & Wine Only',
  'Brewery',
  'Local Brew',
  'Local Wine',
  'Winery',
  'Beer',
  'Wine',
  'Hard Drinks',
  'Mixed Drinks',
  'Martini Bar',
  'Bar Area',
  'Full Bar',
  'Bottle Service',
  'Good For Happy Hour',
  'Happy Hour Specials',
  'No Alcohol Allowed',
  'Other'
];

// Wheelchair accessibility
export const WHEELCHAIR_OPTIONS = [
  'No',
  'Unknown',
  'Yes'
];

// Smoking options
export const SMOKING_OPTIONS = [
  'Yes',
  'Outdoor Area',
  'Indoor Lounge/Sitting Area',
  'Specified Area',
  'No'
];

// Coat check options (Events only)
export const COAT_CHECK_OPTIONS = [
  'Yes',
  'No',
  'Private Lockers'
];

// WiFi options — Phase 1 replaced (3 values)
export const WIFI_OPTIONS = [
  'Free Wifi',
  'Paid Wifi',
  'No Public Wifi'
];

// Phase 1 — Cell service
export const CELL_SERVICE_OPTIONS = [
  'Good',
  'Limited',
  'Unknown',
  'None'
];

// ---------------------------------------------------------------------------
// Phase 1 / Issue #55 — Facilities + Amenities rebuild.
//
// Item shape: { value, label, visibility, hasSubSelect?, hasAdaChecklist? }
//   - visibility: 'ALL' (visible to every POI type), 'PT' (Parks + Trails only),
//                 or 'B+E' (Business + Events only). Defaults to 'ALL' when
//                 omitted.
//   - hasSubSelect: keyed slug whose options live in AMENITY_SUBSELECT_OPTIONS.
//                   When the parent checkbox is checked, the corresponding
//                   multi-select panel renders directly below.
//   - hasAdaChecklist: keyed slug whose checklist lives in AMENITY_ADA_CHECKLISTS.
//                      Renders an ADA inline checklist when checked.
//
// All values for these groups serialize into the existing `amenities` JSONB
// column on `points_of_interest`. No migration is required — fields are
// additive sub-keys under that JSONB blob.
// ---------------------------------------------------------------------------
export const AMENITIES_GENERAL = [
  { value: 'amphitheater',            label: 'Amphitheater',                       visibility: 'ALL' },
  { value: 'atm',                     label: 'ATM',                                visibility: 'ALL' },
  { value: 'bag_check',               label: 'Bag Check',                          visibility: 'ALL' },
  { value: 'bike_rack',               label: 'Bike Rack',                          visibility: 'ALL' },
  { value: 'bike_repair_station',     label: 'Bike Repair Station',                visibility: 'ALL' },
  { value: 'caretaker_on_site',       label: 'Caretaker On Site',                  visibility: 'ALL' },
  { value: 'coat_check',              label: 'Coat Check',                         visibility: 'B+E', hasSubSelect: 'coat_check' },
  { value: 'coin_change_machine',     label: 'Coin Change Machine',                visibility: 'ALL' },
  { value: 'covered_trail_shelter',   label: 'Covered Trail Shelter',              visibility: 'PT' },
  { value: 'darts',                   label: 'Darts',                              visibility: 'B+E' },
  { value: 'drive_up_pickup_area',    label: 'Drive-Up Pickup Area',               visibility: 'B+E' },
  { value: 'drinking_fountain',       label: 'Drinking Fountain',                  visibility: 'ALL', hasSubSelect: 'drinking_fountain' },
  { value: 'no_drinking_water_on_site',  label: 'No Drinking Water on Site',        visibility: 'ALL' },
  { value: 'no_drinking_water_on_trail', label: 'No Drinking Water on Trail',       visibility: 'PT' },
  { value: 'dump_station_rvs',        label: 'Dump Station for RVs',               visibility: 'ALL' },
  { value: 'equestrian_facilities',   label: 'Equestrian Facilities',              visibility: 'ALL', hasSubSelect: 'equestrian' },
  { value: 'equipment_storage',       label: 'Equipment Storage',                  visibility: 'ALL' },
  { value: 'ev_charging',             label: 'EV Charging',                        visibility: 'ALL', hasSubSelect: 'ev_charging' },
  { value: 'fire_pit',                label: 'Fire Pit',                           visibility: 'ALL' },
  { value: 'fire_ring',               label: 'Fire Ring',                          visibility: 'ALL' },
  { value: 'first_aid_station',       label: 'First Aid Station',                  visibility: 'ALL' },
  { value: 'gated_access',            label: 'Gated Access',                       visibility: 'ALL' },
  { value: 'gazebo',                  label: 'Gazebo',                             visibility: 'ALL' },
  { value: 'gift_shop',               label: 'Gift Shop',                          visibility: 'ALL' },
  { value: 'grill',                   label: 'Grill',                              visibility: 'ALL' },
  { value: 'information_kiosk',       label: 'Information Kiosk + Map Board',      visibility: 'ALL' },
  { value: 'laundry_facilities',      label: 'Laundry Facilities',                 visibility: 'ALL' },
  { value: 'lockers_storage',         label: 'Lockers + Storage',                  visibility: 'ALL' },
  { value: 'lost_and_found',          label: 'Lost + Found',                       visibility: 'ALL' },
  { value: 'multilingual_signage',    label: 'Multilingual Signage',               visibility: 'ALL' },
  { value: 'outdoor_classroom',       label: 'Outdoor Classroom',                  visibility: 'ALL' },
  { value: 'overflow_parking',        label: 'Overflow Parking',                   visibility: 'ALL' },
  { value: 'performance_stage',       label: 'Performance Stage',                  visibility: 'ALL' },
  { value: 'pool_tables',             label: 'Pool Tables',                        visibility: 'B+E' },
  { value: 'public_spring_water',     label: 'Public Spring Water Collection Point', visibility: 'ALL' },
  { value: 'recycling_stations',      label: 'Recycling Stations',                 visibility: 'ALL' },
  { value: 'seasonal_access',         label: 'Seasonal Access',                    visibility: 'ALL' },
  { value: 'security_on_site',        label: 'Security On Site',                   visibility: 'ALL' },
  { value: 'showers',                 label: 'Showers',                            visibility: 'ALL' },
  { value: 'shuttle_trolley_service', label: 'Shuttle + Trolley Service',          visibility: 'ALL' },
  { value: 'sports_on_tv',            label: 'Sports on TV',                       visibility: 'B+E' },
  { value: 'vending_machines',        label: 'Vending Machines',                   visibility: 'ALL' },
  { value: 'weather_station',         label: 'Weather Station',                    visibility: 'ALL' },
  { value: 'wildlife_observation',    label: 'Wildlife Observation Platform',      visibility: 'ALL' },
];

export const AMENITIES_FAMILY_YOUTH = [
  { value: 'booster_seat',         label: 'Booster Seat',         visibility: 'ALL' },
  { value: 'changing_table',       label: 'Changing Table',       visibility: 'ALL' },
  { value: 'childcare_available',  label: 'Childcare Available',  visibility: 'B+E' },
  { value: 'cribs',                label: 'Cribs',                visibility: 'B+E' },
  { value: 'family_spaces',        label: 'Family Spaces',        visibility: 'ALL' },
  { value: 'high_chair',           label: 'High Chair',           visibility: 'ALL' },
  { value: 'kids_activity_area',   label: 'Kids Activity Area',   visibility: 'ALL' },
  { value: 'kid_friendly_menus',   label: 'Kid Friendly Menus',   visibility: 'B+E' },
  { value: 'lactation_room',       label: 'Lactation Room',       visibility: 'ALL' },
  { value: 'play_area_indoor',     label: 'Play Area — Indoor',   visibility: 'ALL' },
  { value: 'play_area_outdoor',    label: 'Play Area — Outdoor',  visibility: 'ALL' },
  { value: 'playpens',             label: 'Playpens',             visibility: 'B+E' },
  { value: 'stroller_parking',     label: 'Stroller Parking',     visibility: 'ALL' },
  { value: 'stroller_rental',      label: 'Stroller Rental',      visibility: 'ALL' },
];

export const AMENITIES_WATER_BOATING = [
  { value: 'beach_access',     label: 'Beach Access',                          visibility: 'ALL' },
  { value: 'boat_dock',        label: 'Boat Dock',                             visibility: 'ALL', hasAdaChecklist: 'boat_dock' },
  { value: 'boat_launch',      label: 'Boat Launch',                           visibility: 'ALL', hasAdaChecklist: 'boat_launch' },
  { value: 'boat_ramp',        label: 'Boat Ramp',                             visibility: 'ALL', hasAdaChecklist: 'boat_ramp' },
  { value: 'boat_storage',     label: 'Boat Storage',                          visibility: 'ALL' },
  { value: 'fuel_station',     label: 'Fuel Station for Boats',                visibility: 'ALL' },
  { value: 'kayak_launch',     label: 'Kayak, Canoe + Paddleboard Launch',     visibility: 'ALL', hasAdaChecklist: 'kayak_launch' },
  { value: 'marina',           label: 'Marina',                                visibility: 'ALL' },
];

export const AMENITIES_DINING_SEATING = [
  { value: 'bar_seating',            label: 'Bar Seating',                          visibility: 'B+E' },
  { value: 'benches_rest_areas',     label: 'Benches + Rest Areas',                 visibility: 'ALL' },
  { value: 'catering_pickup_area',   label: 'Catering Pickup Area',                 visibility: 'B+E' },
  { value: 'concession_stand',       label: 'Concession Stand',                     visibility: 'ALL' },
  { value: 'coworking_seating',      label: 'Coworking + Work Friendly Seating',    visibility: 'B+E' },
  { value: 'group_shelter',          label: 'Group Shelter',                        visibility: 'ALL' },
  { value: 'indoor_seating',         label: 'Indoor Seating',                       visibility: 'ALL' },
  { value: 'meeting_room',           label: 'Meeting Room',                         visibility: 'B+E' },
  { value: 'kitchen',                label: 'On-Site Kitchen Facility',             visibility: 'ALL', hasSubSelect: 'kitchen' },
  { value: 'outdoor_bar',            label: 'Outdoor Bar',                          visibility: 'B+E' },
  { value: 'outdoor_seating',        label: 'Outdoor Seating',                      visibility: 'ALL', hasSubSelect: 'outdoor_seating' },
  { value: 'picnic_area',            label: 'Picnic Area',                          visibility: 'ALL', hasSubSelect: 'picnic_area' },
  { value: 'private_event_space',    label: 'Private Event Space',                  visibility: 'ALL' },
];

// Conditional sub-option panels rendered under specific parent amenities.
// Keys are the slugs referenced by `hasSubSelect` on the item.
export const AMENITY_SUBSELECT_OPTIONS = {
  coat_check: [
    { value: 'complimentary', label: 'Complimentary' },
    { value: 'fee_based',     label: 'Fee Based' },
  ],
  drinking_fountain: [
    { value: 'at_trailhead',                label: 'At Trailhead',                  visibility: 'PT' },
    { value: 'on_trail',                    label: 'On Trail',                      visibility: 'PT' },
    { value: 'standard',                    label: 'Standard Drinking Fountain' },
    { value: 'bottle_refill',               label: 'Bottle Refill Station' },
    { value: 'pet_water',                   label: 'Pet Water Station' },
  ],
  equestrian: [
    { value: 'tie_up_hitching_post', label: 'Equestrian Tie-Up + Hitching Post' },
    { value: 'horse_water_trough',   label: 'Horse Water Trough' },
    { value: 'horse_trailer_parking',label: 'Horse Trailer Parking' },
    { value: 'staging_area',         label: 'Equestrian Staging Area' },
  ],
  ev_charging: [
    { value: 'standard_level_2',     label: 'Standard Charging (Level 2)' },
    { value: 'fast_dc_level_3',      label: 'Fast Charging (DC Fast Charge / Level 3)' },
    { value: 'tesla_supercharger',   label: 'Tesla Supercharger' },
  ],
  kitchen: [
    { value: 'has_power',            label: 'Has Power' },
    { value: 'has_running_water',    label: 'Has Running Water' },
  ],
  outdoor_seating: [
    { value: 'cooled',  label: 'Cooled Outdoor Seating' },
    { value: 'covered', label: 'Covered Outdoor Seating' },
    { value: 'heated',  label: 'Heated Outdoor Seating' },
  ],
  picnic_area: [
    { value: 'covered',   label: 'Covered' },
    { value: 'uncovered', label: 'Uncovered' },
  ],
};

// ADA inline checklists rendered beneath specific Water + Boating items.
// Wording must match the spec exactly so downstream rendering / filtering can
// substring-match the labels.
export const AMENITY_ADA_CHECKLISTS = {
  boat_dock: [
    'Stationary fixed dock (no movement)',
    'Floating dock (moves with water level)',
    'Accessible path to dock entrance',
    'Dock width 60"+ throughout',
    'Non-slip surface',
    'Lowered or open railing sections for fishing or water access',
    'Cleats and tie-up points reachable from wheelchair height',
    'Seating available',
  ],
  boat_launch: [
    'Paved or firm surface path to staging area (minimum 5 feet wide)',
    '1:12 slope gangway or ramp (1 foot length for every inch of drop)',
    'Continuous handrail along gangway — 36" high',
    'Floating dock or stable launch platform',
    'Transfer bench available — 16" high',
    'Grab bars and handrails at water entry point',
    'Boat slide or guide rails',
    'Accessible parking within reasonable distance',
    'Staging area width 60"+ for wheelchair',
  ],
  boat_ramp: [
    'Non-slip surface on ramp',
    '1:12 slope — 1 foot length for every inch of drop',
    'Handrails on both sides',
    'Handrail height 36"',
    'Level landing area at bottom of ramp',
    'Accessible parking within reasonable distance',
    'Firm surface alongside ramp for wheelchair access',
    'Staging area width 60"+ at top and bottom of ramp',
  ],
  kayak_launch: [
    'Paved or firm surface path to launch (at least 5 feet wide)',
    '1:12 slope gangway or ramp (1 foot length for every inch of drop)',
    'Continuous handrail along gangway (36" high)',
    'Floating dock or stable launch platform',
    'Transfer bench available (16" high — standard for wheelchair transfers)',
    'Grab bars and handrails at water entry point',
    'Roll cage or stabilizing frame around vessel (holds kayak/canoe steady during transfer)',
    'Boat slide or guide rails (allows vessel to be eased into water)',
    'Accessible parking within reasonable distance',
    'Staging area width 60"+ for wheelchair',
  ],
};

// Helper — used by FullAmenitiesBlock and any caller that needs to filter
// amenity items by the current POI type. Items without a `visibility` field
// (or explicitly 'ALL') are always visible.
export const isAmenityVisibleForPoiType = (item, poiType) => {
  if (!item || !item.visibility || item.visibility === 'ALL') return true;
  const isBusinessOrEvent = poiType === 'BUSINESS' || poiType === 'EVENT';
  const isParkOrTrail = poiType === 'PARK' || poiType === 'TRAIL';
  if (item.visibility === 'B+E') return isBusinessOrEvent;
  if (item.visibility === 'PT')  return isParkOrTrail;
  return true;
};

export const ALCOHOL_AVAILABLE_OPTIONS = [
  { value: 'full_bar', label: 'Full Bar' },
  { value: 'beer_wine', label: 'Beer + Wine Only' },
  { value: 'byob', label: 'BYOB' },
  { value: 'no_alcohol', label: 'No Alcohol' },
  { value: 'seasonal', label: 'Seasonal/Event Only' },
  { value: 'nearby', label: 'Adjacent/Nearby Available' }
];

// Issue #69 — granular alcohol availability types. Surfaces under the Alcohol
// accordion only when alcohol_available !== 'no_alcohol'. Multi-select; values
// persist to the `alcohol_availability` JSONB column.
export const ALCOHOL_AVAILABILITY_OPTIONS = [
  { value: 'beer',          label: 'Beer' },
  { value: 'wine',          label: 'Wine' },
  { value: 'cider',         label: 'Cider' },
  { value: 'mead',          label: 'Mead' },
  { value: 'spirits',       label: 'Spirits / Liquor' },
  { value: 'cocktails',     label: 'Cocktails' },
  { value: 'non_alcoholic', label: 'Non-Alcoholic Options' },
];

export const SPONSOR_LEVEL_OPTIONS = [
  { value: 'platform', label: 'Platform' },
  { value: 'state', label: 'State' },
  { value: 'county', label: 'County' },
  { value: 'town', label: 'Town' }
];

// Drone usage
export const DRONE_USAGE_OPTIONS = [
  'Yes, follow all current Drone Laws',
  'Yes, With Permit from Park',
  'No'
];

// Pet options — Issue #48 replaced (43 values)
export const PET_OPTIONS = [
  'Any Well Behaved Pet',
  'Breed Restriction — see notes',
  'Cats Allowed',
  'Clean Up Stations',
  'Dogs Allowed',
  'Dogs Only',
  'Fenced in Area',
  'Hot Surface Warning',
  'Horse Boarding',
  'Horses Welcome',
  'Kennels Available for Rent',
  'Leash Required — 6 Feet Maximum',
  'Leash Required — Length Not Specified',
  'Livestock Permitted',
  'Maximum Number of Dogs Per Person — see notes',
  'No Pets Left Unattended',
  'Off Leash',
  'Pet Friendly Seating Areas',
  'Pack Out Waste — No Trash Cans Available',
  'Pet Relief Area',
  'Pet Waste Bags Available',
  'Trash Cans Available for Waste Bags',
  'Pet Fee Required',
  'Pet Swimming Area — Beach Access',
  'Pet Swimming Area — Designated + Marked',
  'Pet Swimming Area — Lake or Pond Access',
  'Pet Swimming Area — River or Creek Access',
  'Pet Washing Station',
  'Pets Allowed in Designated Areas Only',
  'Small Pets Only',
  'Size Restriction — Under 25 lbs',
  'Size Restriction — Under 50 lbs',
  'Size Restriction — No Size Restriction',
  'Pets Must Stay on Trail',
  'Pets Not Allowed in Buildings',
  'Seasonal Restrictions Apply — see notes',
  'Shade Available Along Route',
  'Spayed + Neutered Required',
  'Toxic Plant Warning',
  'Vaccination Proof Required',
  'Voice Control Accepted in Designated Areas',
  'Water Source',
  'Wildlife Hazard Area — see notes'
];

// Public toilet options — Wave 3 #47 (19 values; "Wheelchair + ADA Accessible"
// triggers the inline AccessibleRestroomChecklist below).
export const PUBLIC_TOILET_OPTIONS = [
  'Single Stall',
  'Multi Stall',
  'Family Restroom',
  'Baby Changing Station',
  'Wheelchair + ADA Accessible',
  'All Gender',
  'Climate Controlled Restroom',
  'Key Required',
  'Code Required',
  'Customers Only',
  'Attendant on Duty',
  'Pay Toilet',
  'Porta Potti',
  'Outdoor + Pit Toilet',
  'Vault Toilet',
  'Trailer Restroom',
  'Seasonal Only',
  '24 Hour Access'
];

// Phase 1 / #49 — Playground option lists (refreshed) — per-playground data
// stored inside each item of playground_locations[] JSONB array. Item shape:
// { lat, lng, name?, age_groups: string[], ada_checklist: { [groupKey]: [] } }.
export const PLAYGROUND_TYPES = [
  { value: 'traditional',          label: 'Traditional / Climbing Structure' },
  { value: 'nature',               label: 'Nature Playground' },
  { value: 'inclusive',            label: 'Inclusive / All-Abilities' },
  { value: 'sensory',              label: 'Sensory Playground' },
  { value: 'adventure',            label: 'Adventure Course / Ropes / Ninja' },
  { value: 'water',                label: 'Water / Splash Play' },
  { value: 'musical',              label: 'Musical Instruments' },
  { value: 'imaginative',          label: 'Imaginative / Themed' },
  { value: 'sports',               label: 'Sport-Focused (Mini Pitch / Court)' },
  { value: 'other',                label: 'Other' },
];

export const PARK_PLAYGROUND_SURFACES = [
  { value: 'poured_rubber',        label: 'Poured Rubber' },
  { value: 'rubber_tiles',         label: 'Rubber Tiles' },
  { value: 'engineered_woodchip',  label: 'Engineered Wood Fiber / Mulch' },
  { value: 'sand',                 label: 'Sand' },
  { value: 'pea_gravel',           label: 'Pea Gravel' },
  { value: 'turf',                 label: 'Artificial Turf' },
  { value: 'grass',                label: 'Grass' },
  { value: 'concrete',             label: 'Concrete / Pavement' },
  { value: 'mixed',                label: 'Mixed Surface' },
  { value: 'other',                label: 'Other' },
];

export const PLAYGROUND_AGE_GROUPS = [
  { value: 'infant_toddler', label: 'Infant / Toddler (0–2)' },
  { value: 'preschool',      label: 'Preschool (3–5)' },
  { value: 'school_age',     label: 'School Age (6–12)' },
  { value: 'teen',           label: 'Teen / Adult' },
  { value: 'all_ages',       label: 'All Ages' },
];

// ADA checklist grouped into 4 categories per #49.
export const PLAYGROUND_ADA_CATEGORIES = {
  surface_access: {
    label: 'Surface + Access',
    items: [
      { value: 'firm_stable_surface',   label: 'Firm + stable surface (rubber tile, poured-in-place, engineered wood fiber)' },
      { value: 'accessible_route',      label: 'Accessible route from parking / sidewalk to play area' },
      { value: 'level_transitions',     label: 'No abrupt level changes / ramped transitions' },
      { value: 'maneuvering_clearance', label: '60"+ maneuvering clearance at entries' },
    ],
  },
  play_equipment: {
    label: 'Play Equipment',
    items: [
      { value: 'transfer_platform',  label: 'Transfer platform at composite structure' },
      { value: 'accessible_swing',   label: 'Accessible swing (full-back / harness)' },
      { value: 'ground_level_play', label: 'Ground-level play components reachable from wheelchair' },
      { value: 'sensory_panel',      label: 'Sensory / interactive panel at wheelchair height' },
      { value: 'inclusive_carousel', label: 'Inclusive carousel or spinner (wheelchair-friendly)' },
    ],
  },
  seating_shade: {
    label: 'Seating + Shade',
    items: [
      { value: 'accessible_seating', label: 'Accessible bench with armrests + back' },
      { value: 'shade_structure',    label: 'Shade structure or natural shade over play area' },
      { value: 'companion_seating',  label: 'Companion seating beside accessible seats' },
    ],
  },
  amenities: {
    label: 'Amenities Nearby',
    items: [
      { value: 'accessible_water',    label: 'Accessible drinking fountain or bottle-fill' },
      { value: 'accessible_restroom', label: 'Accessible restroom within sight / short distance' },
      { value: 'accessible_parking',  label: 'Accessible parking with curb cut' },
    ],
  },
};

// Wave 3 #47 — grouped ADA restroom checklist (15 items, 6 groups). Each entry
// is { group, label }. Renderer groups by `group`. Label wording must match
// shared/constants/field_options.py RESTROOM_ADA_CHECKLIST exactly because
// backend compute_accessible_restroom substring-matches on it.
export const RESTROOM_ADA_CHECKLIST = [
  // Space + Size
  { group: 'Space + Size', label: 'Accessible stall size — minimum 60" x 56" (wall-mounted toilet) or 60" x 59" (floor-mounted)' },
  { group: 'Space + Size', label: '60 inch turning radius clear floor space' },
  // Grab Bars
  { group: 'Grab Bars', label: 'Side grab bar installed' },
  { group: 'Grab Bars', label: 'Rear grab bar installed' },
  { group: 'Grab Bars', label: 'Grab bars mounted 33-36 inches from floor' },
  // Door
  { group: 'Door', label: 'Wide door — minimum 32 inches clear width' },
  { group: 'Door', label: 'Outward swinging or sliding door' },
  { group: 'Door', label: 'Lever or loop door handle' },
  // Toilet
  { group: 'Toilet', label: 'Accessible toilet height — 17-19 inches from floor' },
  // Sink + Fixtures
  { group: 'Sink + Fixtures', label: 'Sink height 34 inches or lower' },
  { group: 'Sink + Fixtures', label: 'Clear knee space under sink' },
  { group: 'Sink + Fixtures', label: 'Lever or sensor faucet' },
  { group: 'Sink + Fixtures', label: 'No exposed hot water or drain pipes under sink' },
  // General
  { group: 'General', label: 'Level entry — no lip or step' },
  { group: 'General', label: 'Accessible route to restroom' }
];

// Price Range Per Person (Business only)
export const PRICE_RANGE_OPTIONS = [
  '$10 and under',
  '$15 and under',
  '$25 and under',
  '$30 and under',
  '$40 and under',
  '$50 and under',
  '$60 and under',
  '$80 and under',
  '$100 and under',
  'Over $101'
];

// Discount Types — Phase 1 replaced (26 values)
export const DISCOUNT_TYPES = [
  'AAA Members',
  'AARP Members',
  'Access Pass Holders',
  'Active Duty Military',
  'Military Veteran',
  'Annual Pass Holder',
  'Children Free (age specified in notes)',
  'EMT',
  'Farmers',
  'Fire + Firefighter',
  'First Responder',
  'Golden Years (55+)',
  'Senior Discount (65+)',
  'Group Discount (10+)',
  'Healthcare Workers',
  'Homeschool Groups',
  'Local Resident + In-County Discount',
  'National Park Pass Holders',
  'Nonprofit + Organization Discount',
  'Police',
  'Season Pass Holder',
  'State Park Pass Holders',
  'Student',
  'Teacher',
  'Tribal Members',
  'Youth Discount'
];

// Gift Card Options
export const GIFT_CARD_OPTIONS = [
  { value: 'yes_this_only', label: 'Yes, for this business only' },
  { value: 'no', label: 'No' },
  { value: 'yes_select_others', label: 'Yes, for select other businesses' }
];

// Youth Amenities (Business only)
export const YOUTH_AMENITIES = [
  'Booster Seat',
  'Childcare Available',
  'Cribs',
  'Playpens',
  'High Chair',
  'Kid Friendly Menus',
  'Lactation Room',
  'Family Spaces',
  'Play Area - Indoor',
  'Play Area - Outdoor',
  'Stroller Parking',
  'Stroller Rental'
];

// Business Amenities/Services
export const BUSINESS_AMENITIES = [
  'By Appointment Only',
  'Catering',
  'Curbside Pickup',
  'Drive Through',
  'In Store Shopping Assistant',
  'Large Group Friendly',
  'Local Delivery',
  'Shipping',
  'Takes Reservations',
  'Takeout',
  'Virtual Services',
  'Virtual Consults',
  'Walk Ins Welcome',
  'We Come to You',
  '24/7 Availability',
  'Indoor Seating',
  'Outdoor Seating',
  'Cooled Outdoor Seating',
  'Covered Outdoor Seating',
  'Heated Outdoor Seating',
  'Private Events'
];

// Entertainment Options (Business, Parks, Trails)
export const ENTERTAINMENT_OPTIONS = [
  'Live Music',
  'Live Comedy',
  'Sports on TV',
  'Free Wifi',
  'Paid Wifi',
  'Karaoke',
  'Game Night',
  'Special Events',
  'No Public Wifi'
];

// Park Facilities Options (separate from key_facilities)
export const PARK_FACILITIES = [
  'Amphitheater',
  'Benches',
  'Bike Rack',
  'Boat Ramp or Launch',
  'Chargepoint Station',
  'Drinking Fountain',
  'Fire Pit',
  'Fishing',
  'Grill',
  'Outdoor Classroom',
  'Picnic Area - Uncovered',
  'Picnic Area - Covered',
  'Public Toilet',
  'Rental Equipment',
  'Rental Space',
  'Wifi - Free Wifi',
  'Wifi - Paid Wifi',
  'Wifi - No Public Wifi'
];

// Event Venue Settings
export const VENUE_SETTINGS = [
  'Indoor',
  'Outdoor',
  'Hybrid (In-Person and Online)',
  'Online Only'
];

// Vendor types for events
export const VENDOR_TYPES = [
  { value: 'Food & Beverage', label: 'Food & Beverage', group: 'Food & Beverage' },
  { value: 'Food Trucks', label: 'Food Trucks', group: 'Food & Beverage' },
  { value: 'Mobile Grills', label: 'Mobile Grills', group: 'Food & Beverage' },
  { value: 'Concession Vendors', label: 'Concession Vendors', group: 'Food & Beverage' },
  { value: 'Beverage Stands', label: 'Beverage Stands', group: 'Food & Beverage' },
  { value: 'Crafts & Art', label: 'Crafts & Art', group: 'Crafts & Art' },
  { value: 'Handmade Goods', label: 'Handmade Goods', group: 'Crafts & Art' },
  { value: 'Jewelry', label: 'Jewelry', group: 'Crafts & Art' },
  { value: 'Pottery', label: 'Pottery', group: 'Crafts & Art' },
  { value: 'Paintings', label: 'Paintings', group: 'Crafts & Art' },
  { value: 'Seasonal', label: 'Seasonal', group: 'Seasonal' },
  { value: 'Agriculture', label: 'Agriculture', group: 'Agriculture' },
  { value: 'Produce', label: 'Produce', group: 'Agriculture' },
  { value: 'Plants', label: 'Plants', group: 'Agriculture' },
  { value: 'Flowers', label: 'Flowers', group: 'Agriculture' },
  { value: 'Honey', label: 'Honey', group: 'Agriculture' },
  { value: 'Herbal Products', label: 'Herbal Products', group: 'Agriculture' },
  { value: 'Retail/Local Goods', label: 'Retail/Local Goods', group: 'Retail' },
  { value: 'Clothing', label: 'Clothing', group: 'Retail' },
  { value: 'Boutique Items', label: 'Boutique Items', group: 'Retail' },
  { value: 'Antiques', label: 'Antiques', group: 'Retail' },
  { value: 'Local Shops', label: 'Local Shops', group: 'Retail' },
  { value: 'Health & Wellness', label: 'Health & Wellness', group: 'Health & Wellness' },
  { value: 'Wellness Products', label: 'Wellness Products', group: 'Health & Wellness' },
  { value: 'Massage', label: 'Massage', group: 'Health & Wellness' },
  { value: 'Fitness Demos', label: 'Fitness Demos', group: 'Health & Wellness' },
  { value: 'Herbalists', label: 'Herbalists', group: 'Health & Wellness' },
  { value: 'Informational', label: 'Informational', group: 'Informational' },
  { value: 'Nonprofits', label: 'Nonprofits', group: 'Informational' },
  { value: 'Community Groups', label: 'Community Groups', group: 'Informational' },
  { value: 'Outreach', label: 'Outreach', group: 'Informational' },
  { value: 'Local Services', label: 'Local Services', group: 'Informational' },
  { value: 'Kids & Family', label: 'Kids & Family', group: 'Kids & Family' },
  { value: 'Games', label: 'Games', group: 'Kids & Family' },
  { value: 'Face Painting', label: 'Face Painting', group: 'Kids & Family' },
  { value: 'Bounce Houses', label: 'Bounce Houses', group: 'Kids & Family' },
  { value: 'Activity Stations', label: 'Activity Stations', group: 'Kids & Family' },
  { value: 'Entertainment', label: 'Entertainment', group: 'Entertainment' },
  { value: 'Musicians', label: 'Musicians', group: 'Entertainment' },
  { value: "DJ's", label: "DJ's", group: 'Entertainment' },
  { value: 'Performers', label: 'Performers', group: 'Entertainment' },
  { value: 'Clowns', label: 'Clowns', group: 'Entertainment' },
  { value: 'Live Demos', label: 'Live Demos', group: 'Entertainment' },
  { value: 'Pet Focused', label: 'Pet Focused', group: 'Pet Focused' },
  { value: 'Pet Products', label: 'Pet Products', group: 'Pet Focused' },
  { value: 'Rescues', label: 'Rescues', group: 'Pet Focused' },
  { value: 'Animal Adoptions', label: 'Animal Adoptions', group: 'Pet Focused' },
  { value: 'Business Booths', label: 'Business Booths', group: 'Business' },
  { value: 'Real Estate', label: 'Real Estate', group: 'Business' },
  { value: 'Insurance', label: 'Insurance', group: 'Business' },
  { value: 'Financial', label: 'Financial', group: 'Business' },
  { value: 'Local Business Services', label: 'Local Business Services', group: 'Business' },
  { value: 'Faith Based', label: 'Faith Based', group: 'Faith Based' },
  { value: 'Church', label: 'Church', group: 'Faith Based' },
  { value: 'Youth Outreach', label: 'Youth Outreach', group: 'Faith Based' },
  { value: 'Faith Literature', label: 'Faith Literature', group: 'Faith Based' },
  { value: 'Prepared Food Sales', label: 'Prepared Food Sales', group: 'Food Sales' },
  { value: 'Baked Goods', label: 'Baked Goods', group: 'Food Sales' },
  { value: 'Jams', label: 'Jams', group: 'Food Sales' },
  { value: 'Packaged Snacks', label: 'Packaged Snacks', group: 'Food Sales' }
];

// Listing Types — Phase 1: sponsor levels moved to SPONSOR_LEVEL_OPTIONS + is_sponsor flag
export const LISTING_TYPES = [
  { value: 'free', label: 'Free Listing' },
  { value: 'paid', label: 'Paid Listing' },
  { value: 'paid_founding', label: 'Paid – Founding' },
  { value: 'community_comped', label: 'Community-Comped' }
];

export const BUSINESS_STATUS_OPTIONS = [
  'Fully Open',
  'Partly Open',
  'Temporary Hour Changes',
  'Temporarily Closed',
  'Call Ahead',
  'Permanently Closed',
  'Warning',
  'Limited Capacity',
  'Coming Soon',
  'Under Development',
  'Alert'
];

export const EVENT_STATUS_OPTIONS = [
  'Scheduled',
  'Canceled',
  'Postponed',
  'Updated Date and/or Time',
  'Rescheduled',
  'Moved Online',
  'Unofficial Proposed Date'
];

// Event Cost Types (Task 139)
export const EVENT_COST_TYPES = [
  { value: 'free', label: 'Free' },
  { value: 'single_price', label: 'Single Price' },
  { value: 'range', label: 'Price Range' },
];

// Event Disclaimer (Task 149)
export const EVENT_DISCLAIMER = "While we work to keep event information current and accurate, details may change. We recommend confirming directly with event organizers before making plans.";

// Helper function to get status options based on POI type
export const getStatusOptions = (poiType) => {
  if (poiType === 'EVENT') {
    return EVENT_STATUS_OPTIONS;
  }
  return BUSINESS_STATUS_OPTIONS;
};

// Venue Inheritance Sections — which venue fields an event can inherit
// Venue Inheritance Sections (issue #124), mirroring UI_SECTIONS in
// shared/constants/venue_sections.py, the single source of truth for which POI
// columns each section covers. `accordion` keys each section to the Event form
// panel that hosts its mode control.
// Hours is deliberately absent: an event's schedule is its own, not the venue's
// opening hours. Stale {"hours": ...} config already stored is ignored.
export const VENUE_INHERITANCE_SECTIONS = [
  { value: 'address', label: 'Address & Location', accordion: 's8-address' },
  { value: 'parking', label: 'Parking', accordion: 's9-parking' },
  { value: 'accessibility', label: 'Accessibility', accordion: 's10-accessibility' },
  { value: 'restrooms', label: 'Restrooms', accordion: 's11-restrooms' },
  { value: 'playground', label: 'Playground', accordion: 's12-playground' },
  { value: 'amenities', label: 'Amenities', accordion: 's13-onsite-facilities' },
  { value: 'pet_policy', label: 'Pet Policy', accordion: 's14-pets' },
  { value: 'alcohol_smoking', label: 'Alcohol & Smoking', accordion: 's15-alcohol-smoking' },
  // phone/email/website live in ContactSection, inside the identity panel.
  { value: 'contact', label: 'Contact Info', accordion: 's1-identity' },
];

// Venue Inheritance Modes — how each inherited section is used
export const VENUE_INHERITANCE_MODES = [
  { value: 'as_is', label: 'Use As Is' },
  { value: 'use_and_add', label: 'Use & Add' },
  { value: 'do_not_use', label: "Don't Use" },
];

// Recurrence frequency options for recurring events
export const REPEAT_FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 Weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

// Sponsor tier options for event sponsors (Issue #51)
export const SPONSOR_TIERS = [
  { value: 'Tier 1', label: 'Tier 1' },
  { value: 'Tier 2', label: 'Tier 2' },
  { value: 'Tier 3', label: 'Tier 3' },
  { value: 'Tier 4', label: 'Tier 4' },
  { value: 'Tier 5', label: 'Tier 5' },
];

// Phase 1 helper — returns feature flags for a (poi_type, listing_type) pair.
// Used by layout files to gate which fields/sections render.
export function getFieldsForListingType(poi_type, listing_type) {
  const paid = ['paid', 'paid_founding', 'community_comped'];
  const isBusiness = poi_type === 'BUSINESS';
  const isPaid = isBusiness && paid.includes(listing_type);
  const isFree = isBusiness && (listing_type === 'free' || !listing_type);
  if (isPaid) {
    return {
      maxCategories: null,
      maxIdealFor: null,
      maxIdealForKey: 3,
      includeGallery: true,
      includeTeaser: true,
      includeDescriptionLong: true,
      includeSocials: true,
      includeMenu: true,
      includeRentals: true,
      includePlayground: true,
      includeHistory: true,
      includePaymentMethods: true,
      includeDiscounts: true,
      includeFullAmenities: true,
    };
  }
  if (isFree) {
    return {
      maxCategories: 1,
      maxIdealFor: 5,
      maxIdealForKey: 3,
      includeGallery: false,
      includeTeaser: false,
      includeDescriptionLong: false,
      includeSocials: false,
      includeMenu: false,
      includeRentals: false,
      includePlayground: false,
      includeHistory: false,
      includePaymentMethods: false,
      includeDiscounts: false,
      includeFullAmenities: false,
    };
  }
  return { maxIdealForKey: 3, includeGallery: true };
}

// Legacy helper (old arg order + legacy shape) retained for CategoriesSection + validationRules.
export const getLegacyFieldsForListingType = (listingType, poiType) => {
  const isPaid = ['paid', 'sponsor_platform', 'sponsor_state', 'sponsor_county', 'sponsor_town', 'community_comped'].includes(listingType);
  
  if (poiType === 'BUSINESS') {
    if (listingType === 'free') {
      return {
        showDescriptionLong: false,
        showDescriptionShort: true,
        descriptionShortMaxLength: 250,
        showHistoryParagraph: false,
        showGallery: false,
        showCustomFields: false,
        showIdealFor: false,  // Free business listings don't get ideal for
        showIdealForKey: true, // But they do get the key box (max 3)
        maxIdealForKey: 3,
        maxCategories: 1,  // Free listings get only 1 category
        featuredImageLabel: 'Logo'
      };
    }
    // Paid business listings
    return {
      showDescriptionLong: true,
      showDescriptionShort: false,
      showHistoryParagraph: true,
      showGallery: true,
      showCustomFields: true,
      showIdealFor: true,
      showIdealForKey: true,
      maxIdealForKey: null, // No limit for paid
      maxCategories: null,  // No limit for paid
      featuredImageLabel: 'Featured Image'
    };
  }
  
  // For Parks, Trails, Events
  return {
    showDescriptionLong: true,
    showDescriptionShort: false,
    showHistoryParagraph: (poiType === 'PARK' || poiType === 'TRAIL') && isPaid,
    showGallery: true,
    showCustomFields: true,
    showIdealFor: true,
    showIdealForKey: true,
    maxIdealForKey: null,
    maxCategories: null,
    featuredImageLabel: 'Featured Image'
  };
};