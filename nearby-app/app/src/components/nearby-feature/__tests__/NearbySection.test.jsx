import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ---------------------------------------------------------------------------
// #160: clicking a numbered marker highlighted the next card down. The numbering
// itself is sound (map and cards read the same array), so these tests lock that
// invariant in, including the case that actually broke it in the wild: two POIs
// at the SAME coordinates (a venue and its event), whose square icon boxes
// overlap. See Map.test.jsx for the hit-area half of the fix.
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
vi.mock('../../../config', () => ({ getApiUrl: (p) => p }));
vi.mock('../../SearchBar', () => ({ default: () => null }));

import NearbySection from '../NearbySection.jsx';

const at = (lng, lat) => ({ type: 'Point', coordinates: [lng, lat] });

const CURRENT = { id: 'origin', name: 'Chatham Mills', location: at(-79.178, 35.7222) };

// Doherty's and Pub Trivia sit on the exact same point in prod, and the endpoint
// returns them in an arbitrary order (equal ST_Distance, no tie-break).
const NEARBY = [
  { id: 'n1', name: 'The Quiltmaker Cafe', poi_type: 'BUSINESS', distance_meters: 71,  location: at(-79.17807, 35.72155) },
  { id: 'n2', name: 'Pittsboro Toys',      poi_type: 'BUSINESS', distance_meters: 192, location: at(-79.17765, 35.72049) },
  { id: 'n3', name: "Doherty's Irish Pub", poi_type: 'BUSINESS', distance_meters: 302, location: at(-79.17814, 35.71947) },
  { id: 'n4', name: 'Pub Trivia',          poi_type: 'BUSINESS', distance_meters: 302, location: at(-79.17814, 35.71947) },
];

const numbered = (nodes, numberOf, nameOf) => nodes.map((n) => [numberOf(n), nameOf(n)]);

const cardEntries = () =>
  numbered(
    Array.from(document.querySelectorAll('.one_search_map_result_single')),
    (c) => Number(c.querySelector('.one_search_map_result_number').textContent),
    (c) => c.querySelector('.one_search_map_result_title').textContent
  );

// Numbered pins only; the first marker is the current POI's unnumbered gold pin.
const numberedMarkers = () =>
  screen.getAllByTestId('marker').filter((m) => /<\/text>/.test(m.getAttribute('data-icon')));

const markerEntries = () =>
  numbered(
    numberedMarkers(),
    (m) => Number(m.getAttribute('data-icon').match(/>(\d+)<\/text>/)[1]),
    (m) => m.querySelector('strong').textContent
  );

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(NEARBY) }));
});
afterEach(() => { vi.clearAllMocks(); });

describe('NearbySection marker/card alignment (#160)', () => {
  it('gives every marker the number its own card shows', async () => {
    render(<MemoryRouter><NearbySection currentPOI={CURRENT} /></MemoryRouter>);
    await screen.findAllByText('Pub Trivia');

    const cards = cardEntries();
    expect(cards).toEqual([
      [1, 'The Quiltmaker Cafe'],
      [2, 'Pittsboro Toys'],
      [3, "Doherty's Irish Pub"],
      [4, 'Pub Trivia'],
    ]);
    // Same numbers, same order; the current POI's gold pin never consumes one.
    expect(markerEntries()).toEqual(cards);
    expect(screen.getAllByTestId('marker')).toHaveLength(cards.length + 1); // + gold pin
  });

  it('highlights the card of the marker that was clicked, not its neighbour', async () => {
    render(<MemoryRouter><NearbySection currentPOI={CURRENT} /></MemoryRouter>);
    await screen.findAllByText('Pub Trivia');

    // Marker 3 is stacked underneath marker 4 (identical coordinates).
    const marker3 = screen.getAllByTestId('marker').find(
      (m) => m.querySelector('strong').textContent === "Doherty's Irish Pub"
    );
    fireEvent.click(marker3);

    await waitFor(() => {
      const highlighted = document.querySelectorAll('.one_search_map_result_single--highlighted');
      expect(highlighted).toHaveLength(1);
      expect(within(highlighted[0]).getByText("Doherty's Irish Pub")).toBeInTheDocument();
      expect(highlighted[0].querySelector('.one_search_map_result_number').textContent).toBe('3');
    }, { timeout: 3000 });
  });
});
