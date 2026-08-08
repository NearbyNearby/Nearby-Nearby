import React, { useState } from 'react';
import {
  Alert, Badge, Box, Button, Group, Paper, SegmentedControl, Stack, Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCopy, IconLock } from '@tabler/icons-react';
import {
  VENUE_INHERITANCE_SECTIONS,
  VENUE_INHERITANCE_MODES,
} from '../../../utils/constants';
import { api } from '../../../utils/api';

/**
 * Per-section venue inheritance control (issue #124).
 *
 * Rhonda's ask: "the venue data inheritance choice should live in each accordion
 * section, so it can be set per section". This renders that choice at the top of
 * one Event form panel and, when given children, owns the panel body too.
 *
 *   as_is       locked, live. The event's own columns for the section are
 *               dormant (never cleared) and the API resolves the venue's values
 *               fresh on every read, so a venue edit shows up immediately.
 *   use_and_add ONE-TIME copy the moment the mode is chosen. After that the
 *               event's own values stand alone and a venue edit cannot
 *               overwrite them. Re-copy on demand.
 *   do_not_use  nothing inherited. Existing values are left alone, never wiped.
 *
 * Returns null when the event has no venue linked.
 */

// Venue-data payload keys copied per section. Same names as the POI form fields
// except where noted in copyVenueSection below.
export const SECTION_COPY_FIELDS = {
  address: [
    'address_full', 'address_street', 'address_city', 'address_state',
    'address_zip', 'address_county', 'what3words_address', 'arrival_methods',
  ],
  parking: [
    'parking_types', 'parking_notes', 'parking_locations',
    'expect_to_pay_parking', 'accessible_parking_details',
  ],
  accessibility: ['wheelchair_details', 'mobility_access'],
  restrooms: [
    'public_toilets', 'toilet_description', 'toilet_locations',
    'accessible_restroom', 'accessible_restroom_details',
  ],
  playground: [
    'playground_available', 'playground_types', 'playground_surface_types',
    'playground_notes', 'playground_locations', 'playground_age_groups',
    'playground_ada_checklist', 'inclusive_playground',
  ],
  amenities: ['amenities', 'payment_methods', 'cell_service', 'payphone_locations'],
  pet_policy: ['pet_options', 'pet_policy'],
  alcohol_smoking: [
    'alcohol_available', 'alcohol_availability', 'alcohol_options',
    'alcohol_policy_details', 'alcohol_notes', 'byob_allowed',
    'smoking_options', 'smoking_details',
  ],
  contact: ['phone_number', 'email', 'website_url'],
};

const MODE_HINTS = {
  as_is: 'Locked to the venue. Updates automatically whenever the venue POI changes.',
  use_and_add: 'Copied once from the venue. Edit freely; venue updates will not overwrite it.',
  do_not_use: 'Nothing is inherited. Enter all new information for this section.',
};

/**
 * Copy one section's venue data into the event form.
 * Only fields the venue actually has are written, so a copy never blanks out
 * information the editor already entered.
 */
export function copyVenueSection(form, section, venueData) {
  if (!venueData) return 0;
  let copied = 0;

  (SECTION_COPY_FIELDS[section] || []).forEach((field) => {
    const value = venueData[field];
    if (value === null || value === undefined || value === '') return;
    form.setFieldValue(field, value);
    copied += 1;
  });

  if (section === 'address') {
    // Coordinates are a GeoJSON point in the payload but two form fields.
    if (venueData.location?.coordinates) {
      form.setFieldValue('longitude', venueData.location.coordinates[0]);
      form.setFieldValue('latitude', venueData.location.coordinates[1]);
      copied += 1;
    }
    if (venueData.front_door_latitude) {
      form.setFieldValue('front_door_latitude', venueData.front_door_latitude);
    }
    if (venueData.front_door_longitude) {
      form.setFieldValue('front_door_longitude', venueData.front_door_longitude);
    }
    // The venue keeps entry notes in a type-specific column; the API normalizes
    // them to entry_notes and the event has its own event_entry_notes.
    if (venueData.entry_notes) {
      form.setFieldValue('event.event_entry_notes', venueData.entry_notes);
      copied += 1;
    }
  }

  return copied;
}

