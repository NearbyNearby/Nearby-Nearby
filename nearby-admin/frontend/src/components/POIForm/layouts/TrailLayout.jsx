import React, { useMemo, useState } from 'react';
import {
  Accordion, Stack, Group, Text, Badge, Select, Textarea, Radio,
  Autocomplete, Alert, Switch, TextInput, Checkbox, SimpleGrid, Divider
} from '@mantine/core';

import { CoreInformationSection } from '../sections/CoreInformationSection';
import { CategoriesSection } from '../sections/CategoriesSection';
import { LocationSection } from '../sections/LocationSection';
import { ContactSection } from '../sections/ContactSection';
import TrailheadAccessPointsSection from '../sections/TrailheadAccessPointsSection';
import {
  FacilitiesSection, RentalsSection, PlaygroundsSection
} from '../sections/FacilitiesSection';
import {
  OutdoorFeaturesSection, HuntingFishingSection, PetPolicySection
} from '../sections/OutdoorFeaturesSection';
import { BusinessGallerySection } from '../sections/BusinessDetailsSection';
import {
  InternalContactSection, PricingMembershipsSection, ConnectionsSection,
  CommunityConnectionsSection, CorporateComplianceSection
} from '../sections/MiscellaneousSections';
import HoursSelector from '../../HoursSelector';
import { FeaturedImageUpload, shouldUseImageUpload } from '../ImageIntegration';

import { ParkingLocationGroup } from '../components/ParkingLocationGroup';
import ParkingLotLinkGroup from '../components/ParkingLotLinkGroup';
import { RestroomLocationGroup } from '../components/RestroomLocationGroup';
import ServiceAnimalAlert from '../components/ServiceAnimalAlert';
import {
  AdminOnlyAccordionItem, IdealForGrouped, ArrivalMethodsGroup,
  FullAmenitiesBlock,
} from './_shared';
import {
  TRAIL_ROUTE_TYPES, GRANDFATHERED_ROUTE_TYPES, TRAIL_LIGHTING_OPTIONS,
  TRAIL_DIFFICULTIES, TRAIL_SURFACES, TRAIL_CONDITIONS,
} from '../../../utils/outdoorConstants';
import {
  DRONE_USAGE_OPTIONS, getFieldsForListingType,
  SMOKING_OPTIONS, ALCOHOL_AVAILABLE_OPTIONS, ALCOHOL_AVAILABILITY_OPTIONS,
} from '../../../utils/constants';
import { getCheckboxGroupProps } from '../constants/helpers';
import { api } from '../../../utils/api';

const MOBILITY_TRISTATE = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unknown', label: 'Unknown' },
];

// Issue #77 — Trail 22-accordion reorg (section-by-section fixes on #64).
// Same shape as #74 Business Free / #75 Business Paid / #76 Park: every
// shared-section internal is guarded so the other 4 POI types render exactly as
// before. CoreInformationSection / LocationSection / FacilitiesSection /
// ConnectionsSection were extended with an `isTrail` branch alongside the
// existing `isPark` branches — never a behavior change for Business / Park /
// Event.
//
// Foundation components are reused, not rebuilt:
//   - LocationSection Address renders the CoordinateInput bundle + the moved-in
//     lat_long_most_accurate toggle (isTrail path).
//   - ParkingLocationGroup = full repeatable parking grouping on
//     parking_locations JSONB (Acc 6).
//   - RestroomLocationGroup = restroom_name + per-grouping ADA checklist in
//     EVERY grouping (Acc 10).
//   - TrailheadAccessPointsSection (#63) owns trailhead + access points (Acc 8).
//   - IdealForGrouped is enabled for Trail via IDEAL_FOR_RULES (Acc 3).
//   - Canonical #69 alcohol fields (Acc 14), inlined alongside Smoking.

