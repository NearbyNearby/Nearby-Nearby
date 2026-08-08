import React from 'react';
import {
  Stack,
  Group,
  Text,
  TextInput,
  Textarea,
  Card,
  Button,
  Divider,
  Box,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';

import CoordinateInput from '../components/CoordinateInput';
import { ImageUploadField } from '../../ImageUpload/ImageUploadField';

/**
 * Issue #63 — Trailhead + Access Points (consolidated).
 *
 * Design deviation: the AUTHORITATIVE comment recommends a dedicated
 * `primary_trailhead_name` String column on the trails table. This
 * implementation stores the name as the `.name` key of the existing
 * `trail.trailhead_location` JSONB instead, which keeps the name + coords
 * + photos co-located and avoids an additional DDL migration. Functionally
 * equivalent — the field round-trips through autosave and the public app
 * via the JSONB. If a column becomes necessary (indexing/queries), a
 * follow-up backfill from the JSONB key is straightforward.
 *
 * Renders three blocks in this order:
 *   1. Trailhead (single)        — name (stored inside trail.trailhead_location
 *                                  JSONB), CoordinateInput bound to the flat
 *                                  trail.trailhead_latitude / _longitude
 *                                  columns and the POI-level
 *                                  what3words_address, photo upload
 *                                  (image_type='trail_head'), and the existing
 *                                  trail.trailhead_access_details textarea.
 *   2. Access Points (repeatable) — Each row is { name, description, latitude,
 *                                  longitude, what3words_address, notes }
 *                                  stored in trail.access_points JSONB. Each
 *                                  row also gets its own photo upload scoped
 *                                  by image_context='access_point_${idx}' so
 *                                  the back-end Images table can attribute
 *                                  uploads to a specific access-point row.
 *                                  Issue #146: `description` duplicated the
 *                                  `notes` field, so its form input was
 *                                  removed (notes stays). `description` is
 *                                  left in the JSONB shape/schema untouched
 *                                  (expand/contract); it's just no longer
 *                                  editable from this form.
 */
export default function TrailheadAccessPointsSection({ form, poiId }) {
  // ---- Trailhead (single) ----
  const trail = form.values.trail || {};
  const trailheadLocation = trail.trailhead_location || {};
  const trailheadName = trailheadLocation.name || '';

  const trailheadValue = {
    lat: trail.trailhead_latitude ?? null,
    lng: trail.trailhead_longitude ?? null,
    w3w: form.values.what3words_address || '',
  };

  const setTrailheadCoord = (next) => {
    form.setFieldValue('trail.trailhead_latitude', next.lat ?? null);
    form.setFieldValue('trail.trailhead_longitude', next.lng ?? null);
    form.setFieldValue('what3words_address', next.w3w || '');
    // Keep the JSONB mirror in sync so the name + coords travel together.
    form.setFieldValue('trail.trailhead_location', {
      ...trailheadLocation,
      lat: next.lat ?? null,
      lng: next.lng ?? null,
    });
  };

  const setTrailheadName = (name) => {
    form.setFieldValue('trail.trailhead_location', {
      ...trailheadLocation,
      name,
      lat: trail.trailhead_latitude ?? trailheadLocation.lat ?? null,
      lng: trail.trailhead_longitude ?? trailheadLocation.lng ?? null,
    });
  };

  // ---- Access Points (repeatable) ----
  const accessPoints = Array.isArray(form.values.access_points)
    ? form.values.access_points
    : [];

  const addAccessPoint = () => {
    form.insertListItem('access_points', {
      name: '',
      description: '',
      latitude: null,
      longitude: null,
      what3words_address: '',
      notes: '',
    });
  };

  const removeAccessPoint = (idx) => {
    form.removeListItem('access_points', idx);
  };

  const setAccessPointCoord = (idx, next) => {
    form.setFieldValue(`access_points.${idx}.latitude`, next.lat ?? null);
    form.setFieldValue(`access_points.${idx}.longitude`, next.lng ?? null);
    form.setFieldValue(`access_points.${idx}.what3words_address`, next.w3w || '');
  };

  return (
    <Stack>
      {/* ============= 1. Trailhead ============= */}
      <Text fw={600} size="sm">Trailhead</Text>
      <TextInput
        label="Trailhead Name"
        placeholder="e.g. Main Trailhead, North Entrance"
        value={trailheadName}
        onChange={(e) => setTrailheadName(e.currentTarget.value)}
      />

      <CoordinateInput
        label="Trailhead Coordinates"
        value={trailheadValue}
        onChange={setTrailheadCoord}
      />

      {poiId ? (
        <ImageUploadField
          poiId={poiId}
          imageType="trail_head"
          label="Trailhead Photos"
          description="Photos of the trail starting point (up to 10)"
        />
      ) : (
        <Text size="sm" c="dimmed">Save POI first to enable trailhead photo upload</Text>
      )}

      <Textarea
        label="Trailhead Access Details"
        placeholder="Parking, signage, kiosk, ranger station, etc."
        autosize
        minRows={2}
        value={trail.trailhead_access_details || ''}
        onChange={(e) => form.setFieldValue('trail.trailhead_access_details', e.currentTarget.value)}
      />

      <Divider my="sm" />

      {/* ============= 2. Access Points (repeatable) ============= */}
      <Text fw={600} size="sm">Access Points</Text>

      {accessPoints.length === 0 ? (
        <Box ta="center" py="sm">
          <Text c="dimmed" size="sm">
            No access points yet — click Add Access Point
          </Text>
        </Box>
      ) : (
        accessPoints.map((ap, idx) => (
          <Card key={idx} withBorder mb="sm" radius="md">
            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <Text fw={500} size="sm">Access Point #{idx + 1}</Text>
                <Button
                  size="xs"
                  color="red"
                  variant="light"
                  leftSection={<IconTrash size={14} />}
                  onClick={() => removeAccessPoint(idx)}
                >
                  Remove this access point
                </Button>
              </Group>

              <TextInput
                label="Name"
                placeholder="e.g. South Parking Lot Access"
                required
                value={ap.name || ''}
                onChange={(e) =>
                  form.setFieldValue(`access_points.${idx}.name`, e.currentTarget.value)
                }
              />

              <CoordinateInput
                label="Access Point Coordinates"
                value={{
                  lat: ap.latitude ?? null,
                  lng: ap.longitude ?? null,
                  w3w: ap.what3words_address || '',
                }}
                onChange={(next) => setAccessPointCoord(idx, next)}
              />

              {/*
                * Each access-point row scopes its photos via
                * image_context=`access_point_${idx}` so the Images API can
                * attribute uploads back to the correct row in the
                * trail.access_points JSONB array.
                */}
              {poiId ? (
                <ImageUploadField
                  poiId={poiId}
                  imageType="access_point"
                  context={`access_point_${idx}`}
                  label={`Access Point #${idx + 1} Photos`}
                  description="Photos of this access point (up to 5)"
                />
              ) : (
                <Text size="sm" c="dimmed">
                  Save POI first to enable photos for this access point
                </Text>
              )}

              <Textarea
                label="Notes"
                placeholder="Anything else worth knowing about this access point."
                autosize
                minRows={2}
                value={ap.notes || ''}
                onChange={(e) =>
                  form.setFieldValue(`access_points.${idx}.notes`, e.currentTarget.value)
                }
              />
            </Stack>
          </Card>
        ))
      )}

      <Group justify="center">
        <Button
          variant="outline"
          leftSection={<IconPlus size={14} />}
          onClick={addAccessPoint}
        >
          Add Access Point
        </Button>
      </Group>
    </Stack>
  );
}
