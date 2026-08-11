import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

    it('lists the upcoming occurrence dates in About + Details (#142 item 11)', () => {
      renderDetail({ event: weeklySince2023 });
      const panel = document.getElementById('acc_panel_about_details');
      expect(panel).toHaveTextContent('Upcoming Dates');
      const chips = panel.querySelectorAll('.ed-date-chip');
      expect(chips.length).toBe(5);
      expect(chips[0].textContent).toContain('Aug 16th');
      // A recurring series is ONE listing, so the dates are not links.
      expect(chips[0].querySelector('a')).toBeNull();
    });

    it('renders without crashing once the series is past its recurrence_end_date', () => {
      // getNextOccurrence returns null here, so the Date/Time rows drop out.
      // Locking in no-crash plus the Ended badge; the missing rows are a known
      // gap, not something this change redesigns.
      renderDetail({ event: { ...weeklySince2023, recurrence_end_date: '2024-01-01' } });
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Test Event');
      expect(document.querySelector('.ed-ended-badge')).toHaveTextContent('Ended');
    });

    it('offers a recurring-event note that opens About + Details (#142 item 4)', () => {
      renderDetail({ event: weeklySince2023 });
      const note = screen.getByRole('button', { name: /recurring event/i });
      const about = screen.getByRole('button', { name: /about \+ details/i });
      fireEvent.click(about); // close the initially open section
      expect(about).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(note);
      expect(about).toHaveAttribute('aria-expanded', 'true');
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

  it('renders a zero poi.cost as "Free", never the literal "0"', () => {
    // The seeded farmers market stores cost: "0" with no event.cost_type, which
    // used to fall through and print a bare "0" (#142 follow-up).
    renderDetail({ cost: '0' });
    const col2 = document.querySelector('#acc_panel_about_details .acc_col_2');
    expect(col2).toHaveTextContent('Free');
    expect(col2.textContent).not.toContain('Cost0');
  });

  it('renders a zero poi.cost written as "0.00" as "Free"', () => {
    renderDetail({ cost: '0.00' });
    expect(document.querySelector('#acc_panel_about_details .acc_col_2')).toHaveTextContent('Free');
  });

  it('still passes a real poi.cost amount through untouched', () => {
    renderDetail({ cost: '$15' });
    expect(document.querySelector('#acc_panel_about_details .acc_col_2')).toHaveTextContent('$15');
  });

  it('renders a single ticket link as a clickable GET TICKETS anchor', () => {
    renderDetail({
      event: { ticket_links: [{ platform: 'Eventbrite', url: 'https://tickets.example.com' }] },
    });
    // ticket_links (array of {platform, url}) replaced the old singular ticket_link.
    // #142 item 11 adds a second copy inside the Cost group, so both the header
    // button and the accordion button point at the same URL.
    const links = screen.getAllByRole('link', { name: /get tickets/i, hidden: true });
    expect(links.length).toBe(2);
    links.forEach((l) => expect(l).toHaveAttribute('href', 'https://tickets.example.com'));
  });

  it('does not render COST & TICKETS section when no cost data exists', () => {
    renderDetail({ event: {} });
    expect(screen.queryByRole('button', { name: /cost & tickets/i })).not.toBeInTheDocument();
  });

  // --- #142 item 16: organizer info lives in the Contact accordion ---

  it('shows organizer name in the Contact accordion', () => {
    renderDetail({ event: { organizer_name: 'Amazing Org' } });
    const contact = document.getElementById('poi_acc_contact');
    expect(contact).toBeInTheDocument();
    expect(contact).toHaveTextContent('Amazing Org');
  });

  it('shows organizer email in Contact when provided', () => {
    renderDetail({ event: { organizer_name: 'Org', organizer_email: 'org@example.com' } });
    expect(document.getElementById('poi_acc_contact')).toHaveTextContent('org@example.com');
  });

  it('shows organizer phone in Contact when provided', () => {
    renderDetail({ event: { organizer_name: 'Org', organizer_phone: '555-1234' } });
    expect(document.getElementById('poi_acc_contact')).toHaveTextContent('555-1234');
  });

  it('does not repeat the organizer inside About + Details', () => {
    // #142 item 10: Organizer (and Repeats) were removed from About + Details.
    renderDetail({ event: { organizer_name: 'Amazing Org' } });
    expect(document.getElementById('poi_acc_about_details')).not.toHaveTextContent('Amazing Org');
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

  it('renders the venue from the real API shape: only venue_poi_id + venue_name (#124)', () => {
    // API contract case. The public payload has no venue_name_snapshot and no
    // nested venue object; the backend resolves the linked venue's name live
    // into event.venue_name. Before #124 nothing populated any of the three
    // sources, so the venue never rendered and the link was dead code.
    renderDetail({
      event: {
        venue_poi_id: '3f0c2a1e-0000-4000-8000-000000000001',
        venue_name: 'Carolina Brewery',
        venue_type: 'BUSINESS',
        venue_inheritance: { parking: 'as_is' },
      },
    });
    const venueLink = screen.getByRole('link', { name: /carolina brewery/i, hidden: true });
    expect(venueLink).toHaveAttribute(
      'href',
      '/poi/3f0c2a1e-0000-4000-8000-000000000001',
    );
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
      address_street: '123 Main St',
      address_city: 'Pittsboro',
      address_state: 'NC',
    });
    // #142 item 12: the address comes from the POI's own address columns. When
    // the event links to a venue with address inheritance the backend has
    // already resolved the venue's address into them (#124); there are no
    // event.venue_address_* fields in the public payload.
    const addr = screen.getByText(/123 Main St/, { hidden: true });
    expect(addr).toBeInTheDocument();
  });

  // --- #142: Rhonda's Event page punch list ---

  describe('#142 punch list', () => {
    it('never renders a featured image at the top of the page', () => {
      // item 1
      renderDetail({
        featured_image: 'https://example.com/hero.jpg',
        images: [{ id: 'i1', url: 'https://example.com/hero.jpg', thumbnail_url: 'https://example.com/t.jpg' }],
      });
      expect(document.getElementById('poi_quick_info_photos_box')).toBeNull();
      expect(document.querySelectorAll('img').length).toBe(0);
    });

    it('hides the admin status and status message block', () => {
      // item 2: EventStatusBanner is the event's status treatment.
      renderDetail({ status: 'Fully Open', status_message: 'Doors open at noon.' });
      expect(document.querySelector('.poi_status')).toBeNull();
      expect(screen.queryByText('Doors open at noon.')).not.toBeInTheDocument();
    });

    it('shows the venue name directly under the date line', () => {
      // item 3
      renderDetail({ event: { venue_name: 'Grand Hall' } });
      const main = document.querySelector('.poi_page_main_category');
      const venue = document.querySelector('.ed-venue-line');
      expect(venue).toHaveTextContent('Grand Hall');
      expect(main.compareDocumentPosition(venue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('puts the ENDED badge behind the date for a past event', () => {
      // item 3: "Ended" moved out of the status block and behind the date.
      renderDetail({ event: { start_datetime: '2020-06-01T10:00:00', end_datetime: '2020-06-01T18:00:00' } });
      expect(document.querySelector('.poi_page_main_category .ed-ended-badge')).toHaveTextContent('Ended');
    });

    it('does not show the ENDED badge for an upcoming event', () => {
      renderDetail();
      expect(document.querySelector('.ed-ended-badge')).toBeNull();
    });

    it('drops the "show all hours" toggle even when the POI carries hours', () => {
      // item 4
      renderDetail({ hours: { monday: [{ open: '09:00', close: '17:00' }] } });
      expect(document.getElementById('poi_page_hours_toggle')).toBeNull();
    });

    it('does not offer the recurring-event note for a one-off event', () => {
      renderDetail();
      expect(screen.queryByRole('button', { name: /recurring event/i })).not.toBeInTheDocument();
    });

    it('flashes "Copied!" on the header Lat + Long button', async () => {
      // item 5: the header button used to copy silently on every POI page.
      Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      renderDetail();
      const buttons = screen.getAllByRole('button', { name: /lat \+ long/i, hidden: true });
      fireEvent.click(buttons[0]);
      expect(await screen.findByText('Copied!')).toBeInTheDocument();
      expect(writeText).toHaveBeenCalledWith('35.7, -79.1');
    });

    it('does not flash "Copied!" when the copy fails', async () => {
      // The clipboard write rejects and the execCommand fallback is unavailable,
      // so copyToClipboard reports false and the button has to stay silent.
      Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
      const writeText = vi.fn().mockRejectedValue(new Error('denied'));
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      document.execCommand = vi.fn(() => { throw new Error('unavailable'); });

      renderDetail();
      const buttons = screen.getAllByRole('button', { name: /lat \+ long/i, hidden: true });
      fireEvent.click(buttons[0]);
      await waitFor(() => expect(writeText).toHaveBeenCalled());
      expect(screen.queryByText('Copied!')).not.toBeInTheDocument();
      delete document.execCommand;
    });

    it('flashes "Copied!" on the accordion Lat + Long button', async () => {
      Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true,
      });
      renderDetail();
      const buttons = screen.getAllByRole('button', { name: /lat \+ long/i, hidden: true });
      fireEvent.click(buttons[buttons.length - 1]);
      expect(await screen.findByText('Copied!')).toBeInTheDocument();
    });

    it('renders About + Details as two columns', () => {
      // item 7
      renderDetail({ description_long: 'About this event.' });
      const panel = document.getElementById('acc_panel_about_details');
      expect(panel).toHaveClass('column_grid_5050');
      expect(panel.querySelector('.acc_col_1')).toHaveTextContent('About this event.');
      expect(panel.querySelector('.acc_col_2')).toHaveTextContent('Date');
    });

    it('keeps the teaser paragraph out of About + Details', () => {
      // item 8
      renderDetail({ teaser_paragraph: 'Teaser copy here.', description_long: 'Long copy.' });
      expect(document.getElementById('poi_acc_about_details')).not.toHaveTextContent('Teaser copy here.');
    });

    it('renders Categories and Ideal For as links', () => {
      // item 9
      renderDetail({
        categories: [{ id: 'c1', name: 'Music', slug: 'music' }],
        ideal_for: { atmosphere: ['Family Friendly'] },
      });
      expect(screen.getByRole('link', { name: 'Music', hidden: true }).getAttribute('href'))
        .toContain('category=music');
      expect(screen.getByRole('link', { name: 'Family Friendly', hidden: true }).getAttribute('href'))
        .toContain('/explore?q=');
    });

    it('shows Date, Time and Wifi rows in the second column', () => {
      // item 11
      renderDetail({ wifi_options: ['Free Public WiFi'] });
      const col2 = document.querySelector('#acc_panel_about_details .acc_col_2');
      expect(col2).toHaveTextContent('Date');
      expect(col2).toHaveTextContent('Time');
      expect(col2).toHaveTextContent('Wifi');
      expect(col2).toHaveTextContent('Free Public WiFi');
    });

    it('renders the Public Restrooms and Playground accordions', () => {
      // items 13 and 15
      renderDetail({ public_toilets: ['Portable'], playground_types: ['Swings'] });
      expect(screen.getByRole('button', { name: /public restrooms/i, hidden: true })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /playground/i, hidden: true })).toBeInTheDocument();
    });

    it('renders the bottom notice as an on-brand note card', () => {
      // item 17
      renderDetail();
      const notice = document.querySelector('.ed-disclaimer');
      expect(notice.tagName).toBe('ASIDE');
      expect(notice.querySelector('.ed-disclaimer__title')).toHaveTextContent('Before You Go');
    });
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
