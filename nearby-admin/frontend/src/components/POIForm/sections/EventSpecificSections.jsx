import React, { useState } from 'react';
import {
  Stack, SimpleGrid, Switch, Divider, Text, Checkbox, Button,
  TextInput, NumberInput, Card, Select, Alert, Badge, Group, Textarea, FileInput
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import RichTextEditor from '../../RichTextEditor';
import { getCheckboxGroupProps } from '../constants/helpers';
import {
  VENDOR_TYPES, COAT_CHECK_OPTIONS, EVENT_STATUS_OPTIONS, EVENT_COST_TYPES,
  SPONSOR_TIERS,
} from '../../../utils/constants';
import {
  DownloadableMapsUpload,
  shouldUseImageUpload
} from '../ImageIntegration';
import { VenueSelector } from '../components/VenueSelector';
import VenueInheritanceControls from './VenueInheritanceControls';
import useEventStatuses from '../../../hooks/useEventStatuses';
import RescheduleModal from '../components/RescheduleModal';
import POISearchSelect from '../../common/POISearchSelect';
import { ImageUploadField } from '../../ImageUpload/ImageUploadField';

// Short, collision-resistant id used to give each sponsor a STABLE key so its
// uploaded logo (scoped by image_context=`sponsor_${id}`) is not reassigned
// when sponsors are reordered or removed. Index-based keys cannot be used for
// the image context for exactly that reason.
function makeSponsorId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Flat vendor type data for the per-row Select (no group headers needed here)
const VENDOR_TYPE_SELECT_DATA = VENDOR_TYPES.map(({ value, label }) => ({ value, label }));

export const EventVendorsSection = React.memo(function EventVendorsSection({ form, id }) {
  const vendorPoiLinks = form.values.event?.vendor_poi_links || [];

  // Stable Date reference so the DateTimePicker dropdown doesn't close on every
  // interaction (see the start/end pickers in EventLayout for the full rationale).
  const deadlineValue = React.useMemo(() => {
    const v = form.values.event?.vendor_application_deadline;
    return v instanceof Date ? v : v ? new Date(v) : null;
  }, [form.values.event?.vendor_application_deadline]);

  function addVendorPoiLink() {
    form.setFieldValue('event.vendor_poi_links', [
      ...vendorPoiLinks,
      { poi_id: null, vendor_type: '' },
    ]);
  }

  function removeVendorPoiLink(index) {
    form.setFieldValue(
      'event.vendor_poi_links',
      vendorPoiLinks.filter((_, i) => i !== index),
    );
  }

  function handleVendorPoiSelect(index, poi) {
    const updated = [...vendorPoiLinks];
    updated[index] = { ...updated[index], poi_id: poi.id };
    form.setFieldValue('event.vendor_poi_links', updated);
  }

  function setVendorType(index, value) {
    const updated = [...vendorPoiLinks];
    updated[index] = { ...updated[index], vendor_type: value };
    form.setFieldValue('event.vendor_poi_links', updated);
  }

  return (
    <Stack>
      <Switch
        label="Has Vendors"
        {...form.getInputProps('event.has_vendors', { type: 'checkbox' })}
      />
      {form.values.event?.has_vendors && (
        <>
          {/* Vendor POI Links — each linked vendor carries its own vendor-type
              dropdown, so the standalone vendor-type checkbox grid was removed. */}
          <Divider my="md" label="Linked Vendor POIs" />
          <Text size="sm" c="dimmed" mb="xs">
            Link specific vendor businesses from the directory to this event.
          </Text>
          {vendorPoiLinks.map((link, index) => (
            <Card key={index} withBorder p="sm" mb="xs">
              <Stack gap="xs">
                <POISearchSelect
                  placeholder="Search for a vendor business..."
                  filterTypes={['BUSINESS']}
                  onSelect={(poi) => handleVendorPoiSelect(index, poi)}
                />
                <Select
                  label="Vendor Type"
                  placeholder="Select vendor type"
                  data={VENDOR_TYPE_SELECT_DATA}
                  value={link.vendor_type || ''}
                  onChange={(val) => setVendorType(index, val)}
                  clearable
                />
                <Button
                  color="red"
                  variant="light"
                  size="xs"
                  leftSection={<IconTrash size={14} />}
                  onClick={() => removeVendorPoiLink(index)}
                >
                  Remove
                </Button>
              </Stack>
            </Card>
          ))}
          <Button
            variant="light"
            leftSection={<IconPlus size={16} />}
            onClick={addVendorPoiLink}
          >
            Link Vendor POI
          </Button>

          <DateTimePicker
            label="Vendor Application Deadline"
            placeholder="Select deadline"
            timePickerProps={{ format: '12h', withDropdown: true }}
            value={deadlineValue}
            onChange={(val) => form.setFieldValue('event.vendor_application_deadline', val)}
            error={form.errors['event.vendor_application_deadline']}
          />

          <RichTextEditor
            label="Vendor Application Information"
            placeholder="How to apply to be a vendor"
            value={form.values.event?.vendor_application_info || ''}
            onChange={(html) => form.setFieldValue('event.vendor_application_info', html)}
            error={form.errors['event.vendor_application_info']}
            minRows={3}
          />

          <TextInput
            label="Vendor Fee"
            placeholder="Cost to be a vendor"
            {...form.getInputProps('event.vendor_fee')}
          />

          <RichTextEditor
            label="Vendor Requirements"
            placeholder="Requirements for vendors"
            value={form.values.event?.vendor_requirements || ''}
            onChange={(html) => form.setFieldValue('event.vendor_requirements', html)}
            error={form.errors['event.vendor_requirements']}
          />
        </>
      )}
    </Stack>
  );
});

export const EventAmenitiesSection = React.memo(function EventAmenitiesSection({ form }) {
  return (
    <Stack>
      <Checkbox.Group
        label="Coat Check Options"
        {...getCheckboxGroupProps(form, 'event.coat_check_options')}
      >
        <SimpleGrid cols={{ base: 2, sm: 3 }}>
          {COAT_CHECK_OPTIONS.map(option => (
            <Checkbox key={option} value={option} label={option} />
          ))}
        </SimpleGrid>
      </Checkbox.Group>

      <RichTextEditor
        label="Food & Drink Information"
        placeholder="What food and drink options are available?"
        value={form.values.event?.food_and_drink_info || ''}
        onChange={(html) => form.setFieldValue('event.food_and_drink_info', html)}
        error={form.errors['event.food_and_drink_info']}
        minRows={3}
      />
    </Stack>
  );
});

export const EventMapsSection = React.memo(function EventMapsSection({ form, id }) {
  return (
    <Stack>
      <Divider my="md" label="Downloadable Maps" />
      {shouldUseImageUpload(id) ? (
        <DownloadableMapsUpload poiId={id} form={form} />
      ) : (
        <>
          {(form.values.downloadable_maps || []).map((map, index) => (
            <Card key={index} withBorder p="md" mb="sm">
              <Stack>
                <TextInput
                  label="Map Title"
                  placeholder="e.g., Event Layout, Vendor Map"
                  value={map.name || ''}
                  onChange={(e) => {
                    const maps = [...(form.values.downloadable_maps || [])];
                    maps[index] = { ...maps[index], name: e.target.value };
                    form.setFieldValue('downloadable_maps', maps);
                  }}
                />
                <TextInput
                  label="Map URL"
                  placeholder="URL to PDF or image file"
                  value={map.url || ''}
                  onChange={(e) => {
                    const maps = [...(form.values.downloadable_maps || [])];
                    maps[index] = { ...maps[index], url: e.target.value };
                    form.setFieldValue('downloadable_maps', maps);
                  }}
                />
                <Button
                  color="red"
                  variant="light"
                  size="xs"
                  onClick={() => {
                    const maps = [...(form.values.downloadable_maps || [])];
                    maps.splice(index, 1);
                    form.setFieldValue('downloadable_maps', maps);
                  }}
                >
                  Remove Map
                </Button>
              </Stack>
            </Card>
          ))}
          <Button
            variant="light"
            leftSection={<IconPlus size={16} />}
            onClick={() => {
              const maps = [...(form.values.downloadable_maps || [])];
              maps.push({ name: '', url: '' });
              form.setFieldValue('downloadable_maps', maps);
            }}
          >
            Add Another Map
          </Button>
          <Text size="xs" c="dimmed" mt="xs">
            Save the POI first to enable file upload
          </Text>
        </>
      )}

      <Divider my="md" label="Event Food and Drink" />
      <RichTextEditor
        label="Event Food and Drink"
        placeholder="Will there be food, drinks to purchase? If so, what kind of food? Can attendees bring their own?"
        value={form.values.event?.food_and_drink_info || ''}
        onChange={(html) => form.setFieldValue('event.food_and_drink_info', html)}
        error={form.errors['event.food_and_drink_info']}
        minRows={3}
      />
    </Stack>
  );
});

export const EventVenueSection = React.memo(function EventVenueSection({ form, id }) {
  return (
    <Stack>
      <Text size="sm" c="dimmed" mb="md">
        Link this event to a venue and optionally copy the venue's location, parking,
        accessibility, and restroom information to pre-fill the event details.
      </Text>
      <VenueSelector form={form} poiId={id} />
      <VenueInheritanceControls form={form} />
    </Stack>
  );
});

// ---------------------------------------------------------------------------
// Event Status Section — Phase A2 rewrite
// ---------------------------------------------------------------------------

/** Maps each status name to a Mantine color string for the Badge. */
const STATUS_COLORS = {
  'Scheduled': 'green',
  'Canceled': 'red',
  'Postponed': 'yellow',
  'Updated Date and/or Time': 'orange',
  'Rescheduled': 'blue',
  'Moved Online': 'violet',
  'Unofficial Proposed Date': 'gray',
};

/**
 * Human-readable button labels for each target transition status.
 * Keys are the exact `valid_transitions` strings returned by the API.
 */
const TRANSITION_LABELS = {
  'Canceled': 'Cancel',
  'Postponed': 'Postpone',
  'Updated Date and/or Time': 'Update Date / Time',
  'Rescheduled': 'Reschedule',
  'Moved Online': 'Move Online',
  'Unofficial Proposed Date': 'Set Unofficial Date',
  'Scheduled': 'Return to Scheduled',
};

export const EventStatusSection = React.memo(function EventStatusSection({ form }) {
  const { getValidTransitions, getHelperText } = useEventStatuses();
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);

  const eventStatus = form.values.event?.event_status || 'Scheduled';
  const badgeColor = STATUS_COLORS[eventStatus] || 'gray';
  const helperText = getHelperText(eventStatus);
  const validTransitions = getValidTransitions(eventStatus);

  // Derived booleans for conditional field rendering
  const isCanceledOrPostponed = eventStatus === 'Canceled' || eventStatus === 'Postponed';
  const isPostponed = eventStatus === 'Postponed';
  const isUpdatedDateTime = eventStatus === 'Updated Date and/or Time';
  const isMovedOnline = eventStatus === 'Moved Online';
  const isRescheduled = eventStatus === 'Rescheduled';

  function handleTransitionClick(targetStatus) {
    if (targetStatus === 'Rescheduled') {
      setRescheduleModalOpen(true);
      return;
    }
    form.setFieldValue('event.event_status', targetStatus);
  }

  function handleRescheduleConfirm({ new_start_datetime, new_end_datetime }) {
    form.setFieldValue('event.event_status', 'Rescheduled');
    // Store new dates on the form if the fields exist
    if (new_start_datetime) {
      form.setFieldValue('event.rescheduled_start_datetime', new_start_datetime);
    }
    if (new_end_datetime) {
      form.setFieldValue('event.rescheduled_end_datetime', new_end_datetime);
    }
    setRescheduleModalOpen(false);
  }

  return (
    <Stack>
      {/* Current status badge */}
      <Group align="center">
        <Text fw={500} size="sm">Current Status</Text>
        <Badge color={badgeColor} variant="filled" size="lg">
          {eventStatus}
        </Badge>
      </Group>

      {/* Helper text from API */}
      {helperText ? (
        <Text size="sm" c="dimmed">
          {helperText}
        </Text>
      ) : null}

      {/* Action buttons for valid transitions */}
      {validTransitions.length > 0 && (
        <Stack gap="xs">
          <Text size="sm" fw={500}>Change Status</Text>
          <Group gap="xs" wrap="wrap">
            {validTransitions.map((target) => (
              <Button
                key={target}
                size="xs"
                variant="light"
                color={STATUS_COLORS[target] || 'gray'}
                onClick={() => handleTransitionClick(target)}
              >
                {TRANSITION_LABELS[target] || target}
              </Button>
            ))}
          </Group>
        </Stack>
      )}

      {/* Conditional fields for Canceled or Postponed */}
      {isCanceledOrPostponed && (
        <>
          <RichTextEditor
            label="Cancellation / Postponement Message"
            placeholder="Explain why this event was canceled or postponed"
            value={form.values.event?.cancellation_paragraph || ''}
            onChange={(html) => form.setFieldValue('event.cancellation_paragraph', html)}
            error={form.errors['event.cancellation_paragraph']}
            minRows={3}
          />
          <Switch
            label="Show 'Contact Organizer' button"
            description="Display a link for attendees to contact the organizer"
            checked={form.values.event?.contact_organizer_toggle || false}
            onChange={(e) =>
              form.setFieldValue('event.contact_organizer_toggle', e.currentTarget.checked)
            }
          />
        </>
      )}

      {/* Status explanation — shown for Postponed, Updated Date/Time, Moved Online */}
      {(isPostponed || isUpdatedDateTime || isMovedOnline) && (
        <Textarea
          label="Status Explanation"
          placeholder="Brief explanation (max 80 characters)"
          maxLength={80}
          value={form.values.event?.status_explanation || ''}
          onChange={(e) => form.setFieldValue('event.status_explanation', e.currentTarget.value)}
          error={form.errors['event.status_explanation']}
          autosize
          minRows={2}
        />
      )}

      {/* Online event URL — only when Moved Online */}
      {isMovedOnline && (
        <TextInput
          label="Online Event URL"
          placeholder="https://zoom.us/j/..."
          value={form.values.event?.online_event_url || ''}
          onChange={(e) => form.setFieldValue('event.online_event_url', e.currentTarget.value)}
          error={form.errors['event.online_event_url']}
        />
      )}

      {/* New event link reference — shown when Rescheduled */}
      {isRescheduled && form.values.event?.new_event_link && (
        <Alert color="blue" variant="light">
          <Text size="sm">
            This event has been rescheduled. New event ID: {form.values.event.new_event_link}
          </Text>
        </Alert>
      )}

      {/* Reschedule modal */}
      <RescheduleModal
        opened={rescheduleModalOpen}
        onClose={() => setRescheduleModalOpen(false)}
        onConfirm={handleRescheduleConfirm}
      />
    </Stack>
  );
});

