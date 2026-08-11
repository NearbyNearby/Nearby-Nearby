import React, { useEffect, useState } from 'react';
import { Alert, Button, Divider, Group, Modal, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import ParkingLotFields from './ParkingLotFields';
import { ParkingLotPhotosUpload } from '../POIForm/ImageIntegration';
import { emptyLotValues, lotToFormValues, saveLot } from './lotApi';

/**
 * Create or edit one reusable parking lot in a modal.
 *
 * Creating with no `ownerPoiId` makes a STANDALONE (shared, admin-curated) lot;
 * the backend rejects that for anyone but an admin, so callers gate the entry
 * point. `onSaved(lot)` fires with the saved lot so the POI form can link it
 * immediately.
 */
export default function ParkingLotModal({
  opened,
  onClose,
  lot = null,
  ownerPoiId = null,
  onSaved,
}) {
  const [saving, setSaving] = useState(false);
  const form = useForm({
    initialValues: emptyLotValues(),
    validate: {
      name: (value) => (value && value.trim() ? null : 'Lot name is required'),
    },
  });

  useEffect(() => {
    if (!opened) return;
    form.setValues(lot ? lotToFormValues(lot) : emptyLotValues());
    form.resetDirty();
    // form identity is stable across renders; re-seed only when the target changes
  }, [opened, lot?.id]);

  const handleSave = async () => {
    const validation = form.validate();
    if (validation.hasErrors) return;
    setSaving(true);
    try {
      const saved = await saveLot(form.values, { lotId: lot?.id || null, ownerPoiId });
      notifications.show({
        title: lot ? 'Lot updated' : 'Lot created',
        message: saved.name,
        color: 'green',
      });
      if (onSaved) onSaved(saved);
      onClose();
    } catch (error) {
      notifications.show({
        title: 'Save failed',
        message: error.message || 'Failed to save parking lot',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={lot ? `Edit ${lot.name}` : 'Create Parking Lot'}
      size="lg"
      centered
    >
      <Stack>
        {!lot && !ownerPoiId && (
          <Alert color="blue" variant="light">
            This creates a shared standalone lot that any POI can link. Editing it
            later changes it everywhere it appears.
          </Alert>
        )}
        {lot && lot.linked_poi_count > 1 && (
          <Alert color="yellow" variant="light">
            {lot.linked_poi_count} POIs link this lot. Your changes apply to all of them.
          </Alert>
        )}

        <ParkingLotFields form={form} />

        {lot?.id && (
          <>
            <Divider label="Photos" />
            <ParkingLotPhotosUpload lotId={lot.id} lotName={lot.name} />
          </>
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>
            {lot ? 'Save Changes' : 'Create and Link'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
