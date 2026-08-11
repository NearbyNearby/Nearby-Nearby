import { describe, it, expect } from 'vitest';
import { eventOccursOnDate } from '../eventSchedule';

/**
 * Issue #165: the Nearby date filter checked a nested `event` object that
 * nearby cards never carry, so it silently kept every event. These pin the
 * resolver (eventOccursOnDate) the fixed filter now calls, using the flat
 * card fields (start_datetime, end_datetime, is_repeating, repeat_pattern,
 * recurrence_end_date, excluded_dates) directly.
 */

describe('eventOccursOnDate', () => {
  it('returns false without a target date or a start date', () => {
    expect(eventOccursOnDate({ start_datetime: '2026-08-15T18:00:00' }, '')).toBe(false);
    expect(eventOccursOnDate({}, '2026-08-15')).toBe(false);
  });

  it('matches a non-repeating event on its own date', () => {
    const event = {
      is_repeating: false,
      start_datetime: '2026-08-15T18:00:00',
      end_datetime: '2026-08-15T23:00:00',
    };
    expect(eventOccursOnDate(event, '2026-08-15')).toBe(true);
  });

  it('drops a non-repeating event on a date it does not span', () => {
    const event = {
      is_repeating: false,
      start_datetime: '2026-08-15T18:00:00',
      end_datetime: '2026-08-15T23:00:00',
    };
    expect(eventOccursOnDate(event, '2026-08-12')).toBe(false);
  });

  it('matches a multi-day event on every date it spans', () => {
    const event = {
      is_repeating: false,
      start_datetime: '2026-08-07T12:00:00',
      end_datetime: '2026-08-10T21:00:00',
    };
    expect(eventOccursOnDate(event, '2026-08-09')).toBe(true);
    expect(eventOccursOnDate(event, '2026-08-11')).toBe(false);
  });

  it('resolves a weekly-recurring event to the occurrence on the selected date', () => {
    // Pittsboro Saturday Farmers Market: weekly on Saturdays, no end.
    const event = {
      is_repeating: true,
      start_datetime: '2026-01-20T08:00:00', // series start; the pattern's
      end_datetime: '2026-01-20T12:00:00',   // "days" list drives the actual weekday
      repeat_pattern: { days: ['saturday'], frequency: 'weekly' },
      recurrence_end_date: null,
      excluded_dates: null,
    };
    expect(eventOccursOnDate(event, '2026-08-15')).toBe(true); // a Saturday
    expect(eventOccursOnDate(event, '2026-08-12')).toBe(false); // a Wednesday
  });

  it('skips an excluded occurrence of a recurring event', () => {
    const event = {
      is_repeating: true,
      start_datetime: '2026-01-20T08:00:00',
      repeat_pattern: { days: ['saturday'], frequency: 'weekly' },
      excluded_dates: ['2026-08-15'],
    };
    expect(eventOccursOnDate(event, '2026-08-15')).toBe(false);
  });

  it('stops matching once the recurrence has ended', () => {
    const event = {
      is_repeating: true,
      start_datetime: '2026-01-20T08:00:00',
      repeat_pattern: { days: ['saturday'], frequency: 'weekly' },
      recurrence_end_date: '2026-08-01T00:00:00',
    };
    expect(eventOccursOnDate(event, '2026-08-15')).toBe(false);
  });

  it('falls through to `days` when `days_of_week` is present but empty (#164 parity with the Python expander)', () => {
    // 2026-08-17 is a Monday, 2026-08-21 is a Friday, 2026-08-18 is a Tuesday.
    // An empty days_of_week must not degrade to the start date's own weekday
    // only, it must fall through to `days` and yield both weekdays.
    const event = {
      is_repeating: true,
      start_datetime: '2026-08-10T10:00:00', // a Monday
      repeat_pattern: { frequency: 'weekly', interval: 1, days_of_week: [], days: ['MO', 'FR'] },
    };
    expect(eventOccursOnDate(event, '2026-08-17')).toBe(true); // Monday
    expect(eventOccursOnDate(event, '2026-08-21')).toBe(true); // Friday
    expect(eventOccursOnDate(event, '2026-08-18')).toBe(false); // Tuesday
  });
});
