import React from 'react';
import {
  Accordion, Stack, Group, Text, Badge, Select, Textarea, Checkbox,
  SimpleGrid, Divider, Alert
} from '@mantine/core';

import { CoreInformationSection } from '../sections/CoreInformationSection';
import { CategoriesSection } from '../sections/CategoriesSection';
import { LocationSection } from '../sections/LocationSection';
import { ContactSection } from '../sections/ContactSection';
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
  DRONE_USAGE_OPTIONS, getFieldsForListingType,
  SMOKING_OPTIONS, ALCOHOL_AVAILABLE_OPTIONS, ALCOHOL_AVAILABILITY_OPTIONS,
} from '../../../utils/constants';

const MOBILITY_TRISTATE = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unknown', label: 'Unknown' },
];

// Issue #76 — Park 20-accordion reorg (section-by-section fixes on #60).
// Same shape as #74 Business Free / #75 Business Paid: every shared-section
// internal is guarded so the other 4 POI types render exactly as before
// (CoreInformationSection / LocationSection / FacilitiesSection /
// OutdoorFeaturesSection / ConnectionsSection were extended with an `isPark`
// branch — never a behavior change for Business / Trail / Event).
//
// Foundation components are reused, not rebuilt:
//   - LocationSection Address renders the CoordinateInput bundle + the moved-in
//     lat_long_most_accurate toggle (isPark path).
//   - ParkingLocationGroup = full repeatable parking grouping on
//     parking_locations JSONB (Acc 5).
//   - RestroomLocationGroup = restroom_name + per-grouping ADA checklist in
//     EVERY grouping (Acc 8).
//   - IdealForGrouped is enabled for Park via IDEAL_FOR_RULES (Acc 2).
//   - Canonical #69 alcohol fields (Acc 12), inlined alongside Smoking.
export default function ParkLayout({ form, userRole, poiId }) {
  const fields = getFieldsForListingType('PARK', form.values.listing_type);
  const idealForCap = fields?.maxIdealFor ?? null;
  const showAlcoholSubFields =
    form.values.alcohol_available && form.values.alcohol_available !== 'no_alcohol';

  return (
    <>
      {/* 1. Park Identity — CoreInfo (isPark: is_verified/is_disaster_hub → Admin;
              lat_long_most_accurate → Address; History → Acc 17; Featured Image
              → Acc 18) + Contact. status + status_message stay inline. */}
      <Accordion.Item value="s1-identity">
        <Accordion.Control>
          <Group><Text fw={600}>Park Identity</Text><Badge size="sm" variant="light">Required</Badge></Group>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <CoreInformationSection form={form} isPark id={poiId} />
            <ContactSection form={form} isFreeListing={false} />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 2. Categories + Discovery — Ideal For (5 groups). Parks do NOT get the
              "Featured Ideal For" top-3 picker (Business + Event only). */}
      <Accordion.Item value="s2-categories">
        <Accordion.Control><Text fw={600}>Categories + Discovery</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <CategoriesSection form={form} isFreeListing={false} />
            <Divider my="sm" />
            <IdealForGrouped form={form} listingType="Park" totalCap={idealForCap} />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 3. Hours. */}
      <Accordion.Item value="s3-hours">
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

      {/* 4. Address — CoordinateInput bundle + moved-in lat_long_most_accurate
              (LocationSection isPark path). Parking block moved OUT to Acc 5. */}
      <Accordion.Item value="s4-address">
        <Accordion.Control><Text fw={600}>Address</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <LocationSection form={form} isPark id={poiId} />
            <ArrivalMethodsGroup form={form} />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 5. Parking (renamed from "Parking + Accessibility") — REPEATABLE
              ParkingLocationGroup: Primary Parking Name + parking_types (inline
              Accessible Parking ADA reveal) + CoordinateInput bundle + images +
              notes + Add Another. Binds parking_locations JSONB. */}
      <Accordion.Item value="s5-parking">
        <Accordion.Control><Text fw={600}>Parking</Text></Accordion.Control>
        <Accordion.Panel>
          <ParkingLocationGroup form={form} id={poiId} isPark label="Parking Locations" />
          <ParkingLotLinkGroup form={form} />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 6. Pricing + Memberships — cost + pricing_details + payment_methods +
              discounts + membership_details (unchanged contents). */}
      <Accordion.Item value="s6-pricing-memberships">
        <Accordion.Control><Text fw={600}>Pricing + Memberships</Text></Accordion.Control>
        <Accordion.Panel>
          <PricingMembershipsSection form={form} />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 7. Accessibility + Mobility Access (NEW dedicated accordion) —
              mobility_access tristates + a single consolidated "Accessibility
              and Mobility" paragraph (wheelchair_details), moved out of
              Facilities + Amenities. */}
      <Accordion.Item value="s7-accessibility">
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

      {/* 8. Public Restrooms (renamed from "Restrooms") — no gate; always-on
              REPEATABLE RestroomLocationGroup (restroom_name + per-grouping ADA
              checklist in EVERY grouping + CoordinateInput + images + notes +
              Add Another). The legacy duplicate "Public Toilet Options" top-level
              checkbox group is removed. Binds toilet_locations[]. */}
      <Accordion.Item value="s8-restrooms">
        <Accordion.Control><Text fw={600}>Public Restrooms</Text></Accordion.Control>
        <Accordion.Panel>
          <RestroomLocationGroup form={form} id={poiId} label="Restroom Locations" />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 9. Playground — #49 per-row age groups + grouped ADA + types/surfaces
              inside each grouping. */}
      <Accordion.Item value="s9-playground">
        <Accordion.Control><Text fw={600}>Playground</Text></Accordion.Control>
        <Accordion.Panel>
          <PlaygroundsSection form={form} isPark id={poiId} />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 10. Facilities + Amenities — FacilitiesSection (isPark: Entertainment +
               legacy Facilities removed; accessibility + smoking moved out) +
               FullAmenitiesBlock (#55 full Park amenities list). */}
      <Accordion.Item value="s10-amenities">
        <Accordion.Control><Text fw={600}>Facilities + Amenities</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <FacilitiesSection form={form} isPark id={poiId} />
            <FullAmenitiesBlock form={form} poiType="PARK" />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 11. Pet Policy. */}
      <Accordion.Item value="s11-pets">
        <Accordion.Control><Text fw={600}>Pet Policy</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <PetPolicySection form={form} />
            <ServiceAnimalAlert />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 12. Alcohol + Smoking (renamed from "Alcohol") — canonical #69 alcohol
               fields (gate → availability multi-select + BYOB + notes) plus the
               Smoking Options + Smoking Policy Details moved from Facilities. */}
      <Accordion.Item value="s12-alcohol-smoking">
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

      {/* 13. Outdoor Features — isPark removes the legacy "Outdoor Types" field. */}
      <Accordion.Item value="s13-outdoor-features">
        <Accordion.Control><Text fw={600}>Outdoor Features</Text></Accordion.Control>
        <Accordion.Panel>
          <OutdoorFeaturesSection form={form} isPark />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 14. Drone Policy. */}
      <Accordion.Item value="s14-drone-policy">
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
              placeholder="Additional drone policy information"
              autosize
              minRows={3}
              value={form.values.drone_policy || ''}
              onChange={(e) => form.setFieldValue('drone_policy', e.currentTarget.value)}
            />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 15. Hunting + Fishing. */}
      <Accordion.Item value="s15-hunting-fishing">
        <Accordion.Control><Text fw={600}>Hunting + Fishing</Text></Accordion.Control>
        <Accordion.Panel>
          <HuntingFishingSection form={form} />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 16. Rentals. */}
      <Accordion.Item value="s16-rentals">
        <Accordion.Control><Text fw={600}>Rentals</Text></Accordion.Control>
        <Accordion.Panel>
          <RentalsSection form={form} id={poiId} />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 17. Locally Found + History (renamed from "Connections") — Connections
               + Community Connections (isPark drops Camping + Lodging for MVP) +
               History Paragraph moved from Park Identity. */}
      <Accordion.Item value="s17-locally-found">
        <Accordion.Control><Text fw={600}>Locally Found + History</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <ConnectionsSection form={form} isPark />
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

      {/* 18. Images (renamed from "Gallery") — Featured / Main Image moved from
               Park Identity + Gallery Photos. */}
      <Accordion.Item value="s18-images">
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

      {/* 19. Contact + Compliance (renamed from "Internal + Compliance"). */}
      <Accordion.Item value="s19-contact-compliance">
        <Accordion.Control><Text fw={600}>Contact + Compliance</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <InternalContactSection form={form} />
            <CorporateComplianceSection form={form} />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 20. Admin-Only (stays LAST; only renders for admins). */}
      <AdminOnlyAccordionItem form={form} userRole={userRole} />
    </>
  );
}
