/**
 * Tests for holiday modes - issue #116
 *
 * Holidays carry a `mode` (follows_regular | open | closed | modified) with the
 * legacy `status` kept as a mirror. The critical compatibility rule: a pre-#116
 * entry of {"status": "open"} means "no special hours, use the normal
 * schedule", NOT the new always-open mode. An absent key means unconfirmed.
 *
 * Python twin: tests/test_hours_system.py TestHolidayModes. The fixtures and
 * dates below are the SAME literals. Change both or neither.
 */

import { describe, it, expect } from 'vitest';
import {
  getEffectiveHoursForDate,
  getHolidayMode,
  getOpenCloseStatusLabel,
  getUpcomingHolidays,
  HOLIDAY_UNCONFIRMED_TEXT,
} from '../hoursUtils';

const WEEKDAY_PERIODS = [
  { open: { type: 'fixed', time: '09:00' }, close: { type: 'fixed', time: '17:00' } },
];

// Mirrors REGULAR_HOURS in tests/test_hours_system.py
const REGULAR_HOURS = {
  regular: {
    monday: { status: 'open', periods: WEEKDAY_PERIODS },
    tuesday: { status: 'open', periods: WEEKDAY_PERIODS },
    wednesday: { status: 'open', periods: WEEKDAY_PERIODS },
    thursday: { status: 'open', periods: WEEKDAY_PERIODS },
    friday: { status: 'open', periods: WEEKDAY_PERIODS },
    saturday: { status: 'closed' },
    sunday: { status: 'closed' },
  },
};

// Mirrors LEGACY_HOLIDAYS in tests/test_hours_system.py
const LEGACY_HOLIDAYS = {
  christmas: { name: 'Christmas Day', date: '12-25', status: 'open', periods: [] },
  thanksgiving: { name: 'Thanksgiving', date: 'fourth_thursday_november', status: 'closed' },
};

// Mirrors MODE_HOLIDAYS in tests/test_hours_system.py
const MODE_HOLIDAYS = {
  independence_day: {
    name: 'Independence Day', date: '07-04',
    mode: 'follows_regular', status: 'open',
  },
  christmas: {
    name: 'Christmas Day', date: '12-25',
    mode: 'closed', status: 'closed', note: 'Reopens December 26',
  },
  thanksgiving: {
    name: 'Thanksgiving', date: 'fourth_thursday_november',
    mode: 'modified', status: 'modified',
    periods: [{ open: { type: 'fixed', time: '10:00' }, close: { type: 'fixed', time: '14:00' } }],
  },
  halloween: {
    name: 'Halloween', date: '10-31',
    mode: 'open', status: 'open',
  },
};

describe('getHolidayMode - legacy mapping (#116)', () => {
  it('maps a legacy status-only entry without inventing always-open', () => {
    expect(getHolidayMode({ status: 'open' })).toBe('follows_regular');
    expect(getHolidayMode({ status: 'closed' })).toBe('closed');
    expect(getHolidayMode({ status: 'modified' })).toBe('modified');
  });

  it('lets an explicit mode win over the legacy mirror', () => {
    expect(getHolidayMode({ mode: 'open', status: 'open' })).toBe('open');
    expect(getHolidayMode({ mode: 'follows_regular', status: 'open' })).toBe('follows_regular');
  });

  it('treats a missing entry as unconfirmed', () => {
    expect(getHolidayMode(null)).toBe('unconfirmed');
    expect(getHolidayMode({})).toBe('unconfirmed');
  });
});