// Task 138 / Phase A5: Event Organizer Section — with optional POI linking
export const EventOrganizerSection = React.memo(function EventOrganizerSection({ form }) {
  // Derive initial state from existing poi_id so that edit-mode shows the search select
  const hasExistingPoiId = Boolean(form.values.event?.organizer_poi_id);
  const [linkToPoi, setLinkToPoi] = useState(hasExistingPoiId);

  function handlePoiSelect(poi) {
    form.setFieldValue('event.organizer_poi_id', poi.id);
    form.setFieldValue('event.organizer_name', poi.name);
    // Issue #122: copy the linked POI's contact info over so it doesn't have
    // to be re-typed. POISearchSelect includes these on its onSelect payload.
    form.setFieldValue('event.organizer_email', poi.email || '');
    form.setFieldValue('event.organizer_phone', poi.phone_number || '');
    form.setFieldValue('event.organizer_website', poi.website_url || '');
    form.setFieldValue('event.organizer_social_media', {
      ...(form.values.event?.organizer_social_media || {}),
      instagram: poi.instagram_username || '',
      facebook: poi.facebook_username || '',
    });
  }

  function handleLinkToggle(e) {
    const checked = e.currentTarget.checked;
    setLinkToPoi(checked);
    if (!checked) {
      // Clear the poi_id when unlinking
      form.setFieldValue('event.organizer_poi_id', null);
    }
  }

  return (
    <Stack>
      <Switch
        label="Link to POI"
        description="Link this organizer to an existing business in the directory"
        checked={linkToPoi}
        onChange={handleLinkToggle}
      />

      {linkToPoi && (
        <POISearchSelect
          label="Organizer POI"
          placeholder="Search for organizer business..."
          filterTypes={['BUSINESS']}
          onSelect={handlePoiSelect}
        />
      )}

      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput
          label="Organizer Name"
          placeholder="Organization or person name"
          {...form.getInputProps('event.organizer_name')}
        />
        <TextInput
          label="Organizer Email"
          placeholder="contact@organization.org"
          {...form.getInputProps('event.organizer_email')}
        />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput
          label="Organizer Phone"
          placeholder="919-555-0100"
          {...form.getInputProps('event.organizer_phone')}
        />
        <TextInput
          label="Organizer Website"
          placeholder="https://organization.org"
          {...form.getInputProps('event.organizer_website')}
        />
      </SimpleGrid>

      <Divider my="sm" label="Organizer Social Media" />
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput
          label="Instagram"
          placeholder="@handle"
          value={form.values.event?.organizer_social_media?.instagram || ''}
          onChange={(e) => {
            const current = form.values.event?.organizer_social_media || {};
            form.setFieldValue('event.organizer_social_media', { ...current, instagram: e.target.value });
          }}
        />
        <TextInput
          label="Facebook"
          placeholder="page name or URL"
          value={form.values.event?.organizer_social_media?.facebook || ''}
          onChange={(e) => {
            const current = form.values.event?.organizer_social_media || {};
            form.setFieldValue('event.organizer_social_media', { ...current, facebook: e.target.value });
          }}
        />
      </SimpleGrid>
    </Stack>
  );
});