function useParkSearch() {
  const [options, setOptions] = useState([]);
  const [byName, setByName] = useState({});
  const search = async (q) => {
    if (!q || q.length < 2) { setOptions([]); return; }
    try {
      const resp = await api.get(`/pois/search?q=${encodeURIComponent(q)}&types=PARK`);
      if (resp.ok) {
        const data = await resp.json();
        const list = Array.isArray(data) ? data : (data.results || data.items || []);
        setOptions(list.map(x => x.name));
        const m = {};
        list.forEach(x => { m[x.name] = x; });
        setByName(m);
      }
    } catch (e) { /* ignore */ }
  };
  return { options, byName, search };
}

async function setParkAssociation(trailId, parkPoiId) {
  if (!trailId) return;
  try {
    await api.post(`/trails/${trailId}/park-association`, { park_poi_id: parkPoiId });
  } catch (e) { console.warn('park-association POST failed', e); }
}
async function clearParkAssociation(trailId) {
  if (!trailId) return;
  try {
    await api.delete(`/trails/${trailId}/park-association`);
  } catch (e) { console.warn('park-association DELETE failed', e); }
}

export default function TrailLayout({ form, userRole, poiId }) {
  const parkSearch = useParkSearch();

  const currentRouteType = form.values.trail?.route_type || null;
  const isWaterTrail = currentRouteType === 'water_trail';
  const routeTypeData = useMemo(() => {
    const base = [...TRAIL_ROUTE_TYPES];
    if (currentRouteType === 'connecting_network') {
      base.push(...GRANDFATHERED_ROUTE_TYPES);
    }
    return base;
  }, [currentRouteType]);

  const trailInParkVal =
    form.values.trail_in_park ? 'yes' :
    (form.values.trail_in_park === false ? 'no' : null);
  const associatedPark = form.values.trail?.associated_park || null;

  const fields = getFieldsForListingType('TRAIL', form.values.listing_type);
  const idealForCap = fields?.maxIdealFor ?? null;

  const showAlcoholSubFields =
    form.values.alcohol_available && form.values.alcohol_available !== 'no_alcohol';

  return (
    <>
      {/* 1. Trail Identity — CoreInfo (isTrail: is_verified/is_disaster_hub →
              Admin; lat_long_most_accurate → Address; History → Acc 19; Featured
              Image → Acc 20) + Contact. status + status_message stay inline. */}
      <Accordion.Item value="s1-identity">
        <Accordion.Control>
          <Group><Text fw={600}>Trail Identity</Text><Badge size="sm" variant="light">Required</Badge></Group>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <CoreInformationSection form={form} isTrail id={poiId} />
            <ContactSection form={form} isFreeListing={false} />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 2. Trail in Park — relationship picker (inline Autocomplete +
              park-association POST/DELETE wiring). Unchanged. */}
      <Accordion.Item value="s2-trail-in-park">
        <Accordion.Control><Text fw={600}>Trail in Park</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <Radio.Group
              label="Is this trail inside a park?"
              value={trailInParkVal}
              onChange={(v) => {
                const yes = v === 'yes';
                form.setFieldValue('trail_in_park', yes);
                if (!yes) {
                  form.setFieldValue('trail.associated_park', null);
                  clearParkAssociation(poiId);
                }
              }}
            >
              <Group mt="xs">
                <Radio value="yes" label="Yes" />
                <Radio value="no" label="No" />
              </Group>
            </Radio.Group>
            {trailInParkVal === 'yes' && (
              <Autocomplete
                label="Search for the park"
                placeholder="Type at least 2 characters…"
                data={parkSearch.options}
                onChange={parkSearch.search}
                onOptionSubmit={(val) => {
                  const park = parkSearch.byName[val];
                  if (!park) return;
                  form.setFieldValue('trail.associated_park', { id: park.id, name: park.name });
                  setParkAssociation(poiId, park.id);
                }}
              />
            )}
            {associatedPark && (
              <Badge color="green">Associated with: {associatedPark.name}</Badge>
            )}
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 3. Categories + Discovery — Ideal For (5 groups). Trails do NOT get the
              "Featured Ideal For" top-3 picker (Business + Event only). */}
      <Accordion.Item value="s3-categories">
        <Accordion.Control><Text fw={600}>Categories + Discovery</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <CategoriesSection form={form} isFreeListing={false} />
            <Divider my="sm" />
            <IdealForGrouped form={form} listingType="Trail" totalCap={idealForCap} />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 4. Hours. */}
      <Accordion.Item value="s4-hours">
        <Accordion.Control><Text fw={600}>Hours</Text></Accordion.Control>
        <Accordion.Panel>
          <HoursSelector
            form={form}
            value={form.values.hours}
            onChange={(value) => form.setFieldValue('hours', value)}
            poiType={form.values.poi_type}
          />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 5. Address — CoordinateInput bundle + moved-in lat_long_most_accurate
              (LocationSection isTrail path). Parking block moved OUT to Acc 6. */}
      <Accordion.Item value="s5-address">
        <Accordion.Control><Text fw={600}>Address</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <LocationSection form={form} isTrail id={poiId} />
            <ArrivalMethodsGroup form={form} />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 6. Parking — REPEATABLE ParkingLocationGroup: Primary Parking Name +
              parking_types (inline Accessible Parking ADA reveal) +
              CoordinateInput bundle + images + notes + Add Another. Binds
              parking_locations JSONB. Replaces the old weak "Add a parking
              location" button. */}
      <Accordion.Item value="s6-parking">
        <Accordion.Control><Text fw={600}>Parking</Text></Accordion.Control>
        <Accordion.Panel>
          <ParkingLocationGroup form={form} id={poiId} isTrail label="Parking Locations" />
          <ParkingLotLinkGroup form={form} />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 7. Pricing + Passes (renamed from "Pricing + Memberships") — cost +
              pricing_details + payment_methods + discounts + membership_details
              (unchanged contents). */}
      <Accordion.Item value="s7-pricing-passes">
        <Accordion.Control><Text fw={600}>Pricing + Passes</Text></Accordion.Control>
        <Accordion.Panel>
          <PricingMembershipsSection form={form} />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 8. Trail Guide — field order per #77: Trail Length, Route Types,
              Difficulty (moved from Trail Details), then Trailhead Name /
              Coordinates / Photos / Access Details + Access Points (via
              TrailheadAccessPointsSection), then Trail Markings, Mile Markers,
              Trailhead Signage, Audio Guide, QR Trail Guide, Trail Guide Notes,
              Trail Lighting, Trail Surface Types + Trail Conditions (moved from
              Trail Details). Trail Entry Notes removed (duplicate of Trail
              Access Details). */}
      <Accordion.Item value="s8-trail-guide">
        <Accordion.Control><Text fw={600}>Trail Guide</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            {isWaterTrail && (
              <Alert color="blue" variant="light" mb="md">
                For water trails, the Trailhead is the <strong>Put-In</strong>{' '}
                and Access Points are <strong>Take-Out / launch points</strong>.
              </Alert>
            )}

            {/* Trail metrics moved here from the removed Trail Details accordion. */}
            <TextInput
              label="Trail Length"
              placeholder="e.g., 2.5 miles"
              {...form.getInputProps('trail.length_text')}
            />
            <Select
              label="Route Type"
              data={routeTypeData}
              value={currentRouteType}
              onChange={(v) => form.setFieldValue('trail.route_type', v)}
              clearable
            />
            <Select
              label="Difficulty"
              placeholder="Select difficulty"
              data={TRAIL_DIFFICULTIES.map((d) => ({ value: d.value, label: d.label }))}
              value={form.values.trail?.difficulty || null}
              onChange={(value) => {
                form.setFieldValue('trail.difficulty', value);
                const difficultyInfo = TRAIL_DIFFICULTIES.find((d) => d.value === value);
                if (difficultyInfo) {
                  form.setFieldValue('trail.difficulty_description', difficultyInfo.description);
                }
              }}
              clearable
            />
            {form.values.trail?.difficulty && (
              <Alert color="blue" variant="light">
                {TRAIL_DIFFICULTIES.find((d) => d.value === form.values.trail.difficulty)?.description}
              </Alert>
            )}

            <Divider my="sm" />

            {/* Trailhead Name / Coordinates / Photos / Access Details +
                Access Points. Trail Entry Notes was removed entirely (duplicate
                of Trail Access Details). */}
            <TrailheadAccessPointsSection form={form} poiId={poiId} />

            <Textarea
              label="Trail Markings"
              placeholder="Color blazes, post markers, painted arrows, etc."
              autosize
              minRows={2}
              value={form.values.trail_markings || ''}
              onChange={(e) => form.setFieldValue('trail_markings', e.currentTarget.value)}
            />

            <Switch
              label="Mile Markers"
              checked={!!form.values.mile_markers}
              onChange={(e) => form.setFieldValue('mile_markers', e.currentTarget.checked)}
            />
            <Switch
              label="Trailhead Signage"
              checked={!!form.values.trailhead_signage}
              onChange={(e) => form.setFieldValue('trailhead_signage', e.currentTarget.checked)}
            />
            <Switch
              label="Audio Guide Available"
              checked={!!form.values.audio_guide_available}
              onChange={(e) => form.setFieldValue('audio_guide_available', e.currentTarget.checked)}
            />
            <Switch
              label="QR Trail Guide"
              checked={!!form.values.qr_trail_guide}
              onChange={(e) => form.setFieldValue('qr_trail_guide', e.currentTarget.checked)}
            />

            <Textarea
              label="Trail Guide Notes"
              autosize
              minRows={2}
              {...form.getInputProps('trail_guide_notes')}
            />

            <Select
              label="Trail Lighting"
              data={TRAIL_LIGHTING_OPTIONS}
              value={form.values.trail_lighting}
              onChange={(v) => form.setFieldValue('trail_lighting', v)}
              clearable
            />

            {/* Trail Surface Types + Trail Conditions moved here from the removed
                Trail Details accordion. */}
            <Divider my="sm" label="Trail Surface" />
            <Stack gap="md">
              {Object.entries(TRAIL_SURFACES).map(([category, surfaces]) => (
                <div key={category}>
                  <Text fw={500} size="sm" mb="xs">{category}</Text>
                  <Checkbox.Group {...getCheckboxGroupProps(form, 'trail.trail_surfaces')}>
                    <SimpleGrid cols={{ base: 2, sm: 3 }}>
                      {surfaces.map((surface) => (
                        <Checkbox key={surface} value={surface} label={surface} />
                      ))}
                    </SimpleGrid>
                  </Checkbox.Group>
                </div>
              ))}
            </Stack>

            <Divider my="sm" label="Trail Conditions" />
            <Checkbox.Group {...getCheckboxGroupProps(form, 'trail.trail_conditions')}>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                {TRAIL_CONDITIONS.map((condition) => (
                  <Checkbox key={condition} value={condition} label={condition} />
                ))}
              </SimpleGrid>
            </Checkbox.Group>

            <TextInput
              label="Downloadable Trail Map"
              placeholder="URL to trail map PDF or image"
              value={form.values.downloadable_trail_map || ''}
              onChange={(e) => form.setFieldValue('downloadable_trail_map', e.currentTarget.value)}
            />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 9. Accessibility + Mobility Access (NEW dedicated accordion) —
              mobility_access tristates + a single consolidated "Accessibility
              and Mobility" paragraph (wheelchair_details), moved out of On Site
              Facilities + Amenities
              (Acc 12). */}
      <Accordion.Item value="s9-accessibility">
        <Accordion.Control><Text fw={600}>Accessibility + Mobility Access</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Select
                label="Step Free Entry"
                placeholder="Select..."
                data={MOBILITY_TRISTATE}
                value={form.values.mobility_access?.step_free_entry || ''}
                onChange={(v) => form.setFieldValue('mobility_access.step_free_entry', v)}
              />
              <Select
                label="Main Area Accessible"
                placeholder="Select..."
                data={MOBILITY_TRISTATE}
                value={form.values.mobility_access?.main_area_accessible || ''}
                onChange={(v) => form.setFieldValue('mobility_access.main_area_accessible', v)}
              />
              <Select
                label="Primary Service on Ground Level"
                placeholder="Select..."
                data={MOBILITY_TRISTATE}
                value={form.values.mobility_access?.ground_level_service || ''}
                onChange={(v) => form.setFieldValue('mobility_access.ground_level_service', v)}
              />
            </SimpleGrid>
            <Textarea
              label="Accessibility and Mobility"
              placeholder="Describe accessibility and mobility access (step-free entry, accessible restrooms/parking, etc.)"
              autosize
              minRows={3}
              value={form.values.wheelchair_details || ''}
              onChange={(e) => form.setFieldValue('wheelchair_details', e.currentTarget.value)}
            />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 10. Public Restrooms — no gate; always-on REPEATABLE RestroomLocationGroup
               (restroom_name + per-grouping ADA checklist in EVERY grouping +
               CoordinateInput + images + notes + Add Another). The legacy
               duplicate "Public Toilet Options" top-level group is removed.
               Binds toilet_locations[]. */}
      <Accordion.Item value="s10-restrooms">
        <Accordion.Control><Text fw={600}>Public Restrooms</Text></Accordion.Control>
        <Accordion.Panel>
          <RestroomLocationGroup form={form} id={poiId} label="Restroom Locations" />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 11. Playground — #49 per-row age groups + grouped ADA + types/surfaces
               inside each grouping (isTrail keeps the POI-level multiselects;
               Park-only grouping deltas stay gated by isPark inside the
               section). */}
      <Accordion.Item value="s11-playground">
        <Accordion.Control><Text fw={600}>Playground</Text></Accordion.Control>
        <Accordion.Panel>
          <PlaygroundsSection form={form} isPark id={poiId} />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 12. On Site Facilities + Amenities (renamed from "Amenities") —
               FacilitiesSection (isTrail: Entertainment + legacy Facilities
               removed; accessibility + smoking moved out) + FullAmenitiesBlock
               (#55 Trail-filtered amenities list). */}
      <Accordion.Item value="s12-amenities">
        <Accordion.Control><Text fw={600}>On Site Facilities + Amenities</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <FacilitiesSection form={form} isTrail id={poiId} />
            <FullAmenitiesBlock form={form} poiType="TRAIL" />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 13. Pet Policy. */}
      <Accordion.Item value="s13-pets">
        <Accordion.Control><Text fw={600}>Pet Policy</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <PetPolicySection form={form} />
            <ServiceAnimalAlert />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 14. Alcohol + Smoking (renamed from "Alcohol") — canonical #69 alcohol
               fields (gate → availability multi-select + BYOB + notes) plus the
               Smoking Options + Smoking Policy Details moved from On Site
               Facilities + Amenities. */}
      <Accordion.Item value="s14-alcohol-smoking">
        <Accordion.Control><Text fw={600}>Alcohol + Smoking</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <Select
              label="Alcohol Available"
              data={ALCOHOL_AVAILABLE_OPTIONS}
              value={form.values.alcohol_available}
              onChange={(v) => form.setFieldValue('alcohol_available', v)}
              clearable
            />
            {showAlcoholSubFields && (
              <>
                <Checkbox.Group
                  label="Availability"
                  description="Select all that apply"
                  value={form.values.alcohol_availability || []}
                  onChange={(v) => form.setFieldValue('alcohol_availability', v)}
                >
                  <Stack mt="xs">
                    {ALCOHOL_AVAILABILITY_OPTIONS.map((o) => (
                      <Checkbox key={o.value} value={o.value} label={o.label} />
                    ))}
                  </Stack>
                </Checkbox.Group>
                <Checkbox
                  label="BYOB Allowed"
                  checked={form.values.byob_allowed || false}
                  onChange={(e) => form.setFieldValue('byob_allowed', e.currentTarget.checked)}
                />
                <Textarea
                  label="Alcohol Notes"
                  placeholder="Wine list highlights, last call, age policy, etc."
                  autosize
                  minRows={2}
                  value={form.values.alcohol_notes || ''}
                  onChange={(e) => form.setFieldValue('alcohol_notes', e.currentTarget.value)}
                />
              </>
            )}

            <Divider my="xs" label="Smoking" />
            <Checkbox.Group
              label="Smoking Policy"
              value={form.values.smoking_options || []}
              onChange={(v) => form.setFieldValue('smoking_options', v)}
            >
              <SimpleGrid cols={{ base: 2, sm: 3 }}>
                {SMOKING_OPTIONS.map((o) => (
                  <Checkbox key={o} value={o} label={o} />
                ))}
              </SimpleGrid>
            </Checkbox.Group>
            <Textarea
              label="Smoking Policy Details"
              placeholder="Additional smoking policy information"
              autosize
              minRows={2}
              value={form.values.smoking_details || ''}
              onChange={(e) => form.setFieldValue('smoking_details', e.currentTarget.value)}
            />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 15. Outdoor Features — #68 dynamic outdoor_types loader lives inside
               (Trail keeps Outdoor Types; only Park drops it). */}
      <Accordion.Item value="s15-outdoor-features">
        <Accordion.Control><Text fw={600}>Outdoor Features</Text></Accordion.Control>
        <Accordion.Panel>
          <OutdoorFeaturesSection form={form} />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 16. Drone Policy. */}
      <Accordion.Item value="s16-drone-policy">
        <Accordion.Control><Text fw={600}>Drone Policy</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <Select
              label="Drone Usage"
              placeholder="Select drone policy"
              data={DRONE_USAGE_OPTIONS}
              value={form.values.drone_usage || null}
              onChange={(v) => form.setFieldValue('drone_usage', v)}
              clearable
            />
            <Textarea
              label="Drone Policy Details"
              placeholder="Describe permits, no-fly zones, hours, etc."
              autosize
              minRows={3}
              value={form.values.drone_policy || ''}
              onChange={(e) => form.setFieldValue('drone_policy', e.currentTarget.value)}
            />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 17. Hunting + Fishing. */}
      <Accordion.Item value="s17-hunting-fishing">
        <Accordion.Control><Text fw={600}>Hunting + Fishing</Text></Accordion.Control>
        <Accordion.Panel>
          <HuntingFishingSection form={form} />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 18. Rentals. */}
      <Accordion.Item value="s18-rentals">
        <Accordion.Control><Text fw={600}>Rentals</Text></Accordion.Control>
        <Accordion.Panel>
          <RentalsSection form={form} id={poiId} />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 19. Locally Found + History (renamed from "Connections") — Connections
               + Community Connections (isTrail drops Camping + Lodging for MVP) +
               History Paragraph moved from Trail Identity. */}
      <Accordion.Item value="s19-locally-found">
        <Accordion.Control><Text fw={600}>Locally Found + History</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <ConnectionsSection form={form} isTrail />
            <CommunityConnectionsSection form={form} />
            <Divider my="xs" label="History" />
            <Textarea
              label="History Paragraph"
              placeholder="Brief history or background"
              autosize
              minRows={3}
              value={form.values.history_paragraph || ''}
              onChange={(e) => form.setFieldValue('history_paragraph', e.currentTarget.value)}
            />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 20. Images (renamed from "Gallery") — Featured / Main Image moved from
               Trail Identity + Gallery Photos. */}
      <Accordion.Item value="s20-images">
        <Accordion.Control><Text fw={600}>Images</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            {shouldUseImageUpload(poiId) ? (
              <FeaturedImageUpload
                key={`featured-image-${poiId}`}
                poiId={poiId}
                isFreeListing={false}
                form={form}
              />
            ) : (
              <Alert color="blue" variant="light">
                <Text size="sm">Featured image upload will be available once the listing is saved.</Text>
              </Alert>
            )}
            <Divider my="xs" label="Gallery" />
            <BusinessGallerySection form={form} id={poiId} />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 21. Contact + Compliance (renamed from "Internal + Compliance"). */}
      <Accordion.Item value="s21-contact-compliance">
        <Accordion.Control><Text fw={600}>Contact + Compliance</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <InternalContactSection form={form} />
            <CorporateComplianceSection form={form} />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 22. Admin-Only (stays LAST; only renders for admins). */}
      <AdminOnlyAccordionItem form={form} userRole={userRole} />
    </>
  );
}
