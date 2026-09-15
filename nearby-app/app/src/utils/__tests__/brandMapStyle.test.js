import { describe, it, expect } from 'vitest';
import { brandStyle, withCartoKey } from '../brandMapStyle';

const POSITRON = {
  version: 8,
  sources: { carto: { type: 'vector', url: 'https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json' } },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#fafaf8' } },
    { id: 'water', type: 'fill', paint: { 'fill-color': '#d4dadc', 'fill-opacity': 1 } },
    { id: 'road_mot_fill_noramp', type: 'line', paint: { 'line-color': '#fff', 'line-width': 2 } },
    { id: 'road_pri_case_noramp', type: 'line', paint: { 'line-color': '#ddd' } },
    { id: 'place_town', type: 'symbol', paint: { 'text-color': '#697b89', 'text-halo-color': '#fff' } },
    { id: 'housenumber', type: 'symbol', paint: { 'text-color': 'transparent' } },
  ],
};
const paintOf = (style, id) => style.layers.find((l) => l.id === id).paint;

describe('brandStyle', () => {
  const branded = brandStyle(POSITRON);

  it('recolours land, water, roads and labels with the Nearby Nearby palette', () => {
    expect(paintOf(branded, 'background')['background-color']).toBe('#F3F0EB');
    expect(paintOf(branded, 'water')['fill-color']).toBe('#C4DFE0');
    expect(paintOf(branded, 'road_mot_fill_noramp')['line-color']).toBe('#F4E9F4');
    expect(paintOf(branded, 'road_pri_case_noramp')['line-color']).toBe('#CDB6CD');
    expect(paintOf(branded, 'place_town')['text-color']).toBe('#33404E');
  });

  it('keeps the other paint properties and unmatched layers as CARTO made them', () => {
    expect(paintOf(branded, 'water')['fill-opacity']).toBe(1);
    expect(paintOf(branded, 'road_mot_fill_noramp')['line-width']).toBe(2);
    expect(paintOf(branded, 'place_town')['text-halo-color']).toBe('#fff');
    expect(paintOf(branded, 'housenumber')['text-color']).toBe('transparent');
    expect(branded.sources).toBe(POSITRON.sources);
  });

  it('leaves the fetched style untouched', () => {
    expect(paintOf(POSITRON, 'water')['fill-color']).toBe('#d4dadc');
  });
});

describe('withCartoKey', () => {
  it('adds the key to CARTO basemap URLs', () => {
    expect(withCartoKey('https://basemaps.cartocdn.com/gl/positron-gl-style/style.json', 'k1'))
      .toBe('https://basemaps.cartocdn.com/gl/positron-gl-style/style.json?key=k1');
    expect(withCartoKey('https://tiles-a.basemaps.cartocdn.com/vectortiles/carto.streets/v1/14/1/2.mvt?v=1', 'k1'))
      .toBe('https://tiles-a.basemaps.cartocdn.com/vectortiles/carto.streets/v1/14/1/2.mvt?v=1&key=k1');
  });

  it('never sends the key anywhere else', () => {
    expect(withCartoKey('https://tile.openstreetmap.org/1/2/3.png', 'k1')).toBe('https://tile.openstreetmap.org/1/2/3.png');
    expect(withCartoKey('https://basemaps.cartocdn.com.evil.test/x', 'k1')).toBe('https://basemaps.cartocdn.com.evil.test/x');
  });

  it('passes URLs through when no key is configured', () => {
    expect(withCartoKey('https://basemaps.cartocdn.com/gl/positron-gl-style/style.json', undefined))
      .toBe('https://basemaps.cartocdn.com/gl/positron-gl-style/style.json');
  });
});
