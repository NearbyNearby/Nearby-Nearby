import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { useForm } from '@mantine/form';
import VenueInheritanceControls from '../VenueInheritanceControls';

// Mantine v8 SegmentedControl uses FloatingIndicator which calls ResizeObserver.
// jsdom does not implement it, so we provide a minimal stub here.
beforeAll(() => {
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

function TestWrapper({ venuePoiId = null, venueInheritance = null }) {
  const form = useForm({
    initialValues: {
      event: {
        venue_poi_id: venuePoiId,
        venue_inheritance: venueInheritance,
      },
    },
  });
  return (
    <MantineProvider>
      <VenueInheritanceControls form={form} />
    </MantineProvider>
  );
}

describe('VenueInheritanceControls (read-only summary, issue #124)', () => {
  it('renders nothing when no venue is selected (venue_poi_id is null)', () => {
    render(<TestWrapper venuePoiId={null} />);
    expect(screen.queryByText('Venue Data Inheritance')).not.toBeInTheDocument();
  });

  it('renders nothing when venue_poi_id is an empty string', () => {
    render(<TestWrapper venuePoiId="" />);
    expect(screen.queryByText('Venue Data Inheritance')).not.toBeInTheDocument();
  });

  it('renders the summary when a venue is selected', () => {
    render(<TestWrapper venuePoiId="venue-abc-123" />);
    expect(screen.getByText('Venue Data Inheritance')).toBeInTheDocument();
  });

  it('lists all 9 sections and no longer lists Hours', () => {
    render(<TestWrapper venuePoiId="venue-abc-123" />);

    [
      'Address & Location', 'Parking', 'Accessibility', 'Restrooms',
      'Playground', 'Amenities', 'Pet Policy', 'Alcohol & Smoking', 'Contact Info',
    ].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });

    // Hours stopped being inheritable (#124): an event's schedule is its own.
    expect(screen.queryByText('Hours')).not.toBeInTheDocument();
  });

  it('is read-only: the mode is chosen inside each section, not here', () => {
    render(<TestWrapper venuePoiId="venue-abc-123" venueInheritance={{ parking: 'as_is' }} />);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByText(/set per section, inside each section below/i)).toBeInTheDocument();
  });

  it('shows a section with no stored mode as "Don\'t Use"', () => {
    render(<TestWrapper venuePoiId="venue-abc-123" venueInheritance={null} />);
    expect(screen.getAllByText("Don't Use")).toHaveLength(9);
  });

  it('reflects each stored mode as its own badge', () => {
    render(
      <TestWrapper
        venuePoiId="venue-abc-123"
        venueInheritance={{ parking: 'use_and_add', accessibility: 'as_is' }}
      />,
    );
    expect(screen.getByText('Use & Add')).toBeInTheDocument();
    expect(screen.getByText('Use As Is')).toBeInTheDocument();
    expect(screen.getAllByText("Don't Use")).toHaveLength(7);
  });

  it('ignores a stale hours mode left over in stored config', () => {
    render(
      <TestWrapper venuePoiId="venue-abc-123" venueInheritance={{ hours: 'as_is' }} />,
    );
    expect(screen.queryByText('Hours')).not.toBeInTheDocument();
    expect(screen.queryByText('Use As Is')).not.toBeInTheDocument();
  });
});
