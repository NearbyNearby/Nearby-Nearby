import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionIcon, Badge, Button, Card, Group, Image, Loader, Select, SimpleGrid,
  Stack, Text, TextInput, Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCopy, IconGripVertical, IconPencil, IconPlus, IconTrash,
} from '@tabler/icons-react';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import ParkingLotModal from '../../parking-lots/ParkingLotModal';
import {
  canEditLot, fetchLot, lotEditDeniedReason, searchLots,
} from '../../parking-lots/lotApi';
import { useAuth } from '../../../utils/AuthContext';

const FIELD = 'parking_lot_links';

/** Renumber sort_order to match array position. The backend trusts what we send. */
export const withSortOrder = (links) =>
  links.map((link, index) => ({ ...link, sort_order: index }));

/** Pure move used by the drag handler; exported so the reorder is unit-testable. */
export const applyReorder = (links, fromIndex, toIndex) => {
  const next = Array.from(links);
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return withSortOrder(next);
};

const stripHtml = (value) => (value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const formatCoords = (lot) =>
  lot?.latitude != null && lot?.longitude != null
    ? `${Number(lot.latitude).toFixed(6)}, ${Number(lot.longitude).toFixed(6)}`
    : null;

/**
 * "Additional / Shared Parking" (#90 / #161).
 *
 * Links this POI to reusable parking lots that live in their own table. The
 * POI's OWN parking (the repeating ParkingLocationGroup above this one) is
 * untouched: this group only writes `parking_lot_links`, the edge list that
 * rides on the POI payload as [{parking_lot_id, sort_order, label}].
 *
 * A lot is read-only here on purpose. Editing one changes every POI that shows
 * it, so it happens in the lot's own form and, for a shared standalone lot, only
 * as an admin.
 */
export default function ParkingLotLinkGroup({ form }) {
  const { user } = useAuth();
  const role = user?.role;
  const isAdmin = role === 'admin';

  const links = Array.isArray(form.values[FIELD]) ? form.values[FIELD] : [];
  const [lotsById, setLotsById] = useState({});
  const [options, setOptions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLot, setEditingLot] = useState(null);
  const searchTimer = useRef(null);
  // Ids already requested, so a lot that 404s is not re-fetched every render.
  const requestedIds = useRef(new Set());

  const cacheLot = useCallback((lot) => {
    requestedIds.current.add(String(lot.id));
    setLotsById((prev) => ({ ...prev, [String(lot.id)]: lot }));
  }, []);

  // Hydrate the cards: every linked id we do not already hold, fetched once.
  const linkedIdKey = links.map((link) => String(link.parking_lot_id)).join(',');
  useEffect(() => {
    const missing = linkedIdKey
      .split(',')
      .filter((id) => id && !requestedIds.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => requestedIds.current.add(id));
    Promise.all(missing.map((id) => fetchLot(id).catch(() => null))).then((lots) => {
      const found = lots.filter(Boolean);
      if (found.length === 0) return;
      setLotsById((prev) => {
        const next = { ...prev };
        found.forEach((lot) => { next[String(lot.id)] = lot; });
        return next;
      });
    });
  }, [linkedIdKey]);

  const runSearch = useCallback(async (q) => {
    setSearching(true);
    try {
      const results = await searchLots({ q });
      results.forEach(cacheLot);
      setOptions(results);
    } catch (error) {
      notifications.show({
        title: 'Search failed',
        message: error.message || 'Could not search parking lots',
        color: 'red',
      });
    } finally {
      setSearching(false);
    }
  }, [cacheLot]);

  useEffect(() => {
    runSearch('');
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [runSearch]);

  const handleSearchChange = (value) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runSearch(value), 300);
  };

  const setLinks = (next) => form.setFieldValue(FIELD, withSortOrder(next));

  const handleLink = (lotId) => {
    if (!lotId) return;
    if (links.some((link) => String(link.parking_lot_id) === String(lotId))) return;
    setLinks([...links, { parking_lot_id: lotId, sort_order: links.length, label: '' }]);
  };

  const handleUnlink = (lotId) => {
    setLinks(links.filter((link) => String(link.parking_lot_id) !== String(lotId)));
  };

  const handleLabel = (index, value) => {
    const next = links.map((link, i) => (i === index ? { ...link, label: value } : link));
    setLinks(next);
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    setLinks(applyReorder(links, result.source.index, result.destination.index));
  };

  const handleCopy = (text) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      notifications.show({ title: 'Copied', message: text, color: 'green' });
    }
  };

  const linkedIds = new Set(links.map((link) => String(link.parking_lot_id)));
  const selectData = options
    .filter((lot) => !linkedIds.has(String(lot.id)))
    .map((lot) => ({
      value: String(lot.id),
      label: lot.publication_status === 'draft' ? `${lot.name} (draft)` : lot.name,
    }));

  return (
    <Stack mt="lg">
      <div>
        <Text fw={600}>Additional / Shared Parking</Text>
        <Text size="sm" c="dimmed">
          Link parking lots that are shared with neighbors or managed by Nearby Nearby.
          These are shown to visitors after this listing&apos;s own parking.
        </Text>
      </div>

      <Group align="flex-end">
        <Select
          style={{ flex: 1, minWidth: 260 }}
          label="Link an existing parking lot"
          placeholder="Search parking lots..."
          data={selectData}
          value={null}
          onChange={handleLink}
          onSearchChange={handleSearchChange}
          searchable
          clearable
          nothingFoundMessage={searching ? 'Searching...' : 'No parking lots found'}
          leftSection={searching ? <Loader size="xs" /> : null}
        />
        {isAdmin && (
          <Button
            variant="light"
            leftSection={<IconPlus size={16} />}
            onClick={() => { setEditingLot(null); setModalOpen(true); }}
          >
            Create new lot
          </Button>
        )}
      </Group>

      {links.length === 0 ? (
        <Text size="sm" c="dimmed">No shared parking lots linked yet.</Text>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="parking-lot-links">
            {(dropProvided) => (
              <Stack {...dropProvided.droppableProps} ref={dropProvided.innerRef} gap="sm">
                {links.map((link, index) => {
                  const lotId = String(link.parking_lot_id);
                  const lot = lotsById[lotId];
                  const coords = formatCoords(lot);
                  const editable = canEditLot(lot, role);
                  const deniedReason = lotEditDeniedReason(lot, role);
                  return (
                    <Draggable key={lotId} draggableId={lotId} index={index}>
                      {(dragProvided) => (
                        <div ref={dragProvided.innerRef} {...dragProvided.draggableProps}>
                          <Card withBorder padding="sm" radius="md">
                            <Stack gap="xs">
                              <Group justify="space-between" wrap="nowrap" align="flex-start">
                                <Group gap="xs" wrap="nowrap">
                                  <ActionIcon
                                    {...dragProvided.dragHandleProps}
                                    variant="subtle"
                                    color="gray"
                                    aria-label={`Reorder ${lot?.name || 'parking lot'}`}
                                    style={{ cursor: 'grab' }}
                                  >
                                    <IconGripVertical size={16} />
                                  </ActionIcon>
                                  <div>
                                    <Text fw={600}>{lot?.name || 'Loading lot...'}</Text>
                                    <Group gap="xs" mt={2}>
                                      <Badge
                                        size="sm"
                                        variant="light"
                                        color={lot?.owner_poi_id ? 'indigo' : 'teal'}
                                      >
                                        {lot?.owner_poi_id
                                          ? `Owned by ${lot?.owner?.name || 'another listing'}`
                                          : 'Public lot - NN managed'}
                                      </Badge>
                                      {lot?.publication_status === 'draft' && (
                                        <Badge size="sm" color="yellow" variant="light">Draft</Badge>
                                      )}
                                    </Group>
                                  </div>
                                </Group>
                                <Group gap="xs" wrap="nowrap">
                                  <Tooltip label={deniedReason || 'Edit this lot'}>
                                    <span>
                                      <ActionIcon
                                        variant="subtle"
                                        color="gray"
                                        aria-label={`Edit ${lot?.name || 'parking lot'}`}
                                        disabled={!lot || !editable}
                                        onClick={() => { setEditingLot(lot); setModalOpen(true); }}
                                      >
                                        <IconPencil size={16} />
                                      </ActionIcon>
                                    </span>
                                  </Tooltip>
                                  <Tooltip label="Unlink this lot">
                                    <ActionIcon
                                      variant="subtle"
                                      color="red"
                                      aria-label={`Unlink ${lot?.name || 'parking lot'}`}
                                      onClick={() => handleUnlink(lotId)}
                                    >
                                      <IconTrash size={16} />
                                    </ActionIcon>
                                  </Tooltip>
                                </Group>
                              </Group>

                              {coords && (
                                <Group gap="xs">
                                  <Text size="sm" c="dimmed">{coords}</Text>
                                  <ActionIcon
                                    variant="subtle"
                                    color="gray"
                                    size="sm"
                                    aria-label="Copy coordinates"
                                    onClick={() => handleCopy(coords)}
                                  >
                                    <IconCopy size={14} />
                                  </ActionIcon>
                                </Group>
                              )}

                              {(lot?.parking_types || []).length > 0 && (
                                <Group gap={4}>
                                  {lot.parking_types.map((type) => (
                                    <Badge key={type} size="sm" variant="outline" color="gray">
                                      {type}
                                    </Badge>
                                  ))}
                                </Group>
                              )}

                              {lot?.notes && (
                                <Text size="sm" c="dimmed" lineClamp={2}>{stripHtml(lot.notes)}</Text>
                              )}

                              {(lot?.images || []).length > 0 && (
                                <SimpleGrid cols={{ base: 3, sm: 5 }} spacing="xs">
                                  {lot.images.map((img) => (
                                    <Image
                                      key={img.id}
                                      src={img.thumbnail_url || img.url}
                                      h={60}
                                      radius="sm"
                                      alt={img.alt_text || img.caption || 'Parking lot photo'}
                                    />
                                  ))}
                                </SimpleGrid>
                              )}

                              <TextInput
                                size="xs"
                                label="Note for this listing only"
                                placeholder="e.g., Free after 5pm, 3 minute walk"
                                value={link.label || ''}
                                onChange={(e) => handleLabel(index, e.currentTarget.value)}
                              />
                            </Stack>
                          </Card>
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {dropProvided.placeholder}
              </Stack>
            )}
          </Droppable>
        </DragDropContext>
      )}

      <ParkingLotModal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        lot={editingLot}
        ownerPoiId={null}
        onSaved={(lot) => {
          cacheLot(lot);
          if (!editingLot) handleLink(String(lot.id));
        }}
      />
    </Stack>
  );
}
