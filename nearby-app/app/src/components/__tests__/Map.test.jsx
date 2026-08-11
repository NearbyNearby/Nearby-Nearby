import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// react-leaflet is stubbed so the assertions are about OUR logic (which POI gets
// which number, which id a marker click reports, what the attribution says)
// rather than about Leaflet's DOM, which needs real layout to behave in jsdom.
// The stubs still receive the real L.Icon objects Map.jsx builds.
// ---------------------------------------------------------------------------
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children, center }) => (
    <div data-testid="map" data-center={JSON.stringify(center)}>{children}</div>
  ),
  TileLayer: () => null,
  AttributionControl: ({ prefix }) => (
    <div data-testid="attribution" data-prefix={String(prefix)} />
  ),
  Marker: ({ icon, eventHandlers, children }) => (
    <div
      data-testid="marker"
      data-icon={decodeURIComponent(icon?.options?.iconUrl || '')}
      data-icon-class={icon?.options?.className || ''}
      onClick={() => eventHandlers?.click?.()}
    >
      {children}
    </div>
  ),
  Popup: ({ children }) => <div data-testid="popup">{children}</div>,
  useMap: () => ({ fitBounds: () => {}, setView: () => {} }),
  useMapEvents: () => ({ scrollWheelZoom: { enable: () => {}, disable: () => {} } }),
}));

import Map from '../Map.jsx';

const at = (lng, lat) => ({ type: 'Point', coordinates: [lng, lat] });

// Number drawn inside the pin's SVG, or null for the gold "current" pin.
const markerNumber = (el) => {
  const m = el.getAttribute('data-icon').match(/>(\d+)<\/text>/);
  return m ? Number(m[1]) : null;
};
const markerName = (el) => el.querySelector('strong')?.textContent;
const isCurrentPin = (el) => el.getAttribute('data-icon').includes('#F4C542');

const POIS = [
  { id: 'a', name: 'Alpha',   location: at(-79.171, 35.721) },
  { id: 'b', name: 'Bravo',   location: at(-79.172, 35.722) },
  { id: 'c', name: 'Charlie', location: at(-79.173, 35.723) },
  { id: 'd', name: 'Delta',   location: at(-79.174, 35.724) },
];

beforeEach(() => { vi.clearAllMocks(); });

