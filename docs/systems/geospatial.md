# Geospatial System

## Overview

The Geospatial System handles location-based features using PostgreSQL with PostGIS. It enables storing geographic coordinates, calculating distances, and finding nearby POIs.

**Key Files:**
- `nearby-app/backend/app/crud/crud_poi.py` - Geospatial queries
- `nearby-app/backend/app/api/endpoints/pois.py` - Nearby endpoints
- `nearby-app/backend/app/models/poi.py` - Location fields
- `nearby-app/app/src/components/Map.jsx` - Map visualization (brand-coloured CARTO basemap)
- `nearby-app/app/src/components/nearby-feature/` - Nearby Nearby Feature components

---

## The "Nearby Nearby" Feature

The platform's namesake and flagship feature. When viewing any POI detail page, users see a **"NEARBY" section** that displays other POIs within a configurable radius, helping users discover related places in the area.

### What It Does

1. **Shows nearby POIs** - Fetches and displays businesses, parks, trails, and events near the current POI
2. **Interactive map** - Leaflet map with the brand-coloured basemap and numbered markers that link to result cards
3. **Smart filtering** - Filter by type (All, Businesses, Events, Parks, Trails) and by date
4. **Hybrid AI search** - Search within nearby results using keyword + semantic understanding
5. **Directions** - One-click navigation to Google Maps, Apple Maps, or Waze
6. **Rich POI cards** - Shows distance, hours, amenities, trail difficulty, event dates

### Frontend Components

| Component | Purpose |
|-----------|---------|
| `NearbySection.jsx` | Main container with map, filters, search, pagination, and directions modal |
| `NearbyCard.jsx` | Individual POI cards with distance, hours, amenities, and action buttons |
| `NearbyFilters.jsx` | Horizontal scrolling filter pills with icons (lucide-react) |
| `Map.jsx` | Leaflet map with the brand-coloured basemap and numbered markers |

### Key Features

**Filtering & Search:**
- **Type filter pills**: All, Businesses, Events, Parks, Trails (with lucide icons)
- **Horizontal scroll**: Filter pills scroll horizontally on mobile
- **Hybrid AI search**: Uses `/api/pois/hybrid-search` filtered to nearby results only
- **Date presets**: Today, Tomorrow, This Weekend, or pick a custom date
- **Configurable radius**: 1, 3, 5, 10, or 15 miles

**Date Filtering:**
- Smart dropdown with presets (no manual date entry)
- Shows only places open on selected date
- Filters events by date
- Past event exclusion - automatically hides ended events

**Map Features:**
- **Brand basemap** - CARTO Positron vector tiles recoloured with the NN palette, drawn by MapLibre; OSM raster fallback without WebGL2
- **Numbered markers** - Purple circles with numbers matching card positions
- **Current location** - Teal dot with a halo for the current POI
- **Auto-fit bounds** - Map zooms to show all markers
- **Click to highlight** - Clicking a marker scrolls to and highlights the card

**Mobile-First UX:**
- 44px+ touch targets on all buttons
- Horizontal scrolling filter pills
- Icon-only mode on very small screens (< 480px)
- Responsive breakpoints: 768px, 480px, 360px

**Other Features:**
- **Directions modal**: Choose Google Maps, Apple Maps, or Waze
- **Copy functionality**: Copy lat/long or address to clipboard
- **Amenity icons**: Restrooms, wheelchair accessible, WiFi, pet-friendly
- **Type-specific info**: Trail length/difficulty, park type, event dates
- **Pagination**: Handles large result sets with page navigation

### Controls Layout

```
┌─────────────────────────────────────────────────┐
│  NEARBY                                         │
│  12 listings                                    │
│                                                 │
│  [All] [Businesses] [Events] [Parks] [Trails] →│  ← Horizontal scroll
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ 🔍 Search nearby... try "pet friendly"  │   │  ← Full-width search
│  └─────────────────────────────────────────┘   │
│                                                 │
│  [📍 5 miles ▼] [📅 Any Date ▼] [↺ Clear]      │  ← Dropdowns row
└─────────────────────────────────────────────────┘
```

### API Endpoint

```
GET /api/pois/{poi_id}/nearby?radius_miles={radius}
```

