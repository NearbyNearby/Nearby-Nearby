# App Frontend (nearby-app)

## Overview

The user-facing frontend is a React application built with Vite. It provides search, discovery, and POI detail viewing for public users.

**Tech Stack:**
- React 19
- Vite (build tool)
- React Router v7 (navigation)
- React-Leaflet (maps)
- FullCalendar (events calendar views)
- DOMPurify (HTML sanitization for rich descriptions)
- @sentry/react (error tracking)
- lucide-react (icons)
- Vitest + React Testing Library (frontend tests)
- Custom CSS (no UI framework)

**Key Directories:**
```
nearby-app/app/src/
├── components/           # Reusable components
│   ├── common/           # Shared components (HoursDisplay, etc.)
│   ├── details/          # POI detail components (BusinessDetail, EventDetail, ParkDetail, TrailDetail, GenericDetail, SuggestEditOverlay, EventStatusBanner, EventSponsors, EventVendors, ContactOrganizerModal, PhotoLightbox)
│   ├── nearby-feature/   # Nearby feature components
│   ├── seo/              # SEO components
│   ├── Accordion.jsx     # Shared accordion with slide animation + hash deep-linking
│   ├── ErrorBoundary.jsx # Sentry-integrated React error boundary
│   ├── MobileNavBar.jsx  # Mobile bottom navigation
│   ├── AnnouncementBanner.jsx  # Top announcement bar
│   ├── SearchOverlay.jsx # Full-screen search overlay
│   ├── Overlay.jsx       # Backdrop overlay component
│   └── NNLogo.jsx        # Logo component
├── pages/                # Page components
│   ├── Home.jsx
│   ├── Explore.jsx       # Browse + map/list layout with search and controls
│   ├── POIDetail.jsx     # Smart router to type-specific detail
│   ├── EventsCalendar.jsx # FullCalendar month/week/day/list view
│   ├── CommunityInterest.jsx  # Community interest form
│   ├── Contact.jsx       # Contact form
│   ├── Feedback.jsx      # Feedback with file uploads
│   ├── ClaimBusiness.jsx # Business claim form
│   └── SuggestEvent.jsx  # Event suggestion form
├── hooks/                # Custom hooks
│   ├── useOverlay.js     # Shared overlay state management
│   └── usePWAInstall.js  # PWA install prompt
├── styles/               # Shared CSS styles
├── utils/                # Utilities (hoursUtils, slugify, etc.)
└── App.jsx               # Root component with overlay system
```

---

## Application Structure

### Entry Point

```jsx
// nearby-app/app/src/App.jsx

import { Routes, Route, Navigate } from 'react-router-dom';
import useOverlay from './hooks/useOverlay';

function App() {
  const navOverlay = useOverlay('nav_overlay', { skipDesktop: true });
  const searchOverlay = useOverlay('search_overlay', { focusTargetId: 'one_search' });

  return (
    <>
      <a className="skip-main" href="#main_content">Skip to main content</a>
      <MobileNavBar searchOverlay={searchOverlay} navOverlay={navOverlay} />
      <AnnouncementBanner />
      <Navbar navOverlay={navOverlay} searchOverlay={searchOverlay} />
      <SearchOverlay isOpen={searchOverlay.isOpen} onClose={searchOverlay.close} panelRef={searchOverlay.panelRef} />

      <main id="main_content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/poi/:id" element={<POIDetail />} />
          <Route path="/places/:slug" element={<POIDetail />} />
          <Route path="/events/:slug" element={<POIDetail />} />
          <Route path="/parks/:slug" element={<POIDetail />} />
          <Route path="/trails/:slug" element={<POIDetail />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/services" element={<Services />} />
          <Route path="/community-interest" element={<CommunityInterest />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/claim-business" element={<ClaimBusiness />} />
          <Route path="/suggest-event" element={<SuggestEvent />} />
          <Route path="/suggest-place" element={<Navigate to="/claim-business" replace />} />
          <Route path="/events-calendar" element={<EventsCalendar />} />
        </Routes>
      </main>

      <Footer />
    </>
  );
}
```

### Routing by POI Type

