import { useEffect, useState } from 'react';
import { TileLayer, useMap } from 'react-leaflet';
import { CARTO_STYLE_URL, brandStyle, withCartoKey } from '../utils/brandMapStyle';

const KEY = import.meta.env.VITE_CARTO_BASEMAPS_KEY;

// Fetched once per page load and shared by every map on the page.
let stylePromise = null;
const loadStyle = () => {
  stylePromise ??= fetch(withCartoKey(CARTO_STYLE_URL, KEY))
    .then((res) => {
      if (!res.ok) throw new Error(`style ${res.status}`);
      return res.json();
    })
    .then(brandStyle)
    .catch((err) => {
      stylePromise = null;
      throw err;
    });
  return stylePromise;
};

// MapLibre throws without WebGL2, after the layer is already half attached.
let webgl2 = null;
const hasWebGL2 = () => {
  if (webgl2 === null) {
    const gl = document.createElement('canvas').getContext('webgl2');
    webgl2 = Boolean(gl);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
  return webgl2;
};

// Brand-coloured vector basemap drawn by MapLibre inside the Leaflet map, so
// markers and popups stay plain Leaflet. MapLibre (~300 KB gzipped)
// loads only when a map mounts. Falls back to OSM raster tiles without WebGL2
// or when the style can't be fetched.
export default function BrandBaseMap() {
  const map = useMap();
  const [failed, setFailed] = useState(() => !hasWebGL2());

  useEffect(() => {
    if (failed) return undefined;
    let layer = null;
    let cancelled = false;
    Promise.all([
      loadStyle(),
      import('@maplibre/maplibre-gl-leaflet'),
      import('maplibre-gl'),
      // MapLibre looks for its worker beside its own module, which Vite moves.
      import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
      import('maplibre-gl/dist/maplibre-gl.css'),
    ])
      .then(([style, { maplibreGL }, { setWorkerUrl }, { default: workerUrl }]) => {
        if (cancelled) return;
        setWorkerUrl(workerUrl);
        layer = maplibreGL({
          style,
          transformRequest: (url) => ({ url: withCartoKey(url, KEY) }),
        }).addTo(map);
      })
      .catch((err) => {
        console.warn('Brand basemap unavailable, using OSM tiles:', err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      layer?.remove();
    };
  }, [map, failed]);

  if (!failed) return null;
  // OSM serves up to z19 and 400s at z20, so Leaflet upscales z19 tiles beyond that.
  return (
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      maxZoom={20}
      maxNativeZoom={19}
    />
  );
}
