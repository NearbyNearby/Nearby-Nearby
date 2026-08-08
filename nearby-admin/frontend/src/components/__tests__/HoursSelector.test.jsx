/**
 * Tests for HoursSelector — issues #46 (Seasonal Hours Only) and
 * #54 (Appointments subsection + auto-flip of hours_but_appointment_required).
 *
 * Verifies:
 *   - Quick-set buttons render at the TOP of the Regular Hours panel (#46).
 *   - The new "Set to Seasonal Hours Only" button toggles seasonal_only
 *     on the hours blob and switches to the Seasonal tab.
 *   - Clicking another quick-set preset clears seasonal_only (#46 exit path).
 *   - The Appointments subsection renders Switch + URL TextInput bound to
 *     the top-level POI fields hours_but_appointment_required +
 *     appointment_booking_url (#54).
 *   - Clicking "By Appointment Only" flips the boolean to true (#54).
 *   - The flag is NEVER auto-cleared by an unrelated hours edit (#118).
 *   - The "No Regular Hours" quick-set and its exit path (#118).
 *   - The Holidays tab lists all 20 holidays and writes mode + legacy status (#116).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { useForm } from '@mantine/form';
import HoursSelector from '../HoursSelector';

// jsdom does not implement ResizeObserver; Mantine's Tabs/FloatingIndicator
// uses it on mount. Provide a no-op mock.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Avoid notifications dependency in jsdom.
vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

function Wrapper({
  initialHours = {},
  initialAppointmentRequired = false,
  initialBookingUrl = '',
  onFormReady,
}) {
  const form = useForm({
    initialValues: {
      hours: initialHours,
      hours_but_appointment_required: initialAppointmentRequired,
      appointment_booking_url: initialBookingUrl,
    },
  });
  if (onFormReady) onFormReady(form);
  return (
    <MantineProvider>
      <HoursSelector
        value={form.values.hours || {}}
        onChange={(v) => form.setFieldValue('hours', v)}
        form={form}
      />
    </MantineProvider>
  );
}

describe('HoursSelector — quick-set buttons (#46)', () => {
  it('renders all 4 quick-set buttons including the new Seasonal Hours Only button', () => {
    render(<Wrapper />);
    expect(screen.getByRole('button', { name: /Set Mon-Fri/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Set 24\/7/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /By Appointment Only/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Set to Seasonal Hours Only/i })).toBeTruthy();
  });

  it('clicking "Set to Seasonal Hours Only" sets seasonal_only=true and switches to Seasonal tab', () => {
    let capturedForm;
    render(<Wrapper onFormReady={(f) => (capturedForm = f)} />);
    fireEvent.click(screen.getByRole('button', { name: /Set to Seasonal Hours Only/i }));
    expect(capturedForm.values.hours.seasonal_only).toBe(true);
    // Required alert appears in the seasonal panel
    expect(screen.getByText(/Seasonal Hours Required/i)).toBeTruthy();
  });

  it('clicking "Set Mon-Fri" while seasonal-only resets seasonal_only=false', () => {
    let capturedForm;
    render(
      <Wrapper
        initialHours={{ seasonal_only: true }}
        onFormReady={(f) => (capturedForm = f)}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Set Mon-Fri/i }));
    expect(capturedForm.values.hours.seasonal_only).toBe(false);
  });

  it('clicking "Clear Seasonal-Only Mode" link clears the flag', () => {
    let capturedForm;
    render(
      <Wrapper
        initialHours={{ seasonal_only: true }}
        onFormReady={(f) => (capturedForm = f)}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Clear Seasonal-Only Mode/i }));
    expect(capturedForm.values.hours.seasonal_only).toBe(false);
  });
});

describe('HoursSelector — Appointments subsection (#54)', () => {
  it('renders the "Appointments required" Switch bound to hours_but_appointment_required', () => {
    let capturedForm;
    render(<Wrapper onFormReady={(f) => (capturedForm = f)} />);
    const switchInput = screen.getByLabelText(/Appointments required/i);
    expect(switchInput).toBeTruthy();
    fireEvent.click(switchInput);
    expect(capturedForm.values.hours_but_appointment_required).toBe(true);
  });

  it('renders the Appointment Booking URL TextInput bound to appointment_booking_url', () => {
    let capturedForm;
    render(<Wrapper onFormReady={(f) => (capturedForm = f)} />);
    const urlInput = screen.getByLabelText(/Appointment Booking URL/i);
    expect(urlInput).toBeTruthy();
    fireEvent.change(urlInput, { target: { value: 'https://calendly.com/test' } });
    expect(capturedForm.values.appointment_booking_url).toBe('https://calendly.com/test');
  });

  it('clicking "By Appointment Only" sets hours_but_appointment_required=true', () => {
    let capturedForm;
    render(<Wrapper onFormReady={(f) => (capturedForm = f)} />);
    expect(capturedForm.values.hours_but_appointment_required).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /By Appointment Only/i }));
    expect(capturedForm.values.hours_but_appointment_required).toBe(true);
  });

  it('keeps the flag set when an unrelated regular-hours edit happens (#118)', () => {
    // A law firm open Mon-Fri that only sees clients by appointment must not
    // lose the flag just because someone re-applied the Mon-Fri preset.
    let capturedForm;
    render(
      <Wrapper
        initialAppointmentRequired={true}
        onFormReady={(f) => (capturedForm = f)}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Set Mon-Fri/i }));
    expect(capturedForm.values.hours_but_appointment_required).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Set 24\/7/i }));
    expect(capturedForm.values.hours_but_appointment_required).toBe(true);
  });

  it('preserves appointment_booking_url even after the Appointments toggle is turned off', () => {
    let capturedForm;
    render(
      <Wrapper
        initialAppointmentRequired={true}
        initialBookingUrl="https://example.com/book"
        onFormReady={(f) => (capturedForm = f)}
      />
    );
    const switchInput = screen.getByLabelText(/Appointments required/i);
    fireEvent.click(switchInput);
    // Switch is now off, URL must remain untouched
    expect(capturedForm.values.hours_but_appointment_required).toBe(false);
    expect(capturedForm.values.appointment_booking_url).toBe('https://example.com/book');
  });
});

describe('HoursSelector: No Regular Hours (#118)', () => {
  it('renders the 5th quick-set button and sets the flag', () => {
    let capturedForm;
    render(<Wrapper onFormReady={(f) => (capturedForm = f)} />);
    fireEvent.click(screen.getByRole('button', { name: /^No Regular Hours$/i }));
    expect(capturedForm.values.hours.no_regular_hours).toBe(true);
    expect(capturedForm.values.hours.seasonal_only).toBe(false);
  });

  it('disables the seven day cards while the flag is set', () => {
    const { container } = render(<Wrapper initialHours={{ no_regular_hours: true }} />);
    expect(container.querySelectorAll('[aria-disabled="true"]').length).toBeGreaterThanOrEqual(7);
  });

  it('offers an exit path that clears the flag', () => {
    let capturedForm;
    render(
      <Wrapper
        initialHours={{ no_regular_hours: true }}
        onFormReady={(f) => (capturedForm = f)}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Clear No-Regular-Hours Mode/i }));
    expect(capturedForm.values.hours.no_regular_hours).toBe(false);
  });

  it('is mutually exclusive with seasonal-only (P4)', () => {
    let capturedForm;
    render(
      <Wrapper
        initialHours={{ no_regular_hours: true }}
        onFormReady={(f) => (capturedForm = f)}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Set to Seasonal Hours Only/i }));
    expect(capturedForm.values.hours.seasonal_only).toBe(true);
    expect(capturedForm.values.hours.no_regular_hours).toBe(false);
  });
});

describe('HoursSelector: Holidays tab (#116)', () => {
  // Inactive Mantine tab panels stay mounted but display:none, which hides them
  // from role queries. Activate the tab before reaching for controls.
  function renderHolidaysTab(props = {}) {
    const utils = render(<Wrapper {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: /Holiday Hours/i }));
    return utils;
  }

  const HOLIDAY_LABELS = [
    "New Year's Day", 'Martin Luther King Jr. Day', "Presidents' Day", 'Memorial Day',
    'Juneteenth', 'Independence Day', 'Labor Day', 'Columbus Day', 'Veterans Day',
    'Thanksgiving', 'Black Friday', 'Christmas Eve', 'Christmas Day', "New Year's Eve",
    'Easter Sunday', 'Good Friday', "Mother's Day", "Father's Day", 'Halloween',
    "Valentine's Day",
  ];

  it('renders a card for all 20 holidays without adding them one at a time', () => {
    render(<Wrapper />);
    for (const label of HOLIDAY_LABELS) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('defaults every holiday to Not confirmed and writes nothing', () => {
    let capturedForm;
    renderHolidaysTab({ onFormReady: (f) => (capturedForm = f) });
    expect(capturedForm.values.hours.holidays).toBeUndefined();
    const christmasCard = screen.getByText('Christmas Day').closest('.mantine-Card-root');
    expect(within(christmasCard).getByRole('radio', { name: 'Not confirmed' }).checked).toBe(true);
  });

  it('writes BOTH the new mode and the legacy status mirror', () => {
    let capturedForm;
    renderHolidaysTab({ onFormReady: (f) => (capturedForm = f) });
    const christmasCard = screen.getByText('Christmas Day').closest('.mantine-Card-root');
    fireEvent.click(within(christmasCard).getByRole('radio', { name: 'Closed' }));

    const entry = capturedForm.values.hours.holidays.christmas;
    expect(entry.mode).toBe('closed');
    expect(entry.status).toBe('closed');
    expect(entry.name).toBe('Christmas Day');
    expect(entry.date).toBe('12-25');
  });

  it('maps "Follows regular hours" onto the legacy open status', () => {
    let capturedForm;
    renderHolidaysTab({ onFormReady: (f) => (capturedForm = f) });
    const card = screen.getByText('Independence Day').closest('.mantine-Card-root');
    fireEvent.click(within(card).getByRole('radio', { name: 'Follows regular hours' }));

    const entry = capturedForm.values.hours.holidays.independence_day;
    expect(entry.mode).toBe('follows_regular');
    expect(entry.status).toBe('open');
  });

  it('reads a legacy status-only entry back as Follows regular hours', () => {
    renderHolidaysTab({
      initialHours: { holidays: { christmas: { name: 'Christmas Day', date: '12-25', status: 'open' } } },
    });
    const card = screen.getByText('Christmas Day').closest('.mantine-Card-root');
    expect(within(card).getByRole('radio', { name: 'Follows regular hours' }).checked).toBe(true);
  });

  it('"Not confirmed" deletes the entry rather than writing a stub', () => {
    let capturedForm;
    renderHolidaysTab({
      initialHours: { holidays: { christmas: { name: 'Christmas Day', date: '12-25', mode: 'closed', status: 'closed' } } },
      onFormReady: (f) => (capturedForm = f),
    });
    const card = screen.getByText('Christmas Day').closest('.mantine-Card-root');
    fireEvent.click(within(card).getByRole('radio', { name: 'Not confirmed' }));
    expect(capturedForm.values.hours.holidays.christmas).toBeUndefined();
  });

  it('stores a visitor-facing note', () => {
    let capturedForm;
    renderHolidaysTab({
      initialHours: { holidays: { christmas: { name: 'Christmas Day', date: '12-25', mode: 'closed', status: 'closed' } } },
      onFormReady: (f) => (capturedForm = f),
    });
    const card = screen.getByText('Christmas Day').closest('.mantine-Card-root');
    fireEvent.change(within(card).getByLabelText(/Note shown to visitors/i), {
      target: { value: 'Reopens December 26' },
    });
    expect(capturedForm.values.hours.holidays.christmas.note).toBe('Reopens December 26');
  });

  it('bulk-sets every holiday to Follows regular hours, and Clear all empties them', () => {
    let capturedForm;
    renderHolidaysTab({ onFormReady: (f) => (capturedForm = f) });
    fireEvent.click(screen.getByRole('button', { name: /Set all to Follows regular hours/i }));
    expect(Object.keys(capturedForm.values.hours.holidays).length).toBe(20);
    expect(capturedForm.values.hours.holidays.halloween.mode).toBe('follows_regular');

    fireEvent.click(screen.getByRole('button', { name: /Clear all/i }));
    expect(capturedForm.values.hours.holidays).toEqual({});
  });
});
