// CARTO's Positron vector basemap, recoloured with the Nearby Nearby palette
// (purple roads, teal water and green space, slate labels) so the purple pins
// read clearly on top of it.
export const CARTO_STYLE_URL = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

// [layer type, Positron layer ids, colour]. First match wins.
const COLORS = [
  ['background', /^background$/, '#F3F0EB'],
  ['fill', /^(landcover|landuse|park_national_park|park_nature_reserve)$/, '#DCEBE3'],
  ['fill', /^landuse_residential$/, '#F0EDEA'],
  ['fill', /^water$/, '#C4DFE0'],
  ['line', /^waterway$/, '#C4DFE0'],
  ['fill', /^building$/, '#E6DFE6'],
  ['fill', /^building-top$/, '#F0ECF0'],
  ['line', /^boundary_(county|state)$/, '#DFBFDF'],
  ['line', /_path$/, '#8FC2B3'],
  ['line', /_(trunk|mot)_fill/, '#F4E9F4'],
  ['line', /_(trunk|mot)_case/, '#B98FB9'],
  ['line', /_(pri|sec)_case/, '#CDB6CD'],
  ['line', /_(minor|service)_case/, '#DAD0DA'],
  ['symbol', /^place_/, '#33404E'],
  ['symbol', /^roadname_/, '#4D6578'],
  ['symbol', /^water(way_label|name_)/, '#2F6F73'],
  ['symbol', /^poi_(park|stadium)$/, '#245B4E'],
];
const PAINT = { background: 'background-color', fill: 'fill-color', line: 'line-color', symbol: 'text-color' };

export const brandStyle = (style) => ({
  ...style,
  layers: style.layers.map((layer) => {
    const hit = COLORS.find(([type, ids]) => type === layer.type && ids.test(layer.id));
    return hit ? { ...layer, paint: { ...layer.paint, [PAINT[hit[0]]]: hit[2] } } : layer;
  }),
});

// CARTO wants the Basemaps key on every request to its hosts (style, tiles,
// sprites, fonts). Other URLs pass through untouched.
export const withCartoKey = (url, key) => {
  if (!key || !/^https:\/\/([a-z0-9-]+\.)?basemaps\.cartocdn\.com\//.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`;
};
