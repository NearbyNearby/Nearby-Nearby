import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Same heavy-dep mocks as TrailDetail.test.jsx; SunCalc pinned to 06:30/19:45.
vi.mock('../../nearby-feature/NearbySection', () => ({
  default: function MockNearby() {
    return <div data-testid="nearby-section" />;
  },
}));

vi.mock('dompurify', () => ({
  default: {
    sanitize: (html) => html,
  },
}));

vi.mock('suncalc', () => ({
  default: {
    getTimes: (date) => {
      const sunrise = new Date(date);
      sunrise.setHours(6, 30, 0, 0);
      const sunset = new Date(date);
      sunset.setHours(19, 45, 0, 0);
      return { sunrise, sunset };
    },
  },
}));

import ParkDetail from '../ParkDetail';

const ALL_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function buildPoi() {
  return {
    id: 'park-id',
    name: 'Test Park',
    poi_type: 'PARK',
    location: { type: 'Point', coordinates: [-79.18, 35.72] },
    images: [],
    hours: {
      regular: Object.fromEntries(ALL_DAYS.map((day) => [
        day, { status: 'open', periods: [{ open: { type: 'dawn' }, close: { type: 'dusk' } }] },
      ])),
    },
    park: {},
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ParkDetail: dawn-to-dusk hours (#174)', () => {
  it('renders a park with hours and shows the computed solar times in the grid', () => {
    const { container } = render(
      <MemoryRouter>
        <ParkDetail poi={buildPoi()} />
      </MemoryRouter>
    );
    const rows = container.querySelectorAll('.hours-display__day-row .hours-display__day-hours');
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row) => {
      expect(row.textContent).toBe('Dawn (6:30 AM) - Dusk (7:45 PM)');
    });
  });
});
