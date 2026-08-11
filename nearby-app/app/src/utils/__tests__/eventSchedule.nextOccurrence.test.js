import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getNextOccurrence, getEventScheduleLine } from '../eventSchedule';

/**
 * Issue #141 — clicking a recurring event landed on the FIRST occurrence of the
 * series (an old one) instead of the current listing. These tests pin the
 * next-occurrence resolution the detail page now uses.
 */

// A fixed "now" so weekday arithmetic is deterministic.
// 2026-08-08 is a Saturday.
const NOW = new Date(2026, 7, 8, 12, 0, 0);

function iso(y, m, d, h = 15, min = 0) {
  // Local-time ISO (no Z) so the assertions do not depend on the runner's zone.
  const p = (n) => String(n).padStart(2, '0');
  return `${y}-${p(m)}-${p(d)}T${p(h)}:${p(min)}:00`;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getNextOccurrence', () => {
  it('returns null without an event or a start date', () => {
    expect(getNextOccurrence(null)).toBeNull();
    expect(getNextOccurrence({ is_repeating: true })).toBeNull();
  });

  it('returns the single date for a non-repeating event', () => {
    const next = getNextOccurrence({
      is_repeating: false,
      start_datetime: iso(2026, 9, 3, 18),
      end_datetime: iso(2026, 9, 3, 21),
    });
    expect(next.start.getFullYear()).toBe(2026);
    expect(next.start.getMonth()).toBe(8);
    expect(next.start.getDate()).toBe(3);
    expect(next.end.getHours()).toBe(21);
  });

  it('advances a weekly series whose first occurrence is long past', () => {
    // Thursday 2020-07-02, weekly, no end. Next Thursday after 2026-08-08 is the 13th.
    const next = getNextOccurrence({
      is_repeating: true,
      start_datetime: iso(2020, 7, 2, 15),
      end_datetime: iso(2020, 7, 2, 18),
      repeat_pattern: { frequency: 'weekly', interval: 1, days_of_week: ['Thu'] },
      recurrence_end_date: null,
    });
    expect(next.start.getDate()).toBe(13);
    expect(next.start.getMonth()).toBe(7);
    expect(next.start.getFullYear()).toBe(2026);
    // Time of day and duration are preserved from the series definition.
    expect(next.start.getHours()).toBe(15);
    expect(next.end.getHours()).toBe(18);
  });

  it('keeps today\'s occurrence rather than skipping to next week', () => {
    // Saturday series; today IS Saturday, and the occurrence window already
    // closed this morning. It is still today's listing.
    const next = getNextOccurrence({
      is_repeating: true,
      start_datetime: iso(2025, 1, 4, 8),
      end_datetime: iso(2025, 1, 4, 10),
      repeat_pattern: { frequency: 'weekly', interval: 1 },
    });
    expect(next.start.getDate()).toBe(8);
    expect(next.start.getMonth()).toBe(7);
  });

  it('honors a multi-week interval', () => {
    // Every 2 weeks from Thursday 2026-07-02 -> 7/16, 7/30, 8/13.
    const next = getNextOccurrence({
      is_repeating: true,
      start_datetime: iso(2026, 7, 2, 15),
      repeat_pattern: { frequency: 'weekly', interval: 2 },
    });
    expect(next.start.getDate()).toBe(13);
    expect(next.start.getMonth()).toBe(7);
  });

  it('supports several days per week', () => {
    // Tue + Thu weekly; next after Sat 8/8 is Tue 8/11.
    const next = getNextOccurrence({
      is_repeating: true,
      start_datetime: iso(2026, 6, 2, 19),
      repeat_pattern: { frequency: 'weekly', interval: 1, days_of_week: ['Tue', 'Thu'] },
    });
    expect(next.start.getDate()).toBe(11);
    expect(next.start.getMonth()).toBe(7);
  });

  it('advances daily and monthly and yearly series', () => {
    const daily = getNextOccurrence({
      is_repeating: true,
      start_datetime: iso(2026, 8, 1, 9),
      repeat_pattern: { frequency: 'daily', interval: 1 },
    });
    expect(daily.start.getDate()).toBe(8);

    const monthly = getNextOccurrence({
      is_repeating: true,
      start_datetime: iso(2026, 1, 20, 9),
      repeat_pattern: { frequency: 'monthly', interval: 1 },
    });
    expect(monthly.start.getMonth()).toBe(7);
    expect(monthly.start.getDate()).toBe(20);

    const yearly = getNextOccurrence({
      is_repeating: true,
      start_datetime: iso(2019, 12, 5, 9),
      repeat_pattern: { frequency: 'yearly', interval: 1 },
    });
    expect(yearly.start.getFullYear()).toBe(2026);
    expect(yearly.start.getMonth()).toBe(11);
  });

  it('skips excluded dates', () => {
    const next = getNextOccurrence({
      is_repeating: true,
      start_datetime: iso(2020, 7, 2, 15),
      repeat_pattern: { frequency: 'weekly', interval: 1, days_of_week: ['Thu'] },
      excluded_dates: ['2026-08-13'],
    });
    expect(next.start.getDate()).toBe(20);
  });

  it('stops at recurrence_end_date and reports no upcoming occurrence', () => {
    const next = getNextOccurrence({
      is_repeating: true,
      start_datetime: iso(2020, 7, 2, 15),
      repeat_pattern: { frequency: 'weekly', interval: 1 },
      recurrence_end_date: iso(2021, 7, 2, 15),
    });
    expect(next).toBeNull();
  });

  it('uses a manual date when it lands before the next rule occurrence', () => {
    const next = getNextOccurrence({
      is_repeating: true,
      start_datetime: iso(2020, 7, 2, 15),
      repeat_pattern: { frequency: 'weekly', interval: 1, days_of_week: ['Thu'] },
      manual_dates: [{ date: '2026-08-10', start_time: '17:30' }],
    });
    expect(next.start.getDate()).toBe(10);
    expect(next.start.getHours()).toBe(17);
    expect(next.start.getMinutes()).toBe(30);
  });
});

describe('getEventScheduleLine', () => {
  it('shows the upcoming occurrence date for a repeating event, not the first one', () => {
    const line = getEventScheduleLine({
      is_repeating: true,
      start_datetime: iso(2020, 7, 2, 15),
      end_datetime: iso(2020, 7, 2, 18),
      repeat_pattern: { frequency: 'weekly', interval: 1, days_of_week: ['Thu'] },
    });
    expect(line).toContain('Aug 13th');
    expect(line).not.toContain('2020');
    expect(line).not.toContain('Jul 2nd');
  });

  it('falls back to the stored date for a one-off event', () => {
    const line = getEventScheduleLine({
      is_repeating: false,
      start_datetime: iso(2026, 9, 3, 18),
      end_datetime: iso(2026, 9, 3, 21),
    });
    expect(line).toContain('Sep 3rd');
  });
});
