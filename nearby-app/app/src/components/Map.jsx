import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, AttributionControl, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Create a yellow/gold circle for current POI
const createCurrentIcon = () => {
  const svg = `<svg width="38" height="38" xmlns="http://www.w3.org/2000/svg">
    <circle cx="18" cy="18" r="16" fill="#F4C542" stroke="#562556" stroke-width="2"/>
    <circle cx="18" cy="18" r="6" fill="#562556"/>
  </svg>`;
  const svgUrl = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);

  return new L.Icon({
    iconUrl: svgUrl,
    iconSize: [38, 38],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18]
  });
};

// Create numbered purple marker for nearby POIs
const createNumberedIcon = (number, isHighlighted = false) => {
  const bgColor = isHighlighted ? '#328170' : '#562556';
  const size = isHighlighted ? 46 : 38;
  const fontSize = isHighlighted ? 20 : 18;

  const textEl = number != null
    ? `<text x="${size/2}" y="${size/2 + fontSize/3}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="bold" fill="white">${number}</text>`
    : '';
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="${bgColor}" stroke="white" stroke-width="3"/>${textEl}
  </svg>`;
  const svgUrl = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);

  return new L.Icon({
    iconUrl: svgUrl,
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
    popupAnchor: [0, -size/2],
    // #160: the icon is a SQUARE image with an inscribed circle, so its
    // transparent corners still capture clicks. Downtown POIs sit 20-35m apart
    // (~10-18px at z16) which puts a neighbour's corner right on top of the pin
    // you can actually see: clicking marker N then activated marker N+1.
    // `.map-marker-numbered { clip-path: circle(50%) }` clips paint AND hit area
    // to the visible circle, so what you see is what you click.
    className: 'map-marker-numbered'
  });
};

// Component to auto-fit bounds so all markers are visible
function AutoFitBounds({ bounds, radiusMiles }) {
  const map = useMap();
  const prevBoundsKeyRef = useRef(null);

  useEffect(() => {
    if (bounds && bounds.length > 0 && map) {
      // `bounds` is rebuilt as a new array on every parent re-render (e.g. marker
      // click highlight state), even when the actual coordinates haven't changed.
      // Compare by value so we only re-fit when the bounds truly changed, not on
      // every unrelated re-render (was resetting the user's zoom — #135).
      const boundsKey = JSON.stringify(bounds);
      if (boundsKey === prevBoundsKeyRef.current) return;
      prevBoundsKeyRef.current = boundsKey;

      // Calculate maxZoom based on radius (for NearbySection) or default 15 (for Explore)
      let maxZoom = 15;
      if (radiusMiles) {
        if (radiusMiles <= 1) maxZoom = 18;
        else if (radiusMiles <= 3) maxZoom = 17;
        else if (radiusMiles <= 5) maxZoom = 16;
        else if (radiusMiles <= 10) maxZoom = 15;
        else maxZoom = 14;
      }

      try {
        if (bounds.length === 1) {
          // Single marker — center on it at a reasonable zoom
          map.setView(bounds[0], Math.min(maxZoom, 14));
        } else {
          map.fitBounds(bounds, { padding: [70, 70], maxZoom });
        }
      } catch (e) {
        console.warn('Map fitBounds failed:', e.message);
      }
    }
  }, [bounds, radiusMiles, map]);

  return null;
}

/**
 * Click-to-activate scroll-wheel zoom guard.
 * Renders a transparent overlay over the map; clicking it enables scroll-wheel zoom
 * for the current map instance. Moving the mouse out resets to disabled so the next
 * visit starts fresh. pointerEvents:'none' ensures marker clicks are never blocked.
 */
function ScrollWheelToggle() {
  const [active, setActive] = useState(false);

  // #108 fix: enable scroll-wheel zoom via Leaflet MAP events instead of a
  // click-catching overlay. In Leaflet a marker click does NOT propagate to the
  // map 'click', so numbered-marker clicks reach their handler again (scroll to
  // card + highlight), while clicking the empty map still activates scroll zoom.
  const map = useMapEvents({
    click: () => { map.scrollWheelZoom.enable(); setActive(true); },
    mouseout: () => { map.scrollWheelZoom.disable(); setActive(false); },
  });

  // Hover hint only. This layer is pointerEvents:none so it NEVER intercepts
  // marker or map clicks (that overlay was the cause of #108).
  if (active) return null;
  return (
    <div
      className="map-scroll-hint-layer"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 400,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      aria-hidden="true"
    >
      <div
        className="map-scroll-hint"
        style={{
          background: 'rgba(0,0,0,0.55)',
          color: 'white',
          padding: '6px 14px',
          borderRadius: '4px',
          fontSize: '13px',
          fontWeight: 600,
          pointerEvents: 'none',
          opacity: 0,           // shown on map hover via CSS
        }}
      >
        Click map to enable scroll
      </div>
    </div>
  );
}

function Map({ currentPOI = null, nearbyPOIs = [], radiusMiles, onMarkerClick, highlightedId }) {
  // `currentPOI` is optional: Explore (#133) has no "current" POI and passes its
  // FULL result list as nearbyPOIs so marker numbers equal the card numbers.
  // NearbySection still passes a real currentPOI and gets the gold pin.
  const currentCoords = currentPOI?.location?.coordinates
    ? [
        currentPOI.location.coordinates[1], // latitude
        currentPOI.location.coordinates[0]  // longitude
      ]
    : null;

  // If the current POI has opted out of exact location display, we don't show its pin.
  const hideCurrentExact = Boolean(currentPOI?.dont_display_location);

  // Calculate bounds to fit all markers
  const allCoords = [];
  if (currentCoords && !hideCurrentExact) {
    allCoords.push(currentCoords);
  }
  nearbyPOIs.forEach(poi => {
    if (poi.location && !poi.dont_display_location) {
      allCoords.push([
        poi.location.coordinates[1],
        poi.location.coordinates[0]
      ]);
    }
  });

  // Center on the current POI when there is one, otherwise on the first mapped
  // result. With neither there is nothing to draw.
  const center = currentCoords || allCoords[0] || null;
  if (!center) {
    return (
      <div className="map-placeholder">
        <p>No location data available</p>
      </div>
    );
  }
  // Ensure the map always has at least one bound reference so it doesn't crash.
  if (allCoords.length === 0) {
    allCoords.push(center);
  }

  return (
    <div className="map-container">
      <MapContainer
        key={`${currentPOI?.id || 'explore'}-${nearbyPOIs.length}-${nearbyPOIs[nearbyPOIs.length - 1]?.id || ''}`}
        center={center}
        zoom={14}
        className="leaflet-map"
        scrollWheelZoom={false}
        zoomDelta={0.5}
        zoomSnap={0.25}
        wheelPxPerZoomLevel={120}
        wheelDebounceTime={40}
        maxZoom={20} // Allow much closer zoom
        minZoom={10}
        attributionControl={false}
      >
        {/* #102: Leaflet's default prefix is "🇺🇦 Leaflet"; drop the flag but keep
            the library credit and the OSM/CARTO attributions below. */}
        <AttributionControl position="bottomright" prefix="Leaflet" />

        {/* Carto Voyager - MapQuest-like warm colors */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          maxZoom={20}
        />

        <AutoFitBounds bounds={allCoords} radiusMiles={radiusMiles} />
        <ScrollWheelToggle />

        {/* Current POI marker - hidden when POI opts out of showing exact location */}
        {currentCoords && !hideCurrentExact && (
        <Marker position={currentCoords} icon={createCurrentIcon()}>
          <Popup className="custom-popup">
            <div className="popup-content">
              <strong>{currentPOI.name}</strong>
              <p className="popup-label">Current Location</p>
            </div>
          </Popup>
        </Marker>
        )}

        {/* Nearby POI markers - PURPLE NUMBERED CIRCLES. The number is the POI's position in the list the
            caller renders as cards, so an unmapped POI leaves a gap rather than
            shifting every later marker (#133). */}
        {nearbyPOIs.map((poi, index) => {
          if (!poi.location) return null;
          // Hide pin for POIs that opted out of exact-location display
          if (poi.dont_display_location) return null;

          const coords = [
            poi.location.coordinates[1],
            poi.location.coordinates[0]
          ];

          const number = index + 1;
          const isHighlighted = highlightedId === poi.id;
          const showNumber = nearbyPOIs.length > 1;

          return (
            <Marker
              key={poi.id}
              position={coords}
              icon={createNumberedIcon(showNumber ? number : null, isHighlighted)}
              riseOnHover={true}
              eventHandlers={{
                click: () => {
                  if (onMarkerClick) {
                    onMarkerClick(poi.id, index);
                  }
                }
              }}
            >
              <Popup className="custom-popup">
                <div className="popup-content">
                  <strong>{poi.name}</strong>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}

export default Map;
