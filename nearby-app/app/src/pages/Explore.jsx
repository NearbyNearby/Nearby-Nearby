import { useState, useEffect, useRef, useCallback, useMemo, forwardRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Search,
  X,
  ChevronDown,
  RotateCcw,
  Calendar as CalendarIcon,
  MapPin,
  Navigation,
} from 'lucide-react';
import Map from '../components/Map';
import {
  RestroomIcon,
  // WheelchairIcon removed — wheelchair_accessible column dropped (Issue #45 PR2 Migration B)
  WifiIcon,
  PetIcon,
} from '../components/nearby-feature/NearbyCard';
import { getApiUrl } from '../config';
import { getOpenCloseStatusLabel } from '../utils/hoursUtils';

/* ------------------------------------------------------------------ */
/* Constants                                                          */
/* ------------------------------------------------------------------ */

const FILTER_PILLS = [
  { label: 'All',        type: null },
  { label: 'Businesses', type: 'BUSINESS' },
  { label: 'Events',     type: 'EVENT' },
  { label: 'Parks',      type: 'PARK' },
  { label: 'Trails',     type: 'TRAIL' },
];

const ALL_TYPES = ['BUSINESS', 'EVENT', 'PARK', 'TRAIL'];
const RADIUS_OPTIONS = [1, 3, 5, 10, 15];
const DATE_PRESETS = [
  { value: 'any',      label: 'Any Date' },
  { value: 'today',    label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'weekend',  label: 'This Weekend' },
];

// Downtown Pittsboro center — confirmed by product owner (stopgap; see follow-up ticket for geolocation)
const USER_LOCATION = { lat: 35.72028984062034, lng: -79.17718140354249 };

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function distanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function withDistance(items) {
  return items.map((poi) => {
    const c = poi?.location?.coordinates;
    if (Array.isArray(c) && c.length >= 2) {
      return { ...poi, distance: distanceMiles(USER_LOCATION.lat, USER_LOCATION.lng, c[1], c[0]) };
    }
    return poi;
  });
}