// Task 139: Event Cost & Ticketing Section
export const EventCostSection = React.memo(function EventCostSection({ form }) {
  const ticketLinks = form.values.event?.ticket_links || [];

  return (
    <Stack>
      <Select
        label="Cost Type"
        placeholder="Select cost type"
        data={EVENT_COST_TYPES}
        value={form.values.event?.cost_type || ''}
        onChange={(val) => form.setFieldValue('event.cost_type', val)}
        clearable
      />

      <TextInput
        label="Cost"
        placeholder="e.g., $10 or $0-$50 or 0 (for free)"
        {...form.getInputProps('cost')}
      />

      <RichTextEditor
        label="Pricing Details"
        placeholder="Additional pricing info (e.g., Kids under 2 are free)"
        value={form.values.pricing_details || ''}
        onChange={(html) => form.setFieldValue('pricing_details', html)}
        error={form.errors.pricing_details}
        minRows={3}
      />

      <Divider my="sm" label="Multiple Ticket Links" />
      {ticketLinks.map((link, index) => (
        <Card key={index} withBorder p="sm" mb="xs">
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput
              label="Ticket Name"
              placeholder="e.g., General Admission, VIP"
              value={link.name || ''}
              onChange={(e) => {
                const updated = [...ticketLinks];
                updated[index] = { ...updated[index], name: e.target.value };
                form.setFieldValue('event.ticket_links', updated);
              }}
            />
            <TextInput
              label="Ticket URL"
              placeholder="https://tickets.example.com"
              value={link.url || ''}
              onChange={(e) => {
                const updated = [...ticketLinks];
                updated[index] = { ...updated[index], url: e.target.value };
                form.setFieldValue('event.ticket_links', updated);
              }}
            />
          </SimpleGrid>
          <Button
            color="red"
            variant="light"
            size="xs"
            mt="xs"
            leftSection={<IconTrash size={14} />}
            onClick={() => {
              const updated = ticketLinks.filter((_, i) => i !== index);
              form.setFieldValue('event.ticket_links', updated);
            }}
          >
            Remove
          </Button>
        </Card>
      ))}
      <Button
        variant="light"
        leftSection={<IconPlus size={16} />}
        onClick={() => {
          form.setFieldValue('event.ticket_links', [...ticketLinks, { name: '', url: '' }]);
        }}
      >
        Add Ticket Link
      </Button>
    </Stack>
  );
});

