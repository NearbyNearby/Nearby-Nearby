import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { useForm } from '@mantine/form';
import RecurringEventSection from '../RecurringEventSection';

// ---------------------------------------------------------------------------
// jsdom does not implement ResizeObserver, which is required by Mantine's
// ScrollArea (used internally by Select's dropdown).  Polyfill it globally
// for this test file so renders with the Select component don't crash.
// ---------------------------------------------------------------------------
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// ---------------------------------------------------------------------------
// TestWrapper — wraps the component with a real Mantine form so the component
// can call form.setFieldValue, form.values, etc. without mocking the form API.
// ---------------------------------------------------------------------------

function TestWrapper({ initialValues = {} }) {
  const form = useForm({
    initialValues: {
      event: {
        is_repeating: false,
        repeat_pattern: null,
        excluded_dates: [],
        recurrence_end_date: null,
        manual_dates: [],
        start_datetime: new Date('2026-03-01T10:00:00'),
        ...initialValues,
      },
    },
  });

  return (
    <MantineProvider>
      <RecurringEventSection form={form} />
    </MantineProvider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // The preview lists upcoming dates only, so pin "today" before the fixtures'
  // March 2026 start dates. Only Date is faked; Mantine's timers stay real.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-02-15T12:00:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RecurringEventSection', () => {
  // -------------------------------------------------------------------------
  // 1. Toggle visibility
  // -------------------------------------------------------------------------

  it('renders the is_repeating toggle and it is off by default', () => {
    render(<TestWrapper />);

    // Mantine Switch renders with role="switch", not role="checkbox"
    const toggle = screen.getByRole('switch', { name: /repeating event/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle).not.toBeChecked();
  });

  // -------------------------------------------------------------------------
  // 2. Hidden fields when is_repeating is false
  // -------------------------------------------------------------------------

  it('does not show frequency, interval, or end date fields when is_repeating is false', () => {
    render(<TestWrapper />);

    expect(screen.queryByLabelText(/frequency/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/interval/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/recurrence end date/i)).not.toBeInTheDocument();
  });

  it('does not show the "Add Excluded Date" button when is_repeating is false', () => {
    render(<TestWrapper />);
    expect(screen.queryByRole('button', { name: /add excluded date/i })).not.toBeInTheDocument();
  });

  it('does not show the "Add Manual Date" button when is_repeating is false', () => {
    render(<TestWrapper />);
    expect(screen.queryByRole('button', { name: /add manual date/i })).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 3. Visible fields when is_repeating is true
  // -------------------------------------------------------------------------

  it('shows frequency, interval, and recurrence end date fields when is_repeating is true', () => {
    render(
      <TestWrapper
        initialValues={{
          is_repeating: true,
          repeat_pattern: { frequency: 'weekly', interval: 1, days_of_week: [] },
        }}
      />
    );

    // The Frequency Select label text is visible on the page
    expect(screen.getByText('Frequency')).toBeInTheDocument();
    // The Interval NumberInput label text is visible
    expect(screen.getByText('Interval')).toBeInTheDocument();
    // The Recurrence End Date label text is visible
    expect(screen.getByText('Recurrence End Date')).toBeInTheDocument();
  });

  it('shows the "Add Excluded Date" button when is_repeating is true', () => {
    render(
      <TestWrapper
        initialValues={{
          is_repeating: true,
          repeat_pattern: { frequency: 'weekly', interval: 1, days_of_week: [] },
        }}
      />
    );

    expect(screen.getByRole('button', { name: /add excluded date/i })).toBeInTheDocument();
  });

  it('shows the "Add Manual Date" button when is_repeating is true', () => {
    render(
      <TestWrapper
        initialValues={{
          is_repeating: true,
          repeat_pattern: { frequency: 'weekly', interval: 1, days_of_week: [] },
        }}
      />
    );

    expect(screen.getByRole('button', { name: /add manual date/i })).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 4. Day-of-week chips: weekly frequency
  // -------------------------------------------------------------------------

  it('shows day-of-week chips when frequency is "weekly"', () => {
    render(
      <TestWrapper
        initialValues={{
          is_repeating: true,
          repeat_pattern: { frequency: 'weekly', interval: 1, days_of_week: [] },
        }}
      />
    );

    // Each chip is rendered as a label or button containing the day abbreviation
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Tue')).toBeInTheDocument();
    expect(screen.getByText('Wed')).toBeInTheDocument();
    expect(screen.getByText('Thu')).toBeInTheDocument();
    expect(screen.getByText('Fri')).toBeInTheDocument();
    expect(screen.getByText('Sat')).toBeInTheDocument();
    expect(screen.getByText('Sun')).toBeInTheDocument();
  });

  it('shows day-of-week chips when frequency is "biweekly"', () => {
    render(
      <TestWrapper
        initialValues={{
          is_repeating: true,
          repeat_pattern: { frequency: 'biweekly', interval: 1, days_of_week: [] },
        }}
      />
    );

    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Sun')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 5. Day-of-week chips: non-weekly frequency
  // -------------------------------------------------------------------------

  it('does NOT show day-of-week chips when frequency is "daily"', () => {
    render(
      <TestWrapper
        initialValues={{
          is_repeating: true,
          repeat_pattern: { frequency: 'daily', interval: 1 },
        }}
      />
    );

    // "Days of the week" heading should not be present
    expect(screen.queryByText(/days of the week/i)).not.toBeInTheDocument();
    // Individual chip labels should also be absent
    expect(screen.queryByText('Mon')).not.toBeInTheDocument();
  });

  it('does NOT show day-of-week chips when frequency is "monthly"', () => {
    render(
      <TestWrapper
        initialValues={{
          is_repeating: true,
          repeat_pattern: { frequency: 'monthly', interval: 1 },
        }}
      />
    );

    expect(screen.queryByText(/days of the week/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Mon')).not.toBeInTheDocument();
  });

  it('does NOT show day-of-week chips when frequency is "yearly"', () => {
    render(
      <TestWrapper
        initialValues={{
          is_repeating: true,
          repeat_pattern: { frequency: 'yearly', interval: 1 },
        }}
      />
    );

    expect(screen.queryByText(/days of the week/i)).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 6. Preview panel
  // -------------------------------------------------------------------------

  it('shows "Next occurrences" heading in the preview panel when is_repeating is true', () => {
    render(
      <TestWrapper
        initialValues={{
          is_repeating: true,
          repeat_pattern: { frequency: 'weekly', interval: 1, days_of_week: ['Mon'] },
          start_datetime: new Date('2026-03-01T10:00:00'),
        }}
      />
    );

    expect(screen.getByText(/next occurrences/i)).toBeInTheDocument();
  });

  it('does NOT show the preview panel when is_repeating is false', () => {
    render(<TestWrapper />);
    expect(screen.queryByText(/next occurrences/i)).not.toBeInTheDocument();
  });

  it('preview panel shows a fallback message when no frequency is set', () => {
    render(
      <TestWrapper
        initialValues={{
          is_repeating: true,
          repeat_pattern: { interval: 1 },
          start_datetime: new Date('2026-03-01T10:00:00'),
        }}
      />
    );

    expect(screen.getByText(/select a frequency/i)).toBeInTheDocument();
  });

  it('preview panel shows occurrence dates when pattern is fully configured', () => {
    render(
      <TestWrapper
        initialValues={{
          is_repeating: true,
          // daily — easiest to assert: next 5 occurrences guaranteed
          repeat_pattern: { frequency: 'daily', interval: 1 },
          start_datetime: new Date('2026-03-01T10:00:00'),
        }}
      />
    );

    // Should render several date strings (locale-formatted); just confirm at
    // least one occurrence text appears alongside the heading.
    expect(screen.getByText(/next occurrences/i)).toBeInTheDocument();
    // At least one occurrence date text should be rendered
    const occurrenceTexts = screen.getAllByText(/2026/);
    expect(occurrenceTexts.length).toBeGreaterThan(0);
  });

  it('previews "Every 2 Weeks" as every other week', () => {
    render(
      <TestWrapper
        initialValues={{
          is_repeating: true,
          repeat_pattern: { frequency: 'biweekly', interval: 1, days_of_week: ['Tue'] },
          start_datetime: new Date('2026-03-03T10:00:00'), // a Tuesday
        }}
      />
    );

    expect(screen.getByText(/Mar 17, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Mar 31, 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/Mar 10, 2026/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Mar 24, 2026/)).not.toBeInTheDocument();
  });

  it('previews weekly with no days picked on the start weekday, honoring the interval', () => {
    render(
      <TestWrapper
        initialValues={{
          is_repeating: true,
          repeat_pattern: { frequency: 'weekly', interval: 2, days_of_week: [] },
          start_datetime: new Date('2026-03-03T10:00:00'), // a Tuesday
        }}
      />
    );

    expect(screen.getByText(/Mar 17, 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/Mar 4, 2026/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Mar 10, 2026/)).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 7. Upcoming dates (#186): all of them reachable, none from the past
  // -------------------------------------------------------------------------

  it('starts the preview at today for a series that began earlier', () => {
    vi.setSystemTime(new Date('2026-09-14T12:00:00')); // a Monday
    render(
      <TestWrapper
        initialValues={{
          is_repeating: true,
          repeat_pattern: { frequency: 'weekly', interval: 1, days_of_week: ['Thu'] },
          start_datetime: new Date('2026-05-07T17:00:00'), // a Thursday
        }}
      />
    );

    expect(screen.getByText(/Sep 17, 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/May 14, 2026/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sep 10, 2026/)).not.toBeInTheDocument();
  });

  it('still previews upcoming dates for a series that began over 5 years ago', () => {
    vi.setSystemTime(new Date('2026-09-14T12:00:00')); // a Monday
    render(
      <TestWrapper
        initialValues={{
          is_repeating: true,
          repeat_pattern: { frequency: 'weekly', interval: 1, days_of_week: ['Thu'] },
          start_datetime: new Date('2019-03-07T17:00:00'), // a Thursday
        }}
      />
    );

    expect(screen.getByText(/Sep 17, 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/no occurrences/i)).not.toBeInTheDocument();
  });

  it('shows 10 dates of an open-ended series, and "Show more dates" adds 10 more', () => {
    render(
      <TestWrapper
        initialValues={{
          is_repeating: true,
          repeat_pattern: { frequency: 'daily', interval: 1 },
          start_datetime: new Date('2026-03-01T10:00:00'),
        }}
      />
    );

    expect(screen.getByText(/Mar 10, 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/Mar 11, 2026/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show more dates/i }));

    expect(screen.getByText(/Mar 20, 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/Mar 21, 2026/)).not.toBeInTheDocument();
  });

  it('stops at the recurrence end date', () => {
    render(
      <TestWrapper
        initialValues={{
          is_repeating: true,
          repeat_pattern: { frequency: 'daily', interval: 1 },
          start_datetime: new Date('2026-03-01T10:00:00'),
          recurrence_end_date: '2026-03-04',
        }}
      />
    );

    expect(screen.getByText(/Mar 4, 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/Mar 5, 2026/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show more dates/i })).not.toBeInTheDocument();
  });
});
