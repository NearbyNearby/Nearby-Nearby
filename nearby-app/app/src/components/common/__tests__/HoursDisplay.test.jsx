/**
 * Tests for HoursDisplay - issues #118 (no regular hours) and #116 (holidays),
 * plus the general-hours-notes bug they both depend on.
 *
 * The notes bug: every detail page passed `poi.hours_notes`, a column that does
 * not exist. The value lives at `hours.notes`, so the notes section never
 * rendered. The call sites now pass `poi.hours?.notes`; this file locks in that
 * the section renders once it receives a value.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import HoursDisplay from '../HoursDisplay';
import { HOLIDAY_UNCONFIRMED_TEXT } from '../../../utils/hoursUtils';

const WEEKDAY_PERIODS = [
  { open: { type: 'fixed', time: '09:00' }, close: { type: 'fixed', time: '17:00' } },
];

function regularHours() {
  return {
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
}

beforeEach(() => {
  // Monday, June 15 2026. Keeps the week grid and the upcoming-holiday list
  // deterministic.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HoursDisplay - general hours notes', () => {
  it('renders the notes section from the value stored at hours.notes', () => {
    const hours = { ...regularHours(), notes: 'Kitchen closes an hour early.' };
    render(<HoursDisplay hours={hours} hoursNotes={hours.notes} />);
    expect(screen.getByText('GENERAL HOUR NOTES')).toBeTruthy();
    expect(screen.getByText(/Kitchen closes an hour early/)).toBeTruthy();
  });

  it('shows the appointment notice alongside a normal week grid (#118)', () => {
    render(<HoursDisplay hours={regularHours()} appointmentRequired={true} />);
    expect(screen.getByText('HOURS')).toBeTruthy();
    expect(screen.getByText(/Appointment required for this location/)).toBeTruthy();
  });
});

describe('HoursDisplay - no regular hours (#118)', () => {
  const hours = { ...regularHours(), no_regular_hours: true, notes: 'Call ahead, we are often here.' };

  it('replaces the day grid with a single honest line', () => {
    render(<HoursDisplay hours={hours} hoursNotes={hours.notes} />);
    expect(screen.getByText('No regular hours')).toBeTruthy();
    expect(screen.queryByText('Mon:')).toBeNull();
  });

  it('still renders the notes underneath', () => {
    render(<HoursDisplay hours={hours} hoursNotes={hours.notes} />);
    expect(screen.getByText(/Call ahead, we are often here/)).toBeTruthy();
  });

  it('never says "closed" anywhere on the block', () => {
    const { container } = render(<HoursDisplay hours={hours} hoursNotes={hours.notes} />);
    expect(container.textContent).not.toMatch(/closed/i);
  });
});

describe('HoursDisplay - holidays (#116)', () => {
  it('tells visitors when a major holiday has not been confirmed', () => {
    render(<HoursDisplay hours={regularHours()} />);
    expect(screen.getByText('UPCOMING HOUR CHANGES')).toBeTruthy();
    // July 4 2026 is the next major holiday and nobody answered for it.
    expect(screen.getByText('Independence Day')).toBeTruthy();
    expect(screen.getAllByText(HOLIDAY_UNCONFIRMED_TEXT).length).toBeGreaterThan(0);
  });

  it('renders the admin note for a confirmed holiday', () => {
    const hours = {
      ...regularHours(),
      holidays: {
        independence_day: {
          name: 'Independence Day',
          date: '07-04',
          mode: 'closed',
          status: 'closed',
          note: 'Back open July 5',
        },
      },
    };
    render(<HoursDisplay hours={hours} />);
    expect(screen.getByText('Back open July 5')).toBeTruthy();
    expect(screen.getAllByText('Closed').length).toBeGreaterThan(0);
  });

  it('leaves unconfirmed minor holidays out of the list', () => {
    render(<HoursDisplay hours={regularHours()} />);
    expect(screen.queryByText('Halloween')).toBeNull();
  });
});
