/**
 * Tests for HoursDisplay dawn/dusk grid rows — issue #174
 *
 * Detail pages pass the POI's coordinates so the weekly grid can show each
 * day's computed sunrise/sunset clock time. Without coordinates the grid
 * keeps the bare words "Dawn"/"Dusk" (never a wrong time).
 *
 * SunCalc is mocked (sunrise 06:30, sunset 19:45) so assertions are
 * deterministic regardless of the machine's time zone.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('suncalc', () => {
  return {
    default: {
      getTimes: (_date, _lat, _lng) => {
        const base = new Date(_date);
        const sunrise = new Date(base);
        sunrise.setHours(6, 30, 0, 0);
        const sunset = new Date(base);
        sunset.setHours(19, 45, 0, 0);
        return { sunrise, sunset };
      },
    },
  };
});

// Must import AFTER mock is registered
import HoursDisplay from '../HoursDisplay';

const LAT = 35.72;
const LNG = -79.18;

const ALL_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const DAWN_DUSK_PERIOD = { open: { type: 'dawn' }, close: { type: 'dusk' } };

const dawnDuskWeek = {
  regular: Object.fromEntries(
    ALL_DAYS.map((day) => [day, { status: 'open', periods: [DAWN_DUSK_PERIOD] }])
  ),
};

beforeEach(() => {
  // Wednesday, July 15 2026. Keeps the week grid deterministic.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HoursDisplay - weekly grid with coordinates (#174)', () => {
  const GRID_ROWS = '.hours-display__day-row .hours-display__day-hours';

  it('shows each day with its computed solar times when lat/lng are passed', () => {
    const { container } = render(<HoursDisplay hours={dawnDuskWeek} lat={LAT} lng={LNG} />);
    const rows = container.querySelectorAll(GRID_ROWS);
    expect(rows.length).toBe(7);
    rows.forEach((row) => {
      expect(row.textContent).toBe('Dawn (6:30 AM) - Dusk (7:45 PM)');
    });
  });

  it('shows bare words when no coordinates are passed', () => {
    const { container } = render(<HoursDisplay hours={dawnDuskWeek} />);
    const rows = container.querySelectorAll(GRID_ROWS);
    expect(rows.length).toBe(7);
    rows.forEach((row) => {
      expect(row.textContent).toBe('Dawn - Dusk');
    });
  });
});
