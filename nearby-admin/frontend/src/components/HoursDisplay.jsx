import { Stack, Group, Text, Badge, Card, Divider, Alert } from '@mantine/core';
import { IconClock, IconAlertCircle, IconCheck, IconX } from '@tabler/icons-react';
import { 
  groupHours, 
  formatGroupedHours, 
  isCurrentlyOpen, 
  getNextOpenTime,
  formatDayHours 
} from '../utils/hoursFormatter';

// #116 - read the holiday `mode`, falling back to the legacy `status` where the
// old meaning of 'open' was "follows the regular schedule".
function holidayModeLabel(holiday) {
  const mode = holiday.mode
    || (holiday.status === 'open' ? 'follows_regular' : holiday.status);
  if (mode === 'closed') return 'Closed';
  if (mode === 'open') return 'Open';
  if (mode === 'follows_regular') return 'Follows Regular Hours';
  return 'Modified Hours';
}

export default function HoursDisplay({ hours }) {
  if (!hours || !hours.regular) {
    return (
      <Card p="sm" withBorder>
        <Group>
          <IconClock size={20} />
          <Text c="dimmed">Hours not set</Text>
        </Group>
      </Card>
    );
  }

  const isOpen = isCurrentlyOpen(hours);
  const nextOpen = !isOpen ? getNextOpenTime(hours) : null;
  const hoursGroups = groupHours(hours);

  return (
    <Card p="md" withBorder>
      <Group justify="space-between" mb="md">
        <Group>
          <IconClock size={20} />
          <Text fw={500}>Hours of Operation</Text>
        </Group>
        <Badge
          color={isOpen ? 'green' : 'red'}
          leftSection={isOpen ? <IconCheck size={12} /> : <IconX size={12} />}
        >
          {isOpen ? 'Open Now' : 'Closed'}
        </Badge>
      </Group>

      {nextOpen && (
        <Alert color="blue" variant="light" mb="md">
          Opens {nextOpen.day} at {nextOpen.time}
        </Alert>
      )}

      <Stack gap="xs">
        {hoursGroups.map((group, index) => (
          <Text key={index} size="sm">
            {formatGroupedHours(group)}
          </Text>
        ))}
      </Stack>

      {hours.notes && (
        <>
          <Divider my="sm" />
          <Group gap="xs">
            <IconAlertCircle size={16} />
            <Text size="sm" c="dimmed">{hours.notes}</Text>
          </Group>
        </>
      )}

      {hours.holidays && Object.keys(hours.holidays).length > 0 && (
        <>
          <Divider my="sm" label="Holiday Hours" />
          <Stack gap="xs">
            {Object.entries(hours.holidays).map(([id, holiday]) => (
              <Group key={id} justify="space-between">
                <Text size="sm">{holiday.name}</Text>
                <Badge size="sm" variant="light">
                  {holidayModeLabel(holiday)}
                </Badge>
              </Group>
            ))}
          </Stack>
        </>
      )}

      {hours.seasonal && Object.keys(hours.seasonal).length > 0 && (
        <>
          <Divider my="sm" />
          <Text size="xs" c="dimmed">Seasonal hours are in effect</Text>
        </>
      )}
    </Card>
  );
}