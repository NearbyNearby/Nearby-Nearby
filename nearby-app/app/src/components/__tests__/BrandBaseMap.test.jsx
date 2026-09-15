import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// MapLibre needs WebGL, so the tests stand in for it and check what BrandBaseMap
// hands it: the recoloured style, the key on CARTO requests, and the fallback.
const gl = vi.hoisted(() => ({ options: null, layer: null, map: null, workerUrl: null }));
vi.mock('react-leaflet', () => ({
  TileLayer: ({ url, attribution }) => <div data-testid="tile-layer" data-url={url} data-attribution={attribution} />,
  useMap: () => 'leaflet-map',
}));
vi.mock('@maplibre/maplibre-gl-leaflet', () => ({
  maplibreGL: (options) => {
    gl.options = options;
    gl.layer = {
      addTo: vi.fn((map) => { gl.map = map; return gl.layer; }),
      remove: vi.fn(),
    };
    return gl.layer;
  },
}));
vi.mock('maplibre-gl', () => ({ setWorkerUrl: (url) => { gl.workerUrl = url; } }));
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({ default: '/assets/maplibre-worker.js' }));

const STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'water', type: 'fill', paint: { 'fill-color': '#d4dadc' } }],
};

// The module caches the style and the WebGL check, so each test loads it fresh.
const mount = async ({ webgl2 = true, style = { ok: true, json: async () => STYLE } } = {}) => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(webgl2 ? { getExtension: () => null } : null);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(style));
  vi.resetModules();
  const { default: BrandBaseMap } = await import('../BrandBaseMap.jsx');
  return render(<BrandBaseMap />);
};

beforeEach(() => {
  Object.assign(gl, { options: null, layer: null, map: null, workerUrl: null });
  vi.stubEnv('VITE_CARTO_BASEMAPS_KEY', 'test-key');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('BrandBaseMap', () => {
  it('draws the recoloured CARTO style into the Leaflet map', async () => {
    await mount();
    await waitFor(() => expect(gl.map).toBe('leaflet-map'));
    expect(gl.options.style.layers[0].paint['fill-color']).toBe('#C4DFE0');
    expect(gl.workerUrl).toBe('/assets/maplibre-worker.js');
    expect(screen.queryByTestId('tile-layer')).toBeNull();
  });

  it('sends the Basemaps key with the style and every CARTO tile request, and nowhere else', async () => {
    await mount();
    await waitFor(() => expect(gl.options).not.toBeNull());
    expect(fetch).toHaveBeenCalledWith('https://basemaps.cartocdn.com/gl/positron-gl-style/style.json?key=test-key');
    expect(gl.options.transformRequest('https://tiles-a.basemaps.cartocdn.com/vectortiles/carto.streets/v1/14/1/2.mvt'))
      .toEqual({ url: 'https://tiles-a.basemaps.cartocdn.com/vectortiles/carto.streets/v1/14/1/2.mvt?key=test-key' });
    expect(gl.options.transformRequest('https://example.com/a.png')).toEqual({ url: 'https://example.com/a.png' });
  });

  it('removes the layer when the map goes away', async () => {
    const { unmount } = await mount();
    await waitFor(() => expect(gl.layer?.addTo).toHaveBeenCalled());
    unmount();
    expect(gl.layer.remove).toHaveBeenCalled();
  });

  // #172: never fall back to keyless CARTO raster tiles ("API KEY REQUIRED").
  it.each([
    ['the browser has no WebGL2', { webgl2: false }],
    ['the style cannot be fetched', { style: { ok: false, status: 401 } }],
  ])('falls back to OpenStreetMap tiles when %s', async (_why, opts) => {
    await mount(opts);
    const layer = await screen.findByTestId('tile-layer');
    expect(layer.getAttribute('data-url')).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(layer.getAttribute('data-attribution')).toContain('OpenStreetMap');
    expect(gl.layer).toBeNull();
  });
});
