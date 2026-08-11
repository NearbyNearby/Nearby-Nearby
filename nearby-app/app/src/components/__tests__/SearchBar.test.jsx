import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks: navigate, config (getApiUrl identity), and the portal dropdown (noop).
// vi.mock paths resolve to the SAME modules SearchBar imports.
// ---------------------------------------------------------------------------
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('../../config', () => ({ getApiUrl: (p) => p }));
vi.mock('../SearchDropdown', () => ({ default: () => null }));

import SearchBar from '../SearchBar.jsx';

// hybrid-search returns four POIs; nearby mode intersects them with nearbyPoiIds.
const RESULTS = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(RESULTS) })
  );
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('SearchBar nearby filter', () => {
  it('re-intersects against the widened nearby set when nearbyPoiIds changes under an active query', async () => {
    const onFilterNearby = vi.fn();
    const { rerender } = render(
      <SearchBar nearbyPoiIds={['a', 'b']} onFilterNearby={onFilterNearby} />
    );

    fireEvent.change(screen.getByPlaceholderText(/What's nearby/i), {
      target: { value: 'coffee' },
    });

    // First intersection: query results ∩ ['a','b'] = ['a','b'].
    await waitFor(() =>
      expect(onFilterNearby).toHaveBeenLastCalledWith(['a', 'b'])
    );

    // Widen the nearby set (e.g. a facet was removed) while the query stays active.
    rerender(
      <SearchBar nearbyPoiIds={['a', 'b', 'c', 'd']} onFilterNearby={onFilterNearby} />
    );

    // Fix: the intersection is recomputed against the wider set — c and d, newly
    // in range, are no longer wrongly hidden. Without nearbyPoiIds in the debounce
    // effect deps this would stay ['a','b'] until the user re-typed.
    await waitFor(() =>
      expect(onFilterNearby).toHaveBeenLastCalledWith(['a', 'b', 'c', 'd'])
    );
  });
});
