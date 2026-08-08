import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { useForm } from '@mantine/form';
import { VenueSelector } from '../VenueSelector';

vi.mock('../../../../utils/api', () => ({
  api: { get: vi.fn(), request: vi.fn() },
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

import { api } from '../../../../utils/api';

const VENUE_LIST = [
  { id: 'venue-1', name: 'Carolina Brewery', poi_type: 'BUSINESS' },
  { id: 'venue-2', name: 'Bynum Front Porch', poi_type: 'PARK' },
];

const VENUE_DATA = {
  venue_id: 'venue-1',
  venue_name: 'Carolina Brewery',
  venue_type: 'BUSINESS',
  address_full: '120 Lowes Dr, Pittsboro, NC',
  parking_notes: 'Free lot behind building',
  copyable_images: [
    { id: 'img-1', image_type: 'entry' },
    { id: 'img-2', image_type: 'playground' },
  ],
};

beforeAll(() => {
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((url) => {
    if (url.includes('/venues/list')) {
      return Promise.resolve({ ok: true, json: async () => VENUE_LIST });
    }
    return Promise.resolve({ ok: true, json: async () => VENUE_DATA });
  });
  api.request.mockResolvedValue({ ok: true, json: async () => ({ uploaded: [{ id: 'a' }, { id: 'b' }] }) });
});

function Wrapper({ venuePoiId = null, poiId = 'event-1', venueName = undefined }) {
  const form = useForm({
    initialValues: {
      parking_notes: '',
      event: {
        venue_poi_id: venuePoiId,
        venue_name: venueName,
        venue_inheritance: null,
      },
    },
  });
  return (
    <MantineProvider>
      <VenueSelector form={form} poiId={poiId} />
      <pre data-testid="form-values">{JSON.stringify(form.values)}</pre>
    </MantineProvider>
  );
}

const formValues = () => JSON.parse(screen.getByTestId('form-values').textContent);

describe('VenueSelector (issue #124)', () => {
  it('THE regression test: shows the venue name when seeded only with venue_poi_id', async () => {
    // Before #124 the picker read local state only, so a saved event reopened
    // blank and the card said "Unknown venue".
    render(<Wrapper venuePoiId="venue-1" />);

    // The address only renders inside the summary card, so it proves the card
    // resolved the venue rather than the dropdown merely listing it.
    await screen.findByText('120 Lowes Dr, Pittsboro, NC');
    expect(screen.getAllByText('Carolina Brewery').length).toBeGreaterThan(0);
    expect(screen.queryByText('Unknown venue')).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/pois/venue-1/venue-data');
  });

  it('hydrates the Select itself from the saved venue link', async () => {
    render(<Wrapper venuePoiId="venue-1" />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Carolina Brewery')).toBeInTheDocument();
    });
  });

  it('shows the venue address in the summary card', async () => {
    render(<Wrapper venuePoiId="venue-1" />);
    expect(await screen.findByText('120 Lowes Dr, Pittsboro, NC')).toBeInTheDocument();
  });

  it('renders no venue card when nothing is linked', async () => {
    render(<Wrapper venuePoiId={null} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByText('120 Lowes Dr, Pittsboro, NC')).not.toBeInTheDocument();
  });

  it('no longer offers the per-field copy checkboxes or a Copy Data button', async () => {
    render(<Wrapper venuePoiId="venue-1" />);
    await screen.findByText('120 Lowes Dr, Pittsboro, NC');

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy data to event/i })).not.toBeInTheDocument();
  });

  it('never offers to copy hours', async () => {
    render(<Wrapper venuePoiId="venue-1" />);
    await screen.findByText('120 Lowes Dr, Pittsboro, NC');
    expect(screen.queryByText(/hours/i, { selector: 'label' })).not.toBeInTheDocument();
  });

  it('writes only venue_poi_id, never the phantom venue_name/venue_type columns', async () => {
    render(<Wrapper venuePoiId={null} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    fireEvent.click(await screen.findByPlaceholderText('Search for a venue...'));
    const option = (await screen.findAllByText('Carolina Brewery'))[0];
    fireEvent.click(option);

    await waitFor(() => {
      expect(formValues().event.venue_poi_id).toBe('venue-1');
    });
    // venue_name / venue_type / venue_hours are NOT columns; writing them made
    // Pydantic drop them silently.
    expect(formValues().event.venue_hours).toBeUndefined();
  });

  it('sets every section at once from the bulk control', async () => {
    render(<Wrapper venuePoiId="venue-1" />);
    await screen.findByText('120 Lowes Dr, Pittsboro, NC');

    fireEvent.click(screen.getByRole('radio', { name: 'Use As Is' }));

    await waitFor(() => {
      expect(Object.keys(formValues().event.venue_inheritance)).toHaveLength(9);
    });
    expect(formValues().event.venue_inheritance.parking).toBe('as_is');
    expect(formValues().event.venue_inheritance.hours).toBeUndefined();
  });

  it('copies venue photos when the event is already saved', async () => {
    render(<Wrapper venuePoiId="venue-1" poiId="event-1" />);
    await screen.findByText('120 Lowes Dr, Pittsboro, NC');

    fireEvent.click(screen.getByRole('button', { name: /copy 2 venue photo/i }));

    await waitFor(() => {
      expect(api.request).toHaveBeenCalledWith(
        expect.stringContaining('/images/copy/venue-1/to/event-1'),
        { method: 'POST' },
      );
    });
    expect(api.request.mock.calls[0][0]).toContain('image_types=playground');
  });

  it('explains the deferral instead of silently no-opping on an unsaved event', async () => {
    // #124 "Photos - nothing copies over": the copy was gated on poiId, which
    // is null until the event is saved, and failed silently.
    render(<Wrapper venuePoiId="venue-1" poiId={null} />);
    await screen.findByText('120 Lowes Dr, Pittsboro, NC');

    expect(screen.getByText(/save this event first/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy 2 venue photo/i })).not.toBeInTheDocument();
  });

  it('clears the venue link and its inheritance config when cleared', async () => {
    render(<Wrapper venuePoiId="venue-1" />);
    await screen.findByText('120 Lowes Dr, Pittsboro, NC');

    fireEvent.click(document.querySelector('.mantine-Select-section button'));

    await waitFor(() => {
      expect(formValues().event.venue_poi_id).toBeNull();
    });
    expect(formValues().event.venue_inheritance).toBeNull();
  });
});