describe('Map marker numbering (#133 / #101)', () => {
  it('numbers markers by their position in the list the caller renders as cards', () => {
    render(<Map currentPOI={null} nearbyPOIs={POIS} />);
    const markers = screen.getAllByTestId('marker');
    expect(markers.map(markerNumber)).toEqual([1, 2, 3, 4]);
    expect(markers.map(markerName)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
  });

  it('leaves a gap for an unmapped POI instead of shifting every later marker', () => {
    // Bravo is card 2 but has no coordinates: it gets no pin, and Charlie/Delta
    // keep the numbers their cards show (3 and 4), not 2 and 3.
    const pois = [POIS[0], { id: 'b', name: 'Bravo' }, POIS[2], POIS[3]];
    render(<Map currentPOI={null} nearbyPOIs={pois} />);
    const markers = screen.getAllByTestId('marker');
    expect(markers).toHaveLength(3);
    expect(markers.map(markerNumber)).toEqual([1, 3, 4]);
    expect(markers.map(markerName)).toEqual(['Alpha', 'Charlie', 'Delta']);
  });

  it('reports the clicked marker\'s own id and index', () => {
    const onMarkerClick = vi.fn();
    render(<Map currentPOI={null} nearbyPOIs={POIS} onMarkerClick={onMarkerClick} />);
    fireEvent.click(screen.getAllByTestId('marker')[3]);
    expect(onMarkerClick).toHaveBeenCalledWith('d', 3);
  });

  it('draws no gold "current location" pin when there is no current POI (Explore)', () => {
    render(<Map currentPOI={null} nearbyPOIs={POIS} />);
    expect(screen.getAllByTestId('marker').some(isCurrentPin)).toBe(false);
    // Centers on the first mapped result instead.
    expect(screen.getByTestId('map').getAttribute('data-center')).toBe(JSON.stringify([35.721, -79.171]));
  });

  it('still draws the gold current pin, unnumbered, when a current POI is given (NearbySection)', () => {
    const current = { id: 'x', name: 'Current', location: at(-79.17, 35.72) };
    render(<Map currentPOI={current} nearbyPOIs={POIS} />);
    const markers = screen.getAllByTestId('marker');
    expect(markers).toHaveLength(5);
    expect(isCurrentPin(markers[0])).toBe(true);
    expect(markerNumber(markers[0])).toBeNull();
    // The nearby pins keep card numbering 1..4; the gold pin doesn't consume one.
    expect(markers.slice(1).map(markerNumber)).toEqual([1, 2, 3, 4]);
    expect(screen.getByTestId('map').getAttribute('data-center')).toBe(JSON.stringify([35.72, -79.17]));
  });

  it('renders the placeholder when nothing at all can be mapped', () => {
    render(<Map currentPOI={null} nearbyPOIs={[{ id: 'a', name: 'Alpha' }]} />);
    expect(screen.queryByTestId('map')).toBeNull();
    expect(screen.getByText('No location data available')).toBeInTheDocument();
  });
});

describe('Map marker hit area (#160)', () => {
  // The failure mode, in numbers. Pins are 38px images with an inscribed r=17
  // circle; downtown Pittsboro POIs sit 20-35m apart, i.e. ~10-18px at z16. Take
  // two pins 14px apart on both axes (~27m): pin N's number is still visible
  // (its centre is outside pin N+1's circle) but it IS inside pin N+1's SQUARE
  // image box (and N+1 paints on top), so the click went to N+1's card.
  const SIZE = 38;
  const OFFSET = { dx: 14, dy: 14 };
  const insideSquareBox = ({ dx, dy }) => Math.abs(dx) < SIZE / 2 && Math.abs(dy) < SIZE / 2;
  const insideCircle = ({ dx, dy }) => Math.hypot(dx, dy) < SIZE / 2;

  it('reproduces the overlap: a neighbour\'s square box covers a visible pin, its circle does not', () => {
    expect(insideSquareBox(OFFSET)).toBe(true);   // old hit area → click stolen
    expect(insideCircle(OFFSET)).toBe(false);     // clipped hit area → click lands right
  });

  it('clips numbered pins to their visible circle so a neighbour\'s square corner cannot steal the click', () => {
    render(<Map currentPOI={null} nearbyPOIs={POIS} />);
    for (const marker of screen.getAllByTestId('marker')) {
      expect(marker.getAttribute('data-icon-class')).toBe('map-marker-numbered');
    }
  });

  it('ships the circular clip for that class (the class alone is inert)', () => {
    // vitest runs from the app root.
    const scss = readFileSync(resolve(process.cwd(), 'src/styles/app.scss'), 'utf8');
    expect(scss).toMatch(/\.map-marker-numbered\s*\{[^}]*clip-path:\s*circle\(50%\)/);
  });
});

describe('Map attribution (#102)', () => {
  it('drops the Ukraine flag from the Leaflet prefix but keeps the credit', () => {
    render(<Map currentPOI={null} nearbyPOIs={POIS} />);
    const prefix = screen.getByTestId('attribution').getAttribute('data-prefix');
    expect(prefix).toBe('Leaflet');
    expect(prefix).not.toMatch(/\u{1F1FA}\u{1F1E6}/u);
  });
});

describe('Map hides opted-out locations (#130)', () => {
  it('drops the pin for a nearby POI marked "do not display location"', () => {
    const pois = [
      POIS[0],
      { ...POIS[1], dont_display_location: true },
      POIS[2],
    ];
    render(<Map currentPOI={null} nearbyPOIs={pois} />);
    const names = screen.getAllByTestId('marker').map((m) => m.querySelector('strong').textContent);
    expect(names).toEqual(['Alpha', 'Charlie']);
  });

  it('drops the current-POI pin when the POI being viewed opted out', () => {
    const current = { id: 'cur', name: 'Service Only', location: at(-79.17, 35.72), dont_display_location: true };
    render(<Map currentPOI={current} nearbyPOIs={[POIS[0]]} />);
    const names = screen.getAllByTestId('marker').map((m) => m.querySelector('strong').textContent);
    expect(names).not.toContain('Service Only');
    expect(names).toContain('Alpha');
  });
});
