import React from 'react';
import {
  Accordion, Stack, Group, Text, Badge, Select, Textarea, Checkbox,
  SimpleGrid, Divider, Alert
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';

import { CoreInformationSection } from '../sections/CoreInformationSection';
import { CategoriesSection } from '../sections/CategoriesSection';
import { ContactSection } from '../sections/ContactSection';
import { LocationSection } from '../sections/LocationSection';
import RecurringEventSection from '../sections/RecurringEventSection';
import {
  EventVendorsSection, EventMapsSection,
  EventVenueSection, EventStatusSection, EventCostSection,
  EventSponsorsSection, EventOrganizerSection,
} from '../sections/EventSpecificSections';
import {
  FacilitiesSection, PublicAmenitiesSection, RentalsSection, PlaygroundsSection
} from '../sections/FacilitiesSection';
import { PetPolicySection } from '../sections/OutdoorFeaturesSection';
import { BusinessGallerySection } from '../sections/BusinessDetailsSection';
import {
  InternalContactSection, CommunityConnectionsSection, CorporateComplianceSection
} from '../sections/MiscellaneousSections';
import { CheckboxGroupSection } from '../components/CheckboxGroupSection';
import { RestroomLocationGroup } from '../components/RestroomLocationGroup';
import { ParkingLocationGroup } from '../components/ParkingLocationGroup';
import ParkingLotLinkGroup from '../components/ParkingLotLinkGroup';
import { FeaturedImageUpload, shouldUseImageUpload } from '../ImageIntegration';

import ServiceAnimalAlert from '../components/ServiceAnimalAlert';
import {
  AdminOnlyAccordionItem, IdealForGrouped, FeaturedIdealForChips, ArrivalMethodsGroup,
  FullAmenitiesBlock,
} from './_shared';
import {
  PAYMENT_METHODS, VENUE_SETTINGS,
  ALCOHOL_AVAILABLE_OPTIONS, ALCOHOL_AVAILABILITY_OPTIONS, SMOKING_OPTIONS,
} from '../../../utils/constants';

const MOBILITY_TRISTATE = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unknown', label: 'Unknown' },
];