// Task 140 / Phase A5: Event Sponsors Section — with optional POI linking per sponsor row
//
// Bug #87: the sponsor logo is now a real image upload (stored as an Image row
// with image_type='sponsor_logo') instead of a raw URL box. Each sponsor gets a
// STABLE `_id` so its logo is scoped by image_context=`sponsor_${_id}` and never
// reassigned when rows are reordered or removed. The resulting image URL is
// mirrored back onto `sponsor.logo_url` (and its id onto `sponsor.logo_image_id`)
// so the public app (which renders `sponsor.logo_url`) keeps working unchanged.
export const EventSponsorsSection = React.memo(function EventSponsorsSection({ form, id }) {
  const sponsors = form.values.event?.sponsors || [];

  // Backfill a stable `_id` for any sponsor that lacks one (legacy rows loaded
  // from the DB predate this field). Done once on mount / when the count grows
  // so every row has a stable image_context key. Guarded to avoid a render loop.
  React.useEffect(() => {
    if (sponsors.length && sponsors.some((s) => !s._id)) {
      form.setFieldValue(
        'event.sponsors',
        sponsors.map((s) => (s._id ? s : { ...s, _id: makeSponsorId() })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sponsors.length]);

  // Per-row toggle state: track which rows are in "POI link" mode.
  // We initialise based on whether the sponsor already has a poi_id.
  const [poiLinkModes, setPoiLinkModes] = useState(() =>
    sponsors.map((s) => Boolean(s.poi_id))
  );

  function addSponsor() {
    form.setFieldValue('event.sponsors', [
      ...sponsors,
      { _id: makeSponsorId(), name: '', url: '', logo_url: '', logo_image_id: null, tier: '' },
    ]);
    setPoiLinkModes((prev) => [...prev, false]);
  }

  function removeSponsor(index) {
    form.setFieldValue(
      'event.sponsors',
      sponsors.filter((_, i) => i !== index),
    );
    setPoiLinkModes((prev) => prev.filter((_, i) => i !== index));
  }

  function togglePoiLinkMode(index, checked) {
    setPoiLinkModes((prev) => {
      const next = [...prev];
      next[index] = checked;
      return next;
    });
    if (!checked) {
      // Clear poi_id when switching back to manual
      const updated = [...sponsors];
      updated[index] = { ...updated[index], poi_id: null };
      form.setFieldValue('event.sponsors', updated);
    }
  }

  function handlePoiSelect(index, poi) {
    const updated = [...sponsors];
    updated[index] = { ...updated[index], poi_id: poi.id, name: poi.name };
    form.setFieldValue('event.sponsors', updated);
  }

  function updateSponsorField(index, field, value) {
    const updated = [...sponsors];
    updated[index] = { ...updated[index], [field]: value };
    form.setFieldValue('event.sponsors', updated);
  }

  // Mirror the uploaded logo image (first of the scoped context) onto the
  // sponsor so the public app's `sponsor.logo_url` keeps working. Clears both
  // fields when the logo is deleted. Only writes when the value changes to avoid
  // needless form updates / render churn.
  function handleLogoImagesChange(index, images) {
    const img = Array.isArray(images) && images.length ? images[0] : null;
    const nextUrl = img ? (img.url || img.medium_url || img.thumbnail_url || '') : '';
    const nextImageId = img ? img.id : null;
    const current = sponsors[index] || {};
    if (current.logo_url === nextUrl && current.logo_image_id === nextImageId) {
      return;
    }
    const updated = [...sponsors];
    updated[index] = { ...current, logo_url: nextUrl, logo_image_id: nextImageId };
    form.setFieldValue('event.sponsors', updated);
  }

  return (
    <Stack>
      <Text size="sm" c="dimmed" mb="md">
        Add sponsors for this event. Link to an existing POI or enter sponsor details manually.
      </Text>
      {sponsors.map((sponsor, index) => {
        const isPoiMode = poiLinkModes[index] ?? Boolean(sponsor.poi_id);
        return (
          <Card key={sponsor._id || index} withBorder p="sm" mb="xs">
            <Stack gap="xs">
              {/* Issue #51: Tier renders first in the sponsor card, required, not clearable */}
              <Select
                label="Tier"
                placeholder="Select sponsor tier"
                data={SPONSOR_TIERS}
                value={sponsor.tier || ''}
                onChange={(val) => updateSponsorField(index, 'tier', val)}
                required
              />

              <Switch
                label="Link to POI"
                description="Link this sponsor to an existing business in the directory"
                checked={isPoiMode}
                onChange={(e) => togglePoiLinkMode(index, e.currentTarget.checked)}
              />

              {isPoiMode ? (
                /* POI-linked mode: search select + tier */
                <POISearchSelect
                  placeholder="Search for sponsor business..."
                  filterTypes={['BUSINESS']}
                  onSelect={(poi) => handlePoiSelect(index, poi)}
                />
              ) : (
                /* Manual mode: name + url + logo image upload */
                <>
                  <TextInput
                    label="Sponsor Name"
                    placeholder="e.g., Acme Corp"
                    value={sponsor.name || ''}
                    onChange={(e) => updateSponsorField(index, 'name', e.target.value)}
                  />
                  <TextInput
                    label="Sponsor URL"
                    placeholder="https://sponsor.com"
                    value={sponsor.url || ''}
                    onChange={(e) => updateSponsorField(index, 'url', e.target.value)}
                  />

                  {/* Bug #87: logo is a real image upload. Scoped per sponsor via
                      the stable _id so reordering/removing never reassigns logos.
                      The upload result is mirrored to sponsor.logo_url for the app. */}
                  {id && sponsor._id ? (
                    <ImageUploadField
                      poiId={id}
                      imageType="sponsor_logo"
                      context={`sponsor_${sponsor._id}`}
                      label="Sponsor Logo"
                      description="Upload the sponsor's logo (1 image, max 5MB)"
                      maxCount={1}
                      onImagesChange={(images) => handleLogoImagesChange(index, images)}
                    />
                  ) : (
                    /* Issue #123: the POI (and therefore the real image-upload
                       endpoint) doesn't exist yet the instant this section
                       renders. Rather than blocking the user, hold the picked
                       file in form state (`_pendingLogoFile`) and upload it
                       transparently right after the draft POI is created;
                       see uploadPendingSponsorLogos() in usePOIHandlers.jsx,
                       called from handleAutoCreate / handleSubmit. */
                    <Stack gap={4}>
                      {sponsor.logo_url ? (
                        <Text size="xs" c="dimmed" truncate>
                          Current logo: {sponsor.logo_url}
                        </Text>
                      ) : null}
                      <FileInput
                        label="Sponsor Logo"
                        description="Pick the logo now. It uploads automatically once the event is saved"
                        placeholder={sponsor._pendingLogoFile ? sponsor._pendingLogoFile.name : 'Choose image...'}
                        accept="image/*"
                        value={sponsor._pendingLogoFile || null}
                        onChange={(file) => updateSponsorField(index, '_pendingLogoFile', file)}
                        clearable
                      />
                    </Stack>
                  )}
                </>
              )}

              <Button
                color="red"
                variant="light"
                size="xs"
                leftSection={<IconTrash size={14} />}
                onClick={() => removeSponsor(index)}
              >
                Remove
              </Button>
            </Stack>
          </Card>
        );
      })}
      <Button
        variant="light"
        leftSection={<IconPlus size={16} />}
        onClick={addSponsor}
      >
        Add Sponsor
      </Button>
    </Stack>
  );
});