| Route | POI Type | Example URL |
|-------|----------|-------------|
| `/places/:slug` | BUSINESS | `/places/joes-coffee-pittsboro` |
| `/parks/:slug` | PARK | `/parks/jordan-lake` |
| `/trails/:slug` | TRAIL | `/trails/lakeshore-loop` |
| `/events/:slug` | EVENT | `/events/food-festival` |
| `/poi/:id` | Any (UUID) | `/poi/550e8400-...` |
| `/community-interest` | CommunityInterest | Community interest form |
| `/contact` | Contact | Contact form |
| `/feedback` | Feedback | Feedback with file uploads |
| `/claim-business` | ClaimBusiness | Business claim form |
| `/suggest-event` | SuggestEvent | Event suggestion form |
| `/suggest-place` | Redirect | Redirects to `/claim-business` |
| `/events-calendar` | EventsCalendar | FullCalendar month/week/day/list views |
| `/services` | Services | Services page |

---

## Pages

### Home Page

The Home page renders the Hero component, a search bar, and informational sections. CSS styles are in `Home.css`.

### Explore Page

The Explore page has two modes:

1. **Category Grid** (default): Displays category cards for Businesses, Parks, Trails, and Events with POI counts. Clicking a card fetches POIs of that type.
2. **Search Results**: When the user searches via URL params (`?q=...`), results display in a map + list split layout.

**Key features:**
- Map/list split layout with Leaflet map and result cards
- Radius dropdown (1, 3, 5, 10, 15 miles) and date filter (Today, Tomorrow, This Weekend, Custom)
- Search bar with hybrid AI search integration
- Pagination for large result sets
- Responsive: map hides on mobile, full-width result cards
- "View Calendar" link in the header navigates to `/events-calendar`

### POI Detail Page (Smart Router)

The POIDetail page acts as a **smart router** that dispatches to type-specific detail components based on POI type. This architecture allows each POI type to have its own specialized layout and features.

```jsx
// pages/POIDetail.jsx

function POIDetail() {
  const { id, slug } = useParams();
  const navigate = useNavigate();
  const [poi, setPoi] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPOI();
  }, [id, slug]);

  // ... fetch logic ...

  if (loading) return <LoadingSpinner />;
  if (!poi) return <NotFound />;

  // Smart router: dispatch to type-specific detail component
  const DetailComponent = {
    'BUSINESS': BusinessDetail,
    'PARK': ParkDetail,
    'TRAIL': TrailDetail,
    'EVENT': EventDetail,
  }[poi.poi_type] || GenericDetail;  // GenericDetail as fallback

  return <DetailComponent poi={poi} />;
}
```

### Type-Specific Detail Components

Each POI type has a specialized detail component in `components/details/`:

| Component | File | POI Type |
|-----------|------|----------|
| BusinessDetail | `BusinessDetail.jsx` | BUSINESS |
| ParkDetail | `ParkDetail.jsx` | PARK |
| TrailDetail | `TrailDetail.jsx` | TRAIL |
| EventDetail | `EventDetail.jsx` | EVENT |
| GenericDetail | `GenericDetail.jsx` | Fallback for all other types |

All detail components use the shared `Accordion` component for collapsible sections and the `HoursDisplay` component for consistent hours rendering.

#### BusinessDetail Enhancements

`BusinessDetail.jsx` includes a "Suggest an Update" feature powered by the `SuggestEditOverlay` component.

**SuggestEditOverlay** (`components/details/SuggestEditOverlay.jsx` + `SuggestEditOverlay.css`):

An overlay form that allows public users to suggest edits to a business listing. It uses the shared `Overlay` component and `useOverlay` hook for open/close behavior.

**Features:**
- Triggered via a ref-based API (`externalTriggerRef.current.open()`) from BusinessDetail
- Displays the POI name as a read-only "Location in Question" field
- Two fieldsets: Contact Info (Full Name, Email, Phone -- all required) and Additional Details (Subject dropdown, Message -- both required)
- Subject options: "Inappropriate content", "Something's missing", "Wrong information", "Other"
- Client-side validation with error summary (`role="alert"`)
- Submits to `POST /api/contact` with subject prefixed as `"Suggest Edit: {subject} -- {poiName}"`
- Success state with confirmation message and Close button
- Clear Form button resets all fields

