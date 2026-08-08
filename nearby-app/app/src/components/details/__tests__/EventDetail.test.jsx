import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EventDetail from '../EventDetail';

// Mock child components that pull in heavy deps (Leaflet, etc.)
vi.mock('../EventStatusBanner', () => ({
  default: function MockBanner({ eventStatus }) {
    return eventStatus !== 'Scheduled' ? (
      <div data-testid="event-status-banner">{eventStatus}</div>
    ) : null;
  },
}));

vi.mock('../../nearby-feature/NearbySection', () => ({
  default: function MockNearby() {
    return <div data-testid="nearby-section" />;
  },
}));

vi.mock('../../seo/index', () => ({
  EventJsonLd: function MockJsonLd() {
    return null;
  },
}));

// Keep real MemoryRouter but mock useNavigate to avoid side-effects
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

// Mock DOMPurify so tests don't need a real DOM sanitizer
vi.mock('dompurify', () => ({
  default: {
    sanitize: (html) => html,
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Always-future so scheduled-event fixtures never age into the past. Any
// assertion on formatted date text is derived from this same constant.
const NEXT_JUNE = `${new Date().getFullYear() + 1}-06-01`;

function buildPoi(overrides = {}) {
  // Pull `event` out so the top-level spread of the remaining overrides can't
  // clobber the merged event object (which would drop the default start/end dates).
  const { event: eventOverrides, ...rest } = overrides;
  return {
    id: 'test-id',
    name: 'Test Event',
    poi_type: 'EVENT',
    status: 'Fully Open',
    location: { type: 'Point', coordinates: [-79.1, 35.7] },
    ...rest,
    event: {
      start_datetime: `${NEXT_JUNE}T10:00:00`,
      end_datetime: `${NEXT_JUNE}T18:00:00`,
      event_status: 'Scheduled',
      organizer_name: 'Test Org',
      ...eventOverrides,
    },
  };
}

function renderDetail(poiOverrides = {}) {
  const poi = buildPoi(poiOverrides);
  return render(
    <MemoryRouter>
      <EventDetail poi={poi} />
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EventDetail', () => {
  beforeEach(() => {
    // Reset clipboard / share mocks between tests
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });

  // --- B1: Status Banner ---

  it('canceled event shows status banner', () => {
    renderDetail({ event: { event_status: 'Canceled' } });
    expect(screen.getByTestId('event-status-banner')).toBeInTheDocument();
    expect(screen.getByTestId('event-status-banner')).toHaveTextContent('Canceled');
  });

  it('scheduled event does NOT show status banner', () => {
    renderDetail({ event: { event_status: 'Scheduled' } });
    expect(screen.queryByTestId('event-status-banner')).not.toBeInTheDocument();
  });

  it('uses event.event_status field to determine banner', () => {
    renderDetail({ event: { event_status: 'Postponed' } });
    const banner = screen.getByTestId('event-status-banner');
    expect(banner).toHaveTextContent('Postponed');
  });

  it('event status comes from event.event_status, not poi.status', () => {
    // The status banner is driven by event.event_status; poi.status ("Fully Open")
    // is the separate operational status and must not stand in as the event status.
    renderDetail({ status: 'Fully Open', event: { event_status: 'Postponed' } });
    const banner = screen.getByTestId('event-status-banner');
    expect(banner).toHaveTextContent('Postponed');
    expect(banner).not.toHaveTextContent('Fully Open');
  });

  // --- B1: Canceled event presentation ---

  it('canceled event shows the cancellation paragraph', () => {
    renderDetail({
      event: { event_status: 'Canceled', cancellation_paragraph: 'This event has been canceled.' },
    });
    // Canceled events surface the organizer's cancellation note (in the header
    // subtitle and again inside the About + Details accordion panel).
    const notes = screen.getAllByText('This event has been canceled.', { hidden: true });
    expect(notes.length).toBeGreaterThan(0);
  });

  it('does not render the quick-info photos box', () => {
    renderDetail({ event: { event_status: 'Canceled' } });
    // hidden per the POI Accordion show/hide doc: QuickInfoPhotosBox renders null,
    // so the old quick-info rows (Cost/Pets/Best For) and date box never appear.
    expect(document.getElementById('poi_quick_info_photos_box')).toBeNull();
  });

  it('scheduled event shows the formatted date/time line in the header', () => {
    renderDetail({ event: { event_status: 'Scheduled' } });
    // formatEventDateTime renders as the header main-category (e.g. "Jun 1st • 10am-6pm").
    const dateLine = document.querySelector('.poi_page_main_category');
    expect(dateLine).toBeInTheDocument();
    expect(dateLine).toHaveTextContent('10am-6pm');
    expect(dateLine).toHaveTextContent('Jun');
  });

  // --- #141: a repeating event shows the CURRENT occurrence, not the first ---

  describe('repeating events', () => {
    // Saturday 2026-08-08, so the next Sunday occurrence is 2026-08-09.
    const NOW = new Date(2026, 7, 8, 12, 0, 0);
    const weeklySince2023 = {
      event_status: 'Scheduled',
      is_repeating: true,
      repeat_pattern: { frequency: 'weekly', interval: 1 },
      recurrence_end_date: null,
      start_datetime: '2023-07-02T15:00:00', // a Sunday, years in the past
      end_datetime: '2023-07-02T18:00:00',
    };

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('header shows the upcoming occurrence, not the series start', () => {
      renderDetail({ event: weeklySince2023 });
      const dateLine = document.querySelector('.poi_page_main_category');
      expect(dateLine).toBeInTheDocument();
      expect(dateLine).toHaveTextContent('Aug 9th');
      expect(dateLine).toHaveTextContent('3pm-6pm');
      expect(dateLine).not.toHaveTextContent('Jul 2nd');
    });

    it('is not labelled "Ended" just because the series started long ago', () => {
      renderDetail({ event: weeklySince2023 });
      expect(screen.queryByText('Ended', { hidden: true })).not.toBeInTheDocument();
    });
  });

  // --- B2: Cost renders as an InfoRow inside About + Details ---

  it('renders a "Free" cost row and still no COST & TICKETS accordion', () => {
    renderDetail({ event: { cost_type: 'free' } });
    // Cost lives as an InfoRow in About + Details (the old COST & TICKETS
    // accordion stays gone).
    expect(screen.queryByRole('button', { name: /cost & tickets/i, hidden: true })).not.toBeInTheDocument();
    expect(screen.getByText('Free', { hidden: true })).toBeInTheDocument();
  });

  it('renders a single price as $N in the cost row', () => {
    renderDetail({ event: { cost_type: 'single_price', price: 25 } });
    expect(screen.getByText('$25', { hidden: true })).toBeInTheDocument();
  });

  it('renders a cost range as $min - $max in the cost row', () => {
    renderDetail({ event: { cost_type: 'range', cost_min: 10, cost_max: 40 } });
    expect(screen.getByText('$10 - $40', { hidden: true })).toBeInTheDocument();
  });

  it('renders a single ticket link as a clickable GET TICKETS anchor', () => {
    renderDetail({
      event: { ticket_links: [{ platform: 'Eventbrite', url: 'https://tickets.example.com' }] },
    });
    // ticket_links (array of {platform, url}) replaced the old singular ticket_link;
    // a single link renders a GET TICKETS header button as an anchor.
    const link = screen.getByRole('link', { name: /get tickets/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://tickets.example.com');
  });

  it('does not render COST & TICKETS section when no cost data exists', () => {
    renderDetail({ event: {} });
    expect(screen.queryByRole('button', { name: /cost & tickets/i })).not.toBeInTheDocument();
  });

  // --- B2: EVENT DETAILS section with organizer info ---

  it('shows organizer name in EVENT DETAILS section', () => {
    renderDetail({ event: { organizer_name: 'Amazing Org' } });
    expect(screen.getByText('Amazing Org')).toBeInTheDocument();
  });

  it('shows organizer email in EVENT DETAILS when provided', () => {
    renderDetail({ event: { organizer_name: 'Org', organizer_email: 'org@example.com' } });
    expect(screen.getByText('org@example.com')).toBeInTheDocument();
  });

  it('shows organizer phone in EVENT DETAILS when provided', () => {
    renderDetail({ event: { organizer_name: 'Org', organizer_phone: '555-1234' } });
    expect(screen.getByText('555-1234')).toBeInTheDocument();
  });

  // --- B2: Venue link ---

  it('venue name links to the venue POI when venue_poi_id exists', () => {
    renderDetail({
      event: { venue_name: 'Grand Hall', venue_poi_id: 'venue-abc-123' },
    });
    // The Venue InfoRow links to the venue POI page; the header venue line
    // stays plain text so there is exactly one link.
    const venueLink = screen.getByRole('link', { name: /grand hall/i, hidden: true });
    expect(venueLink).toHaveAttribute('href', '/poi/venue-abc-123');
  });

  it('venue name shows as plain text when no venue_poi_id', () => {
    renderDetail({
      event: {
        venue_name: 'Local Park',
        venue_poi_id: null,
      },
    });
    // The text is in the hidden accordion panel
    const allLocalPark = screen.getAllByText('Local Park', { hidden: true });
    expect(allLocalPark.length).toBeGreaterThan(0);
    // None of them should be a link
    expect(screen.queryByRole('link', { name: /local park/i, hidden: true })).not.toBeInTheDocument();
  });

  // --- B2: Description HTML rendering ---

  it('renders description_long as HTML inside the About + Details accordion', () => {
    renderDetail({ description_long: '<strong>Bold text</strong> in description.' });
    // The old .poi-detail__description-box is gone; long description now renders as
    // sanitized HTML in the About + Details accordion (closed on load, still in DOM).
    const strong = document.querySelector('.poi_description strong');
    expect(strong).toBeInTheDocument();
    expect(strong).toHaveTextContent('Bold text');
  });

  // --- #30: Rich-text fields rendered via dangerouslySetInnerHTML ---

  it('renders pet_policy as HTML (not escaped text)', () => {
    renderDetail({ pet_options: ['Dogs'], pet_policy: '<p>Dogs on leash only.</p>' });
    // The <p> tag should be rendered as a DOM element, not shown as literal text
    expect(screen.queryByText('<p>Dogs on leash only.</p>')).not.toBeInTheDocument();
    expect(screen.getByText('Dogs on leash only.')).toBeInTheDocument();
  });

  it('does not render drone policy (Drone accordion hidden per doc)', () => {
    renderDetail({ drone_usage: ['Allowed'], drone_policy: '<p>FAA rules apply.</p>' });
    // hidden per the POI Accordion show/hide doc: events drop the Drone Policy accordion.
    expect(screen.queryByText('FAA rules apply.')).not.toBeInTheDocument();
  });

  it('does not render rental info (Rentals accordion hidden per doc)', () => {
    renderDetail({ available_for_rent: true, rental_info: '<p>Contact us to book.</p>' });
    // hidden per the POI Accordion show/hide doc: events drop the Rentals accordion.
    expect(screen.queryByText('Contact us to book.')).not.toBeInTheDocument();
  });

  it('does not render community impact (Locally Found accordion hidden per doc)', () => {
    renderDetail({ community_impact: '<p>Supports local charities.</p>' });
    // hidden per the POI Accordion show/hide doc: events drop the Locally Found + History accordion.
    expect(screen.queryByText('Supports local charities.')).not.toBeInTheDocument();
  });

  // --- General rendering ---

  it('renders the event name as the main title', () => {
    renderDetail({ name: 'Summer Festival 2026' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Summer Festival 2026');
  });

  it('renders NearbySection', () => {
    renderDetail();
    expect(screen.getByTestId('nearby-section')).toBeInTheDocument();
  });

  it('does not render description_short as subtitle', () => {
    renderDetail({ description_short: 'A great outdoor event.' });
    // hidden per the POI Accordion show/hide doc: description_short only fed the
    // stubbed QuickInfoPhotosBox, so the subtitle no longer appears.
    expect(screen.queryByText('A great outdoor event.')).not.toBeInTheDocument();
  });

  it('renders the venue address in the Venue Address + Parking accordion', () => {
    renderDetail({
      event: {
        venue_address_street: '123 Main St',
        venue_address_city: 'Pittsboro',
        venue_address_state: 'NC',
      },
    });
    // Event address comes from the event.venue_address_* snapshot fields (top-level
    // poi.address_street is no longer read here). Panel is closed but in the DOM.
    const addr = screen.getByText(/123 Main St/, { hidden: true });
    expect(addr).toBeInTheDocument();
  });

  // --- Accordion group: first section opens on load, single-open thereafter ---

  it('opens the first accordion on load and keeps the rest closed', () => {
    renderDetail({ pet_options: ['Dogs'] });
    // Default fixture has organizer info, so About + Details is the first
    // visible section and claims the initial open slot.
    const about = screen.getByRole('button', { name: /about \+ details/i });
    const pets = screen.getByRole('button', { name: /pet policy/i, hidden: true });
    expect(about).toHaveAttribute('aria-expanded', 'true');
    expect(pets).toHaveAttribute('aria-expanded', 'false');
  });

  it('opening another accordion closes the initially open one', () => {
    renderDetail({ pet_options: ['Dogs'] });
    const about = screen.getByRole('button', { name: /about \+ details/i });
    const pets = screen.getByRole('button', { name: /pet policy/i, hidden: true });
    fireEvent.click(pets);
    expect(pets).toHaveAttribute('aria-expanded', 'true');
    expect(about).toHaveAttribute('aria-expanded', 'false');
  });
});
