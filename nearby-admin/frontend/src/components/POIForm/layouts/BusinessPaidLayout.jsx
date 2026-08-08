import React from 'react';
import {
  Accordion, Stack, Group, Text, Badge, Select, Textarea, Checkbox,
  SimpleGrid, Divider, MultiSelect, Alert
} from '@mantine/core';

import { CoreInformationSection } from '../sections/CoreInformationSection';
import { CategoriesSection } from '../sections/CategoriesSection';
import { LocationSection } from '../sections/LocationSection';
import { ContactSection } from '../sections/ContactSection';
import {
  MenuBookingSection, BusinessGallerySection, BusinessEntrySection
} from '../sections/BusinessDetailsSection';
import { RentalsSection, PlaygroundsSection } from '../sections/FacilitiesSection';
import { PetPolicySection } from '../sections/OutdoorFeaturesSection';
import {
  InternalContactSection, CommunityConnectionsSection, CorporateComplianceSection
} from '../sections/MiscellaneousSections';
import HoursSelector from '../../HoursSelector';
import { FeaturedImageUpload, shouldUseImageUpload } from '../ImageIntegration';

import { ParkingLocationGroup } from '../components/ParkingLocationGroup';
import ParkingLotLinkGroup from '../components/ParkingLotLinkGroup';
import { RestroomLocationGroup } from '../components/RestroomLocationGroup';
import { PayphoneLocationGroup } from '../components/PayphoneLocationGroup';
import ServiceAnimalAlert from '../components/ServiceAnimalAlert';
import {
  AdminOnlyAccordionItem, IdealForGrouped, FeaturedIdealForChips, FullAmenitiesBlock,
  ArrivalMethodsGroup, PAYMENT_METHODS, DISCOUNT_TYPES,
} from './_shared';
import {
  PRICE_RANGE_OPTIONS, GIFT_CARD_OPTIONS, SMOKING_OPTIONS,
  ALCOHOL_AVAILABLE_OPTIONS, ALCOHOL_AVAILABILITY_OPTIONS,
} from '../../../utils/constants';

const MOBILITY_TRISTATE = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unknown', label: 'Unknown' },
];