#### EventDetail Enhancements

`EventDetail.jsx` has extensive event-status-aware rendering and several supporting sub-components:

**Status-Based Conditional Rendering:**
- Reads `poi.event.event_status` (default: `"Scheduled"`)
- When canceled: hides date badge, hides start time in quick info, applies `--canceled` CSS class (strikethrough on name)
- Renders `EventStatusBanner` for any non-Scheduled status (Canceled, Postponed, Rescheduled, Updated Date and/or Time, Moved Online, Unofficial Proposed Date)

**Rich Description (DOMPurify):**
- `description_long` is rendered as sanitized HTML via `DOMPurify.sanitize()` and `dangerouslySetInnerHTML`

**COST & TICKETS Accordion Section:**
- Displays cost info based on `poi.event.cost_type` (`free`, `single_price`, `range`)
- Links to `poi.ticket_link` with "Buy Tickets" action
- Shows `poi.pricing_details` when available

**Venue Linking:**
- If `poi.event.venue_poi_id` is set, the venue name in EVENT DETAILS becomes a link to `/poi/{venue_poi_id}`
- Falls back to plain text when no linked venue POI exists

**Sub-Components (loaded within EventDetail or its accordion sections):**

| Component | File | Purpose |
|-----------|------|---------|
| `EventStatusBanner` | `EventStatusBanner.jsx` | Colored alert banner for non-Scheduled statuses with status-specific actions |
| `EventVendors` | `EventVendors.jsx` | Fetches and displays participating vendors from `GET /api/pois/{id}/vendors` |
| `EventSponsors` | `EventSponsors.jsx` | Fetches and displays sponsors with tier badges (Platinum/Gold/Silver/Bronze/Community) |
| `ContactOrganizerModal` | `ContactOrganizerModal.jsx` | Overlay modal showing organizer contact info (email, phone, website, link to organizer POI) |

