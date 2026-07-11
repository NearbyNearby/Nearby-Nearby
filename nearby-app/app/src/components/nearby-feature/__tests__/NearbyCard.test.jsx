import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import NearbyCard from '../NearbyCard.jsx';

// Always-future so scheduled-event fixtures never age into the past.
const NEXT_JUNE = `${new Date().getFullYear() + 1}-06-01`;

function buildPoi(overrides = {}) {
  return {
    id: 'test-id',
    name: 'Test Event',
    poi_type: 'EVENT',
    distance_meters: 1609,
    event: {
      start_datetime: `${NEXT_JUNE}T10:00:00`,
      event_status: 'Scheduled',
      ...overrides.event,
    },
    ...overrides,
  };
}

const defaultProps = {
  index: 0,
  onDetailsClick: vi.fn(),
  onDirectionsClick: vi.fn(),
  isHighlighted: false,
  selectedDate: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NearbyCard — event status badges', () => {
  it('shows a "Canceled" badge for a canceled event', () => {
    const poi = buildPoi({ event: { start_datetime: '2026-06-01T10:00:00', event_status: 'Canceled' } });
    render(<NearbyCard poi={poi} {...defaultProps} />);

    const badge = screen.getByText('Canceled');
    expect(badge).toBeInTheDocument();
    expect(badge.tagName).toBe('SPAN');
    expect(badge.className).toMatch(/nearby-card__status-badge/);
  });

  it('renders the event name with strikethrough class when status is Canceled', () => {
    const poi = buildPoi({ event: { start_datetime: '2026-06-01T10:00:00', event_status: 'Canceled' } });
    render(<NearbyCard poi={poi} {...defaultProps} />);

    // Barry's redesign: the card title is a div.one_search_map_result_title (not an h3)
    const nameEl = screen.getByText('Test Event');
    expect(nameEl.className).toMatch(/nearby-card__name--canceled/);
  });

  it('shows a "Past" badge when start_datetime is in the past and status is Scheduled', () => {
    const poi = buildPoi({ event: { start_datetime: '2020-01-01T10:00:00', event_status: 'Scheduled' } });
    render(<NearbyCard poi={poi} {...defaultProps} />);

    const badge = screen.getByText('Past');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/nearby-card__status-badge/);
    expect(badge.className).toMatch(/nearby-card__status-badge--past/);
  });

  it('does NOT show a status badge for a scheduled future event', () => {
    const poi = buildPoi({ event: { start_datetime: `${NEXT_JUNE}T10:00:00`, event_status: 'Scheduled' } });
    render(<NearbyCard poi={poi} {...defaultProps} />);

    expect(screen.queryByText('Canceled')).not.toBeInTheDocument();
    expect(screen.queryByText('Postponed')).not.toBeInTheDocument();
    expect(screen.queryByText('Past')).not.toBeInTheDocument();
  });

  it('renders event date normally for a scheduled event', () => {
    const poi = buildPoi({ event: { start_datetime: `${NEXT_JUNE}T10:00:00`, event_status: 'Scheduled' } });
    render(<NearbyCard poi={poi} {...defaultProps} />);

    // The date is rendered via formatEventDate; check for "Jun" which will be in any locale-formatted Jun 1
    expect(screen.getByText(/Jun/i)).toBeInTheDocument();
  });

  it('renders distance and name for a non-event (business) POI', () => {
    const poi = {
      id: 'biz-1',
      name: 'My Coffee Shop',
      poi_type: 'BUSINESS',
      distance_meters: 3218,
    };
    render(<NearbyCard poi={poi} {...defaultProps} />);

    expect(screen.getByText('My Coffee Shop')).toBeInTheDocument();
    // 3218 m ≈ 2.0 miles
    expect(screen.getByText('2.0 mi')).toBeInTheDocument();
  });
});

// Task 1.4: the nearby card serializer now emits these registry card:true fields
// as FLAT keys (not nested under trail/event). The card must read them flat.
describe('NearbyCard — flat registry card fields (Task 1.4)', () => {
  it('renders trail length_text and difficulty from flat card fields', () => {
    const poi = {
      id: 't1', name: 'Blue Trail', poi_type: 'TRAIL', distance_meters: 1609,
      length_text: '2.5 miles', difficulty: 'Easy',
    };
    render(<NearbyCard poi={poi} {...defaultProps} />);

    expect(screen.getByText('2.5 miles')).toBeInTheDocument();
    expect(screen.getByText('Easy')).toBeInTheDocument();
  });

  it('renders the wheelchair amenity icon from icon_wheelchair_accessible', () => {
    const poi = {
      id: 'b1', name: 'Cafe', poi_type: 'BUSINESS', distance_meters: 100,
      icon_wheelchair_accessible: true,
    };
    render(<NearbyCard poi={poi} {...defaultProps} />);

    expect(screen.getByTitle('Wheelchair Accessible')).toBeInTheDocument();
  });

  it('renders event date from a flat start_datetime (no nested event object)', () => {
    const poi = {
      id: 'e1', name: 'Future Fest', poi_type: 'EVENT', distance_meters: 100,
      start_datetime: '2030-06-01T10:00:00',
    };
    render(<NearbyCard poi={poi} {...defaultProps} />);

    // formatEventDate → locale "Jun 1"; a future date shows no Past badge.
    expect(screen.getByText(/Jun/i)).toBeInTheDocument();
    expect(screen.queryByText('Past')).not.toBeInTheDocument();
  });
});
