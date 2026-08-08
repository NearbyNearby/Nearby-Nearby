import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ---------------------------------------------------------------------------
// react-leaflet is stubbed (see Map.test.jsx) so the map renders in jsdom and we
// can read each marker's number + name straight off the icon it was given.
// ---------------------------------------------------------------------------
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  AttributionControl: () => null,
  Marker: ({ icon, eventHandlers, children }) => (
    <div
      data-testid="marker"
      data-icon={decodeURIComponent(icon?.options?.iconUrl || '')}
      onClick={() => eventHandlers?.click?.()}
    >
      {children}
    </div>
  ),
  Popup: ({ children }) => <div data-testid="popup">{children}</div>,
  useMap: () => ({ fitBounds: () => {}, setView: () => {} }),
  useMapEvents: () => ({ scrollWheelZoom: { enable: () => {}, disable: () => {} } }),
}));
vi.mock('../../config', () => ({ getApiUrl: (p) => p }));

import Explore from '../Explore.jsx';

// Explore measures from downtown Pittsboro (USER_LOCATION in Explore.jsx).
const ORIGIN = { lat: 35.72028984062034, lng: -79.17718140354249 };
// ~ north-south offsets: 1 degree of latitude ≈ 69 miles.
const northOf = (miles) => ({ type: 'Point', coordinates: [ORIGIN.lng, ORIGIN.lat + miles / 69] });

// Deliberately unsorted, and "Nowhere" has no coordinates at all.
const POIS = [
  { id: 'far',   name: 'Far Place',   poi_type: 'BUSINESS', location: northOf(0.9) },
  { id: 'near',  name: 'Near Place',  poi_type: 'BUSINESS', location: northOf(0.05) },
  { id: 'nowhere', name: 'Unmapped Place', poi_type: 'BUSINESS' },
  { id: 'mid',   name: 'Mid Place',   poi_type: 'BUSINESS', location: northOf(0.4) },
];

const cardNumbers = () =>
  Array.from(document.querySelectorAll('.one_search_map_result_single')).map((card) => [
    Number(card.querySelector('.one_search_map_result_number').textContent),
    card.querySelector('.one_search_map_result_title').textContent,
  ]);

const markerNumbers = () =>
  screen.getAllByTestId('marker').map((m) => [
    Number(m.getAttribute('data-icon').match(/>(\d+)<\/text>/)[1]),
    m.querySelector('strong').textContent,
  ]);

const renderExplore = () =>
  render(
    <MemoryRouter initialEntries={['/explore']}>
      <Explore />
    </MemoryRouter>
  );

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  // Landing mode fetches all four types in parallel; serve the fixtures once.
  let first = true;
  global.fetch = vi.fn(() => {
    const body = first ? POIS : [];
    first = false;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  });
});
afterEach(() => { vi.clearAllMocks(); });

describe('Explore map/card alignment (#133, #101)', () => {
  it('numbers every marker the same as its card, including past an unmapped POI', async () => {
    renderExplore();
    await screen.findAllByText('Near Place');

    // Cards are sorted by distance; the unmapped POI sorts last but still owns a number.
    expect(cardNumbers()).toEqual([
      [1, 'Near Place'],
      [2, 'Mid Place'],
      [3, 'Far Place'],
      [4, 'Unmapped Place'],
    ]);
    // Every marker's number matches the card with the same name (the old
    // mapCurrent/mapOthers split shifted these down by one).
    expect(markerNumbers()).toEqual([
      [1, 'Near Place'],
      [2, 'Mid Place'],
      [3, 'Far Place'],
    ]);
  });

  it('highlights the card belonging to the marker that was clicked', async () => {
    renderExplore();
    await screen.findAllByText('Near Place');

    const [, midMarker] = screen.getAllByTestId('marker');
    expect(midMarker.querySelector('strong').textContent).toBe('Mid Place');
    fireEvent.click(midMarker);

    await waitFor(() => {
      const highlighted = document.querySelectorAll('.one_search_map_result_single--highlighted');
      expect(highlighted).toHaveLength(1);
      expect(within(highlighted[0]).getByText('Mid Place')).toBeInTheDocument();
      expect(highlighted[0].querySelector('.one_search_map_result_number').textContent).toBe('2');
    });
  });
});

describe('Explore directions (#109)', () => {
  it('opens the directions picker instead of jumping straight to Google Maps', async () => {
    renderExplore();
    await screen.findAllByText('Near Place');

    const nearCard = document.querySelectorAll('.one_search_map_result_single')[0];
    fireEvent.click(within(nearCard).getByText('Directions'));

    const modal = await waitFor(() => document.querySelector('.directions-modal'));
    expect(modal).toBeTruthy();
    expect(within(modal).getByText('Near Place')).toBeInTheDocument();
  });
});

describe('Explore distance formatting (#134)', () => {
  it('shows feet under a tenth of a mile and miles above it, like the Nearby cards', async () => {
    renderExplore();
    await screen.findAllByText('Near Place');

    const distances = Array.from(
      document.querySelectorAll('.one_search_map_result_calculated')
    ).map((el) => el.textContent);
    expect(distances[0]).toMatch(/^\d+ ft$/);   // 0.05 mi → feet
    expect(distances[1]).toBe('0.4 mi');
    expect(distances[2]).toBe('0.9 mi');
  });
});
