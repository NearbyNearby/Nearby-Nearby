/**
 * Tests for dawn/dusk real clock times  -  issue #174
 *
 * Admin's HoursSelector saves solar period ends as
 * {type:'dawn'|'dusk', offset:<minutes>} (offset can be negative, e.g. -20 =
 * 20 min before dusk). The public app must show the real clock time (sunrise/
 * sunset with the offset folded in) in open/opens labels and in the
 * detail-page weekly grid, and keep the bare words "Dawn"/"Dusk" when
 * coordinates are missing (never a wrong time).
 *
 * SunCalc is mocked (sunrise 06:30, sunset 19:45 every day at any location)
 * so assertions are deterministic regardless of the machine's time zone.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

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
import {
  formatTime,
  formatDayHours,
  getWeekHours,
  getOpenCloseStatusLabel,
  isCurrentlyOpen,
} from '../hoursUtils';

// Pittsboro NC (brief's fixed coordinates)
const LAT = 35.72;
const LNG = -79.18;

const ALL_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/** Dawn-to-dusk hours on every day of the week. */
function dawnDuskWeek(period) {
  return {
    regular: Object.fromEntries(
      ALL_DAYS.map((day) => [day, { status: 'open', periods: [period] }])
    ),
  };
}

/** Dawn-to-dusk hours on Wednesday only (the fixed test date's weekday). */
function wednesdayDawnDusk(period) {
  return {
    regular: {
      monday: { status: 'closed' },
      tuesday: { status: 'closed' },
      wednesday: { status: 'open', periods: [period] },
      thursday: { status: 'closed' },
      friday: { status: 'closed' },
      saturday: { status: 'closed' },
      sunday: { status: 'closed' },
    },
  };
}

const DAWN_DUSK = { open: { type: 'dawn' }, close: { type: 'dusk' } };
const DAWN_DUSK_OFFSET = { open: { type: 'dawn', offset: 30 }, close: { type: 'dusk', offset: -20 } };

// Wednesday 15 July 2026, fixed local wall-clock reference points
const NOON = new Date(2026, 6, 15, 12, 0, 0);
const EVENING = new Date(2026, 6, 15, 19, 30, 0);
const EARLY = new Date(2026, 6, 15, 5, 0, 0);

// ── formatTime ────────────────────────────────────────────────────────────

describe('formatTime  -  solar ends show real clock times (#174)', () => {
  it('renders dusk with its real clock time given coordinates and date', () => {
    expect(formatTime({ type: 'dusk' }, NOON, LAT, LNG)).toBe('Dusk (7:45 PM)');
  });

  it('renders dawn with its real clock time given coordinates and date', () => {
    expect(formatTime({ type: 'dawn' }, NOON, LAT, LNG)).toBe('Dawn (6:30 AM)');
  });

  it('folds a negative offset into the time and says so', () => {
    expect(formatTime({ type: 'dusk', offset: -20 }, NOON, LAT, LNG))
      .toBe('7:25 PM (20 min before dusk)');
  });

  it('folds a positive offset into the time and says so', () => {
    expect(formatTime({ type: 'dawn', offset: 30 }, NOON, LAT, LNG))
      .toBe('7:00 AM (30 min after dawn)');
  });

  it('treats a zero offset as plain dusk', () => {
    expect(formatTime({ type: 'dusk', offset: 0 }, NOON, LAT, LNG)).toBe('Dusk (7:45 PM)');
  });

  it('falls back to the bare word when coordinates are missing', () => {
    expect(formatTime({ type: 'dusk' }, NOON, null, null)).toBe('Dusk');
    expect(formatTime({ type: 'dusk', offset: -20 }, NOON, null, null)).toBe('Dusk');
  });

  it('falls back to the bare word when no date is given (legacy calls)', () => {
    expect(formatTime({ type: 'dawn' })).toBe('Dawn');
    expect(formatTime({ type: 'dusk' })).toBe('Dusk');
  });

  it('keeps fixed times unchanged', () => {
    expect(formatTime({ type: 'fixed', time: '09:00' })).toBe('9:00 AM');
  });
});

// ── getOpenCloseStatusLabel ───────────────────────────────────────────────

