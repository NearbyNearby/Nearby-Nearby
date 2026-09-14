import React, { lazy, Suspense } from 'react';
import {
  Stack, SimpleGrid, Select, Autocomplete, NumberInput, Button, Divider,
  Checkbox, Radio, Card, Group, ActionIcon, Alert, Text, TextInput, Switch
} from '@mantine/core';
import { IconPlus, IconTrash, IconMapPin, IconInfoCircle } from '@tabler/icons-react';
import RichTextEditor from '../../RichTextEditor';
import { DebouncedTextInput } from '../../DebouncedTextInput';
import { getDebouncedInputProps } from '../constants/helpers';
import { PARKING_OPTIONS } from '../../../utils/constants';
import CoordinateInput from '../components/CoordinateInput';
import AddressAutocomplete from '../components/AddressAutocomplete';
import {
  EntryPhotoUpload,
  ParkingPhotosUpload,
  shouldUseImageUpload
} from '../ImageIntegration';

// Lazy load the map component
const LocationMap = lazy(() => import('../../LocationMap'));
import { LocationMapSkeleton } from '../../LocationMap';

// A city outside this list (e.g. from address autocomplete) is appended so the
// Select can still show it.
const CITY_OPTIONS = [
  'Pittsboro', 'Siler City', 'Chapel Hill', 'Carrboro', 'Goldston',
  'Bear Creek', 'Bennett', 'Bonlee', 'Bynum', 'Gulf', 'Moncure',
  'Sanford', 'Apex', 'Holly Springs', 'Fuquay-Varina'
];

