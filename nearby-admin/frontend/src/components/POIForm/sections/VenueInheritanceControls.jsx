import React from 'react';
import { Card, Stack, Group, Text, Badge, Divider } from '@mantine/core';
import { VENUE_INHERITANCE_SECTIONS } from '../../../utils/constants';

/**
 * VenueInheritanceControls
 *
 * READ-ONLY summary of how each section treats the linked venue (issue #124).
 * The choice itself is now made inside each Event form accordion, by
 * VenueSectionModeControl, which is what Rhonda asked for: "the venue data
 * inheritance choice should live in each accordion section". This card exists
 * so the Event Venue panel can show the whole picture at a glance.
 *
 * Returns null when no venue is selected (venue_poi_id is falsy).
 */
const MODE_SUMMARY = {
  as_is: { label: 'Use As Is', color: 'blue', hint: 'Follows the venue automatically' },
  use_and_add: { label: 'Use & Add', color: 'teal', hint: 'Copied once, edits are kept' },
  do_not_use: { label: "Don't Use", color: 'gray', hint: 'Event enters its own information' },
};

const VenueInheritanceControls = React.memo(function VenueInheritanceControls({ form }) {
  const venuePoiId = form.values.event?.venue_poi_id;

  if (!venuePoiId) {
    return null;
  }

  const currentInheritance = form.values.event?.venue_inheritance || {};

  return (
    <Card withBorder p="md" mt="md">
      <Text fw={600} size="sm" mb="md">
        Venue Data Inheritance
      </Text>
      <Text size="xs" c="dimmed" mb="md">
        Set per section, inside each section below. This is a summary.
      </Text>
      <Stack gap="sm">
        {VENUE_INHERITANCE_SECTIONS.map((section, index) => {
          const mode = MODE_SUMMARY[currentInheritance[section.value]] || MODE_SUMMARY.do_not_use;
          return (
            <React.Fragment key={section.value}>
              {index > 0 && <Divider />}
              <Group justify="space-between" align="center" wrap="wrap" gap="xs">
                <Text size="sm" fw={500} style={{ minWidth: 140 }}>
                  {section.label}
                </Text>
                <Group gap="xs">
                  <Text size="xs" c="dimmed">{mode.hint}</Text>
                  <Badge size="sm" color={mode.color} variant="light">{mode.label}</Badge>
                </Group>
              </Group>
            </React.Fragment>
          );
        })}
      </Stack>
    </Card>
  );
});

export default VenueInheritanceControls;
