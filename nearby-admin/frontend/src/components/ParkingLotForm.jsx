import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Badge, Button, Divider, Group, Paper, Stack, Text, Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import ParkingLotFields from './parking-lots/ParkingLotFields';
import { ParkingLotPhotosUpload } from './POIForm/ImageIntegration';
import {
  canEditLot, emptyLotValues, fetchLot, lotToFormValues, saveLot,
} from './parking-lots/lotApi';
import { useAuth } from '../utils/AuthContext';

/** Create or edit one reusable parking lot from the management pages. */
export default function ParkingLotForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role;
  const isEditing = Boolean(id);

  const [lot, setLot] = useState(null);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);

  const form = useForm({
    initialValues: emptyLotValues(),
    validate: {
      name: (value) => (value && value.trim() ? null : 'Lot name is required'),
    },
  });

  useEffect(() => {
    if (!isEditing) return;
    let cancelled = false;
    fetchLot(id)
      .then((data) => {
        if (cancelled) return;
        setLot(data);
        form.setValues(lotToFormValues(data));
      })
      .catch((error) => notifications.show({
        title: 'Error',
        message: error.message || 'Failed to load parking lot.',
        color: 'red',
      }))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const handleSubmit = async () => {
    const validation = form.validate();
    if (validation.hasErrors) return;
    setSaving(true);
    try {
      const saved = await saveLot(form.values, { lotId: id || null });
      notifications.show({
        title: isEditing ? 'Lot updated' : 'Lot created',
        message: saved.name,
        color: 'green',
      });
      navigate('/parking-lots');
    } catch (error) {
      notifications.show({
        title: 'Save failed',
        message: error.message || 'Failed to save parking lot.',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  // A brand-new lot from this page is standalone, which is admin-only; an
  // existing lot follows the same rule the backend enforces.
  const permitted = isEditing ? canEditLot(lot, role) : role === 'admin';

  if (loading) {
    return <Paper><Text c="dimmed">Loading parking lot...</Text></Paper>;
  }

  return (
    <Paper>
      <Group justify="space-between" mb="lg">
        <Group gap="sm">
          <Title order={2} c="deep-purple.7">
            {isEditing ? 'Edit Parking Lot' : 'Create Parking Lot'}
          </Title>
          {lot && (
            <Badge variant="light" color={lot.owner_poi_id ? 'indigo' : 'teal'}>
              {lot.owner_poi_id ? `Owned by ${lot.owner?.name || 'a listing'}` : 'Standalone'}
            </Badge>
          )}
        </Group>
        <Button variant="subtle" onClick={() => navigate('/parking-lots')}>Back to list</Button>
      </Group>

      <Stack>
        {!permitted && (
          <Alert color="red" variant="light">
            Only an admin may {isEditing ? 'edit this' : 'create a standalone'} parking lot.
          </Alert>
        )}
        {isEditing && lot?.linked_poi_count > 0 && (
          <Alert color="yellow" variant="light">
            {lot.linked_poi_count} POI(s) link this lot. Your changes apply to all of them.
          </Alert>
        )}

        <ParkingLotFields form={form} />

        {isEditing && lot?.id && (
          <>
            <Divider label="Photos" />
            <ParkingLotPhotosUpload lotId={lot.id} lotName={lot.name} />
          </>
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={() => navigate('/parking-lots')}>Cancel</Button>
          <Button onClick={handleSubmit} loading={saving} disabled={!permitted}>
            {isEditing ? 'Save Changes' : 'Create Parking Lot'}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
