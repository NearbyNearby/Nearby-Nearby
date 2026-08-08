import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { useForm } from '@mantine/form';
import VenueSectionModeControl from '../VenueSectionModeControl';

vi.mock('../../../../utils/api', () => ({
  api: { get: vi.fn(), request: vi.fn() },
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

import { api } from '../../../../utils/api';

const VENUE_DATA = {
  venue_id: 'venue-1',
  venue_name: 'Carolina Brewery',
  venue_type: 'BUSINESS',
  parking_types: ['Lot'],
  parking_notes: 'Free lot behind building',
  accessible_parking_details: ['Van accessible'],
  address_city: 'Pittsboro',
  entry_notes: 'Blue side door',
  mobility_access: { step_free_entry: true },
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
  api.get.mockResolvedValue({ ok: true, json: async () => VENUE_DATA });
});

function Wrapper({
  section = 'parking',
  venuePoiId = 'venue-1',
  venueInheritance = null,
  venueData = VENUE_DATA,
  children = null,
  initialValues = {},
}) {
  const form = useForm({
    initialValues: {
      parking_notes: '',
      parking_types: [],
      accessible_parking_details: [],
      address_city: '',
      ...initialValues,
      event: {
        venue_poi_id: venuePoiId,
        venue_inheritance: venueInheritance,
        event_entry_notes: '',
      },
    },
  });
  return (
    <MantineProvider>
      <VenueSectionModeControl
        section={section}
        form={form}
        venueData={venueData}
      >
        {children}
      </VenueSectionModeControl>
      <pre data-testid="form-values">{JSON.stringify(form.values)}</pre>
    </MantineProvider>
  );
}

const formValues = () => JSON.parse(screen.getByTestId('form-values').textContent);

describe('VenueSectionModeControl (issue #124)', () => {
  it('renders no control when the event has no venue', () => {
    render(<Wrapper venuePoiId={null} />);
    expect(screen.queryByText('Venue data')).not.toBeInTheDocument();
  });

  it('still renders its children when the event has no venue', () => {
    render(<Wrapper venuePoiId={null} children={<div>section body</div>} />);
    expect(screen.getByText('section body')).toBeInTheDocument();
    expect(screen.queryByText('Venue data')).not.toBeInTheDocument();
  });

  it('renders the three modes when a venue is linked', () => {
    render(<Wrapper />);
    expect(screen.getByText('Venue data')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Use As Is' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Use & Add' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: "Don't Use" })).toBeInTheDocument();
  });

  it('defaults to "Don\'t Use" when the section has no stored mode', () => {
    render(<Wrapper />);
    expect(screen.getByRole('radio', { name: "Don't Use" })).toBeChecked();
  });

  it('writes only its own section into venue_inheritance', () => {
    render(<Wrapper venueInheritance={{ address: 'as_is' }} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Use As Is' }));
    expect(formValues().event.venue_inheritance).toEqual({
      address: 'as_is',
      parking: 'as_is',
    });
  });

  it('copies the section once when switching into "Use & Add"', async () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByRole('radio', { name: 'Use & Add' }));

    await waitFor(() => {
      expect(formValues().parking_notes).toBe('Free lot behind building');
    });
    expect(formValues().parking_types).toEqual(['Lot']);
    expect(formValues().accessible_parking_details).toEqual(['Van accessible']);
  });

  it('does not re-copy on a re-render once already in "Use & Add"', async () => {
    const { rerender } = render(<Wrapper venueInheritance={{ parking: 'use_and_add' }} />);
    rerender(<Wrapper venueInheritance={{ parking: 'use_and_add' }} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /re-copy from venue/i })).toBeInTheDocument();
    });
    expect(formValues().parking_notes).toBe('');
  });

  it('offers an explicit re-copy button in "Use & Add"', async () => {
    render(<Wrapper venueInheritance={{ parking: 'use_and_add' }} />);
    fireEvent.click(screen.getByRole('button', { name: /re-copy from venue/i }));
    await waitFor(() => {
      expect(formValues().parking_notes).toBe('Free lot behind building');
    });
  });

  it('copies address coordinates and entry notes into the event', async () => {
    render(
      <Wrapper
        section="address"
        venueData={{ ...VENUE_DATA, location: { type: 'Point', coordinates: [-79.1, 35.7] } }}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Use & Add' }));

    await waitFor(() => {
      expect(formValues().address_city).toBe('Pittsboro');
    });
    expect(formValues().longitude).toBe(-79.1);
    expect(formValues().latitude).toBe(35.7);
    expect(formValues().event.event_entry_notes).toBe('Blue side door');
  });

  it('locks the section body and explains the live link under "Use As Is"', () => {
    render(
      <Wrapper
        venueInheritance={{ parking: 'as_is' }}
        children={<div>section body</div>}
      />,
    );
    expect(screen.getByText(/updating automatically/i)).toBeInTheDocument();
    expect(screen.getByText('Carolina Brewery')).toBeInTheDocument();
    const locked = document.querySelector('[data-venue-locked="true"]');
    expect(locked).toBeTruthy();
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    expect(locked.textContent).toContain('section body');
  });

  it('does not copy anything when switching into "Use As Is"', () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByRole('radio', { name: 'Use As Is' }));
    expect(formValues().parking_notes).toBe('');
  });

  it('leaves the section body editable under "Use & Add"', () => {
    render(
      <Wrapper
        venueInheritance={{ parking: 'use_and_add' }}
        children={<div>section body</div>}
      />,
    );
    expect(document.querySelector('[data-venue-locked="true"]')).toBeNull();
    expect(screen.getByText('section body')).toBeInTheDocument();
  });

  it('never clears existing values when switching to "Don\'t Use"', () => {
    render(
      <Wrapper
        venueInheritance={{ parking: 'as_is' }}
        initialValues={{ parking_notes: 'Event has its own lot' }}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: "Don't Use" }));
    expect(formValues().event.venue_inheritance.parking).toBe('do_not_use');
    expect(formValues().parking_notes).toBe('Event has its own lot');
  });

  it('fetches venue data on demand when none was passed in', async () => {
    render(<Wrapper venueData={null} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Use & Add' }));
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/pois/venue-1/venue-data');
    });
    expect(formValues().parking_notes).toBe('Free lot behind building');
  });
});