// #75 — Business Paid + Community Comped 18-accordion reorg (supersedes the #53
// 20-section order). Mirrors the #74 Business Free pass: every shared-section
// internal is guarded by `isBusiness && isPaidListing` so the other 4 POI types
// render exactly as before. The Business-Paid layout is also used for
// community_comped + sponsor listings (see POIForm.selectLayout), so the
// paid guard intentionally covers all of those. Foundation components
// (CoordinateInput bundle in LocationSection, ParkingLocationGroup,
// RestroomLocationGroup, AlcoholAccordionItem) are reused, not rebuilt.
export default function BusinessPaidLayout({ form, userRole, poiId }) {
  // This layout only ever mounts for paid/community_comped/sponsor BUSINESS
  // listings, so the paid guard is always true here — it is passed to shared
  // sections so their internal branches that compare against Free vs Paid
  // resolve to the Paid path.
  const isBusiness = true;
  const isPaidListing = true;
  const showAlcoholSubFields =
    form.values.alcohol_available && form.values.alcohol_available !== 'no_alcohol';

  return (
    <>
      {/* 1. Business Identity — CoreInfo (Paid path keeps teaser + long
              description + status + History suppressed → moved to Acc 15) +
              Contact. is_verified / is_disaster_hub live in Admin-Only;
              lat_long_most_accurate / dont_display_location move to Address;
              Featured Image moves to Images (Acc 16). */}
      <Accordion.Item value="s1-identity">
        <Accordion.Control>
          <Group><Text fw={600}>Business Identity</Text><Badge size="sm" variant="light">Required</Badge></Group>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <CoreInformationSection form={form} isBusiness isPaidListing id={poiId} />
            <ContactSection form={form} isFreeListing={false} />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 2. Categories + Discovery — IdealForGrouped (Business Paid: all 5
              groups, no cap). Unchanged. */}
      <Accordion.Item value="s2-categories">
        <Accordion.Control><Text fw={600}>Categories + Discovery</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <CategoriesSection form={form} isPaidListing isFreeListing={false} />
            <Divider my="sm" />
            <IdealForGrouped form={form} listingType="Business Paid" />
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

      {/* 4. Address — CoordinateInput bundle (front_door lat/lng + w3w) +
              moved-in lat_long_most_accurate / dont_display_location toggles
              (LocationSection renders these for the Paid path). The entire
              in-Address parking block is suppressed for Business Paid and
              moves to Acc 5. */}
      <Accordion.Item value="s4-address">
        <Accordion.Control><Text fw={600}>Address</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <LocationSection form={form} isBusiness isPaidListing id={poiId} />
            <ArrivalMethodsGroup form={form} />
            <BusinessEntrySection form={form} id={poiId} />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 5. Parking — REPEATABLE groupings via ParkingLocationGroup (primary +
              Add Another): name / parking_types (inline Accessible Parking ADA
              reveal) / CoordinateInput bundle / photos / notes. Binds the
              parking_locations JSONB. */}
      <Accordion.Item value="s5-parking">
        <Accordion.Control><Text fw={600}>Parking</Text></Accordion.Control>
        <Accordion.Panel>
          <ParkingLocationGroup form={form} id={poiId} label="Parking Locations" />
          <ParkingLotLinkGroup form={form} />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 6. Menu + Booking — unchanged. */}
      <Accordion.Item value="s6-menu">
        <Accordion.Control><Text fw={600}>Menu + Booking</Text></Accordion.Control>
        <Accordion.Panel>
          <MenuBookingSection form={form} id={poiId} />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 7. Pricing + Passes (renamed from "Pricing") — price_range_per_person
              (single canonical instance), Gift Cards, General Pricing,
              pricing_details, Payment Methods (moved here from Amenities), and
              Discounts. */}
      <Accordion.Item value="s7-pricing">
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
            <Select
              label="Gift Cards Available?"
              data={GIFT_CARD_OPTIONS}
              clearable
              value={form.values.gift_cards || null}
              onChange={(v) => form.setFieldValue('gift_cards', v)}
            />
            <Textarea
              label="General Pricing"
              placeholder="e.g., Average meal $15-25"
              autosize
              minRows={1}
              value={form.values.pricing || ''}
              onChange={(e) => form.setFieldValue('pricing', e.currentTarget.value)}
            />
            <Textarea
              label="Pricing Details"
              description="Free-form notes such as 'Kids Under 2 are Free'"
              autosize
              minRows={3}
              value={form.values.pricing_details || ''}
              onChange={(e) => form.setFieldValue('pricing_details', e.currentTarget.value)}
            />
            <MultiSelect
              label="Payment Methods Accepted"
              data={PAYMENT_METHODS}
              searchable
              value={form.values.payment_methods || []}
              onChange={(v) => form.setFieldValue('payment_methods', v)}
            />
            <MultiSelect
              label="Discounts Offered"
              data={DISCOUNT_TYPES}
              searchable
              value={form.values.discounts || []}
              onChange={(v) => form.setFieldValue('discounts', v)}
            />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 8. Accessibility + Mobility Access (NEW dedicated accordion) — the
              mobility_access tristates + wheelchair_details, extracted from the
              removed Amenities + Facilities accordion. */}
      <Accordion.Item value="s8-accessibility">
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
                label="Main Service Area Reachable"
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

      {/* 9. Restrooms — REPEATABLE groupings via RestroomLocationGroup:
              restroom_name + per-grouping ADA checklist + CoordinateInput +
              photos + description + Add Another. Binds toilet_locations[]. */}
      <Accordion.Item value="s9-restrooms">
        <Accordion.Control><Text fw={600}>Restrooms</Text></Accordion.Control>
        <Accordion.Panel>
          <RestroomLocationGroup form={form} id={poiId} label="Restroom Locations" />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 10. Playground — REPEATABLE PlaygroundLocationGroup. The redundant
               "playground available" Yes/No slider (old #53 bug) is gone; the
               group itself owns the primary + Add Another grouping. */}
      <Accordion.Item value="s10-playground">
        <Accordion.Control><Text fw={600}>Playground</Text></Accordion.Control>
        <Accordion.Panel>
          <PlaygroundsSection form={form} isPark id={poiId} />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 11. On Site Facilities + Amenities — repeatable Pay Phone groupings
               (PayphoneLocationGroup) + the Facilities + Amenities JSONB block
               (Wifi, Cell Service, General / Family + Youth / Water + Boating /
               Dining + Seating). */}
      <Accordion.Item value="s11-facilities">
        <Accordion.Control><Text fw={600}>On Site Facilities + Amenities</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <PayphoneLocationGroup form={form} label="Pay Phone Locations" />
            <Divider my="xs" />
            <FullAmenitiesBlock form={form} poiType="BUSINESS" />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 12. Pet Policy — moved down; unchanged contents. */}
      <Accordion.Item value="s12-pets">
        <Accordion.Control><Text fw={600}>Pet Policy</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <PetPolicySection form={form} />
            <ServiceAnimalAlert />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 13. Alcohol + Smoking — canonical #69 AlcoholAccordionItem (gate →
               availability multi-select + BYOB + notes) plus the always-visible
               Smoking policy + details moved from the removed Amenities
               accordion. */}
      <Accordion.Item value="s13-alcohol-smoking">
        <Accordion.Control><Text fw={600}>Alcohol + Smoking</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            {/* Canonical #69 alcohol fields (same as AlcoholAccordionItem):
                alcohol_available gate → alcohol_availability multi-select +
                byob_allowed + alcohol_notes. Inlined here (no nested
                Accordion.Item) so the combined "Alcohol + Smoking" accordion
                owns both. */}
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

      {/* 14. Rentals — unchanged. */}
      <Accordion.Item value="s14-rentals">
        <Accordion.Control><Text fw={600}>Rentals</Text></Accordion.Control>
        <Accordion.Panel>
          <RentalsSection form={form} id={poiId} />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 15. Locally Found + History — Article Links + Community Impact (moved
               from Internal + Compliance) + History Paragraph (moved from
               Business Identity). */}
      <Accordion.Item value="s15-locally-found">
        <Accordion.Control><Text fw={600}>Locally Found + History</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
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

      {/* 16. Images (renamed from "Gallery") — Featured / Main Image (moved
               from Business Identity) + Gallery Photos. */}
      <Accordion.Item value="s16-images">
        <Accordion.Control><Text fw={600}>Images</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            {shouldUseImageUpload(poiId) ? (
              <FeaturedImageUpload
                key={`featured-image-${poiId}`}
                poiId={poiId}
                isBusiness
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

      {/* 17. Contact + Compliance (renamed from "Internal + Compliance") —
               Article Links + Community Impact moved out to Acc 15; everything
               else stays. */}
      <Accordion.Item value="s17-contact-compliance">
        <Accordion.Control><Text fw={600}>Contact + Compliance</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <InternalContactSection form={form} />
            <CorporateComplianceSection form={form} />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 18. Admin-Only (stays LAST; only renders for admins). */}
      <AdminOnlyAccordionItem form={form} userRole={userRole} />
    </>
  );
}
