/**
 * Tests for the no-regular-hours flag - issue #118
 *
 * A location can be real, visitable and worth listing without keeping a weekly
 * schedule (a seasonal farm stand, a by-request venue, a trail with no gate).
 * When `hours.no_regular_hours === true`:
 *   - resolution reports source 'no_regular_hours', never the stale grid;
 *   - the status badge is suppressed everywhere (never "Closed", never
 *     "Closed now") - this is the acceptance criterion for #118;
 *   - exceptions and holidays still apply.
 *
 * Python twin: tests/test_hours_system.py TestNoRegularHours (same fixtures).
 */

import { describe, it, expect } from 'vitest';
import {
  getEffectiveHoursForDate,
  getOpenCloseStatusLabel,
  getWeekHours,
  formatDayHours,
  isCurrentlyOpen,
} from '../hoursUtils';

const WEEKDAY_PERIODS = [
  { open: { type: 'fixed', time: '09:00' }, close: { type: 'fixed', time: '17:00' } },
];

// Mirrors REGULAR_HOURS in tests/test_hours_system.py
const REGULAR = {
  monday: { status: 'open', periods: WEEKDAY_PERIODS },
  tuesday: { status: 'open', periods: WEEKDAY_PERIODS },
  wednesday: { status: 'open', periods: WEEKDAY_PERIODS },
  thursday: { status: 'open', periods: WEEKDAY_PERIODS },
  friday: { status: 'open', periods: WEEKDAY_PERIODS },
  saturday: { status: 'closed' },
  sunday: { status: 'closed' },
};

// Mirrors NO_REGULAR_HOURS in tests/test_hours_system.py
const NO_REGULAR_HOURS = {
  no_regular_hours: true,
  regular: REGULAR,
  notes: 'Hours vary. Call ahead.',
};

// 2026-03-03 is an ordinary Tuesday (regular hours say 09:00-17:00).
const TUESDAY = new Date(2026, 2, 3, 10, 0, 0);

describe('getEffectiveHoursForDate - no_regular_hours (#118)', () => {
  it('reports source no_regular_hours instead of the stale weekly grid', () => {
    const result = getEffectiveHoursForDate(NO_REGULAR_HOURS, TUESDAY);
    expect(result.source).toBe('no_regular_hours');
    expect(result.hours.status).toBe('no_regular_hours');
    expect(result.hours.periods).toBeUndefined();
  });

  it('still lets an exception win', () => {
    const hours = {
      ...NO_REGULAR_HOURS,
      exceptions: [
        { type: 'one-time', date: '2026-03-15', status: 'modified', reason: 'Staff training', periods: WEEKDAY_PERIODS },
      ],
    };
    const result = getEffectiveHoursForDate(hours, new Date(2026, 2, 15));
    expect(result.source).toBe('exception');
    expect(result.label).toBe('Staff training');
  });

  it('still lets a holiday win', () => {
    const hours = {
      ...NO_REGULAR_HOURS,
      holidays: { christmas: { name: 'Christmas Day', date: '12-25', mode: 'closed', status: 'closed' } },
    };
    const result = getEffectiveHoursForDate(hours, new Date(2026, 11, 25));
    expect(result.source).toBe('holiday');
    expect(result.hours.status).toBe('closed');
  });

  it('wins over seasonal_only (P4)', () => {
    const hours = {
      ...NO_REGULAR_HOURS,
      seasonal_only: true,
      seasonal: { summer: { monday: { status: 'open', periods: WEEKDAY_PERIODS } } },
    };
    // 2026-07-06 is a Monday in summer.
    const result = getEffectiveHoursForDate(hours, new Date(2026, 6, 6));
    expect(result.source).toBe('no_regular_hours');
  });
});

describe('getOpenCloseStatusLabel - no_regular_hours (#118)', () => {
  it('returns no badge at all, and never the word "closed"', () => {
    const { variant, label } = getOpenCloseStatusLabel(NO_REGULAR_HOURS, TUESDAY);
    expect(variant).toBeNull();
    expect(label).toBeNull();
    expect(String(label)).not.toMatch(/closed/i);
  });

  it('returns no badge even at an hour the regular grid would call closed', () => {
    // 22:00 on a Tuesday: the regular 9-5 grid would say "Closed".
    const lateNight = new Date(2026, 2, 3, 22, 0, 0);
    const { variant, label } = getOpenCloseStatusLabel(NO_REGULAR_HOURS, lateNight);
    expect(variant).toBeNull();
    expect(label).toBeNull();
  });

  it('returns no badge on a day the regular grid would call closed', () => {
    // 2026-03-07 is a Saturday: regular says closed.
    const saturday = new Date(2026, 2, 7, 12, 0, 0);
    expect(getOpenCloseStatusLabel(NO_REGULAR_HOURS, saturday).label).toBeNull();
  });
});

describe('day rendering - no_regular_hours (#118)', () => {
  it('getWeekHours returns an empty week so the HOURS grid is suppressed', () => {
    expect(getWeekHours(NO_REGULAR_HOURS, TUESDAY)).toEqual([]);
  });

  it('formatDayHours says nothing rather than "Closed"', () => {
    expect(formatDayHours({ status: 'no_regular_hours' })).toBeNull();
  });

  it('isCurrentlyOpen does not claim the location is closed', () => {
    const result = isCurrentlyOpen(NO_REGULAR_HOURS);
    expect(result.isOpen).toBe(false);
    expect(result.status).not.toMatch(/closed/i);
  });
});
