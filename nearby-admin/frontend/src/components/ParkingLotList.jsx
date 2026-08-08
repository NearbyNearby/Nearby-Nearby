import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ActionIcon, Badge, Button, Group, List, Modal, Paper, Stack, Table, Text,
  TextInput, Title, Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconLink, IconPencil, IconPlus, IconSearch, IconTrash, IconX,
} from '@tabler/icons-react';
import {
  canEditLot, deleteLot, fetchLinkedPois, lotEditDeniedReason, searchLots,
} from './parking-lots/lotApi';
import { useAuth } from '../utils/AuthContext';

const STATUS_COLOR = { published: 'green', draft: 'yellow', archived: 'gray' };

/**
 * Management page for reusable parking lots (#90 / #161).
 *
 * Standalone lots are shared infrastructure, so only an admin may edit or
 * delete them; an editor sees them here because it still needs to find and
 * link them from a POI.
 */
export default function ParkingLotList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role;

  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [conflictCount, setConflictCount] = useState(0);
  const [linkedTarget, setLinkedTarget] = useState(null);
  const [linkedPois, setLinkedPois] = useState([]);

  const loadLots = async () => {
    setLoading(true);
    try {
      setLots(await searchLots({ limit: 200 }));
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to load parking lots.',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLots(); }, []);

  const filtered = useMemo(() => {
    if (!searchTerm) return lots;
    const s = searchTerm.toLowerCase();
    return lots.filter((lot) =>
      lot.name?.toLowerCase().includes(s) ||
      lot.address_hint?.toLowerCase().includes(s) ||
      lot.owner?.name?.toLowerCase().includes(s));
  }, [lots, searchTerm]);

  const openLinked = async (lot) => {
    setLinkedTarget(lot);
    setLinkedPois([]);
    try {
      setLinkedPois(await fetchLinkedPois(lot.id));
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to load linked POIs.',
        color: 'red',
      });
    }
  };

  // The DELETE endpoint 409s while POIs still link the lot; that answer becomes
  // the second confirmation rather than an error.
  const runDelete = async (force) => {
    if (!deleteTarget) return;
    try {
      const result = await deleteLot(deleteTarget.id, { force });
      if (result.conflict) {
        setConflictCount(result.linkedPoiCount);
        return;
      }
      notifications.show({
        title: 'Deleted',
        message: `Deleted "${deleteTarget.name}".`,
        color: 'green',
      });
      setDeleteTarget(null);
      setConflictCount(0);
      loadLots();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to delete parking lot.',
        color: 'red',
      });
    }
  };

  const rows = filtered.map((lot) => {
    const editable = canEditLot(lot, role);
    const coords = lot.latitude != null && lot.longitude != null
      ? `${Number(lot.latitude).toFixed(5)}, ${Number(lot.longitude).toFixed(5)}`
      : '-';
    return (
      <Table.Tr key={lot.id}>
        <Table.Td>{lot.name}</Table.Td>
        <Table.Td>
          {lot.owner_poi_id
            ? <Text size="sm">Owned by {lot.owner?.name || 'unknown listing'}</Text>
            : <Badge size="sm" variant="light" color="teal">Standalone</Badge>}
        </Table.Td>
        <Table.Td><Text size="sm" c="dimmed">{coords}</Text></Table.Td>
        <Table.Td>{lot.linked_poi_count ?? 0}</Table.Td>
        <Table.Td>
          <Badge size="sm" color={STATUS_COLOR[lot.publication_status] || 'gray'} variant="light">
            {lot.publication_status}
          </Badge>
        </Table.Td>
        <Table.Td>
          <Group gap="xs" justify="flex-end">
            <Tooltip label={lotEditDeniedReason(lot, role) || 'Edit lot'}>
              <span>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  aria-label={`Edit ${lot.name}`}
                  disabled={!editable}
                  onClick={() => navigate(`/parking-lot/${lot.id}/edit`)}
                >
                  <IconPencil size={18} />
                </ActionIcon>
              </span>
            </Tooltip>
            <Tooltip label="View linked POIs">
              <ActionIcon
                variant="subtle"
                color="blue"
                aria-label={`View POIs linked to ${lot.name}`}
                onClick={() => openLinked(lot)}
              >
                <IconLink size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={role === 'admin' ? 'Delete lot' : 'Only an admin may delete a parking lot'}>
              <span>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label={`Delete ${lot.name}`}
                  disabled={role !== 'admin'}
                  onClick={() => { setDeleteTarget(lot); setConflictCount(0); }}
                >
                  <IconTrash size={18} />
                </ActionIcon>
              </span>
            </Tooltip>
          </Group>
        </Table.Td>
      </Table.Tr>
    );
  });

  return (
    <Paper>
      <Group justify="space-between" mb="lg">
        <Title order={2} c="deep-purple.7">Manage Parking Lots</Title>
        {role === 'admin' && (
          <Button component={Link} to="/parking-lot/new" leftSection={<IconPlus size={18} />}>
            Create New Parking Lot
          </Button>
        )}
      </Group>

      <Stack gap="md" mb="lg">
        <Group align="flex-end">
          <TextInput
            placeholder="Search parking lots..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e?.currentTarget?.value ?? '')}
            leftSection={<IconSearch size={16} />}
            style={{ flex: 1, minWidth: 300 }}
          />
          {searchTerm && (
            <Button variant="light" color="gray" onClick={() => setSearchTerm('')} leftSection={<IconX size={16} />}>
              Clear Filters
            </Button>
          )}
        </Group>
      </Stack>

      {loading ? (
        <Text c="dimmed" ta="center" py="xl">Loading parking lots...</Text>
      ) : filtered.length > 0 ? (
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead style={{ backgroundColor: 'var(--mantine-color-deep-purple-0)' }}>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Owner</Table.Th>
              <Table.Th>Coordinates</Table.Th>
              <Table.Th>Linked POIs</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{rows}</Table.Tbody>
        </Table>
      ) : (
        <Text c="dimmed" ta="center" py="xl">No parking lots found.</Text>
      )}

      <Modal
        opened={Boolean(linkedTarget)}
        onClose={() => setLinkedTarget(null)}
        title={<Text fw={600}>POIs linking {linkedTarget?.name}</Text>}
        centered
      >
        {linkedPois.length === 0 ? (
          <Text size="sm" c="dimmed">No POIs link this lot.</Text>
        ) : (
          <List spacing="xs">
            {linkedPois.map((poi) => (
              <List.Item key={poi.id}>
                <Group gap="xs">
                  <Text size="sm">{poi.name}</Text>
                  <Badge size="xs" variant="light">{poi.poi_type}</Badge>
                  {poi.publication_status !== 'published' && (
                    <Badge size="xs" color="yellow" variant="light">{poi.publication_status}</Badge>
                  )}
                </Group>
              </List.Item>
            ))}
          </List>
        )}
      </Modal>

      <Modal
        opened={Boolean(deleteTarget)}
        onClose={() => { setDeleteTarget(null); setConflictCount(0); }}
        title={<Text fw={600}>Confirm Deletion</Text>}
        centered
      >
        <Stack>
          {conflictCount > 0 ? (
            <Text>
              <Text component="span" fw={600}>{conflictCount}</Text> POI(s) still link
              {' '}"{deleteTarget?.name}". Deleting it removes the lot from every one of them.
            </Text>
          ) : (
            <Text>Are you sure you want to delete <Text component="span" fw={600}>"{deleteTarget?.name}"</Text>?</Text>
          )}
          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={() => { setDeleteTarget(null); setConflictCount(0); }}>
              Cancel
            </Button>
            <Button
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={() => runDelete(conflictCount > 0)}
            >
              {conflictCount > 0 ? 'Delete Anyway' : 'Delete'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}
