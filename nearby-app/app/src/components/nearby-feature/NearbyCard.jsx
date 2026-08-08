import { forwardRef } from 'react';
import { Navigation, Toilet, Wifi, PawPrint, Accessibility } from 'lucide-react';
import { getDisplayableLocation } from '../../utils/getDisplayableLocation';
import { getNextOccurrence } from '../../utils/eventSchedule';
import { getOpenCloseStatusLabel, getEffectiveHoursForDate, formatDayHours } from '../../utils/hoursUtils';

// Card distance formatting: feet under a tenth of a mile, miles above it.
// Exported so Explore's result cards read identically (#134) instead of always
// printing miles.
export function formatDistanceMiles(miles) {
  if (!miles || miles <= 0) return '0 mi';
  if (miles < 0.1) {
    return `${Math.round(miles * 5280)} ft`;
  }
  return `${miles.toFixed(1)} mi`;
}

// Helper to convert meters to miles
function formatDistance(meters) {
  if (!meters || meters === 0) return '0 mi';
  return formatDistanceMiles(meters / 1609.34);
}

// Amenity icon components — Lucide icons (swapped from custom SVGs 2026-05-29)
export const RestroomIcon = () => <Toilet size={19} color="rgb(86,37,86)" strokeWidth={1.5} />;
export const WheelchairIcon = () => <Accessibility size={19} color="rgb(86,37,86)" strokeWidth={1.5} />;
export const WifiIcon = () => <Wifi size={19} color="rgb(86,37,86)" strokeWidth={1.5} />;
export const PetIcon = () => <PawPrint size={19} color="rgb(86,37,86)" strokeWidth={1.5} />;

// Treat any non-empty list whose entries aren't outright "No"-style denials as
// presence of that amenity. The admin schema uses many vocabularies
// ("Dog Friendly", "Accessible Bathrooms", "Free WiFi", etc.) and a strict
// allowlist of literals reliably misses real data.
function hasAmenity(values) {
  if (!Array.isArray(values) || values.length === 0) return false;
  const negatives = new Set(['no', 'none', 'not available', 'unavailable']);
  return values.some((v) => {
    const s = String(v || '').trim().toLowerCase();
    return s && !negatives.has(s);
  });
}

export function getAmenities(poi) {
  const amenities = [];
  // Prefer the registry computed icon_* booleans (card fields); fall back to the
  // loose array heuristic so we never drop an amenity that already showed.
  const has = (iconBool, values) => iconBool === true || hasAmenity(values);
  if (has(poi.icon_public_restroom, poi.public_toilets))  amenities.push({ icon: <RestroomIcon />,   title: 'Public Restrooms',    key: 'restroom' });
  if (poi.icon_wheelchair_accessible === true)            amenities.push({ icon: <WheelchairIcon />, title: 'Wheelchair Accessible', key: 'wheelchair' });
  if (has(poi.icon_free_wifi, poi.wifi_options))          amenities.push({ icon: <WifiIcon />,       title: 'WiFi Available',      key: 'wifi' });
  if (has(poi.icon_pet_friendly, poi.pet_options))        amenities.push({ icon: <PetIcon />,        title: 'Pet Friendly',        key: 'pet' });
  return amenities;
}