// Issue #73 — Event 20-accordion reorg (section-by-section fixes on #59).
// Same shape as #74 Business Free / #76 Park: every shared-section internal is
// guarded so the other 4 POI types render exactly as before. CoreInformation /
// Location / Facilities were extended with an `isEvent` branch — never a
// behavior change for Business / Park / Trail.
//
// Foundation components reused, not rebuilt:
//   - LocationSection Address renders the CoordinateInput bundle (front_door
//     lat/lng + w3w) + the moved-in lat_long_most_accurate toggle (isEvent path)
//     + Event Entry Notes/Photos + arrival methods (Acc 8).
//   - ParkingLocationGroup = full repeatable parking grouping on
//     parking_locations JSONB (Acc 9).
//   - RestroomLocationGroup = restroom_name + per-grouping ADA checklist in
//     EVERY grouping (Acc 11).
//   - IdealForGrouped is enabled for Event via IDEAL_FOR_RULES (Acc 2, cap 10).
//   - Canonical #69 alcohol fields (Acc 15), inlined alongside Smoking.
export default function EventLayout({ form, userRole, poiId }) {
  const showAlcoholSubFields =
    form.values.alcohol_available && form.values.alcohol_available !== 'no_alcohol';

  // Stable Date references for the start/end DateTimePickers. Re-deriving
  // `new Date(...)` inline on every render gives the controlled value a fresh
  // object identity each render, which makes Mantine's DateTimePicker dropdown
  // close on every interaction. Memoizing keys the identity to the stored value
  // (the same stability the useState-backed RescheduleModal already has).
  const startDatetimeValue = React.useMemo(() => {
    const v = form.values.event?.start_datetime;
    return v instanceof Date ? v : v ? new Date(v) : null;
  }, [form.values.event?.start_datetime]);
  const endDatetimeValue = React.useMemo(() => {
    const v = form.values.event?.end_datetime;
    return v instanceof Date ? v : v ? new Date(v) : null;
  }, [form.values.event?.end_datetime]);

  return (
    <>
      {/* 1. Event Identity — CoreInfo (isEvent: is_verified/is_disaster_hub →
              Admin-Only; lat_long_most_accurate → Address; Start/End Date+Time +
              Date Instructions → Event Details; History → Locally Found;
              Featured Image → Images; dead "Create Repeating Event" removed). */}
      <Accordion.Item value="s1-identity">
        <Accordion.Control>
          <Group><Text fw={600}>Event Identity</Text><Badge size="sm" variant="light">Required</Badge></Group>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <CoreInformationSection form={form} isEvent id={poiId} />
            <ContactSection form={form} isFreeListing={false} />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 2. Categories + Discovery (Ideal For 5-group, cap 10 for Event). */}
      <Accordion.Item value="s2-categories">
        <Accordion.Control><Text fw={600}>Categories + Discovery</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <CategoriesSection form={form} isPaidListing isFreeListing={false} />
            <Divider my="sm" />
            <IdealForGrouped form={form} listingType="Event" />
            <Divider my="sm" />
            <FeaturedIdealForChips form={form} />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 3. Event Details — Event Status FIRST, then Date Instructions banner,
              Start/End Date+Time, the working Repeating Event mechanism, Event
              Food and Drink + Downloadable Maps, the Event Venue Setting JSONB
              array, and the Event Cost + Tickets sub-group (incl. Payment
              Methods moved from On Site Facilities). */}
      <Accordion.Item value="s3-event-details">
        <Accordion.Control>
          <Group><Text fw={600}>Event Details</Text><Badge size="sm" variant="light">Required</Badge></Group>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <EventStatusSection form={form} />

            <Divider my="sm" label="Event Dates" />
            <Alert color="blue" variant="light">
              <Text size="sm">
                <strong>Date Instructions:</strong>
                <br />• If your event takes place on multiple separate days, please create a Repeat Event and enter each day individually.
                <br />• If your event runs past midnight (for example, December 31st at 10:00 AM until January 1st at 3:00 AM), enter it as one single event since it's continuous.
              </Text>
            </Alert>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <DateTimePicker
                label="Start Date & Time"
                placeholder="Select start date and time"
                valueFormat="MM/DD/YYYY hh:mm A"
                timePickerProps={{ format: '12h', withDropdown: true }}
                value={startDatetimeValue}
                onChange={(val) => form.setFieldValue('event.start_datetime', val)}
                error={form.errors['event.start_datetime']}
              />
              <DateTimePicker
                label="End Date & Time"
                placeholder="Select end date and time"
                valueFormat="MM/DD/YYYY hh:mm A"
                timePickerProps={{ format: '12h', withDropdown: true }}
                value={endDatetimeValue}
                onChange={(val) => form.setFieldValue('event.end_datetime', val)}
                error={form.errors['event.end_datetime']}
              />
            </SimpleGrid>

            <Divider my="sm" label="Repeating Event" />
            <RecurringEventSection form={form} />

            {/* Event Food and Drink + Downloadable Maps. */}
            <EventMapsSection form={form} id={poiId} />

            <Divider my="sm" label="Event Venue Setting" />
            <Checkbox.Group
              label="Venue Settings"
              value={form.values.event?.venue_settings || []}
              onChange={(value) => form.setFieldValue('event.venue_settings', value)}
            >
              <SimpleGrid cols={{ base: 2, sm: 4 }}>
                {VENUE_SETTINGS.map((setting) => (
                  <Checkbox key={setting} value={setting} label={setting} />
                ))}
              </SimpleGrid>
            </Checkbox.Group>

            <Divider my="sm" label="Event Cost + Tickets" />
            <EventCostSection form={form} />
            {/* Payment Methods moved here from On Site Facilities (#73). */}
            <CheckboxGroupSection
              label="Payment Methods"
              fieldName="payment_methods"
              options={PAYMENT_METHODS}
              cols={{ base: 2, sm: 3 }}
              form={form}
            />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 4. Event Venue (NEW dedicated) — "Select Venue" blue info banner +
              searchable venue dropdown (Business/Park/Trail) via VenueSelector.
              PROJECT-OWNER DECISION (option B): KEEP the "event-specific
              overrides" banner as a visible placeholder for future overrides —
              banner concept only, no backing fields wired. */}
      <Accordion.Item value="s4-venue">
        <Accordion.Control><Text fw={600}>Event Venue</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <EventVenueSection form={form} id={poiId} />
            <Divider my="sm" />
            <Alert color="gray" variant="light">
              <Text size="sm">
                Additional venue configuration is handled through the venue selector above.
                Event-specific overrides (capacity, indoor/outdoor flag, venue address)
                will be captured here once those fields are wired up.
              </Text>
            </Alert>
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 5. Event Organizer. */}
      <Accordion.Item value="s5-organizer">
        <Accordion.Control><Text fw={600}>Event Organizer</Text></Accordion.Control>
        <Accordion.Panel>
          <EventOrganizerSection form={form} />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 6. Event Sponsors (renamed from "Sponsors") — Tier-first (#51). */}
      <Accordion.Item value="s6-sponsors">
        <Accordion.Control><Text fw={600}>Event Sponsors</Text></Accordion.Control>
        <Accordion.Panel>
          <EventSponsorsSection form={form} id={poiId} />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 7. Event Vendors (NEW dedicated) — "Event has vendors" Yes/No gate +
              a NEW instructions banner directly under it; when YES reveal the
              vendor application fields + linked vendor POI JSONB array
              (EventVendorsSection owns the gate + reveal). */}
      <Accordion.Item value="s7-vendors">
        <Accordion.Control><Text fw={600}>Event Vendors</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <Alert color="blue" variant="light">
              <Text size="sm">
                Are you accepting vendors? If so, please enter the info below.
              </Text>
            </Alert>
            <EventVendorsSection form={form} id={poiId} />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 8. Address (renamed from "Location + Arrival") — map widget + address
              fields + the CoordinateInput bundle (front_door lat/lng + w3w) +
              moved-in lat_long_most_accurate + arrival_methods + Event Entry
              Notes + Event Entry Photos (all via LocationSection isEvent path).
              Venue Settings moved to Acc 3; parking moved to Acc 9. */}
      <Accordion.Item value="s8-address">
        <Accordion.Control><Text fw={600}>Address</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <LocationSection form={form} isEvent id={poiId} />
            <ArrivalMethodsGroup form={form} />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 9. Parking — REPEATABLE ParkingLocationGroup: Primary Parking Name +
              parking_types (inline Accessible Parking ADA reveal) +
              CoordinateInput bundle + photos + notes + Add Another. Binds
              parking_locations JSONB. */}
      <Accordion.Item value="s9-parking">
        <Accordion.Control><Text fw={600}>Parking</Text></Accordion.Control>
        <Accordion.Panel>
          <ParkingLocationGroup form={form} id={poiId} isEvent label="Parking Locations" />
          <ParkingLotLinkGroup form={form} />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 10. Accessibility + Mobility Access (NEW dedicated) — mobility_access
               tristates + wheelchair_details, moved out of On Site Facilities. */}
      <Accordion.Item value="s10-accessibility">
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

      {/* 11. Public Restrooms — no gate; always-on REPEATABLE RestroomLocationGroup
               (restroom_name + per-grouping ADA checklist in EVERY grouping +
               CoordinateInput + images + notes + Add Another). Binds
               toilet_locations[]. */}
      <Accordion.Item value="s11-restrooms">
        <Accordion.Control><Text fw={600}>Public Restrooms</Text></Accordion.Control>
        <Accordion.Panel>
          <RestroomLocationGroup form={form} id={poiId} label="Restroom Locations" />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 12. Playground — #49 per-row age groups + grouped ADA checklist.
               PlaygroundsSection owns its own playground_available Switch. */}
      <Accordion.Item value="s12-playground">
        <Accordion.Control><Text fw={600}>Playground</Text></Accordion.Control>
        <Accordion.Panel>
          <PlaygroundsSection form={form} isPark id={poiId} />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 13. On Site Facilities + Amenities — FacilitiesSection (isEvent: now
               just the Pay Phone repeatable; Payment Methods → Acc 3,
               accessibility → Acc 10, smoking → Acc 15, dead WiFi options
               removed) + FullAmenitiesBlock (#55 Event amenities list, which
               already includes WiFi + Cell Service). */}
      <Accordion.Item value="s13-onsite-facilities">
        <Accordion.Control><Text fw={600}>On Site Facilities + Amenities</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <FacilitiesSection form={form} isEvent id={poiId} />
            <FullAmenitiesBlock form={form} poiType="EVENT" />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 14. Pet Policy. */}
      <Accordion.Item value="s14-pets">
        <Accordion.Control><Text fw={600}>Pet Policy</Text></Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <PetPolicySection form={form} />
            <ServiceAnimalAlert />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {/* 15. Alcohol + Smoking — canonical #69 alcohol fields (gate →
               availability multi-select + BYOB + notes) plus the Smoking
               Options + Smoking Policy Details moved from On Site Facilities. */}
      <Accordion.Item value="s15-alcohol-smoking">
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

      {/* 16. Rentals. */}
      <Accordion.Item value="s16-rentals">
        <Accordion.Control><Text fw={600}>Rentals</Text></Accordion.Control>
        <Accordion.Panel>
          <RentalsSection form={form} id={poiId} />
        </Accordion.Panel>
      </Accordion.Item>

      {/* 17. Locally Found + History — Article Links + Community Impact
               (CommunityConnectionsSection) + History Paragraph moved from
               Event Identity. */}
      <Accordion.Item value="s17-locally-found">
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

      {/* 18. Images — Featured / Main Image moved from Event Identity + Gallery
               Photos. */}
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

      {/* 20. Admin-Only (stays LAST; only renders for admins). is_verified +
               is_disaster_hub moved here from Event Identity. */}
      <AdminOnlyAccordionItem form={form} userRole={userRole} />
    </>
  );
}
