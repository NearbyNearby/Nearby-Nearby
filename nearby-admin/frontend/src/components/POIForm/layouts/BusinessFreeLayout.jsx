import React from 'react';
import {
  Accordion, Stack, Group, Text, Badge, Select, Textarea, Checkbox,
  SimpleGrid, Divider, Alert
} from '@mantine/core';

import { CoreInformationSection } from '../sections/CoreInformationSection';
import { CategoriesSection } from '../sections/CategoriesSection';
import { LocationSection } from '../sections/LocationSection';
import { ContactSection } from '../sections/ContactSection';
import { PetPolicySection } from '../sections/OutdoorFeaturesSection';
import {
  InternalContactSection, CorporateComplianceSection
} from '../sections/MiscellaneousSections';
import HoursSelector from '../../HoursSelector';
import { RestroomLocationGroup } from '../components/RestroomLocationGroup';
import ParkingLotLinkGroup from '../components/ParkingLotLinkGroup';
import { FeaturedImageUpload, shouldUseImageUpload } from '../ImageIntegration';

import ServiceAnimalAlert from '../components/ServiceAnimalAlert';
import { AdminOnlyAccordionItem, IdealForGrouped, FeaturedIdealForChips } from './_shared';
import {
  getFieldsForListingType, PRICE_RANGE_OPTIONS,
  PARKING_OPTIONS, PARKING_ADA_CHECKLIST,
  ALCOHOL_AVAILABLE_OPTIONS, ALCOHOL_AVAILABILITY_OPTIONS, SMOKING_OPTIONS,
} from '../../../utils/constants';

// First PARKING_OPTIONS entry is the "Accessible Parking" option whose selection
// reveals the 6-item ADA accessible-parking sub-checklist.
const ACCESSIBLE_PARKING_OPTION = PARKING_OPTIONS[0];

const MOBILITY_TRISTATE = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unknown', label: 'Unknown' },
];