Returns POIs within the specified radius, sorted by distance, with full details including hours, categories, and type-specific data.

---

## PostGIS Setup

### Database Configuration

```sql
-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- The location column uses GEOMETRY type with SRID 4326 (WGS 84)
ALTER TABLE points_of_interest
ADD COLUMN location GEOMETRY(Point, 4326);

-- Create spatial index for fast queries
CREATE INDEX idx_poi_location ON points_of_interest
USING gist (location);
```

### SRID 4326

SRID 4326 is the standard coordinate system (WGS 84) used by GPS and web mapping:
- Latitude: -90 to 90 (North/South)
- Longitude: -180 to 180 (East/West)

---

## Data Model

### Location Fields

```python
# nearby-admin/backend/app/models/poi.py

from geoalchemy2 import Geometry

class PointOfInterest(Base):
    __tablename__ = "points_of_interest"

    # Primary location (PostGIS point)
    location = Column(Geometry("POINT", srid=4326))

    # Human-readable address
    address_street = Column(String(255))
    address_city = Column(String(100))
    address_state = Column(String(50))
    address_zip = Column(String(20))
    address_country = Column(String(100))

    # Front door coordinates (more precise than centroid)
    front_door_latitude = Column(Float)
    front_door_longitude = Column(Float)

    # Trail-specific locations
    # (in Trail subtype)
    trailhead_latitude = Column(Float)
    trailhead_longitude = Column(Float)
    trail_exit_latitude = Column(Float)
    trail_exit_longitude = Column(Float)
```

### Creating Location Points

```python
from geoalchemy2.elements import WKTElement

def create_poi_with_location(db: Session, poi_data: dict):
    """Create POI with geographic location."""

    # Convert lat/lng to PostGIS point
    if poi_data.get("latitude") and poi_data.get("longitude"):
        location = WKTElement(
            f"POINT({poi_data['longitude']} {poi_data['latitude']})",
            srid=4326
        )
    else:
        location = None

    poi = PointOfInterest(
        name=poi_data["name"],
        location=location,
        # ... other fields
    )
    db.add(poi)
    db.commit()
    return poi
```

---

## Distance Calculations

### Meters vs Miles

PostGIS returns distances in meters. Convert to miles:
- 1 mile = 1609.34 meters

### Distance Query

```python
# nearby-app/backend/app/crud/crud_poi.py

from sqlalchemy import func
from geoalchemy2 import Geography

def get_nearby_pois(
    db: Session,
    latitude: float,
    longitude: float,
    radius_miles: float = 5,
    limit: int = 10
):
    """Find POIs within radius of coordinates."""

    # Create point from coordinates
    user_point = func.ST_SetSRID(
        func.ST_MakePoint(longitude, latitude),
        4326
    )

    # Calculate distance in miles
    # Cast to Geography for accurate distance on Earth's surface
    distance_miles = (
        func.ST_Distance(
            PointOfInterest.location.cast(Geography),
            user_point.cast(Geography)
        ) / 1609.34
    ).label("distance_miles")

    # Query with distance filter
    results = db.query(
        PointOfInterest,
        distance_miles
    ).filter(
        PointOfInterest.publication_status == "published",
        PointOfInterest.location.isnot(None),
        func.ST_DWithin(
            PointOfInterest.location.cast(Geography),
            user_point.cast(Geography),
            radius_miles * 1609.34  # Convert miles to meters
        )
    ).order_by(
        distance_miles
    ).limit(limit).all()

    return results
```

### Distance from Specific POI

```python
def get_pois_near_poi(
    db: Session,
    poi_id: UUID,
    radius_miles: float = 5,
    limit: int = 10
):
    """Find POIs near another POI."""

    # Get source POI
    source = db.query(PointOfInterest).filter(
        PointOfInterest.id == poi_id
    ).first()

    if not source or not source.location:
        return []

    # Calculate distance from source POI
    distance_miles = (
        func.ST_Distance(
            PointOfInterest.location.cast(Geography),
            source.location.cast(Geography)
        ) / 1609.34
    ).label("distance_miles")

    results = db.query(
        PointOfInterest,
        distance_miles
    ).filter(
        PointOfInterest.publication_status == "published",
        PointOfInterest.id != poi_id,  # Exclude source
        PointOfInterest.location.isnot(None),
        func.ST_DWithin(
            PointOfInterest.location.cast(Geography),
            source.location.cast(Geography),
            radius_miles * 1609.34
        )
    ).order_by(
        distance_miles
    ).limit(limit).all()

    return results
```