describe('getEffectiveHoursForDate - holiday modes (#116)', () => {
  it('legacy {"status":"open"} still falls through to the normal schedule', () => {
    const hours = { ...REGULAR_HOURS, holidays: LEGACY_HOLIDAYS };
    // 2026-12-25 is Christmas Day, a Friday (regular hours 09:00-17:00).
    const result = getEffectiveHoursForDate(hours, new Date(2026, 11, 25));
    expect(result.source).toBe('regular');
    expect(result.hours.periods[0].open.time).toBe('09:00');
    expect(result.label).toBe('Christmas Day');
  });

  it('legacy {"status":"closed"} still closes', () => {
    const hours = { ...REGULAR_HOURS, holidays: LEGACY_HOLIDAYS };
    // 2026-11-26 is Thanksgiving.
    const result = getEffectiveHoursForDate(hours, new Date(2026, 10, 26));
    expect(result.source).toBe('holiday');
    expect(result.hours.status).toBe('closed');
  });

  it('follows_regular derives a different answer per year (the #116 July 4 example)', () => {
    const hours = { ...REGULAR_HOURS, holidays: MODE_HOLIDAYS };

    // 2025-07-04 is a Friday: regular hours apply.
    const friday = getEffectiveHoursForDate(hours, new Date(2025, 6, 4));
    expect(friday.source).toBe('regular');
    expect(friday.hours.status).toBe('open');
    expect(friday.label).toBe('Independence Day');

    // 2026-07-04 is a Saturday: the business is closed on Saturdays.
    const saturday = getEffectiveHoursForDate(hours, new Date(2026, 6, 4));
    expect(saturday.source).toBe('regular');
    expect(saturday.hours.status).toBe('closed');
    expect(saturday.label).toBe('Independence Day');
  });

  it('mode closed carries the visitor note', () => {
    const hours = { ...REGULAR_HOURS, holidays: MODE_HOLIDAYS };
    const result = getEffectiveHoursForDate(hours, new Date(2026, 11, 25));
    expect(result.source).toBe('holiday');
    expect(result.hours.status).toBe('closed');
    expect(result.label).toBe('Christmas Day');
    expect(result.note).toBe('Reopens December 26');
  });

  it('mode modified uses the holiday periods', () => {
    const hours = { ...REGULAR_HOURS, holidays: MODE_HOLIDAYS };
    const result = getEffectiveHoursForDate(hours, new Date(2026, 10, 26));
    expect(result.source).toBe('holiday');
    expect(result.hours.periods[0].close.time).toBe('14:00');
  });

  it('mode open on a normally-closed weekday never invents 24 hours', () => {
    const hours = { ...REGULAR_HOURS, holidays: MODE_HOLIDAYS };
    // 2026-10-31 is Halloween, a Saturday (regular: closed).
    const result = getEffectiveHoursForDate(hours, new Date(2026, 9, 31));
    expect(result.source).toBe('holiday');
    expect(result.hours.status).toBe('open');
    expect(result.hours.hoursVary).toBe(true);
    expect(result.hours.periods).toBeUndefined();
  });

  it('mode open reuses the regular periods when that weekday is open', () => {
    const hours = {
      ...REGULAR_HOURS,
      holidays: { christmas: { name: 'Christmas Day', date: '12-25', mode: 'open', status: 'open' } },
    };
    // 2026-12-25 is a Friday.
    const result = getEffectiveHoursForDate(hours, new Date(2026, 11, 25));
    expect(result.source).toBe('holiday');
    expect(result.hours.periods[0].open.time).toBe('09:00');
  });

  it('an absent major holiday resolves as unconfirmed', () => {
    const result = getEffectiveHoursForDate(REGULAR_HOURS, new Date(2026, 11, 25));
    expect(result.source).toBe('holiday_unconfirmed');
    expect(result.hours).toBeNull();
    expect(result.unconfirmed).toBe(true);
    expect(result.label).toBe('Christmas Day');
  });

  it('an absent minor holiday falls through silently', () => {
    // 2026-10-31 is Halloween, a minor holiday.
    const result = getEffectiveHoursForDate(REGULAR_HOURS, new Date(2026, 9, 31));
    expect(result.source).toBe('regular');
    expect(result.label).toBeNull();
  });

  it('an exception still beats an unconfirmed holiday', () => {
    const hours = {
      ...REGULAR_HOURS,
      exceptions: [{ type: 'one-time', date: '2026-12-25', status: 'closed', reason: 'Family time' }],
    };
    const result = getEffectiveHoursForDate(hours, new Date(2026, 11, 25));
    expect(result.source).toBe('exception');
    expect(result.label).toBe('Family time');
  });
});

describe('getOpenCloseStatusLabel - unconfirmed holiday (#116 P2)', () => {
  it('suppresses the open/closed badge on an unconfirmed major holiday', () => {
    // Christmas Day 2026 at noon; the regular Friday grid would say "Open".
    const { variant, label } = getOpenCloseStatusLabel(REGULAR_HOURS, new Date(2026, 11, 25, 12, 0, 0));
    expect(variant).toBeNull();
    expect(label).toBeNull();
  });
});

describe('getUpcomingHolidays - canonical list (#116)', () => {
  it('surfaces unconfirmed major holidays and skips unconfirmed minor ones', () => {
    const rows = getUpcomingHolidays(REGULAR_HOURS);
    const keys = rows.map((r) => r.key);
    expect(keys).toContain('christmas');
    expect(keys).not.toContain('halloween');
    const christmas = rows.find((r) => r.key === 'christmas');
    expect(christmas.unconfirmed).toBe(true);
    expect(christmas.statusText).toBe(HOLIDAY_UNCONFIRMED_TEXT);
  });

  it('reports the configured mode, note and derived text for each entry', () => {
    const rows = getUpcomingHolidays({ ...REGULAR_HOURS, holidays: MODE_HOLIDAYS });
    const christmas = rows.find((r) => r.key === 'christmas');
    expect(christmas.mode).toBe('closed');
    expect(christmas.statusText).toBe('Closed');
    expect(christmas.note).toBe('Reopens December 26');

    const halloween = rows.find((r) => r.key === 'halloween');
    expect(halloween.mode).toBe('open');

    const july4 = rows.find((r) => r.key === 'independence_day');
    expect(july4.mode).toBe('follows_regular');
    expect(july4.statusText).toMatch(/Closed|AM|PM/);
  });

  it('is sorted by next occurrence and honours the count cap', () => {
    const rows = getUpcomingHolidays({ ...REGULAR_HOURS, holidays: MODE_HOLIDAYS }, 3);
    expect(rows.length).toBe(3);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].date >= rows[i - 1].date).toBe(true);
    }
  });
});