// #74 — Business Free 13-section accordion order. This supersedes the #52
// ordering: Pricing moves up, Accessibility + Alcohol/Smoking become their own
// accordions, the Amenities accordion is removed, and the Logo/Identity toggles
// move to their target sections. Shared-section internals are guarded so the
// other 4 POI types render exactly as before.
export default function BusinessFreeLayout({ form, userRole, poiId }) {
  const fields = getFieldsForListingType('BUSINESS', 'free');
  const parkingTypes = Array.isArray(form.values.parking_types) ? form.values.parking_types : [];
  const accessibleParkingSelected = parkingTypes.includes(ACCESSIBLE_PARKING_OPTION);
  const accessibleParkingDetails = Array.isArray(form.values.accessible_parking_details)
    ? form.values.accessible_parking_details
    : [];
  const showAlcoholSubFields =
    form.values.alcohol_available && form.values.alcohol_available !== 'no_alcohol';

  const toggleAccessibleParking = (opt) => {
    const next = accessibleParkingDetails.includes(opt)
      ? accessibleParkingDetails.filter((x) => x !== opt)
      : [...accessibleParkingDetails, opt];
    form.setFieldValue('accessible_parking_details', next);
  };

  return (
    <>
      {/* 1. Business Identity — CoreInfo (logo + status toggles suppressed for
              Free) + Contact + a "WiFi Available" checkbox bound to icon_free_wifi. */}
      <Accordion.Item value="s1-identity">
        <Accordion.Control>
          <Group><Text fw={600}>Business Identity</Text><Badge size="sm" variant="light">Required</Badge></Group>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <CoreInformationSection form={form} isBusiness isFreeListing id={poiId} />
            <ContactSection form={form} isFreeListing={true} />
            {/* icon_free_wifi is a COMPUTED boolean (apply_phase1_computed derives
                it from wifi_options / amenities.wifi), so it can't be set directly.
                Drive the real, whitelisted wifi_options field instead — 'Free Wifi'
                makes the computed icon true and persists. */}
            <Checkbox
              label="WiFi Available"
              description="Marks this business as offering free WiFi"
              checked={(form.values.wifi_options || []).includes('Free Wifi')}
              onChange={(e) =>
                form.setFieldValue('wifi_options', e.currentTarget.checked ? ['Free Wifi'] : [])
              }
            />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 2. Categories + Discovery (ideal_for cap 5 for Business Free) — unchanged. */}
      <Accordion.Item value="s2-categories">
        <Accordion.Control><Text fw={600}>Categories + Discovery</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <CategoriesSection form={form} isFreeListing isPaidListing={false} />
            <IdealForGrouped form={form} listingType="Business Free" totalCap={fields.maxIdealFor} />
            <Divider my="sm" />
            <FeaturedIdealForChips form={form} />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 3. Hours — unchanged. */}
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

      {/* 4. Address — CoordinateInput bundle (front_door lat/lng + w3w) plus the
              moved-in lat_long_most_accurate + dont_display_location toggles.
              Parking block is suppressed for Free inside LocationSection. */}
      <Accordion.Item value="s4-address">
        <Accordion.Control><Text fw={600}>Address</Text></Accordion.Control>
        <Accordion.Panel>
          <LocationSection form={form} isBusiness isFreeListing id={poiId} />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 5. Parking — Business Free gets ONLY parking_types, with the inline
              Accessible Parking ADA reveal (accessible_parking_details). */}
      <Accordion.Item value="s5-parking">
        <Accordion.Control><Text fw={600}>Parking</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <Checkbox.Group
              label="Parking Types"
              value={parkingTypes}
              onChange={(value) => form.setFieldValue('parking_types', value)}
            >
              <SimpleGrid cols={{ base: 2, sm: 3 }}>
                {PARKING_OPTIONS.map((type) => (
                  <Checkbox key={type} value={type} label={type} />
                ))}
              </SimpleGrid>
            </Checkbox.Group>

            {accessibleParkingSelected && (
              <Stack
                gap="xs"
                pl="md"
                style={{ borderLeft: '2px solid var(--mantine-color-gray-3)' }}
              >
                <Text fw={500} size="sm" c="dimmed">
                  Accessible Parking Details (ADA) <Text span c="red">*</Text>
                </Text>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  {PARKING_ADA_CHECKLIST.map((opt) => (
                    <Checkbox
                      key={opt}
                      label={opt}
                      checked={accessibleParkingDetails.includes(opt)}
                      onChange={() => toggleAccessibleParking(opt)}
                    />
                  ))}
                </SimpleGrid>
                {form.errors.accessible_parking_details && (
                  <Text c="red" size="xs">{form.errors.accessible_parking_details}</Text>
                )}
              </Stack>
            )}

            {/* Business Free still gets no own-lot repeat, but it may LINK
                shared lots (product decision 7). */}
            <ParkingLotLinkGroup form={form} />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 6. Pricing + Passes (renamed from "Pricing", moved up) —
              price_range_per_person + pricing_details. */}
      <Accordion.Item value="s6-pricing">
        <Accordion.Control><Text fw={600}>Pricing + Passes</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <Select
              label="Price Range Per Person"
              placeholder="Select a price range"
              data={PRICE_RANGE_OPTIONS}
              clearable
              value={form.values.price_range_per_person || null}
              onChange={(v) => form.setFieldValue('price_range_per_person', v)}
            />
            <Textarea
              label="Pricing Details"
              description="Free-form notes such as 'Kids Under 2 are Free'"
              autosize
              minRows={3}
              value={form.values.pricing_details || ''}
              onChange={(e) => form.setFieldValue('pricing_details', e.currentTarget.value)}
            />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 7. Accessibility + Mobility Access — its OWN accordion (extracted from
              the removed Amenities accordion). */}
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
                label="Mobility Access — Main Area Accessible"
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

      {/* 8. Public Restrooms — restroom_name + restroom features + Add Another
              (RestroomLocationGroup binds the toilet_locations[] array). */}
      <Accordion.Item value="s8-restrooms">
        <Accordion.Control><Text fw={600}>Public Restrooms</Text></Accordion.Control>
        <Accordion.Panel>
          <RestroomLocationGroup form={form} id={poiId} label="Restroom Locations" />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 9. Pet Policy — unchanged. */}
      <Accordion.Item value="s9-pets">
        <Accordion.Control><Text fw={600}>Pet Policy</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <PetPolicySection form={form} />
            <ServiceAnimalAlert />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 10. Alcohol + Smoking — alcohol Yes/No gate reveals options + policy
               details; smoking is always visible (no gate). */}
      <Accordion.Item value="s10-alcohol-smoking">
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
                {/* Canonical #69 alcohol fields (same as AlcoholAccordionItem used
                    by the other POI types): granular types -> alcohol_availability,
                    plus byob_allowed + alcohol_notes. The #74 spec's "alcohol_options
                    / alcohol_policy_details" are the legacy pre-#69 columns; we use
                    the canonical ones so Business Free data matches every other type
                    and renders on the public app. */}
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

      {/* 11. Images — Logo only (moved from Identity). No gallery for Free. */}
      <Accordion.Item value="s11-images">
        <Accordion.Control><Text fw={600}>Images</Text></Accordion.Control>
        <Accordion.Panel>
          {shouldUseImageUpload(poiId) ? (
            <FeaturedImageUpload
              key={`featured-image-${poiId}`}
              poiId={poiId}
              isBusiness
              isFreeListing
              form={form}
            />
          ) : (
            <Alert color="blue" variant="light">
              <Text size="sm">Logo upload will be available once the listing is saved.</Text>
            </Alert>
          )}
        </Accordion.Panel>
      </Accordion.Item>

      {/* 12. Contact + Compliance — merge of the old Internal + Compliance
               accordions. */}
      <Accordion.Item value="s12-contact-compliance">
        <Accordion.Control><Text fw={600}>Contact + Compliance</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <InternalContactSection form={form} />
            <CorporateComplianceSection form={form} />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 13. Admin-Only (stays last; only renders for admins). */}
      <AdminOnlyAccordionItem form={form} userRole={userRole} />
    </>
  );
}
