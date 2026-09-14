import React, { useState } from 'react';
import { Button, Checkbox, SimpleGrid, Stack, Text, TextInput, Textarea, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconShare2 } from '@tabler/icons-react';
import { RepeatableLocationGroup } from './RepeatableLocationGroup';
import CoordinateInput from './CoordinateInput';
import { ParkingPhotosUpload } from '../ImageIntegration';
import { shareLotFromPoi } from '../../parking-lots/lotApi';
import { PARKING_OPTIONS, PARKING_ADA_CHECKLIST } from '../../../utils/constants';

// The first PARKING_OPTIONS entry is the "Accessible Parking" option. Selecting
// it in a row reveals the 6-item accessible-parking sub-checklist.
const ACCESSIBLE_PARKING_OPTION = PARKING_OPTIONS[0];

/**
 * Composite wrapper for the `parking_locations` JSONB array.
 *
 * Row shape (additive — legacy {lat,lng,name} rows still render):
 *   { lat, lng, w3w?, name, parking_types?, accessible_parking_details?, notes? }
 *
 * Used by Park, Trail, and Event layouts.
 */
export const ParkingLocationGroup = React.memo(function ParkingLocationGroup({
  form,
  id,
  isPark = false,
  isTrail = false,
  isEvent = false,
  label = 'Parking Locations',
  fieldName = 'parking_locations',
  enablePhotos = true,
}) {
  const namePlaceholder = isPark
    ? 'e.g., Main Lot, Visitor Center Parking'
    : isTrail
      ? 'e.g., Trailhead Parking, Main Lot'
      : isEvent
        ? 'e.g., Main Lot, Event Parking'
        : 'e.g., Main Lot';

  const [sharingIndex, setSharingIndex] = useState(null);

  // "Share this lot" (#171): copy this row into a shareable lot owned by this
  // POI, so it shows up in Manage Parking Lots and other listings' pickers.
  const handleShare = async (row, index) => {
    setSharingIndex(index);
    try {
      const { alreadyShared } = await shareLotFromPoi(id, row);
      notifications.show(
        alreadyShared
          ? { message: 'Already shared', color: 'blue' }
          : {
              title: 'Shared',
              message:
                'It now appears in Manage Parking Lots and other listings can link to it',
              color: 'green',
            },
      );
    } catch (error) {
      notifications.show({
        title: 'Sharing failed',
        message: error.message || 'Could not share this parking lot',
        color: 'red',
      });
    } finally {
      setSharingIndex(null);
    }
  };

  return (
    <RepeatableLocationGroup
      form={form}
      fieldName={fieldName}
      label={label}
      addButtonLabel="Add Another Parking Location"
      defaultRow={{
        lat: null,
        lng: null,
        w3w: '',
        name: '',
        parking_types: [],
        accessible_parking_details: [],
        notes: '',
      }}
      renderRow={(row, index) => {
        const parkingTypes = Array.isArray(row?.parking_types) ? row.parking_types : [];
        const showAccessibleChecklist = parkingTypes.includes(ACCESSIBLE_PARKING_OPTION);
        const adaDetails = Array.isArray(row?.accessible_parking_details)
          ? row.accessible_parking_details
          : [];
        return (
          <>
            <TextInput
              label="Parking Area Name"
              placeholder={namePlaceholder}
              {...form.getInputProps(`${fieldName}.${index}.name`)}
            />

            <Checkbox.Group
              label="Parking Types"
              value={parkingTypes}
              onChange={(value) =>
                form.setFieldValue(`${fieldName}.${index}.parking_types`, value)
              }
            >
              <SimpleGrid cols={{ base: 2, sm: 3 }}>
                {PARKING_OPTIONS.map((type) => (
                  <Checkbox key={type} value={type} label={type} />
                ))}
              </SimpleGrid>
            </Checkbox.Group>

            {showAccessibleChecklist && (
              <Stack
                gap="xs"
                pl="md"
                style={{ borderLeft: '2px solid var(--mantine-color-gray-3)' }}
              >
                <Text fw={500} size="sm" c="dimmed">
                  Accessible Parking Details (ADA) <Text span c="red">*</Text>
                </Text>
                <Checkbox.Group
                  value={adaDetails}
                  error={form.errors[`${fieldName}.${index}.accessible_parking_details`]}
                  onChange={(value) =>
                    form.setFieldValue(
                      `${fieldName}.${index}.accessible_parking_details`,
                      value,
                    )
                  }
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
              label="Parking Coordinates"
              latLabel="Parking Latitude"
              lngLabel="Parking Longitude"
              value={{ lat: row?.lat ?? null, lng: row?.lng ?? null, w3w: row?.w3w ?? '' }}
              onChange={(v) => {
                form.setFieldValue(`${fieldName}.${index}.lat`, v.lat);
                form.setFieldValue(`${fieldName}.${index}.lng`, v.lng);
                form.setFieldValue(`${fieldName}.${index}.w3w`, v.w3w ?? '');
              }}
            />

            <Textarea
              label="Parking Notes"
              placeholder="Additional details about this parking area"
              autosize
              minRows={2}
              {...form.getInputProps(`${fieldName}.${index}.notes`)}
            />

            {id && (
              <Tooltip
                label={
                  row?.name && row?.lat != null && row?.lng != null
                    ? 'Copy this lot into Manage Parking Lots so other listings can link to it'
                    : 'Add a name and a pin first, then share'
                }
              >
                <span>
                  <Button
                    variant="light"
                    size="xs"
                    leftSection={<IconShare2 size={14} />}
                    disabled={!(row?.name && row?.lat != null && row?.lng != null)}
                    loading={sharingIndex === index}
                    onClick={() => handleShare(row, index)}
                  >
                    Share this lot
                  </Button>
                </span>
              </Tooltip>
            )}

            {enablePhotos && (id ? (
              <ParkingPhotosUpload
                poiId={id}
                parkingIndex={index}
                parkingName={row.name}
                form={form}
              />
            ) : (
              <Text size="sm" c="dimmed">Save POI first to enable parking photo upload</Text>
            ))}
          </>
        );
      }}
    />
  );
});

export default ParkingLocationGroup;