/** Returns {from, to} as YYYY-MM-DD strings for the active date filter, or null when the filter is "any". */
function dateRangeForFilter(filter, customDate) {
  const fmt = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (filter === 'today') {
    return { from: fmt(today), to: fmt(today) };
  }
  if (filter === 'tomorrow') {
    const t = new Date(today); t.setDate(t.getDate() + 1);
    return { from: fmt(t), to: fmt(t) };
  }
  if (filter === 'weekend') {
    // This week's Saturday + Sunday. (Sun=0, Mon=1, ..., Sat=6)
    const dow = today.getDay();
    const daysToSat = (6 - dow + 7) % 7; // 0 if today is Sat
    const sat = new Date(today); sat.setDate(sat.getDate() + daysToSat);
    const sun = new Date(sat);   sun.setDate(sun.getDate() + 1);
    return { from: fmt(sat), to: fmt(sun) };
  }
  if (filter === 'custom' && customDate) {
    return { from: customDate, to: customDate };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Result card — 1:1 port of nn-templates/explore-page-03.html         */
/*   .one_search_map_result_single.box_style_1                         */
/*     ├─ .one_search_map_result_number   (purple circle, top-center) */
/*     ├─ .one_search_map_result_distance                              */
/*     │    ├─ .one_search_map_result_calculated "0.8 miles"           */
/*     │    └─ .one_search_map_result_frompoint "from point of interest"*/
/*     ├─ .one_search_map_result_title                                 */
/*     ├─ .one_search_map_single_city "Pittsboro, NC"                  */
/*     ├─ .one_search_map_result_hours "Open now - Until 9:00PM"       */
/*     ├─ .one_search_map_result_type_amenities_group                  */
/*     │    ├─ .one_search_map_result_type "Restaurant"                */
/*     │    └─ .one_search_map_result_amenities (icon row)             */
/*     └─ .one_search_map_result_single_buttons                        */
/*          ├─ Directions (btn_outline_teal btn_poi_button_1)          */
/*          └─ Details    (btn_outline_teal btn_poi_button_1)          */
/* ------------------------------------------------------------------ */

// Contextual status line for explore result cards — delegates to the shared helper
// so it is dawn/dusk-aware and produces consistent output with detail pages and NearbyCard.
function exploreStatusLine(hours, lat, lng) {
  if (!hours || typeof hours !== 'object') return null;
  const { variant, label } = getOpenCloseStatusLabel(hours, new Date(), lat ?? null, lng ?? null);
  return label ? { variant, label } : null;
}

// Barry's design: color only the leading status word (mirrors NearbyCard).
function renderHoursStatus(status) {
  if (!status?.label) return null;
  const cls = status.variant === 'open' ? 'nearby-card__hours--open'
    : status.variant === 'opensoon' ? 'nearby-card__hours--soon'
    : status.variant === 'closed' ? 'nearby-card__hours--closed' : '';
  const sp = status.label.indexOf(' ');
  const lead = sp === -1 ? status.label : status.label.slice(0, sp);
  const rest = sp === -1 ? '' : status.label.slice(sp);
  return (<><span className={cls}>{lead}</span>{rest}</>);
}

// Same matcher as NearbyCard — accept any non-empty / non-"no" entry.
function exploreHasAmenity(values) {
  if (!Array.isArray(values) || values.length === 0) return false;
  const negatives = new Set(['no', 'none', 'not available', 'unavailable']);
  return values.some((v) => {
    const s = String(v || '').trim().toLowerCase();
    return s && !negatives.has(s);
  });
}

const ResultCard = forwardRef(function ResultCard({ poi, index, isHighlighted }, ref) {
  const navigate = useNavigate();
  const slug = poi.slug || poi.id;
  const city = poi.address_city || poi.city || '';
  const state = poi.address_state || poi.state || '';
  const cityLine = [city, state].filter(Boolean).join(', ');
  const isEvent = poi.poi_type === 'EVENT';
  // Prefer a real category name ("Restaurant") over the raw POI type ("business").
  const categoryLabel =
    poi.main_category?.name ||
    poi.categories?.find((c) => c?.is_main)?.category?.name ||
    poi.categories?.[0]?.category?.name ||
    poi.categories?.[0]?.name ||
    null;
  const amenities = [];
  if (exploreHasAmenity(poi.public_toilets))        amenities.push({ key: 'restroom',   title: 'Public Restrooms',     Icon: RestroomIcon });
  // wheelchair amenity icon removed — wheelchair_accessible column dropped (Issue #45 PR2 Migration B)
  if (exploreHasAmenity(poi.wifi_options))          amenities.push({ key: 'wifi',       title: 'WiFi Available',        Icon: WifiIcon });
  if (exploreHasAmenity(poi.pet_options))           amenities.push({ key: 'pet',        title: 'Pet Friendly',          Icon: PetIcon });
  const hasDistance = typeof poi.distance === 'number';
  const lat = poi?.location?.coordinates?.[1];
  const lng = poi?.location?.coordinates?.[0];
  const statusLine = !isEvent ? exploreStatusLine(poi.hours, lat, lng) : null;
  const directionsHref = lat && lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    : null;

  const goDetails = () => navigate(`/poi/${slug}`);
  const stop = (e) => e.stopPropagation();
  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goDetails(); }
  };

  return (
    <div
      ref={ref}
      className={`one_search_map_result_single box_style_1 one_search_map_result_single--clickable${isHighlighted ? ' one_search_map_result_single--highlighted' : ''}`}
      role="link"
      tabIndex={0}
      onClick={goDetails}
      onKeyDown={handleKey}
      aria-label={`View details for ${poi.name}`}
    >
      <div className="one_search_map_result_number">{index + 1}</div>

      {hasDistance && (
        <div className="one_search_map_result_distance">
          <span className="one_search_map_result_calculated">
            {poi.distance.toFixed(1)} {poi.distance === 1 ? 'mile' : 'miles'}
          </span>{' '}
          <span className="one_search_map_result_frompoint">from downtown Pittsboro</span>
        </div>
      )}

      <div className="one_search_map_result_title">{poi.name}</div>

      {cityLine && <div className="one_search_map_single_city">{cityLine}</div>}

      {statusLine && <div className="one_search_map_result_hours">{renderHoursStatus(statusLine)}</div>}

      {(categoryLabel || amenities.length > 0) && (
        <div className="one_search_map_result_type_amenities_group">
          {categoryLabel && (
            <div className="one_search_map_result_type">{categoryLabel}</div>
          )}
          {amenities.length > 0 && (
            <div className="one_search_map_result_amenities" aria-label="Amenities" onClick={stop}>
              {amenities.map(({ key, title, Icon }) => (
                <span
                  key={key}
                  className="one_search_amenity_icon"
                  title={title}
                  aria-label={title}
                >
                  <Icon />
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="one_search_map_result_single_buttons" onClick={stop}>
        {directionsHref && (
          <a
            className="btn_reset button btn_outline_teal btn_poi_button_1"
            href={directionsHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stop}
          >
            <Navigation size={14} className="poi_button_icon" aria-hidden="true" style={{fill:'none'}} />
            <span className="poi_button_title">Directions</span>
          </a>
        )}
        <Link
          className="btn_reset button btn_outline_teal btn_poi_button_1"
          to={`/poi/${slug}`}
          onClick={stop}
        >
          <span className="poi_button_title">Details</span>
        </Link>
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export default function Explore() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlQuery = searchParams.get('q') || '';
  const urlType  = searchParams.get('type') || null;
  const activePill = urlType || 'All';

  /* state ---------------------------------------------------------- */
  const [pois, setPois]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [searchInput, setSearchInput] = useState(urlQuery);
  const [radius, setRadius]     = useState(5);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState('any');
  const [dateOpen, setDateOpen] = useState(false);
  const [customDate, setCustomDate] = useState('');
  // Set of event POI ids that match the active date filter (null = filter inactive / not yet loaded).
  const [dateMatchedEventIds, setDateMatchedEventIds] = useState(null);

  const radiusRef = useRef(null);
  const dateRef   = useRef(null);

  // Marker click → scroll-to-card + highlight (#32)
  const [highlightedCardId, setHighlightedCardId] = useState(null);
  const cardRefs = useRef({});

  const handleMarkerClick = useCallback((poiId) => {
    setHighlightedCardId(poiId);
    setTimeout(() => {
      cardRefs.current[poiId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    setTimeout(() => setHighlightedCardId(null), 3000);
  }, []);

  /* sync search input with url ------------------------------------- */
  useEffect(() => { setSearchInput(urlQuery); }, [urlQuery]);

  /* close dropdowns on outside click / escape ---------------------- */
  useEffect(() => {
    const onDocClick = (e) => {
      if (radiusRef.current && !radiusRef.current.contains(e.target)) setRadiusOpen(false);
      if (dateRef.current   && !dateRef.current.contains(e.target))   setDateOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { setRadiusOpen(false); setDateOpen(false); }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  /* data fetching -------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        let data = [];
        if (urlQuery) {
          // Search mode — hybrid search
          let url = `api/pois/hybrid-search?q=${encodeURIComponent(urlQuery)}&limit=50`;
          if (urlType) url += `&poi_type=${encodeURIComponent(urlType)}`;
          const res = await fetch(getApiUrl(url));
          data = res.ok ? await res.json() : [];
        } else if (urlType) {
          // Single-type mode
          const res = await fetch(getApiUrl(`api/pois/by-type/${urlType}`));
          data = res.ok ? await res.json() : [];
        } else {
          // Landing — fetch all types in parallel
          const results = await Promise.all(
            ALL_TYPES.map((t) =>
              fetch(getApiUrl(`api/pois/by-type/${t}`))
                .then((r) => (r.ok ? r.json() : []))
                .catch(() => [])
            )
          );
          data = results.flat();
        }
        if (!cancelled) setPois(data);
      } catch (e) {
        if (!cancelled) { setError('Failed to load results.'); setPois([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [urlQuery, urlType]);

  /* fetch event ids that match the active date filter -------------- */
  useEffect(() => {
    const range = dateRangeForFilter(dateFilter, customDate);
    if (!range) {
      setDateMatchedEventIds(null); // filter inactive
      return;
    }

    let cancelled = false;
    const params = new URLSearchParams({ date_from: range.from, date_to: range.to });
    fetch(getApiUrl(`api/events/in-range?${params.toString()}`))
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (cancelled) return;
        const ids = new Set((rows || []).map((r) => String(r.id)));
        setDateMatchedEventIds(ids);
      })
      .catch(() => { if (!cancelled) setDateMatchedEventIds(new Set()); });

    return () => { cancelled = true; };
  }, [dateFilter, customDate]);

  /* derived -------------------------------------------------------- */
  const sortedWithDistance = useMemo(() => {
    const d = withDistance(pois);
    return d.sort((a, b) => {
      const da = typeof a.distance === 'number' ? a.distance : Infinity;
      const db = typeof b.distance === 'number' ? b.distance : Infinity;
      return da - db;
    });
  }, [pois]);

  /** Apply radius (always) + date (events only) filters. */
  const filteredResults = useMemo(() => {
    return sortedWithDistance.filter((poi) => {
      // Radius filter — keep items with no distance (no coords) so they're not silently dropped.
      if (typeof poi.distance === 'number' && poi.distance > radius) return false;

      // Date filter — only constrains EVENT POIs. Non-events pass through unaffected.
      if (dateMatchedEventIds && poi.poi_type === 'EVENT') {
        if (!dateMatchedEventIds.has(String(poi.id))) return false;
      }
      return true;
    });
  }, [sortedWithDistance, radius, dateMatchedEventIds]);

  const pageTitle = urlQuery
    ? <>Results for <span className="explore__title-q">&ldquo;{urlQuery}&rdquo;</span></>
    : urlType
      ? FILTER_PILLS.find((p) => p.type === urlType)?.label || 'Results'
      : 'Explore Nearby';

  const countLabel = !loading && filteredResults.length > 0
    ? `${filteredResults.length} ${filteredResults.length === 1 ? 'place' : 'places'}`
    : null;

  /* handlers ------------------------------------------------------- */
  const handlePillClick = (pillType) => {
    const params = new URLSearchParams();
    if (urlQuery)  params.set('q', urlQuery);
    if (pillType)  params.set('type', pillType);
    setSearchParams(params);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const q = searchInput.trim();
    const params = new URLSearchParams();
    if (q)       params.set('q', q);
    if (urlType) params.set('type', urlType);
    navigate(`/explore${params.toString() ? `?${params.toString()}` : ''}`);
  };

  const clearControls = () => {
    setRadius(5);
    setDateFilter('any');
    setCustomDate('');
    setSearchInput('');
    navigate('/explore');
  };

  const handleRadiusSelect = useCallback((v) => { setRadius(v); setRadiusOpen(false); }, []);
  const handleDateSelect   = useCallback((v) => {
    setDateFilter(v);
    if (v !== 'custom') setCustomDate('');
    setDateOpen(false);
  }, []);

  const dateButtonLabel = dateFilter === 'custom' && customDate
    ? customDate
    : DATE_PRESETS.find((p) => p.value === dateFilter)?.label || 'Any Date';

  /* map split ------------------------------------------------------ */
  const mapCurrent = filteredResults.find((p) => p?.location?.coordinates) || null;
  const mapOthers  = mapCurrent
    ? filteredResults.filter((p) => p !== mapCurrent && p?.location?.coordinates)
    : [];

  /* render --------------------------------------------------------- */
  return (
    <div className="explore-page">
      {/* ── Controls band (purple) ─────────────────────────────── */}
      <div id="one_search_magic">
        <div className="wrapper_default one_search_wrapper">
          {/* Filter pills */}
          <div className="one_search_1" role="tablist" aria-label="Filter by category">
            {FILTER_PILLS.map((pill) => {
              const isActive = (pill.type || 'All') === activePill;
              return (
                <button
                  key={pill.label}
                  type="button"
                  className={`btn_reset one_search_button one_search_button_style_1${isActive ? ' selected' : ''}`}
                  aria-label={`Filter by ${pill.label.toLowerCase()}`}
                  aria-pressed={isActive}
                  onClick={() => handlePillClick(pill.type)}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>

          {/* Search + controls */}
          <div className="one_search_2">
            <form className="search_container" onSubmit={handleSearchSubmit} role="search">
              <label htmlFor="one_search_inpage" className="visually_hidden">
                Search for locations or interests
              </label>
              <div className="search_input_wrapper">
                <span className="search_icon" aria-hidden="true">
                  <Search size={20} />
                </span>
                <input
                  type="search"
                  id="one_search_inpage"
                  className="search_input"
                  placeholder="What's nearby? Search for locations or interests..."
                  autoComplete="off"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
              <button type="submit" className="button btn_search btn_search_gold">
                Search
              </button>
            </form>

            <div className="one_search_controls">
              {/* Radius */}
              <div className="one_search_group">
                <div className="radius_dropdown_wrapper" ref={radiusRef}>
                  <button
                    type="button"
                    className="btn_show_radius_options"
                    aria-haspopup="true"
                    aria-expanded={radiusOpen}
                    onClick={() => setRadiusOpen((p) => !p)}
                  >
                    <MapPin size={16} aria-hidden="true" />
                    <span>{radius} {radius === 1 ? 'mile' : 'miles'}</span>
                    <ChevronDown size={14} className="lucide_chevron_down" aria-hidden="true" />
                  </button>
                  {radiusOpen && (
                    <div className="dropdown_show_radius_options" role="menu">
                      {RADIUS_OPTIONS.map((r) => (
                        <button
                          key={r}
                          type="button"
                          className={`radius_dropdown_option${r === radius ? ' radius_dropdown_option_active' : ''}`}
                          role="menuitem"
                          onClick={() => handleRadiusSelect(r)}
                        >
                          {r} {r === 1 ? 'mile' : 'miles'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Date */}
              <div className="one_search_group">
                <div className="date_dropdown_wrapper" ref={dateRef}>
                  <button
                    type="button"
                    className="btn_show_event_options"
                    aria-haspopup="true"
                    aria-expanded={dateOpen}
                    onClick={() => setDateOpen((p) => !p)}
                  >
                    <CalendarIcon size={16} aria-hidden="true" />
                    <span>{dateButtonLabel}</span>
                    <ChevronDown size={14} className="lucide_chevron_down" aria-hidden="true" />
                  </button>
                  {dateOpen && (
                    <div className="dropdown_show_event_options" role="menu">
                      {DATE_PRESETS.map((preset) => (
                        <button
                          key={preset.value}
                          type="button"
                          className={`date_dropdown_option${dateFilter === preset.value ? ' date_dropdown_option_active' : ''}`}
                          role="menuitem"
                          onClick={() => handleDateSelect(preset.value)}
                        >
                          {preset.label}
                        </button>
                      ))}
                      <div className="date_dropdown_divider" role="separator" />
                      <div className="date_dropdown_custom">
                        <label className="date_dropdown_date_label">
                          <span>Pick a date</span>
                          <span className="date_dropdown_date_field">
                          <input
                            type="date"
                            className={`date_dropdown_date_input${customDate ? '' : ' is-empty'}`}
                            value={customDate}
                            onChange={(e) => {
                              setCustomDate(e.target.value);
                              setDateFilter('custom');
                              setDateOpen(false);
                            }}
                          />
                          {!customDate && <span className="date_dropdown_date_ph" aria-hidden="true">mm/dd/yyyy</span>}
                          </span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                className="btn_reset button btn_clear"
                aria-label="Clear all filters"
                onClick={clearControls}
              >
                <RotateCcw size={16} aria-hidden="true" />
                <span>Clear</span>
              </button>

              <Link to="/claim-business" className="add_location_link">
                Add Location
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Results title band ─────────────────────────────────── */}
      <div className="explore__title-band">
        <div className="wrapper_default explore__title-inner">
          {(urlQuery || urlType) && (
            <Link to="/explore" className="explore__back" aria-label="Back to all places">
              <X size={18} aria-hidden="true" color="white" />
            </Link>
          )}
          <h1 className="explore__title">{pageTitle}</h1>
          {countLabel && <span className="explore__count">{countLabel}</span>}
        </div>
      </div>

      {/* ── Results + map ─────────────────────────────────────── */}
      {error ? (
        <div className="explore__state explore__state--error">{error}</div>
      ) : loading ? (
        <div className="explore__state">Loading places…</div>
      ) : filteredResults.length === 0 ? (
        <div className="explore__state explore__state--empty">
          <p className="explore__state-msg">
            {urlQuery
              ? <>No results found for &ldquo;{urlQuery}&rdquo;.</>
              : <>No places match these filters.</>}
          </p>
          {urlQuery && (
            <Link
              to={`/claim-business?name=${encodeURIComponent(urlQuery)}`}
              className="explore__suggest"
            >
              Suggest this place
            </Link>
          )}
        </div>
      ) : (
        <div id="map_results_layout_1">
          <div className="map_results_layout_1_left_col">
            {filteredResults.map((poi, idx) => (
              <ResultCard
                key={poi.id}
                poi={poi}
                index={idx}
                ref={(el) => (cardRefs.current[poi.id] = el)}
                isHighlighted={highlightedCardId === poi.id}
              />
            ))}
          </div>
          <div className="map_results_layout_1_right_col">
            {mapCurrent ? (
              <Map
                currentPOI={mapCurrent}
                nearbyPOIs={mapOthers}
                onMarkerClick={handleMarkerClick}
                highlightedId={highlightedCardId}
              />
            ) : (
              <div className="explore__map-empty">
                <MapPin size={32} aria-hidden="true" />
                <span>No mapped locations</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
