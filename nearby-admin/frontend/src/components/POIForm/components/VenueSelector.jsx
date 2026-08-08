import React, { useState, useEffect, useCallback } from 'react';
import {
  Stack, Select, Button, Card, Text, Group, Badge, Alert,
  Loader, Divider, SegmentedControl,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBuilding, IconTree, IconPhoto, IconCheck } from '@tabler/icons-react';
import { api } from '../../../utils/api';
import {
  VENUE_INHERITANCE_SECTIONS,
  VENUE_INHERITANCE_MODES,
} from '../../../utils/constants';
import { copyVenueSection } from './VenueSectionModeControl';

/**
 * VenueSelector: pick the venue an event happens at (issue #124).
 *
 * The picker only links the venue and summarizes it. What gets inherited is
 * decided per section by VenueSectionModeControl, inside each Event form
 * accordion, so the old all-or-nothing checkbox grid is gone.
 *
 * Two bugs this component used to cause:
 *   - the Select was bound to local state only, so a saved venue came back
 *     blank on reopen. It now hydrates from form.values.event.venue_poi_id.
 *   - it wrote event.venue_name / venue_type / venue_hours, none of which are
 *     columns. Pydantic dropped them, so the card said "Unknown venue".
 */
export function VenueSelector({ form, poiId, types = ['BUSINESS', 'PARK', 'TRAIL'] }) {
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [venueLoading, setVenueLoading] = useState(false);
  const [venueData, setVenueData] = useState(null);
  const [copyingImages, setCopyingImages] = useState(false);
  const [imagesCopied, setImagesCopied] = useState(false);

  const selectedVenueId = form.values.event?.venue_poi_id || null;

  // Fetch available venues on mount
  useEffect(() => {
    const fetchVenues = async () => {
      setLoading(true);
      try {
        const qs = (types || []).map(t => `types=${encodeURIComponent(t)}`).join('&');
        const url = qs ? `/pois/venues/list?${qs}` : '/pois/venues/list';
        const response = await api.get(url);
        if (response.ok) {
          const data = await response.json();
          // Defensive client-side filter in case backend ignores types param
          setVenues((data || []).filter(v => !types || types.includes(v.poi_type)));
        }
      } catch (error) {
        console.error('Failed to fetch venues:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchVenues();
  }, [JSON.stringify(types)]);

  const loadVenueData = useCallback(async (venueId) => {
    setVenueLoading(true);
    try {
      const response = await api.get(`/pois/${venueId}/venue-data`);
      if (response.ok) {
        setVenueData(await response.json());
      } else {
        setVenueData(null);
        notifications.show({
          title: 'Error',
          message: 'Failed to fetch venue data',
          color: 'red',
        });
      }
    } catch (error) {
      console.error('Failed to fetch venue data:', error);
      setVenueData(null);
      notifications.show({
        title: 'Error',
        message: 'Failed to fetch venue data',
        color: 'red',
      });
    } finally {
      setVenueLoading(false);
    }
  }, []);

  // Hydrate from the saved venue link. THIS is the fix for "once saved, the
  // event doesn't remember the venue": the picker used to read local state
  // only, which is empty on every reopen.
  useEffect(() => {
    if (!selectedVenueId) {
      setVenueData(null);
      return;
    }
    if (venueData?.venue_id === selectedVenueId) return;
    loadVenueData(selectedVenueId);
  }, [selectedVenueId, venueData?.venue_id, loadVenueData]);

  const handleVenueSelect = (venueId) => {
    setImagesCopied(false);
    form.setFieldValue('event.venue_poi_id', venueId || null);
    if (!venueId) {
      setVenueData(null);
      form.setFieldValue('event.venue_inheritance', null);
    }
  };

  // Bulk helper: set every section to one mode at once. use_and_add still
  // performs its one-time copy, section by section.
  const handleSetAllSections = (mode) => {
    const next = {};
    VENUE_INHERITANCE_SECTIONS.forEach((section) => { next[section.value] = mode; });
    form.setFieldValue('event.venue_inheritance', next);

    if (mode === 'use_and_add' && venueData) {
      let copied = 0;
      VENUE_INHERITANCE_SECTIONS.forEach((section) => {
        copied += copyVenueSection(form, section.value, venueData);
      });
      notifications.show({
        title: 'Venue Data Copied',
        message: `${copied} field(s) copied from "${venueData.venue_name}".`,
        color: 'green',
      });
    }
  };

  const handleCopyImages = async () => {
    if (!venueData?.copyable_images?.length || !poiId) return;

    setCopyingImages(true);
    try {
      const uniqueTypes = [...new Set(venueData.copyable_images.map(img => img.image_type))];
      const response = await api.request(
        `/images/copy/${venueData.venue_id}/to/${poiId}?${uniqueTypes.map(t => `image_types=${t}`).join('&')}`,
        { method: 'POST' },
      );
      if (!response.ok) throw new Error('copy failed');
      const result = await response.json();
      setImagesCopied(true);
      notifications.show({
        title: 'Photos Copied',
        message: `${result.uploaded?.length || 0} photo(s) copied from the venue`,
        color: 'green',
      });
    } catch (error) {
      console.error('Failed to copy images:', error);
      notifications.show({
        title: 'Error',
        message: 'Photos could not be copied from the venue',
        color: 'red',
      });
    } finally {
      setCopyingImages(false);
    }
  };

  // Format venues for Select component — use Mantine v8 grouped format
  const venueOptions = Object.entries(
    venues.reduce((groups, venue) => {
      const group = venue.poi_type || 'Other';
      if (!groups[group]) groups[group] = [];
      groups[group].push({ value: venue.id, label: venue.name });
      return groups;
    }, {})
  ).map(([group, items]) => ({ group, items }));

  const venueName = venueData?.venue_name || form.values.event?.venue_name;
  const venueType = venueData?.venue_type || form.values.event?.venue_type;

  return (
    <Stack>
      <Alert color="blue" variant="light" mb="md">
        <Text size="sm">
          Link the Business, Park or Trail this event happens at. Nothing is copied
          automatically: open each section below (Address, Parking, Accessibility,
          Restrooms, Playground, Amenities, Pet Policy, Alcohol + Smoking, Contact)
          and choose whether it follows the venue, starts as a one-time copy you can
          edit, or is entered fresh. Hours are always the event&apos;s own.
        </Text>
      </Alert>

      <Select
        label="Select Venue"
        placeholder={loading ? 'Loading venues...' : 'Search for a venue...'}
        data={venueOptions}
        value={selectedVenueId}
        onChange={handleVenueSelect}
        searchable
        clearable
        leftSection={loading ? <Loader size="xs" /> : null}
        disabled={loading}
        renderOption={({ option }) => {
          const isBusiness = option.label?.includes('BUSINESS') || venues.find(v => v.id === option.value)?.poi_type === 'BUSINESS';
          return (
            <Group gap="sm">
              {isBusiness ? (
                <IconBuilding size={16} style={{ color: '#6366f1' }} />
              ) : (
                <IconTree size={16} style={{ color: '#22c55e' }} />
              )}
              <span>{option.label}</span>
            </Group>
          );
        }}
      />

      {venueLoading && (
        <Card withBorder p="md">
          <Group justify="center">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">Loading venue data...</Text>
          </Group>
        </Card>
      )}

      {selectedVenueId && !venueLoading && (
        <Card withBorder p="md">
          <Stack>
            <Group gap="sm">
              {venueType === 'BUSINESS' ? (
                <IconBuilding size={20} style={{ color: '#6366f1' }} />
              ) : (
                <IconTree size={20} style={{ color: '#22c55e' }} />
              )}
              <Text fw={600}>{venueName || 'Loading venue...'}</Text>
              {venueType && (
                <Badge color={venueType === 'BUSINESS' ? 'indigo' : 'green'} size="sm">
                  {venueType}
                </Badge>
              )}
            </Group>

            {venueData?.address_full && (
              <Text size="sm" c="dimmed">{venueData.address_full}</Text>
            )}

            <Divider my="sm" label="Set all sections to" />

            <SegmentedControl
              size="xs"
              data={VENUE_INHERITANCE_MODES}
              value=""
              onChange={handleSetAllSections}
            />
            <Text size="xs" c="dimmed">
              A shortcut. Each section can still be changed on its own below.
            </Text>

            <Divider my="sm" label="Venue photos" />

            {!venueData?.copyable_images?.length ? (
              <Text size="xs" c="dimmed">
                This venue has no entry, parking, restroom or playground photos to copy.
              </Text>
            ) : !poiId ? (
              // The copy endpoint needs a saved target POI. This used to be a
              // silent no-op on an unsaved event (#124: "Photos - nothing copies").
              <Alert color="yellow" variant="light">
                <Text size="sm">
                  {venueData.copyable_images.length} venue photo(s) available. Save this
                  event first, then come back here to copy them.
                </Text>
              </Alert>
            ) : (
              <Group>
                <Button
                  size="xs"
                  variant="light"
                  leftSection={imagesCopied ? <IconCheck size={14} /> : <IconPhoto size={14} />}
                  color={imagesCopied ? 'green' : 'blue'}
                  loading={copyingImages}
                  onClick={handleCopyImages}
                >
                  {imagesCopied ? 'Photos copied' : `Copy ${venueData.copyable_images.length} venue photo(s)`}
                </Button>
                <Text size="xs" c="dimmed">Entry, parking, restroom and playground photos.</Text>
              </Group>
            )}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

export default VenueSelector;