const VenueSectionModeControl = React.memo(function VenueSectionModeControl({
  section,
  form,
  venueData = null,
  children = null,
}) {
  const [copying, setCopying] = useState(false);
  const venuePoiId = form.values.event?.venue_poi_id;

  if (!venuePoiId) {
    return children;
  }

  const meta = VENUE_INHERITANCE_SECTIONS.find((s) => s.value === section);
  const inheritance = form.values.event?.venue_inheritance || {};
  const mode = inheritance[section] || 'do_not_use';
  const venueName = venueData?.venue_name || form.values.event?.venue_name || 'the venue';

  async function loadVenueData() {
    if (venueData) return venueData;
    const response = await api.get(`/pois/${venuePoiId}/venue-data`);
    if (!response.ok) throw new Error('Failed to fetch venue data');
    return response.json();
  }

  async function runCopy(label) {
    setCopying(true);
    try {
      const data = await loadVenueData();
      const copied = copyVenueSection(form, section, data);
      notifications.show({
        title: label,
        message: copied
          ? `${copied} field(s) copied from "${data.venue_name}".`
          : `"${data.venue_name}" has no data for this section yet.`,
        color: copied ? 'green' : 'yellow',
      });
    } catch (error) {
      console.error('Failed to copy venue section:', error);
      notifications.show({
        title: 'Error',
        message: 'Could not copy this section from the venue',
        color: 'red',
      });
    } finally {
      setCopying(false);
    }
  }

  function handleModeChange(newMode) {
    if (newMode === mode) return;
    form.setFieldValue('event.venue_inheritance', { ...inheritance, [section]: newMode });
    // One-time copy, only on the TRANSITION into use_and_add. Re-renders cannot
    // re-trigger it because this only runs from the control's onChange.
    if (newMode === 'use_and_add') {
      runCopy('Venue Data Copied');
    }
  }

  const locked = mode === 'as_is';

  return (
    <Stack gap="sm">
      <Paper withBorder p="sm" radius="sm">
        <Group justify="space-between" align="center" wrap="wrap" gap="xs">
          <Group gap="xs">
            <Text size="sm" fw={600}>Venue data</Text>
            {meta?.label && <Badge size="xs" variant="light">{meta.label}</Badge>}
          </Group>
          <SegmentedControl
            size="xs"
            data={VENUE_INHERITANCE_MODES}
            value={mode}
            onChange={handleModeChange}
          />
        </Group>
        <Text size="xs" c="dimmed" mt={6}>{MODE_HINTS[mode]}</Text>

        {locked && (
          <Alert color="blue" variant="light" mt="sm" icon={<IconLock size={16} />}>
            <Text size="xs">
              Inherited from <strong>{venueName}</strong> and updating automatically.
              The fields below are not used while this is on.
            </Text>
          </Alert>
        )}

        {mode === 'use_and_add' && (
          <Group mt="sm">
            <Button
              size="xs"
              variant="light"
              leftSection={<IconCopy size={14} />}
              loading={copying}
              onClick={() => runCopy('Re-copied From Venue')}
            >
              Re-copy from venue
            </Button>
            <Text size="xs" c="dimmed">
              Overwrites this section with {venueName}&apos;s current data.
            </Text>
          </Group>
        )}
      </Paper>

      {children && (
        locked ? (
          <Box
            aria-disabled="true"
            data-venue-locked="true"
            style={{ opacity: 0.55, pointerEvents: 'none' }}
          >
            {children}
          </Box>
        ) : children
      )}
    </Stack>
  );
});

export default VenueSectionModeControl;
export { VenueSectionModeControl };