function formatEventDate(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Renders the hours status line with only the status word colored.
// variant: 'open' | 'closed' | 'opensoon' | null
function renderHoursStatus(variant, label) {
  if (!label) return null;

  if (variant === 'open') {
    if (label === 'Open 24 Hours') {
      return <span className="nearby-card__hours--open">Open 24 Hours</span>;
    }
    // "Open until 3:00 PM" → "Open Now:" + " Until 3:00 PM"
    const rest = label.replace(/^Open\s*(until\s*)?/i, '').trim();
    return (
      <><span className="nearby-card__hours--open">Open Now:</span>{rest ? ` Until ${rest}` : ''}</>
    );
  }

  if (variant === 'opensoon') {
    // "Opens at 9am" → "Opening Soon:" + " at 9am"
    const rest = label.replace(/^Opens?\s*/i, '').trim();
    return (
      <><span className="nearby-card__hours--soon">Opens Soon:</span>{rest ? ` ${rest}` : ''}</>
    );
  }

  if (variant === 'closed') {
    // "Closed · Opens Tomorrow 9am" → "Closed:" + " Opens Tomorrow 9am"
    const rest = label.replace(/^Closed\s*[·\-]?\s*/i, '').trim();
    return (
      <><span className="nearby-card__hours--closed">Closed:</span>{rest ? ` ${rest}` : ''}</>
    );
  }

  // null variant (e.g. "Hours vary by season") — plain text, no color
  return <>{label}</>;
}

const NearbyCard = forwardRef(function NearbyCard({ poi, index, totalCount = 0, onDetailsClick, onDirectionsClick, isHighlighted, selectedDate }, ref) {
  const poiType = poi.poi_type?.toLowerCase();
  const isEvent = poiType === 'event';
  const isPark  = poiType === 'park';
  const isTrail = poiType === 'trail';
  const isBusiness = poiType === 'business';

  const distance = formatDistance(poi.distance_meters);

  // Event start comes from the flat card field (registry card:true); fall back to
  // the nested event object for callers that pass a full detail payload.
  // #141: for a repeating series that stored date is the FIRST occurrence, so the
  // card resolves the occurrence that is current today. `null` means the
  // recurrence has finished; the card then falls back to the stored date and the
  // "Past" badge below is correct.
  const eventSchedule = poi.event?.start_datetime ? poi.event : poi;
  const nextOccurrence = isEvent ? getNextOccurrence(eventSchedule) : null;
  const eventStart = nextOccurrence?.start || poi.start_datetime || poi.event?.start_datetime;
  // Past is measured from the start of today in UTC, the same cutoff the API's
  // browse filter uses (_event_is_past), so the badge can never contradict a
  // card the server just delivered as current.
  const _badgeNow = new Date();
  const _todayStartUtc = new Date(Date.UTC(
    _badgeNow.getUTCFullYear(), _badgeNow.getUTCMonth(), _badgeNow.getUTCDate()
  ));
  const occurrenceEnd = nextOccurrence
    ? (nextOccurrence.end ?? nextOccurrence.start)
    : (eventStart ? new Date(eventStart) : null);
  const eventIsPast = Boolean(occurrenceEnd) && occurrenceEnd < _todayStartUtc;

  // Coordinates for dawn/dusk-aware status (GeoJSON order: [lng, lat])
  const _poiCoords = poi?.location?.coordinates;
  const _poiLat = Array.isArray(_poiCoords) ? _poiCoords[1] : null;
  const _poiLng = Array.isArray(_poiCoords) ? _poiCoords[0] : null;

  // Hours status — variant drives color, label drives text
  let statusVariant = null;
  let statusLabel = null;
  if (!isEvent) {
    if (selectedDate) {
      // Future date: show day's range only, no open/closed coloring
      const refDate = new Date(selectedDate + 'T12:00:00');
      const { hours: dayHours } = getEffectiveHoursForDate(poi.hours, refDate);
      const formatted = dayHours ? formatDayHours(dayHours) : null;
      statusLabel = (formatted && formatted !== 'Hours not set') ? formatted : null;
    } else {
      const { variant, label } = getOpenCloseStatusLabel(poi.hours, new Date(), _poiLat, _poiLng);
      statusVariant = variant;
      statusLabel = label || null;
    }
  }

  // City, ST line ("Pittsboro, NC")
  const city = poi.address_city;
  const stateAbbr = poi.address_state;
  const cityLine = [city, stateAbbr].filter((s) => s && String(s).trim()).join(', ');

  // Primary category
  const primaryCategory =
    poi.main_category?.name ||
    poi.categories?.find(c => c.is_main)?.category?.name ||
    poi.categories?.[0]?.category?.name ||
    poi.categories?.[0]?.name ||
    null;

  const amenities = getAmenities(poi);

  // Location display gating - hide exact location for POIs that opt out
  const displayLoc = getDisplayableLocation(poi);

  // Stop card-level navigation when interacting with inner controls
  const stop = (e) => e.stopPropagation();
  const handleCardKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onDetailsClick?.();
    }
  };

  return (
    <div
      className={`one_search_map_result_single box_style_1 one_search_map_result_single--clickable${isHighlighted ? ' one_search_map_result_single--highlighted' : ''}`}
      ref={ref}
      role="link"
      tabIndex={0}
      onClick={onDetailsClick}
      onKeyDown={handleCardKey}
      aria-label={`View details for ${poi.name}`}
    >
      {/* Number badge — hidden when only 1 result */}
      {totalCount > 1 && (
        <div className="one_search_map_result_number">{index + 1}</div>
      )}

      {/* Distance */}
      <div className="one_search_map_result_distance">
        <span className="one_search_map_result_calculated">{distance}</span>
        {' '}<span className="one_search_map_result_frompoint">from point of interest</span>
      </div>

      {/* POI Name */}
      <div className={`one_search_map_result_title${isEvent && poi.event?.event_status === 'Canceled' ? ' nearby-card__name--canceled' : ''}`}>
        {poi.name}
      </div>

      {/* City, ST */}
      {cityLine && <div className="one_search_map_single_city">{cityLine}</div>}

      {/* Event status badge for non-Scheduled events */}
      {isEvent && poi.event?.event_status && poi.event.event_status !== 'Scheduled' && (
        <span className={`nearby-card__status-badge nearby-card__status-badge--${poi.event.event_status.toLowerCase().replace(/\s+/g, '-')}`}>
          {poi.event.event_status}
        </span>
      )}

      {/* Past event badge for Scheduled events whose date has passed */}
      {isEvent && eventIsPast && poi.event?.event_status === 'Scheduled' && (
        <span className="nearby-card__status-badge nearby-card__status-badge--past">Past</span>
      )}

      {/* Hours status — colored label word + plain rest */}
      {statusLabel && (
        <div className="one_search_map_result_hours">
          {renderHoursStatus(statusVariant, statusLabel)}
        </div>
      )}

      {/* Event-specific: Date */}
      {isEvent && eventStart && (
        <div className="nearby-card__event-date">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span>{formatEventDate(eventStart)}</span>
        </div>
      )}

      {/* Type + Amenities Group */}
      <div className="one_search_map_result_type_amenities_group">
        {primaryCategory && (
          <div className="one_search_map_result_type">{primaryCategory}</div>
        )}

        {/* Park-specific: Park type */}
        {isPark && poi.park_type && (
          <div className="nearby-card__park-type">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
            <span>{poi.park_type}</span>
          </div>
        )}

        {/* Trail-specific: Length and difficulty (flat card fields, nested fallback) */}
        {isTrail && (
          <div className="nearby-card__trail-info">
            {(poi.length_text || poi.trail?.length_miles) && (
              <span className="nearby-card__trail-length">{poi.length_text || `${poi.trail.length_miles} mi`}</span>
            )}
            {(poi.difficulty || poi.trail?.difficulty) && (
              <span className={`nearby-card__trail-difficulty nearby-card__trail-difficulty--${(poi.difficulty || poi.trail?.difficulty).toLowerCase()}`}>
                {poi.difficulty || poi.trail?.difficulty}
              </span>
            )}
          </div>
        )}

        {/* Amenity Icons */}
        {amenities.length > 0 && (
          <div className="one_search_map_result_amenities" aria-label="Amenities">
            {amenities.map(amenity => (
              <span
                key={amenity.key}
                className="one_search_amenity_icon"
                title={amenity.title}
                aria-label={amenity.title}
              >
                {amenity.icon}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="one_search_map_result_single_buttons" onClick={stop}>
        {!displayLoc.hideExact && (
          <button
            type="button"
            className="btn_reset button btn_outline_teal btn_poi_button_1"
            onClick={(e) => { stop(e); onDirectionsClick(poi); }}
          >
            <Navigation size={14} className="poi_button_icon" style={{fill:'none'}} aria-hidden="true" />
            <span className="poi_button_title">Directions</span>
          </button>
        )}
        <button
          type="button"
          className="btn_reset button btn_outline_teal btn_poi_button_1"
          onClick={(e) => { stop(e); onDetailsClick?.(); }}
        >
          <span className="poi_button_title">Details</span>
        </button>
      </div>
    </div>
  );
});

export default NearbyCard;
