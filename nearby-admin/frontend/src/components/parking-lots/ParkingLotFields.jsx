import React from 'react';
import {
  Checkbox, Select, SimpleGrid, Stack, Text, TextInput, Textarea,
} from '@mantine/core';
import CoordinateInput from '../POIForm/components/CoordinateInput';
import { PARKING_OPTIONS, PARKING_ADA_CHECKLIST } from '../../utils/constants';
import { EXPECT_TO_PAY_OPTIONS, PUBLICATION_STATUS_OPTIONS } from './lotApi';

// The first PARKING_OPTIONS entry is the "Accessible Parking" option; selecting
// it reveals the ADA sub-checklist, exactly as the POI's own parking rows do.
const ACCESSIBLE_PARKING_OPTION = PARKING_OPTIONS[0];

/**
 * The editable fields of one reusable parking lot.
 *
 * Shared by the POI form's create/edit modal and the /parking-lot management
 * pages so the two never drift. Takes a Mantine form whose values are the
 * `lotApi.emptyLotValues()` shape.
 */
export default function ParkingLotFields({ form }) {
  const parkingTypes = Array.isArray(form.values.parking_types) ? form.values.parking_types : [];
  const adaDetails = Array.isArray(form.values.accessible_parking_details)
    ? form.values.accessible_parking_details
    : [];
  const showAccessibleChecklist = parkingTypes.includes(ACCESSIBLE_PARKING_OPTION);

  return (
    <Stack>
      <TextInput
        label="Lot Name"
        placeholder="e.g., Main St Municipal Deck"
        required
        {...form.getInputProps('name')}
      />

      <Checkbox.Group
        label="Parking Types"
        value={parkingTypes}
        onChange={(value) => form.setFieldValue('parking_types', value)}
      >
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {PARKING_OPTIONS.map((type) => (
            <Checkbox key={type} value={type} label={type} />
          ))}
        </SimpleGrid>
      </Checkbox.Group>

      {showAccessibleChecklist && (
        <Stack gap="xs" pl="md" style={{ borderLeft: '2px solid var(--mantine-color-gray-3)' }}>
          <Text fw={500} size="sm" c="dimmed">Accessible Parking Details (ADA)</Text>
          <Checkbox.Group
            value={adaDetails}
            onChange={(value) => form.setFieldValue('accessible_parking_details', value)}
          >
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              {PARKING_ADA_CHECKLIST.map((opt) => (
                <Checkbox key={opt} value={opt} label={opt} />
              ))}
            </SimpleGrid>
          </Checkbox.Group>
        </Stack>
      )}

      <CoordinateInput
        label="Lot Coordinates"
        latLabel="Latitude"
        lngLabel="Longitude"
        value={{
          lat: form.values.latitude ?? null,
          lng: form.values.longitude ?? null,
          w3w: form.values.what3words ?? '',
        }}
        onChange={(v) => {
          form.setFieldValue('latitude', v.lat);
          form.setFieldValue('longitude', v.lng);
          form.setFieldValue('what3words', v.w3w ?? '');
        }}
      />

      <TextInput
        label="Address Hint"
        placeholder="e.g., Behind the courthouse, entrance on Elm St"
        {...form.getInputProps('address_hint')}
      />

      <Textarea
        label="Notes"
        placeholder="Anything a visitor should know about this lot"
        autosize
        minRows={2}
        {...form.getInputProps('notes')}
      />

      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Select
          label="Expect to Pay"
          data={EXPECT_TO_PAY_OPTIONS}
          {...form.getInputProps('expect_to_pay')}
        />
        <Select
          label="Publication Status"
          description="A draft lot is hidden from the public POI pages that link it"
          data={PUBLICATION_STATUS_OPTIONS}
          {...form.getInputProps('publication_status')}
        />
      </SimpleGrid>
    </Stack>
  );
}