export const LocationSection = React.memo(function LocationSection({
  form,
  isBusiness,
  isPark,
  isTrail,
  isEvent,
  isFreeListing,
  isPaidListing,
  id
}) {
  return (
    <Stack>
      {/* Prominent Alert emphasizing Lat & Long is best */}
      <Alert
        icon={<IconMapPin size={20} />}
        title="Best Practice: Use Latitude & Longitude"
        color="blue"
        variant="light"
      >
        <Stack gap="xs">
          <Text size="sm">
            <strong>For the most accurate location</strong>, we recommend using the map pin below to set your
            Latitude & Longitude coordinates. This ensures precise placement on all maps and location services.
          </Text>
          <Text size="sm" c="dimmed">
            Address fields are optional and can be used for additional context, but the map coordinates
            are the primary location identifier.
          </Text>
        </Stack>
      </Alert>

      <Suspense fallback={<LocationMapSkeleton />}>
        <LocationMap
          latitude={form.values.latitude}
          longitude={form.values.longitude}
          onLocationChange={(lat, lng) => {
            form.setFieldValue('latitude', lat);
            form.setFieldValue('longitude', lng);
          }}
        />
      </Suspense>

      <Divider my="sm" label="Address (Optional)" labelPosition="center" />

      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <AddressAutocomplete
          form={form}
          label="Street Address"
          placeholder="123 Main St"
        />
        <DebouncedTextInput
          label="Address Line 2 (Suite, Unit, etc.)"
          placeholder="Suite 100, Unit B, etc."
          {...getDebouncedInputProps(form, 'address_full')}
        />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, sm: 4 }}>
        <Select
          label="City"
          placeholder="Select or type city"
          data={
            !form.values.address_city || CITY_OPTIONS.includes(form.values.address_city)
              ? CITY_OPTIONS
              : [...CITY_OPTIONS, form.values.address_city]
          }
          searchable
          allowDeselect
          nothingFoundMessage="Type to enter a custom city"
          {...form.getInputProps('address_city')}
        />
        <Autocomplete
          label="County"
          placeholder="Start typing a county..."
          data={[
            'Chatham County', 'Randolph County', 'Lee County', 'Wake County',
            'Orange County', 'Durham County', 'Alamance County', 'Moore County',
            'Harnett County', 'Guilford County'
          ]}
          {...form.getInputProps('address_county')}
        />
        <Select
          label="State"
          placeholder="Select state"
          data={[
            { value: 'NC', label: 'North Carolina' },
            { value: 'SC', label: 'South Carolina' },
            { value: 'VA', label: 'Virginia' },
            { value: 'GA', label: 'Georgia' },
            { value: 'TN', label: 'Tennessee' }
          ]}
          {...form.getInputProps('address_state')}
          searchable
        />
        <DebouncedTextInput
          label="ZIP Code"
          placeholder="12345"
          {...getDebouncedInputProps(form, 'address_zip')}
        />
      </SimpleGrid>

      <Divider my="md" label="Front Door / Arrival Coordinates" />
      <CoordinateInput
        label="Front Door / Arrival Coordinates"
        latLabel="Front Door Latitude"
        lngLabel="Front Door Longitude"
        value={{
          lat: form.values.front_door_latitude,
          lng: form.values.front_door_longitude,
          w3w: form.values.what3words_address,
        }}
        onChange={(v) => {
          form.setFieldValue('front_door_latitude', v.lat);
          form.setFieldValue('front_door_longitude', v.lng);
          form.setFieldValue('what3words_address', v.w3w ?? '');
        }}
      />
      <Button
        size="xs"
        variant="light"
        onClick={() => {
          form.setFieldValue('front_door_latitude', form.values.latitude);
          form.setFieldValue('front_door_longitude', form.values.longitude);
          // Manual coord set from map pin invalidates any prior w3w (task 2 consistency).
          form.setFieldValue('what3words_address', '');
        }}
      >
        Use Map Pin for Lat/Long
      </Button>

      {/* Business Free (#74) + Business Paid (#75) + Park (#76) + Trail (#77) +
          Event (#73): lat_long_most_accurate moves here from Identity (Business
          also moves dont_display_location). Other POI types keep these toggles
          in their original locations and never render them in Address. */}
      {((isBusiness && (isFreeListing || isPaidListing)) || isPark || isTrail || isEvent) && (
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Switch
            label="Lat/Long Most Accurate"
            description="Map coordinates are the most reliable location"
            {...form.getInputProps('lat_long_most_accurate', { type: 'checkbox' })}
          />
          <Switch
            label="Don't Display Location"
            {...form.getInputProps('dont_display_location', { type: 'checkbox' })}
          />
        </SimpleGrid>
      )}

      {/* Park Entry Information */}
      {isPark && (
        <>
          <Divider my="md" label="Park Entry Information" />
          <RichTextEditor
            label="Park Entry Notes"
            placeholder="Describe how to enter the park, special instructions, etc."
            value={form.values.park_entry_notes || ''}
            onChange={(html) => form.setFieldValue('park_entry_notes', html)}
            error={form.errors.park_entry_notes}
            minRows={3}
          />
          {shouldUseImageUpload(id) ? (
            <EntryPhotoUpload poiId={id} poiType="Park" form={form} />
          ) : (
            <Text size="sm" c="dimmed">Save POI first to enable park entry photo upload</Text>
          )}
        </>
      )}

      {/* Trail Entry Information */}
      {isTrail && (
        <>
          <Divider my="md" label="Trail Entry Information" />
          {shouldUseImageUpload(id) ? (
            <EntryPhotoUpload poiId={id} poiType="Trail" form={form} />
          ) : (
            <Text size="sm" c="dimmed">Save POI first to enable trail entry photo upload</Text>
          )}
        </>
      )}

      {/* Business Entry Information - PAID Business only.
          #75: Business Paid drops the in-Address Business Entry block (its
          contents are duplicated by Hours / the dedicated entry flow), so this
          renders only for non-Free, non-Paid business variants. */}
      {isBusiness && !isFreeListing && !isPaidListing && (
        <>
          <Divider my="md" label="Business Entry Information" />
          <RichTextEditor
            label="Business Entry Notes"
            placeholder="Describe how to enter your business, special instructions, etc."
            value={form.values.business_entry_notes || ''}
            onChange={(html) => form.setFieldValue('business_entry_notes', html)}
            error={form.errors.business_entry_notes}
            minRows={3}
          />
          {shouldUseImageUpload(id) ? (
            <EntryPhotoUpload poiId={id} poiType="Business" form={form} />
          ) : (
            <Text size="sm" c="dimmed">Save POI first to enable business entry photo upload</Text>
          )}
        </>
      )}

      {/* Event Entry Information.
          #73 Event reorg: the "Venue Settings" (event.venue_settings JSONB) array
          moved OUT of Address into the Event Details accordion (Acc 3), rendered
          directly in EventLayout. Address keeps only the Event Entry Notes +
          Photos for Event. */}
      {isEvent && (
        <>
          <Divider my="md" label="Event Entry Information" />
          <RichTextEditor
            label="Event Entry Notes"
            placeholder="Describe how to enter the event, special instructions, etc."
            value={form.values.event?.event_entry_notes || ''}
            onChange={(html) => form.setFieldValue('event.event_entry_notes', html)}
            error={form.errors['event.event_entry_notes']}
            minRows={3}
          />
          {shouldUseImageUpload(id) ? (
            <EntryPhotoUpload poiId={id} poiType="Event" form={form} />
          ) : (
            <Text size="sm" c="dimmed">Save POI first to enable event entry photo upload</Text>
          )}
        </>
      )}

      {/* Business Free (#74) + Business Paid (#75) + Park (#76) + Trail (#77) +
          Event (#73): the in-Address parking block is removed entirely. For
          Free, parking_types moves to the dedicated Parking accordion (single
          checkbox group). For Paid, Park, Trail, and Event, the whole block
          moves to the dedicated Parking accordion as repeatable
          ParkingLocationGroup groupings (parking_locations JSONB). Every other
          POI type renders this legacy block unchanged. */}
      {!((isBusiness && (isFreeListing || isPaidListing)) || isPark || isTrail || isEvent) && (
        <>
          <Divider my="md" label="Parking Information" />

          <Checkbox.Group
            label="Parking Types Available"
            value={form.values.parking_types || []}
            onChange={(value) => form.setFieldValue('parking_types', value)}
          >
            <SimpleGrid cols={{ base: 2, sm: 3 }}>
              {PARKING_OPTIONS.map(type => (
                <Checkbox key={type} value={type} label={type} />
              ))}
            </SimpleGrid>
          </Checkbox.Group>

          <RichTextEditor
            label="Parking Notes"
            placeholder="Additional parking information"
            value={form.values.parking_notes || ''}
            onChange={(html) => form.setFieldValue('parking_notes', html)}
            error={form.errors.parking_notes}
          />

          {/* public_transit_info removed — renamed _deprecated_public_transit_info (Migration A #33) */}

          <Radio.Group
            label="Expect to Pay for Parking?"
            {...form.getInputProps('expect_to_pay_parking')}
          >
            <Stack mt="xs">
              <Radio value="yes" label="Yes" />
              <Radio value="no" label="No" />
              <Radio value="sometimes" label="Sometimes" />
            </Stack>
          </Radio.Group>

          {/* Primary Parking Location - lat/long and photos for main parking area */}
          <Divider my="md" label="Primary Parking Location" />
          <Text size="sm" c="dimmed" mb="sm">
            Set the coordinates and photos for the main parking area. Use "Add Another Parking Location" below for additional lots.
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <NumberInput
              label="Primary Parking Latitude"
              placeholder="35.7128"
              precision={6}
              value={form.values.primary_parking_lat || ''}
              onChange={(value) => form.setFieldValue('primary_parking_lat', value)}
            />
            <NumberInput
              label="Primary Parking Longitude"
              placeholder="-79.0064"
              precision={6}
              value={form.values.primary_parking_lng || ''}
              onChange={(value) => form.setFieldValue('primary_parking_lng', value)}
            />
          </SimpleGrid>
          <TextInput
            label="Primary Parking Area Name"
            placeholder="e.g., Main Lot, Front Parking"
            value={form.values.primary_parking_name || ''}
            onChange={(e) => form.setFieldValue('primary_parking_name', e.target.value)}
          />
          {shouldUseImageUpload(id) ? (
            <ParkingPhotosUpload poiId={id} parkingName={form.values.primary_parking_name || 'Primary'} form={form} />
          ) : (
            <Text size="sm" c="dimmed">Save POI first to enable parking photo upload</Text>
          )}
        </>
      )}

      {/* Parking Locations. Park (#76), Trail (#77), and Event (#73) all move
          this repeatable parking grouping OUT of Address into the dedicated
          Parking accordion as the richer ParkingLocationGroup, so it is now
          suppressed for every type. Guard kept explicit for safety. */}
      {false && (
        <>
          <Divider my="md" label="Parking Locations" />
          {(form.values.parking_locations || []).map((parking, index) => (
            <Card key={index} withBorder p="md" mb="sm">
              <Stack>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <NumberInput
                    label="Parking Latitude"
                    placeholder="35.7128"
                    precision={6}
                    value={parking.lat || ''}
                    onChange={(value) => {
                      const locations = [...(form.values.parking_locations || [])];
                      locations[index] = { ...locations[index], lat: value };
                      form.setFieldValue('parking_locations', locations);
                    }}
                  />
                  <NumberInput
                    label="Parking Longitude"
                    placeholder="-79.0064"
                    precision={6}
                    value={parking.lng || ''}
                    onChange={(value) => {
                      const locations = [...(form.values.parking_locations || [])];
                      locations[index] = { ...locations[index], lng: value };
                      form.setFieldValue('parking_locations', locations);
                    }}
                  />
                </SimpleGrid>
                <TextInput
                  label="Parking Area Name"
                  placeholder={isPark ? "e.g., Main Lot, Visitor Center Parking" : isTrail ? "e.g., Trailhead Parking, Main Lot" : "e.g., Main Lot, Event Parking"}
                  value={parking.name || ''}
                  onChange={(e) => {
                    const locations = [...(form.values.parking_locations || [])];
                    locations[index] = { ...locations[index], name: e.target.value };
                    form.setFieldValue('parking_locations', locations);
                  }}
                />
                {shouldUseImageUpload(id) ? (
                  <ParkingPhotosUpload poiId={id} parkingIndex={index} parkingName={parking.name} form={form} />
                ) : (
                  <Text size="sm" c="dimmed">Save POI first to enable parking photo upload</Text>
                )}
                <Button
                  color="red"
                  variant="light"
                  size="xs"
                  onClick={() => {
                    const locations = [...(form.values.parking_locations || [])];
                    locations.splice(index, 1);
                    form.setFieldValue('parking_locations', locations);
                  }}
                >
                  Remove Parking Location
                </Button>
              </Stack>
            </Card>
          ))}
          <Button
            variant="light"
            leftSection={<IconPlus size={16} />}
            onClick={() => {
              const locations = [...(form.values.parking_locations || [])];
              locations.push({ lat: null, lng: null, name: '' });
              form.setFieldValue('parking_locations', locations);
            }}
          >
            Add Another Parking Location
          </Button>
        </>
      )}
    </Stack>
  );
});