import React from 'react';
import { Checkbox, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { RepeatableLocationGroup } from './RepeatableLocationGroup';
import CoordinateInput from './CoordinateInput';
import RichTextEditor from '../../RichTextEditor';
import { RestroomPhotosUpload, shouldUseImageUpload } from '../ImageIntegration';
import { PUBLIC_TOILET_OPTIONS, RESTROOM_ADA_CHECKLIST } from '../../../utils/constants';

// Build the grouped ADA checklist structure once (group header -> items),
// preserving insertion order. Same wording the shared AccessibleRestroomChecklist
// uses so backend compute_accessible_restroom substring-matching stays valid.
const RESTROOM_ADA_GROUPS = (() => {
  const groups = [];
  const idx = new Map();
  for (const item of RESTROOM_ADA_CHECKLIST) {
    if (!idx.has(item.group)) {
      idx.set(item.group, groups.length);
      groups.push({ group: item.group, items: [] });
    }
    groups[idx.get(item.group)].items.push(item);
  }
  return groups;
})();

/**
 * Composite wrapper for the `toilet_locations` JSONB array.
 *
 * Row shape (additive — legacy rows still render):
 *   { restroom_name?, lat, lng, description, photos, toilet_types,
 *     accessible_restroom?, accessible_restroom_details? }
 * Used by Park, Trail, and Event layouts.
 */
export const RestroomLocationGroup = React.memo(function RestroomLocationGroup({
  form,
  id,
  label = 'Restroom Locations',
  fieldName = 'toilet_locations',
}) {
  return (
    <RepeatableLocationGroup
      form={form}
      fieldName={fieldName}
      label={label}
      addButtonLabel="Add Another Bathroom Location"
      defaultRow={{
        restroom_name: '',
        // Seed with the POI's own coordinates rather than null. A restroom row
        // with no parseable lat/lng is silently dropped in its entirety (name,
        // description, features included, not just the pin) by the poi_points
        // sync layer — geom is NOT NULL there. Most editors never touch the
        // coordinate fields for an indoor restroom, so defaulting to "here"
        // keeps the row (and everything else they typed) from vanishing.
        lat: typeof form.values?.latitude === 'number' ? form.values.latitude : null,
        lng: typeof form.values?.longitude === 'number' ? form.values.longitude : null,
        w3w: '',
        description: '',
        photos: '',
        toilet_types: [],
        accessible_restroom: false,
        accessible_restroom_details: [],
      }}
      renderRow={(row, index) => {
        const adaOpen = !!row?.accessible_restroom;
        const adaDetails = Array.isArray(row?.accessible_restroom_details)
          ? row.accessible_restroom_details
          : [];
        return (
          <>
            <TextInput
              label="Restroom Name"
              placeholder="e.g., Visitor Center Restroom, Trailhead Restroom"
              {...form.getInputProps(`${fieldName}.${index}.restroom_name`)}
            />
            <CoordinateInput
              label="Restroom Coordinates"
              latLabel="Restroom Latitude"
              lngLabel="Restroom Longitude"
              value={{ lat: row?.lat ?? null, lng: row?.lng ?? null, w3w: row?.w3w ?? '' }}
              onChange={(v) => {
                form.setFieldValue(`${fieldName}.${index}.lat`, v.lat);
                form.setFieldValue(`${fieldName}.${index}.lng`, v.lng);
                form.setFieldValue(`${fieldName}.${index}.w3w`, v.w3w ?? '');
              }}
            />
            <RichTextEditor
              label="Description"
              placeholder="e.g., For paying customers only, Location details, accessibility info"
              value={row.description || ''}
              onChange={(html) => form.setFieldValue(`${fieldName}.${index}.description`, html)}
            />
            <Checkbox.Group
              label="Restroom Features at This Location"
              value={row.toilet_types || []}
              onChange={(value) => form.setFieldValue(`${fieldName}.${index}.toilet_types`, value)}
            >
              <SimpleGrid cols={{ base: 2, sm: 3 }}>
                {/* "Wheelchair + ADA Accessible" is excluded here on purpose: this
                    group has its own standalone ADA checkbox below (with an inline
                    ADA sub-checklist), so surfacing the plain option too would
                    duplicate it. Kept in the shared PUBLIC_TOILET_OPTIONS constant
                    because the legacy PublicAmenitiesSection + backend search still
                    key off that exact string. */}
                {PUBLIC_TOILET_OPTIONS
                  .filter(option => !['Yes', 'No', 'Wheelchair + ADA Accessible'].includes(option))
                  .map(option => (
                    <Checkbox key={option} value={option} label={option} />
                  ))}
              </SimpleGrid>
            </Checkbox.Group>

            <Checkbox
              label="Wheelchair / ADA Accessible Restroom"
              checked={adaOpen}
              onChange={(e) =>
                form.setFieldValue(
                  `${fieldName}.${index}.accessible_restroom`,
                  e.currentTarget.checked,
                )
              }
            />
            {adaOpen && (
              <Stack
                gap="md"
                pl="md"
                style={{ borderLeft: '2px solid var(--mantine-color-gray-3)' }}
              >
                <Text fw={500} size="sm" c="dimmed">Accessible Restroom Details (ADA)</Text>
                <Checkbox.Group
                  value={adaDetails}
                  onChange={(value) =>
                    form.setFieldValue(
                      `${fieldName}.${index}.accessible_restroom_details`,
                      value,
                    )
                  }
                >
                  <Stack gap="md">
                    {RESTROOM_ADA_GROUPS.map(({ group, items }) => (
                      <Stack key={group} gap={4}>
                        <Text size="sm" fw={500} c="dimmed">{group}</Text>
                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                          {items.map((opt) => (
                            <Checkbox key={opt.label} value={opt.label} label={opt.label} />
                          ))}
                        </SimpleGrid>
                      </Stack>
                    ))}
                  </Stack>
                </Checkbox.Group>
              </Stack>
            )}

            {shouldUseImageUpload(id) ? (
              <RestroomPhotosUpload
                poiId={id}
                restroomIndex={index}
                form={{
                  values: { toilets: form.values[fieldName] },
                  setFieldValue: (field, value) => {
                    if (field === 'toilets') {
                      form.setFieldValue(fieldName, value);
                    }
                  },
                }}
              />
            ) : (
              <TextInput
                label="Photos"
                placeholder="URLs to restroom photos (comma-separated)"
                {...form.getInputProps(`${fieldName}.${index}.photos`)}
                description="Image upload will be available shortly..."
              />
            )}
          </>
        );
      }}
    />
  );
});

export default RestroomLocationGroup;