**EventStatusBanner** supports these statuses with distinct color schemes:
| Status | Color | Border | Actions |
|--------|-------|--------|---------|
| Canceled | Red (#dc2626) | Red | Shows `cancellationParagraph`, optional Contact Organizer button |
| Postponed | Amber (#d97706) | Yellow | Shows `statusExplanation` |
| Rescheduled | Blue (#2563eb) | Blue | Shows `statusExplanation`, "View New Event Details" link |
| Updated Date and/or Time | Orange (#ea580c) | Orange | Shows `statusExplanation` |
| Moved Online | Purple (#7c3aed) | Purple | Shows `statusExplanation`, "Join Online Event" link |
| Unofficial Proposed Date | Gray (#6b7280) | Gray | Shows `statusExplanation` |

### Events Calendar Page

A full-page calendar view at `/events-calendar` powered by FullCalendar.

**File:** `pages/EventsCalendar.jsx`

**Features:**
- Fetches all published events via `GET /api/pois?poi_type=EVENT&publication_status=published&limit=250`
- Four view modes: Month (`dayGridMonth`), Week (`timeGridWeek`), Day (`timeGridDay`), List (`listMonth`)
- View toggle buttons with `aria-pressed` state
- Color-coded by event status: Scheduled (indigo), Canceled (red), Postponed (amber), Rescheduled (blue)
- Canceled events prefixed with `[CANCELED]` in title
- Clicking an event navigates to its detail page (`/events/{slug}`)
- Loading and error states with `role="status"` and `role="alert"` for accessibility

**Dependencies:** `@fullcalendar/react`, `@fullcalendar/daygrid`, `@fullcalendar/timegrid`, `@fullcalendar/list`

### Accordion Component

A shared accordion component (`components/Accordion.jsx` + `Accordion.css`) used across all five detail views, replacing the per-component `CollapsibleSection` implementations.

**Features:**
- `closeOther`: Only one section open at a time (optional)
- `closeAble`: Clicking an open section closes it (optional)
- `scrollOffset`: Scroll offset for header overlap on auto-scroll
- Hash deep-linking: `#section-id` in URL auto-opens and scrolls to matching section
- Slide animation with `prefers-reduced-motion` support
- `AccordionSection` sub-component defines each section with `title`, `id`, `children`, and optional `show` prop for conditional rendering

### Share & Clipboard Functionality

All five detail components (BusinessDetail, EventDetail, GenericDetail, ParkDetail, TrailDetail) share a consistent set of share and clipboard features:

**Native Share (navigator.share)**
- On devices/browsers that support the Web Share API, the share button triggers `navigator.share()` with the POI title, teaser text, and current URL.
- On unsupported browsers, clicking share opens a dropdown menu with social sharing options.

**Share Menu (Fallback)**
| Option | Behavior |
|--------|----------|
| Facebook | Opens Facebook share dialog with current URL |
| Twitter | Opens Twitter intent with POI name and URL |
| Email | Opens `mailto:` link with POI name as subject and `window.location.href` as body |
| Copy Link | Copies current URL to clipboard with "Copied!" state-based feedback (2-second duration) |

**Clipboard Fallback**
- All detail pages use a `fallbackCopyToClipboard` helper for non-secure contexts (HTTP without HTTPS). This creates a temporary `<textarea>` element and uses `document.execCommand('copy')` when the modern `navigator.clipboard.writeText()` API is unavailable.

**Copy Address Feedback**
- The address copy button shows a "Copied!" label with a checkmark icon for 2 seconds, replacing the previous `alert()` call. Uses React state to toggle between the default and success states.

---

## Components

### Search Bar

```jsx
// components/SearchBar.jsx

function SearchBar({ onSearch }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const navigate = useNavigate();

  // Debounced search
  const debouncedSearch = useDebouncedCallback(async (q) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    const response = await fetch(
      `/api/pois/hybrid-search?q=${encodeURIComponent(q)}&limit=8`
    );
    const data = await response.json();
    setResults(data);
    setLoading(false);
  }, 300);

  useEffect(() => {
    debouncedSearch(query);
  }, [query]);

  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          navigateToPOI(results[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        break;
    }
  };

  const navigateToPOI = (poi) => {
    const url = getPOIUrl(poi);
    navigate(url);
    setShowDropdown(false);
  };

  return (
    <div className="search-bar">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search places, parks, trails, events..."
      />
      {loading && <span className="loading-indicator" />}

      {showDropdown && results.length > 0 && (
        <SearchDropdown
          results={results}
          selectedIndex={selectedIndex}
          onSelect={navigateToPOI}
          onClose={() => setShowDropdown(false)}
        />
      )}
    </div>
  );
}
```

### Search Dropdown

```jsx
// components/SearchDropdown.jsx

import { createPortal } from 'react-dom';

function SearchDropdown({ results, selectedIndex, onSelect, onClose }) {
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.search-bar')) {
        onClose();
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return createPortal(
    <div className="search-dropdown">
      {results.map((result, index) => (
        <button
          key={result.id}
          className={`search-result ${index === selectedIndex ? 'selected' : ''}`}
          onClick={() => onSelect(result)}
        >
          <span className="result-icon">
            {getTypeIcon(result.poi_type)}
          </span>
          <div className="result-content">
            <span className="result-name">{result.name}</span>
            <span className="result-meta">
              {result.poi_type} • {result.address_city}
            </span>
          </div>
        </button>
      ))}
    </div>,
    document.body
  );
}
```

### Map Component

```jsx
// components/Map.jsx

import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Custom marker icons
const createIcon = (color, label) => L.divIcon({
  html: `<svg viewBox="0 0 24 24" width="32" height="32">
    <circle cx="12" cy="12" r="10" fill="${color}" stroke="#fff" stroke-width="2"/>
    ${label ? `<text x="12" y="16" text-anchor="middle" fill="white" font-size="12">${label}</text>` : ''}
  </svg>`,
  className: 'custom-marker',
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

function Map({ center, markers, zoom = 13, showNearby = false }) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className="map-container"
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />

      {markers.map((poi, index) => (
        <Marker
          key={poi.id}
          position={[
            poi.location?.coordinates[1] || poi.latitude,
            poi.location?.coordinates[0] || poi.longitude
          ]}
          icon={createIcon(
            index === 0 ? '#FFD700' : '#8B5CF6',
            showNearby && index > 0 ? index : null
          )}
        >
          <Popup>
            <strong>{poi.name}</strong>
            {poi.distance_miles && (
              <div>{poi.distance_miles.toFixed(1)} miles</div>
            )}
          </Popup>
        </Marker>
      ))}

      <FitBounds markers={markers} />
    </MapContainer>
  );
}

function FitBounds({ markers }) {
  const map = useMap();

  useEffect(() => {
    if (markers.length > 1) {
      const bounds = L.latLngBounds(
        markers.map(m => [
          m.location?.coordinates[1] || m.latitude,
          m.location?.coordinates[0] || m.longitude
        ])
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [markers, map]);

  return null;
}
```

### Nearby Section

```jsx
// components/nearby-feature/NearbySection.jsx

function NearbySection({ poi, nearbyPois: initialNearby }) {
  const [nearby, setNearby] = useState(initialNearby);
  const [radius, setRadius] = useState(5);
  const [typeFilter, setTypeFilter] = useState(null);
  const [page, setPage] = useState(0);
  const itemsPerPage = 6;

  useEffect(() => {
    if (radius !== 5) {
      fetchNearby();
    }
  }, [radius]);

  const fetchNearby = async () => {
    const response = await fetch(
      `/api/pois/${poi.id}/nearby?radius_miles=${radius}`
    );
    const data = await response.json();
    setNearby(data);
  };

  const filtered = typeFilter
    ? nearby.filter(p => p.poi_type === typeFilter)
    : nearby;

  const paginated = filtered.slice(
    page * itemsPerPage,
    (page + 1) * itemsPerPage
  );

  return (
    <section className="nearby-section">
      <h2>Nearby Places</h2>

      <NearbyFilters
        radius={radius}
        onRadiusChange={setRadius}
        typeFilter={typeFilter}
        onTypeChange={setTypeFilter}
      />

      <div className="nearby-layout">
        <div className="nearby-list">
          {paginated.map((nearbyPoi, index) => (
            <NearbyCard
              key={nearbyPoi.id}
              poi={nearbyPoi}
              index={page * itemsPerPage + index}
            />
          ))}
        </div>

        <div className="nearby-map">
          <Map
            center={[
              poi.location.coordinates[1],
              poi.location.coordinates[0]
            ]}
            markers={[poi, ...paginated]}
            showNearby
          />
        </div>
      </div>

      {filtered.length > itemsPerPage && (
        <Pagination
          page={page}
          total={Math.ceil(filtered.length / itemsPerPage)}
          onChange={setPage}
        />
      )}
    </section>
  );
}
```

### Nearby Card

The NearbyCard component (`components/nearby-feature/NearbyCard.jsx`) renders a card for each nearby POI with type-specific information, amenity icons, and action buttons.

**Event Status Badges:**
- Events with a non-`Scheduled` status display a colored badge (e.g., `Canceled`, `Postponed`, `Rescheduled`)
- Canceled events render the name with strikethrough text (`nearby-card__name--canceled` CSS class)
- Scheduled events whose `start_datetime` is in the past display a `Past` badge
- Badge CSS classes follow the pattern `nearby-card__status-badge--{status}` (lowercase, spaces replaced with hyphens)

**Other Features:**
- Distance display in miles or feet (meters-to-miles conversion)
- Hours display for non-event POIs based on selected date or current day
- Primary category label
- Amenity icons: Restrooms, Wheelchair Accessible, Free WiFi, Pet Friendly (custom SVG icons from nn-templates)
- Trail-specific info: length in miles, difficulty badge
- Park-specific info: park type
- Action buttons: Directions and Details

---

## New Components

### Overlay System

The app uses a shared overlay system via `useOverlay` hook for consistent modal/overlay behavior:

```jsx
// hooks/useOverlay.js
const navOverlay = useOverlay('nav_overlay', { skipDesktop: true });
const searchOverlay = useOverlay('search_overlay', { focusTargetId: 'one_search' });
```

- **MobileNavBar**: Bottom navigation bar for mobile with hamburger menu and search toggle
- **SearchOverlay**: Full-screen search overlay with focus management
- **AnnouncementBanner**: Dismissible top banner for announcements
- **Overlay**: Backdrop component used by both nav and search overlays

### Form Pages

Five form pages following a consistent pattern (card layout, success state, error handling, `aria-required` on required fields, `role="alert"` on error messages):

| Page | Route | API Endpoint | Key Feature |
|------|-------|-------------|-------------|
| `CommunityInterest.jsx` | `/community-interest` | `POST /api/community-interest` | Multi-select checkbox for roles |
| `Contact.jsx` | `/contact` | `POST /api/contact` | Simple 3-field form |
| `Feedback.jsx` | `/feedback` | `POST /api/feedback` | Drag-and-drop file upload with preview |
| `ClaimBusiness.jsx` | `/claim-business` | `POST /api/business-claims` | Chatham County gate (Yes/No) |
| `SuggestEvent.jsx` | `/suggest-event` | `POST /api/event-suggestions` | Event name + organizer email required; fields for date, location, description, details link, organizer name/phone |

See [Forms System](../systems/forms.md) for full backend documentation.

### SEO Components

The app uses JSON-LD structured data components for search engine optimization. These render `<script type="application/ld+json">` tags using native React rendering (not react-helmet-async).

| Component | File | Description |
|-----------|------|-------------|
| `EventJsonLd` | `components/seo/EventJsonLd.jsx` | schema.org/Event structured data with event status mapping |
| `LocalBusinessJsonLd` | `components/seo/LocalBusinessJsonLd.jsx` | schema.org/LocalBusiness structured data |

Each type-specific detail page includes the appropriate JSON-LD component. Server-side meta tag injection handles Open Graph and Twitter Card tags.

**EventJsonLd Details:**

The `EventJsonLd` component outputs a comprehensive schema.org/Event object including:

- **Event status mapping** (`eventStatus`):
  | App Status | Schema.org Value |
  |------------|------------------|
  | Scheduled | `EventScheduled` |
  | Canceled | `EventCancelled` |
  | Postponed | `EventPostponed` |
  | Rescheduled | `EventRescheduled` |
  | Moved Online | `EventMovedOnline` |
  | Updated Date and/or Time | `EventScheduled` |
  | Unofficial Proposed Date | `EventScheduled` |

- **Attendance mode** (`eventAttendanceMode`): Offline, Online, or Mixed based on `is_virtual` and `is_in_person` flags
- **VirtualLocation**: When status is "Moved Online" and `online_event_url` is set, `location` becomes an array with both `Place` and `VirtualLocation`
- **Offers**: Free events emit `price: 0`; paid events include cost from `poi.cost`
- **Organizer**: Built from `organizer_name`, `organizer_website`, `organizer_email`, `organizer_phone`
- **Performers**: Array of `PerformingGroup` from `poi.event.performers`
- **Additional fields**: `doorTime`, `typicalAgeRange` (from `ideal_for`), `accessibilityFeature`, `maximumAttendeeCapacity`

### Event Disclaimer

`EventDetail.jsx` displays a disclaimer at the bottom of each event page (Task 149). The text is defined as a local `EVENT_DISCLAIMER` constant:

> "While we work to keep event information current and accurate, details may change. We recommend confirming directly with event organizers before making plans."

---

## Common Components

### HoursDisplay Component

A reusable component for displaying POI hours with support for multiple formats and special cases.

```jsx
// components/common/HoursDisplay.jsx

function HoursDisplay({ poi }) {
  const weekHours = getWeekHours(poi.hours);
  const holidays = getUpcomingHolidays(poi.hours);

  return (
    <div className="hours-display">
      {/* Regular weekly hours */}
      <div className="week-hours">
        {weekHours.map(day => (
          <div key={day.name} className="day-row">
            <span className="day-name">{day.name}</span>
            <span className="day-hours">{day.hours}</span>
          </div>
        ))}
      </div>

      {/* Holiday hours */}
      {holidays.length > 0 && (
        <div className="holiday-hours">
          <h4>Holiday Hours</h4>
          {holidays.map(holiday => (
            <div key={holiday.date}>{holiday.name}: {holiday.status}</div>
          ))}
        </div>
      )}

      {/* Appointment booking */}
      {poi.appointment_url && (
        <a href={poi.appointment_url} className="appointment-link">
          Book Appointment
        </a>
      )}
    </div>
  );
}
```

**Features:**
- Regular weekly hours (new structured format)
- Legacy hours format support
- Holiday/special hours display
- Appointment booking links
- "See More/See Less" toggle for holiday list

### GenericDetail Component

A fallback detail view for POI types without specialized pages. Uses the shared `Accordion` component for collapsible sections.

**Features:**
- Accordion sections for various POI attributes (About, Hours, Address & Parking, Facilities, etc.)
- Dynamic info rows with label-value pairs
- Photo grid with lazy loading
- Amenities display
- Nearby section with map

### PhotoLightbox Component

A full-screen image gallery lightbox for viewing photos.

```jsx
// components/details/PhotoLightbox.jsx

function PhotoLightbox({ images, initialIndex, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <div className="lightbox-content" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>×</button>
        <button className="nav-prev" onClick={() => setCurrentIndex(i => i - 1)}>‹</button>
        <img src={images[currentIndex].storage_url} alt={images[currentIndex].alt_text} />
        <button className="nav-next" onClick={() => setCurrentIndex(i => i + 1)}>›</button>
      </div>
    </div>
  );
}
```

**Features:**
- Modal overlay
- Previous/Next navigation
- Keyboard support (arrow keys, Escape)
- Responsive image scaling

---

## Utilities

### URL Helpers

```javascript
// utils/slugify.js

export function getPOIUrl(poi) {
  const prefix = getTypePrefix(poi.poi_type);
  return `/${prefix}/${poi.slug}`;
}

export function getTypePrefix(poiType) {
  const prefixes = {
    'BUSINESS': 'places',
    'SERVICES': 'places',
    'PARK': 'parks',
    'TRAIL': 'trails',
    'EVENT': 'events'
  };
  return prefixes[poiType] || 'places';
}

export function isUUID(str) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export function truncateText(text, maxLength = 155) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}
```

### API Configuration

```javascript
// config.js

export const API_BASE_URL = import.meta.env.DEV
  ? 'http://localhost:8000'
  : '';

export function getApiUrl(path) {
  return `${API_BASE_URL}${path}`;
}
```

### Hours Utilities

Utility functions for parsing and displaying POI hours in various formats.

```javascript
// utils/hoursUtils.js

/**
 * Parse new structured hours format into day-by-day structure
 */
export function getWeekHours(hours) {
  if (!hours) return [];
  // Returns array of { name: 'Monday', hours: '9:00 AM - 5:00 PM' }
}

/**
 * Handle legacy simple key-value hours format
 */
export function formatLegacyHours(hours) {
  // Converts { monday: '9-5', tuesday: '9-5' } to displayable format
}

/**
 * Extract upcoming holidays from hours data
 */
export function getUpcomingHolidays(hours, daysAhead = 30) {
  // Returns array of { date, name, status }
}

/**
 * Format holiday hour status for display
 */
export function formatHolidayStatus(holiday) {
  // Returns 'Closed', 'Open 10 AM - 4 PM', etc.
}
```

**Features:**
- Handles both new structured format and legacy simple format
- Support for seasonal hours and exceptions
- Upcoming holiday extraction with configurable lookahead
- Formatted display strings for UI components

**Python backend equivalent:** `shared/utils/hours_resolution.py` provides the same resolution logic server-side. The `GET /api/pois/{poi_id}/effective-hours?date=YYYY-MM-DD` endpoint exposes this via API.

---

## PWA Support

### Install Hook

```jsx
// hooks/usePWAInstall.js

export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (!installPrompt) return;

    installPrompt.prompt();
    const result = await installPrompt.userChoice;

    if (result.outcome === 'accepted') {
      setIsInstallable(false);
    }
    setInstallPrompt(null);
  };

  return { isInstallable, install };
}
```

### Install Button

```jsx
// components/InstallButton.jsx

function InstallButton() {
  const { isInstallable, install } = usePWAInstall();

  if (!isInstallable) return null;

  return (
    <button onClick={install} className="install-button">
      Install App
    </button>
  );
}
```

---

## Styling

The app uses custom CSS modules for styling:

```
src/
├── index.css          # Global styles
├── App.css            # App-level styles
└── components/
    ├── SearchBar.css
    ├── Map.css
    ├── NearbyCard.css
    └── ...
```

### CSS Variables

```css
/* index.css */

:root {
  --color-primary: #8B5CF6;
  --color-primary-dark: #7C3AED;
  --color-secondary: #FFD700;
  --color-text: #1F2937;
  --color-text-light: #6B7280;
  --color-background: #FFFFFF;
  --color-border: #E5E7EB;

  --font-family: 'Inter', sans-serif;
  --border-radius: 8px;
  --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}
```

---

## Error Tracking (Sentry)

The user-facing frontend initializes `@sentry/react` in `main.jsx` if the `VITE_SENTRY_DSN` environment variable is set.

**Initialization (`main.jsx`):**
```jsx
import * as Sentry from '@sentry/react';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  });
}
```

**ErrorBoundary (`components/ErrorBoundary.jsx`):**
- Wraps the app with `Sentry.ErrorBoundary` to catch and report uncaught React errors
- Renders a fallback UI with a "Something went wrong" message and a refresh button
- Reports errors automatically to Sentry when they occur

Hidden source maps are generated in production builds (`build.sourcemap: 'hidden'` in `vite.config.js`) so Sentry can provide meaningful stack traces without exposing source maps to end users.

---

## Frontend Testing (Vitest + React Testing Library)

The frontend has a test suite using Vitest and React Testing Library (RTL).

**Configuration:**
- `vitest.config.js` at `nearby-app/app/` root
- Environment: `jsdom`
- Setup file: `src/test/setup.js` (imports `@testing-library/jest-dom` matchers)
- CSS processing disabled (`css: false`) for faster tests
- Globals enabled (no need to import `describe`, `it`, `expect`)

**Running Tests:**
```bash
cd nearby-app/app
npm test           # Watch mode
npm run test:run   # Single run (CI-friendly)
```

**Test Files (8 suites):**

| Test File | Component Under Test | Key Scenarios |
|-----------|---------------------|---------------|
| `components/details/__tests__/EventStatusBanner.test.jsx` | EventStatusBanner | Renders nothing for Scheduled, shows correct colors/labels for each status, conditional links and Contact Organizer button |
| `components/details/__tests__/EventDetail.test.jsx` | EventDetail | Status banner integration, canceled event conditional hiding, DOMPurify sanitization, COST & TICKETS section, venue linking |
| `components/details/__tests__/EventVendors.test.jsx` | EventVendors | Loading/error/empty states, vendor list rendering, links to vendor POI pages |
| `components/details/__tests__/EventSponsors.test.jsx` | EventSponsors | Loading/error/empty states, tier badge rendering, sponsor links (POI, external URL, plain text) |
| `components/details/__tests__/ContactOrganizerModal.test.jsx` | ContactOrganizerModal | Open/close behavior, displays organizer info, mailto/tel links, link to organizer POI |
| `pages/__tests__/EventsCalendar.test.jsx` | EventsCalendar | Loading state, error handling, FullCalendar rendering, event click navigation |
| `components/nearby-feature/__tests__/NearbyCard.test.jsx` | NearbyCard | Event status badges, canceled strikethrough, past event badge, amenity icons |
| `components/seo/__tests__/EventJsonLd.test.jsx` | EventJsonLd | Status mapping to schema.org values, VirtualLocation for Moved Online, offers, organizer, attendance mode |

**Dev Dependencies:**
- `vitest` + `@vitest/ui` (test runner)
- `@testing-library/react` + `@testing-library/jest-dom` + `@testing-library/user-event` (React testing utilities)
- `jsdom` (browser environment simulation)

---

## Best Practices

1. **SEO-friendly URLs** - Use slugs instead of UUIDs
2. **Debounce search** - 300ms delay before API call
3. **Keyboard navigation** - Arrow keys and Enter in search
4. **Loading states** - Show spinners during fetches
5. **Error handling** - Redirect to 404 on not found
6. **Responsive design** - Mobile-first approach
7. **Lazy loading** - Load images as they scroll into view