---

## API Endpoints

### GET /api/nearby

Find nearest POIs from user coordinates.

```
GET /api/nearby?lat=35.7198&lng=-79.1772
```

```python
@router.get("/nearby")
async def get_nearby(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    db: Session = Depends(get_db)
):
    """Get 8 nearest POIs from coordinates."""
    results = get_nearby_pois(db, lat, lng, radius_miles=50, limit=8)

    return [
        {
            "id": poi.id,
            "name": poi.name,
            "slug": poi.slug,
            "poi_type": poi.poi_type,
            "distance_miles": round(distance, 2),
            "location": {
                "type": "Point",
                "coordinates": [
                    db.scalar(func.ST_X(poi.location)),
                    db.scalar(func.ST_Y(poi.location))
                ]
            }
        }
        for poi, distance in results
    ]
```

### GET /api/pois/{poi_id}/nearby

Find POIs near a specific POI.

```
GET /api/pois/550e8400-e29b-41d4-a716-446655440000/nearby?radius_miles=5
```

```python
@router.get("/pois/{poi_id}/nearby")
async def get_poi_nearby(
    poi_id: UUID,
    radius_miles: float = Query(5, ge=0.1, le=50),
    db: Session = Depends(get_db)
):
    """Get POIs within radius of specific POI."""
    results = get_pois_near_poi(db, poi_id, radius_miles)

    return [
        {
            "id": poi.id,
            "name": poi.name,
            "slug": poi.slug,
            "poi_type": poi.poi_type,
            "distance_miles": round(distance, 2)
        }
        for poi, distance in results
    ]
```

---

## Frontend Components

### Map Component

The basemap is `BrandBaseMap.jsx`: it fetches CARTO's Positron vector style once, recolours it with the NN palette (`utils/brandMapStyle.js`), and adds it to the Leaflet map as a MapLibre layer (`@maplibre/maplibre-gl-leaflet`), so markers and popups stay plain Leaflet. MapLibre loads lazily with the first map. Every request to `*.basemaps.cartocdn.com` gets `?key=` from `VITE_CARTO_BASEMAPS_KEY`, a build arg fed from the GitHub secret `CARTO_BASEMAPS_KEY` (get one free at carto.com/basemaps/apikey; keyless CARTO raster tiles are stamped "API KEY REQUIRED", #172). Without WebGL2, or if the style fetch fails, it falls back to OSM raster tiles. MapLibre's worker is a same-origin file, so the CSP needs no `worker-src` change.

```jsx
// nearby-app/app/src/components/Map.jsx

import { MapContainer, Marker, Popup, useMap } from 'react-leaflet';
import BrandBaseMap from './BrandBaseMap';

function Map({ currentPOI, nearbyPOIs, radiusMiles, onMarkerClick, highlightedId }) {
  return (
    <MapContainer center={currentCoords} zoom={14} className="leaflet-map">
      <BrandBaseMap />

      {/* Current POI - teal dot */}
      <Marker position={currentCoords} icon={createCurrentIcon()} />

      {/* Nearby POIs - Purple numbered circles */}
      {nearbyPOIs.map((poi, index) => (
        <Marker
          key={poi.id}
          position={coords}
          icon={createNumberedIcon(index + 1, highlightedId === poi.id)}
          eventHandlers={{ click: () => onMarkerClick(poi.id, index) }}
        />
      ))}

      <AutoFitBounds bounds={allCoords} radiusMiles={radiusMiles} />
    </MapContainer>
  );
}
```

### Filter Pills

Horizontal scrolling pills with lucide-react icons:

```jsx
// nearby-app/app/src/components/nearby-feature/NearbyFilters.jsx

import { LayoutGrid, Store, Calendar, Trees, Mountain, Users } from 'lucide-react';

const filterIcons = {
  'All': LayoutGrid,
  'Businesses': Store,
  'Events': Calendar,
  'Parks': Trees,
  'Trails': Mountain,
};

function NearbyFilters({ selectedFilter, onFilterChange }) {
  const filters = ['All', 'Businesses', 'Events', 'Parks', 'Trails'];

  return (
    <div className="nearby-filters">
      <div className="nearby-filters__scroll">
        {filters.map(filter => {
          const Icon = filterIcons[filter];
          return (
            <button
              key={filter}
              className={`nearby-filter ${selectedFilter === filter ? 'nearby-filter--active' : ''}`}
              onClick={() => onFilterChange(filter)}
              aria-pressed={selectedFilter === filter}
            >
              <Icon size={16} />
              <span>{filter}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

### Date Dropdown with Presets

```jsx
// In NearbySection.jsx

const getDatePresets = () => {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const saturday = new Date(today);
  saturday.setDate(today.getDate() + (6 - today.getDay()));

  return {
    today: today.toISOString().split('T')[0],
    tomorrow: tomorrow.toISOString().split('T')[0],
    saturday: saturday.toISOString().split('T')[0]
  };
};

// In JSX:
<div className="nearby-dropdown" ref={dateDropdownRef}>
  <button className="nearby-dropdown__btn" onClick={() => setShowDateDropdown(!showDateDropdown)}>
    <Calendar size={16} />
    <span>{formatDateDisplay(selectedDate)}</span>
    <ChevronDown size={14} />
  </button>

  {showDateDropdown && (
    <div className="nearby-dropdown__menu">
      <button onClick={() => setSelectedDate('')}>Any Date</button>
      <button onClick={() => setSelectedDate(getDatePresets().today)}>Today</button>
      <button onClick={() => setSelectedDate(getDatePresets().tomorrow)}>Tomorrow</button>
      <button onClick={() => setSelectedDate(getDatePresets().saturday)}>This Weekend</button>
      <div className="nearby-dropdown__divider" />
      <label>
        <span>Pick a date</span>
        <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
      </label>
    </div>
  )}
</div>
```

---

## GeoJSON Format

The API returns location data in GeoJSON format:

```json
{
  "id": "uuid",
  "name": "Joe's Coffee",
  "location": {
    "type": "Point",
    "coordinates": [-79.1772, 35.7198]
  }
}
```

**Note**: GeoJSON uses [longitude, latitude] order (opposite of typical lat/lng).

### Converting from PostGIS

```python
from geoalchemy2.shape import to_shape

def poi_to_geojson(poi):
    """Convert POI location to GeoJSON."""
    if poi.location:
        point = to_shape(poi.location)
        return {
            "type": "Point",
            "coordinates": [point.x, point.y]  # [lng, lat]
        }
    return None
```

---

## Bounding Box Queries

Find POIs within a rectangular area:

```python
def get_pois_in_bounds(
    db: Session,
    min_lat: float,
    min_lng: float,
    max_lat: float,
    max_lng: float
):
    """Find POIs within bounding box."""

    # Create bounding box
    bbox = func.ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)

    return db.query(PointOfInterest).filter(
        PointOfInterest.publication_status == "published",
        func.ST_Within(PointOfInterest.location, bbox)
    ).all()
```

---

## Default Location

The nearby-app uses Pittsboro, NC as the default location:

```javascript
// nearby-app/app/src/pages/Explore.jsx

const DEFAULT_LOCATION = {
  latitude: 35.7198,
  longitude: -79.1772,
  city: "Pittsboro",
  state: "NC"
};
```

---

## Best Practices

1. **Use Geography type for distance** - More accurate on Earth's surface
2. **Index location column** - Essential for query performance
3. **Validate coordinates** - Ensure lat/lng are within valid ranges
4. **Handle null locations** - Filter out POIs without coordinates
5. **Convert units consistently** - Always specify miles or meters
6. **Use GeoJSON format** - Standard for web mapping libraries
7. **Limit results** - Cap nearby queries to prevent large responses
8. **Large touch targets** - Use 44px+ min-height for mobile buttons
9. **Horizontal scroll** - Use overflow-x for filter pills on mobile
