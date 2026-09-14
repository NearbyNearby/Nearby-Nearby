import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

// ---------------------------------------------------------------------------
// Mock react-leaflet — jsdom has no real DOM layout so Leaflet itself cannot
// run, but we can verify that MapResizeHandler wires up invalidateSize and a
// ResizeObserver correctly.
// ---------------------------------------------------------------------------

const invalidateSize = vi.fn();
const getContainer = vi.fn(() => document.createElement('div'));
const setView = vi.fn();
const getZoom = vi.fn(() => 17);

// Shared mock map instance returned by useMap()
const mockMap = { invalidateSize, getContainer, setView, getZoom };

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  AttributionControl: ({ prefix }) => (
    <div data-testid="attribution" data-prefix={String(prefix)} />
  ),
  useMap: () => mockMap,
  useMapEvents: (handlers) => {
    // expose handlers for tests that need them; return mock map
    return mockMap;
  },
}));

// ResizeObserver is not available in jsdom; provide a controllable mock.
let capturedObserverCallback = null;
let capturedObservedElement = null;

global.ResizeObserver = class {
  constructor(callback) {
    capturedObserverCallback = callback;
  }
  observe(el) {
    capturedObservedElement = el;
  }
  disconnect() {}
};

import LocationMap from '../LocationMap';

function renderMap(props = {}) {
  return render(
    <MantineProvider>
      <LocationMap
        latitude={35.72}
        longitude={-79.18}
        onLocationChange={() => {}}
        {...props}
      />
    </MantineProvider>
  );
}

describe('LocationMap attribution', () => {
  it('credits Leaflet without the default flag prefix (#102)', () => {
    const { getByTestId } = renderMap();
    expect(getByTestId('attribution').getAttribute('data-prefix')).toBe('Leaflet');
  });
});

describe('LocationMap — MapResizeHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invalidateSize.mockClear();
    capturedObserverCallback = null;
    capturedObservedElement = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls invalidateSize after 100 ms on mount', () => {
    renderMap();
    expect(invalidateSize).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(invalidateSize).toHaveBeenCalledWith({ animate: false });
  });

  it('registers a ResizeObserver on the map container', () => {
    renderMap();
    expect(capturedObservedElement).not.toBeNull();
  });

  it('calls invalidateSize when the ResizeObserver fires', () => {
    renderMap();
    vi.advanceTimersByTime(100);
    invalidateSize.mockClear();

    // Simulate the accordion panel expanding (container resizes)
    capturedObserverCallback([]);

    expect(invalidateSize).toHaveBeenCalledWith({ animate: false });
  });
});