describe('getOpenCloseStatusLabel  -  open/opens labels with real times (#174)', () => {
  it('shows the computed dusk time in the open-now label', () => {
    const { variant, label } = getOpenCloseStatusLabel(dawnDuskWeek(DAWN_DUSK), NOON, LAT, LNG);
    expect(variant).toBe('open');
    expect(label).toBe('Open until Dusk (7:45 PM)');
  });

  it('shows the offset dusk time in the open-now label', () => {
    const { variant, label } = getOpenCloseStatusLabel(dawnDuskWeek(DAWN_DUSK_OFFSET), NOON, LAT, LNG);
    expect(variant).toBe('open');
    expect(label).toBe('Open until 7:25 PM (20 min before dusk)');
  });

  it('closes at the offset time, not at raw dusk', () => {
    // 19:30 is before raw dusk (19:45) but after dusk-20min (19:25)
    const { variant } = getOpenCloseStatusLabel(wednesdayDawnDusk(DAWN_DUSK_OFFSET), EVENING, LAT, LNG);
    expect(variant).toBe('closed');
  });

  it('stays open at 19:30 when the close is raw dusk', () => {
    const { variant, label } = getOpenCloseStatusLabel(wednesdayDawnDusk(DAWN_DUSK), EVENING, LAT, LNG);
    expect(variant).toBe('open');
    expect(label).toBe('Open until Dusk (7:45 PM)');
  });

  it('shows the computed dawn time in the opens-soon label', () => {
    const { variant, label } = getOpenCloseStatusLabel(wednesdayDawnDusk(DAWN_DUSK), EARLY, LAT, LNG);
    expect(variant).toBe('opensoon');
    expect(label).toBe('Opens at Dawn (6:30 AM)');
  });

  it('shows the offset dawn time in the opens-soon label', () => {
    const { variant, label } = getOpenCloseStatusLabel(wednesdayDawnDusk(DAWN_DUSK_OFFSET), EARLY, LAT, LNG);
    expect(variant).toBe('opensoon');
    expect(label).toBe('Opens at 7:00 AM (30 min after dawn)');
  });

  it('keeps "Hours vary by season" when coordinates are missing', () => {
    const { variant, label } = getOpenCloseStatusLabel(dawnDuskWeek(DAWN_DUSK), NOON, null, null);
    expect(variant).toBeNull();
    expect(label).toBe('Hours vary by season');
  });
});

// ── Weekly grid rows ──────────────────────────────────────────────────────

describe('getWeekHours / formatDayHours  -  grid rows with computed times (#174)', () => {
  it('shows the solar word with the computed time for every day', () => {
    const week = getWeekHours(dawnDuskWeek(DAWN_DUSK), NOON, LAT, LNG);
    expect(week.length).toBe(7);
    week.forEach((day) => {
      expect(day.formattedHours).toBe('Dawn (6:30 AM) - Dusk (7:45 PM)');
    });
  });

  it('shows offset-adjusted times in the grid rows', () => {
    const week = getWeekHours(dawnDuskWeek(DAWN_DUSK_OFFSET), NOON, LAT, LNG);
    week.forEach((day) => {
      expect(day.formattedHours).toBe('Dawn (7:00 AM) - Dusk (7:25 PM)');
    });
  });

  it('falls back to bare words without coordinates', () => {
    const week = getWeekHours(dawnDuskWeek(DAWN_DUSK), NOON);
    week.forEach((day) => {
      expect(day.formattedHours).toBe('Dawn - Dusk');
    });
  });

  it('formatDayHours computes times only when a date is passed', () => {
    const hours = { status: 'open', periods: [DAWN_DUSK] };
    expect(formatDayHours(hours, NOON, LAT, LNG)).toBe('Dawn (6:30 AM) - Dusk (7:45 PM)');
    expect(formatDayHours(hours)).toBe('Dawn - Dusk');
  });

  it('reads the flat legacy shape with "dawn"/"dusk" strings as solar ends', () => {
    const flat = Object.fromEntries(ALL_DAYS.map((day) => [day, [{ open: 'dawn', close: 'dusk' }]]));
    getWeekHours(flat, NOON, LAT, LNG).forEach((day) => {
      expect(day.formattedHours).toBe('Dawn (6:30 AM) - Dusk (7:45 PM)');
    });
    expect(getOpenCloseStatusLabel(flat, NOON, LAT, LNG).label).toBe('Open until Dusk (7:45 PM)');
  });
});

// ── isCurrentlyOpen decision honors the offset ────────────────────────────

describe('isCurrentlyOpen  -  offset moves the open/close boundary (#174)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is still open at 19:30 when the close is raw dusk (19:45)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15, 19, 30, 0));
    const result = isCurrentlyOpen(dawnDuskWeek(DAWN_DUSK), LAT, LNG);
    expect(result.isOpen).toBe(true);
  });

  it('is closed at 19:30 when the close is dusk minus 20 minutes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15, 19, 30, 0));
    const result = isCurrentlyOpen(dawnDuskWeek(DAWN_DUSK_OFFSET), LAT, LNG);
    expect(result.isOpen).toBe(false);
  });
});
