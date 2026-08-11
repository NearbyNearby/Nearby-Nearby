import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ---------------------------------------------------------------------------
// #165: the date dropdown (Today / Tomorrow / This Weekend / custom) filtered
// events via `nearbyPoi.event?.start_datetime`, but nearby cards carry the
// schedule as flat fields (start_datetime, end_datetime, is_repeating,
// repeat_pattern, recurrence_end_date, excluded_dates), never a nested
// `event` object, so the check was always undefined and every event stayed.
// ---------------------------------------------------------------------------
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  AttributionControl: () => null,
  Marker: ({ children }) => <div data-testid="marker">{children}</div>,
  Popup: ({ children }) => <div data-testid="popup">{children}</div>,
  useMap: () => ({ fitBounds: () => {}, setView: () => {} }),
  useMapEvents: () => ({ scrollWheelZoom: { enable: () => {}, disable: () => {} } }),
}));
vi.mock('../../../config', () => ({ getApiUrl: (p) => p }));
vi.mock('../../SearchBar', () => ({ default: () => null }));

import NearbySection from '../NearbySection.jsx';

const at = (lng, lat) => ({ type: 'Point', coordinates: [lng, lat] });

const CURRENT = { id: 'origin', name: 'Chatham Mills', location: at(-79.178, 35.7222) };

// 2026-08-15 is a Saturday, 2026-08-12 is a Wednesday.
const NEARBY = [
  {
    id: 'e1',
    name: 'Barn Dance Social',
    poi_type: 'EVENT',
    distance_meters: 50,
    location: at(-79.178, 35.722),
    start_datetime: '2026-08-15T18:00:00Z',
    end_datetime: '2026-08-15T23:00:00Z',
    is_repeating: false,
  },
  {
    id: 'e2',
    name: 'Pittsboro Saturday Farmers Market',
    poi_type: 'EVENT',
    distance_meters: 80,
    location: at(-79.179, 35.723),
    start_datetime: '2026-01-20T08:00:00Z',
    end_datetime: '2026-01-20T12:00:00Z',
    is_repeating: true,
    repeat_pattern: { days: ['saturday'], frequency: 'weekly' },
    recurrence_end_date: null,
    excluded_dates: null,
  },
  {
    id: 'b1',
    name: 'The Quiltmaker Cafe',
    poi_type: 'BUSINESS',
    distance_meters: 71,
    location: at(-79.17807, 35.72155),
  },
];

const cardNames = () =>
  Array.from(document.querySelectorAll('.one_search_map_result_title')).map((n) => n.textContent);

const selectDate = async (dateStr) => {
  fireEvent.click(document.querySelector('.btn_show_event_options'));
  const input = document.querySelector('.date_dropdown_date_input');
  fireEvent.change(input, { target: { value: dateStr } });
};

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(NEARBY) }));
});
afterEach(() => { vi.clearAllMocks(); });

describe('NearbySection date filter (#165)', () => {
  it('keeps a non-repeating event that falls on the selected date', async () => {
    render(<MemoryRouter><NearbySection currentPOI={CURRENT} /></MemoryRouter>);
    await screen.findAllByText('Barn Dance Social');

    await selectDate('2026-08-15');
    await waitFor(() => expect(cardNames()).toContain('Barn Dance Social'));
  });

  it('drops a non-repeating event on a date it is not happening', async () => {
    render(<MemoryRouter><NearbySection currentPOI={CURRENT} /></MemoryRouter>);
    await screen.findAllByText('Barn Dance Social');

    await selectDate('2026-08-12');
    await waitFor(() => expect(cardNames()).not.toContain('Barn Dance Social'));
  });

  it('resolves a recurring event to its occurrence on the selected date', async () => {
    render(<MemoryRouter><NearbySection currentPOI={CURRENT} /></MemoryRouter>);
    await screen.findAllByText('Pittsboro Saturday Farmers Market');

    await selectDate('2026-08-15'); // a Saturday: the market runs
    await waitFor(() => expect(cardNames()).toContain('Pittsboro Saturday Farmers Market'));

    await selectDate('2026-08-12'); // a Wednesday: no occurrence
    await waitFor(() => expect(cardNames()).not.toContain('Pittsboro Saturday Farmers Market'));
  });

  it('leaves a non-event POI unaffected by the date filter', async () => {
    render(<MemoryRouter><NearbySection currentPOI={CURRENT} /></MemoryRouter>);
    await screen.findAllByText('The Quiltmaker Cafe');

    await selectDate('2026-08-15');
    await waitFor(() => expect(cardNames()).toContain('The Quiltmaker Cafe'));

    await selectDate('2026-08-12');
    await waitFor(() => expect(cardNames()).toContain('The Quiltmaker Cafe'));
  });
});
