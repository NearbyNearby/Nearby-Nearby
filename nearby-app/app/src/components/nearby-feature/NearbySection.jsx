import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronDown, RotateCcw, Calendar as CalendarIcon, MapPin } from 'lucide-react';
import SearchBar from '../SearchBar';
import Map from '../Map';
import NearbyCard from './NearbyCard';
import NearbyFilters from './NearbyFilters';
import NearbyFacets from './NearbyFacets';
import DirectionsModal from '../common/DirectionsModal';
import { getApiUrl } from '../../config';
import { getPOIUrl } from '../../utils/slugify';
import { eventOccursOnDate } from '../../utils/eventSchedule';

const RADIUS_OPTIONS = [1, 3, 5, 10, 15];

// Helper to get date presets
const getDatePresets = () => {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // This weekend (Saturday and Sunday)
  const dayOfWeek = today.getDay();
  const saturday = new Date(today);
  saturday.setDate(today.getDate() + (6 - dayOfWeek));
  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);

  // Next week (next Monday)
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + (8 - dayOfWeek) % 7 || 7);

  return {
    today: today.toISOString().split('T')[0],
    tomorrow: tomorrow.toISOString().split('T')[0],
    saturday: saturday.toISOString().split('T')[0],
    sunday: sunday.toISOString().split('T')[0],
    nextMonday: nextMonday.toISOString().split('T')[0]
  };
};

function NearbySection({ currentPOI }) {
  const navigate = useNavigate();
  const [nearbyPOIs, setNearbyPOIs] = useState([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [activeFacets, setActiveFacets] = useState([]);
  const [activePayment, setActivePayment] = useState(null);
  const [radiusMiles, setRadiusMiles] = useState(5);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(8);
  const [showDirectionsModal, setShowDirectionsModal] = useState(false);
  const [selectedPOI, setSelectedPOI] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [highlightedCardId, setHighlightedCardId] = useState(null);
  const [searchFilteredIds, setSearchFilteredIds] = useState(null);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  const cardRefs = useRef({});
  const resultsTopRef = useRef(null);
  const radiusRef = useRef(null);
  const dateRef = useRef(null);

  const goToPage = (num) => {
    setCurrentPage(num);
    requestAnimationFrame(() => {
      resultsTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  useEffect(() => {
    if (currentPOI) {
      fetchNearbyPOIs();
    }
  }, [currentPOI, radiusMiles, activeFacets, activePayment]);

  // Close dropdowns on outside click or Escape
  useEffect(() => {
    const onDocClick = (e) => {
      if (radiusRef.current && !radiusRef.current.contains(e.target)) setRadiusOpen(false);
      if (dateRef.current && !dateRef.current.contains(e.target)) setDateOpen(false);
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

  const fetchNearbyPOIs = async () => {
    setNearbyLoading(true);
    try {
      const params = new URLSearchParams({ radius_miles: radiusMiles });
      activeFacets.forEach(f => params.append('facet', f));
      if (activePayment) params.append('payment', activePayment);
      const response = await fetch(getApiUrl(`api/pois/${currentPOI.id}/nearby?${params.toString()}`));
      if (response.ok) {
        const data = await response.json();
        setNearbyPOIs(data);
      }
    } catch (err) {
      console.error('Failed to fetch nearby POIs:', err);
    } finally {
      setNearbyLoading(false);
    }
  };

  const handleFilterChange = (filter) => {
    setSelectedFilter(filter);
    setCurrentPage(1);
  };

  const handleToggleFacet = (key) => {
    setActiveFacets(prev =>
      prev.includes(key) ? prev.filter(f => f !== key) : [...prev, key]
    );
    setCurrentPage(1);
  };

  const handlePaymentChange = (method) => {
    setActivePayment(method);
    setCurrentPage(1);
  };

  const handleClear = () => {
    setSelectedFilter('All');
    setActiveFacets([]);
    setActivePayment(null);
    setRadiusMiles(5);
    setSelectedDate('');
    setSearchFilteredIds(null);
    setCurrentPage(1);
  };

  const handleSearchFilter = useCallback((filteredIds) => {
    setSearchFilteredIds(filteredIds);
    setCurrentPage(1);
  }, []);

  // Filter POIs by type, search, and exclude past events
  const filteredNearbyPOIs = nearbyPOIs.filter(nearbyPoi => {
    if (searchFilteredIds !== null) {
      if (!searchFilteredIds.includes(nearbyPoi.id)) {
        return false;
      }
    }

    if (selectedFilter !== 'All') {
      const filterMap = {
        'Businesses': 'business',
        'Events': 'event',
        'Parks': 'park',
        'Trails': 'trail',
      };
      const expectedType = filterMap[selectedFilter];
      if (expectedType && nearbyPoi.poi_type?.toLowerCase() !== expectedType) {
        return false;
      }
    }

    if (nearbyPoi.poi_type?.toLowerCase() === 'event' && nearbyPoi.event?.end_datetime) {
      const eventEnd = new Date(nearbyPoi.event.end_datetime);
      const now = new Date();
      if (eventEnd < now) {
        return false;
      }
    }

    if (selectedDate && nearbyPoi.poi_type?.toLowerCase() !== 'event') {
      const selectedDateObj = new Date(selectedDate + 'T12:00:00');
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayName = days[selectedDateObj.getDay()];
      if (nearbyPoi.hours?.regular?.[dayName]) {
        const dayHours = nearbyPoi.hours.regular[dayName];
        if (dayHours.status === 'closed') {
          return false;
        }
      }
    }

    // Event cards carry their schedule as flat fields (start_datetime plus the
    // recurrence block), not a nested `event` object, so a repeating event is
    // resolved to whichever occurrence (if any) falls on the selected date.
    if (selectedDate && nearbyPoi.poi_type?.toLowerCase() === 'event') {
      if (!eventOccursOnDate(nearbyPoi, selectedDate)) {
        return false;
      }
    }

    return true;
  });

  // Pagination
  const totalPages = Math.ceil(filteredNearbyPOIs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedPOIs = filteredNearbyPOIs.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedFilter, selectedDate, searchFilteredIds]);

  const handleDirectionsClick = (poi) => {
    setSelectedPOI(poi);
    setShowDirectionsModal(true);
  };

  const handleMarkerClick = (poiId, index) => {
    const poiIndex = filteredNearbyPOIs.findIndex(p => p.id === poiId);
    if (poiIndex !== -1) {
      const targetPage = Math.floor(poiIndex / itemsPerPage) + 1;
      if (targetPage !== currentPage) {
        setCurrentPage(targetPage);
      }
      setTimeout(() => {
        const cardElement = cardRefs.current[poiId];
        if (cardElement) {
          cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
    // Wait for the scroll-into-view to finish before highlighting, so the
    // highlight animation isn't already underway (or done) while the card
    // is still off-screen.
    const HIGHLIGHT_DELAY = 1200;
    setTimeout(() => setHighlightedCardId(poiId), HIGHLIGHT_DELAY);
    setTimeout(() => setHighlightedCardId(null), HIGHLIGHT_DELAY + 3000);
  };

  const handleDetailsClick = (poi) => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    navigate(getPOIUrl(poi));
  };

  const renderPagination = () => {
    if (totalPages <= 1 || filteredNearbyPOIs.length <= 1) return null;

    const pageNumbers = [];
    const maxVisible = 6;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }
    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }

    return (
      <div className="nearby_pagination">
        <button
          type="button"
          onClick={() => goToPage(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="nearby_pagination__btn"
        >
          ⏴
        </button>
        {pageNumbers.map(num => (
          <button
            type="button"
            key={num}
            onClick={() => goToPage(num)}
            className={`nearby_pagination__num ${currentPage === num ? 'active' : ''}`}
          >
            {num}
          </button>
        ))}
        <button
          type="button"
          onClick={() => goToPage(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="nearby_pagination__btn"
        >
          ⏵
        </button>
      </div>
    );
  };

  const nearbyPoiIds = useMemo(() => nearbyPOIs.map(poi => poi.id), [nearbyPOIs]);

  return (
    <div className="nearby-section">
      {/* Title + count */}
      <div className="wrapper_default">
        <h2 className="nearby-section__title">Nearby</h2>
        <div className="nearby-section__count">
          {filteredNearbyPOIs.length} {filteredNearbyPOIs.length === 1 ? 'Listing' : 'Listings'}
        </div>
      </div>

      {/* Controls band — mirrors Explore's #one_search_magic structure */}
      <div id="one_search_magic">
        <div className="wrapper_default one_search_wrapper">

          {/* Filter pills — one_search_1 */}
          <div className="one_search_1" role="tablist" aria-label="Filter by category">
            <NearbyFilters
              selectedFilter={selectedFilter}
              onFilterChange={handleFilterChange}
            />
          </div>

          {/* Amenity facet chips — Task 2.2 */}
          <div className="one_search_facets">
            <NearbyFacets
              activeFacets={activeFacets}
              onToggleFacet={handleToggleFacet}
              activePayment={activePayment}
              onPaymentChange={handlePaymentChange}
            />
          </div>

          {/* Search + controls — one_search_2 */}
          <div className="one_search_2">

            {/* Search bar */}
            <div className="search_container">
              <SearchBar
                placeholder="What's nearby? Search for locations or interests..."
                openInNewTab={true}
                nearbyPoiIds={nearbyPoiIds}
                onFilterNearby={handleSearchFilter}
              />
              <button type="button" className="button btn_search btn_search_gold" onClick={() => {}}>
                Search
              </button>
            </div>

            {/* Controls row */}
            <div className="one_search_controls">

              {/* Radius dropdown */}
              <div className="one_search_group">
                <div className="radius_dropdown_wrapper" ref={radiusRef}>
                  <button
                    type="button"
                    className="btn_show_radius_options"
                    aria-haspopup="true"
                    aria-expanded={radiusOpen}
                    onClick={() => setRadiusOpen(p => !p)}
                  >
                    <MapPin size={16} aria-hidden="true" />
                    <span>{radiusMiles} {radiusMiles === 1 ? 'mile' : 'miles'}</span>
                    <ChevronDown size={14} className="lucide_chevron_down" aria-hidden="true" />
                  </button>
                  {radiusOpen && (
                    <div className="dropdown_show_radius_options" role="menu">
                      {RADIUS_OPTIONS.map(r => (
                        <button
                          key={r}
                          type="button"
                          className={`radius_dropdown_option${r === radiusMiles ? ' radius_dropdown_option_active' : ''}`}
                          role="menuitem"
                          onClick={() => { setRadiusMiles(r); setRadiusOpen(false); setCurrentPage(1); }}
                        >
                          {r} {r === 1 ? 'mile' : 'miles'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Date dropdown */}
              <div className="one_search_group">
                <div className="date_dropdown_wrapper" ref={dateRef}>
                  <button
                    type="button"
                    className="btn_show_event_options"
                    aria-haspopup="true"
                    aria-expanded={dateOpen}
                    onClick={() => setDateOpen(p => !p)}
                  >
                    <CalendarIcon size={16} aria-hidden="true" />
                    <span>{selectedDate || 'Any Date'}</span>
                    <ChevronDown size={14} className="lucide_chevron_down" aria-hidden="true" />
                  </button>
                  {dateOpen && (
                    <div className="dropdown_show_event_options" role="menu">
                      <button
                        type="button"
                        className={`date_dropdown_option${!selectedDate ? ' date_dropdown_option_active' : ''}`}
                        role="menuitem"
                        onClick={() => { setSelectedDate(''); setDateOpen(false); }}
                      >
                        Any Date
                      </button>
                      <div className="date_dropdown_divider" role="separator" />
                      <div className="date_dropdown_custom">
                        <label className="date_dropdown_date_label">
                          <span>Pick a date</span>
                          <span className="date_dropdown_date_field">
                            <input
                              type="date"
                              className={`date_dropdown_date_input${selectedDate ? '' : ' is-empty'}`}
                              value={selectedDate}
                              min={getDatePresets().today}
                              onChange={(e) => { setSelectedDate(e.target.value); setDateOpen(false); }}
                            />
                            {!selectedDate && <span className="date_dropdown_date_ph" aria-hidden="true">mm/dd/yyyy</span>}
                          </span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Clear */}
              <button
                type="button"
                className="btn_reset button btn_clear"
                aria-label="Clear all filters"
                onClick={handleClear}
              >
                <RotateCcw size={16} aria-hidden="true" />
                <span>Clear</span>
              </button>

              {/* Add Location */}
              <a href="/claim-business" className="add_location_link" aria-label="Add a new location to the directory">
                Add Location
              </a>

            </div>
          </div>
        </div>
      </div>

      {/* Map Section */}
      <Map
        currentPOI={currentPOI}
        nearbyPOIs={filteredNearbyPOIs}
        radiusMiles={radiusMiles}
        onMarkerClick={handleMarkerClick}
        highlightedId={highlightedCardId}
      />

      {/* Results — matches nn-templates #one_search_map_results structure */}
      <div id="one_search_map_results">
        <div className="map_marker_detail_title">
          <svg className="map_marker_detail_icon" width="19" height="27" viewBox="0 0 12 17" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" xmlSpace="preserve" style={{fillRule:'evenodd',clipRule:'evenodd',strokeLinejoin:'round',strokeMiterlimit:2}}>
            <g transform="matrix(0.612601,0,0,0.612601,-1088.82,-737.077)">
              <g transform="matrix(0.453813,0,0,0.447621,1402.9,1137.62)">
                <path d="M846.755,147.985C852.185,148.014 857.634,149.936 861.523,153.864C865.404,157.786 867.619,163.725 866.615,171.248C866.485,173.399 865.377,175.594 863.884,178.099C862.37,180.638 860.412,183.448 858.352,186.432C854.26,192.359 849.841,198.992 848.144,205.065C847.422,206.907 845.723,206.916 845.227,205.065C843.543,198.989 839.301,192.656 835.297,186.849C831.277,181.017 827.418,175.843 826.895,171.062C826.893,171.048 826.874,171.054 826.872,171.039C825.869,163.512 828.078,157.609 831.964,153.725C835.858,149.835 841.325,147.956 846.755,147.985Z" style={{fill:'rgb(254,199,100)'}} />
              </g>
              <g transform="matrix(0.453813,0,0,0.447621,1402.9,1137.62)">
                <path d="M868.08,171.369L868.076,171.409C867.915,173.745 866.761,176.151 865.141,178.869C863.613,181.434 861.636,184.272 859.555,187.286C855.558,193.075 851.215,199.539 849.557,205.471C849.543,205.52 849.527,205.568 849.509,205.616C848.86,207.269 847.639,207.937 846.604,207.939C845.499,207.941 844.291,207.234 843.813,205.468C842.169,199.537 838.001,193.371 834.093,187.702C829.947,181.688 826.03,176.298 825.434,171.387L825.416,171.24C824.34,163.157 826.761,156.834 830.933,152.665C835.102,148.499 840.949,146.464 846.763,146.496C852.574,146.527 858.398,148.605 862.56,152.809C866.711,157.003 869.131,163.334 868.08,171.369ZM828.305,170.682L828.331,170.884C828.833,175.471 832.645,180.401 836.501,185.996C840.601,191.942 844.917,198.441 846.642,204.662L846.645,204.675L846.664,204.735C846.696,204.684 846.728,204.63 846.754,204.576C848.508,198.384 852.98,191.615 857.148,185.578C859.188,182.624 861.128,179.843 862.626,177.329C863.976,175.064 865.117,173.104 865.234,171.159L865.245,171.05C866.175,164.076 864.084,158.554 860.486,154.919C856.871,151.267 851.795,149.502 846.747,149.474C841.702,149.447 836.613,151.171 832.995,154.786C829.423,158.355 827.43,163.781 828.305,170.682ZM846.754,161.149C850.468,161.149 853.493,164.193 853.493,167.909C853.493,171.625 850.468,174.67 846.754,174.67C843.04,174.67 839.993,171.625 839.993,167.909C839.993,164.193 843.04,161.149 846.754,161.149Z" style={{fill:'rgb(86,37,86)'}} />
              </g>
            </g>
          </svg>
          <span>Shows the current point of interest and results below.</span>
        </div>
        <div className="wrapper_wide one_search_map_results_group" ref={resultsTopRef}>
          {nearbyLoading ? (
            <div className="nearby-results__loading">Loading nearby locations...</div>
          ) : paginatedPOIs.length > 0 ? (
            <>
              {paginatedPOIs.map((nearbyPoi, index) => (
                <NearbyCard
                  key={nearbyPoi.id}
                  ref={(el) => cardRefs.current[nearbyPoi.id] = el}
                  poi={nearbyPoi}
                  index={startIndex + index}
                  totalCount={filteredNearbyPOIs.length}
                  onDetailsClick={() => handleDetailsClick(nearbyPoi)}
                  onDirectionsClick={handleDirectionsClick}
                  isHighlighted={highlightedCardId === nearbyPoi.id}
                  selectedDate={selectedDate}
                />
              ))}
            </>
          ) : (
            <div className="nearby-results__empty">No nearby locations found</div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {renderPagination()}

      {/* Directions Modal */}
      <DirectionsModal
        isOpen={showDirectionsModal && !!selectedPOI}
        onClose={() => setShowDirectionsModal(false)}
        poiName={selectedPOI?.name}
        coords={
          selectedPOI?.location?.coordinates
            ? { lat: selectedPOI.location.coordinates[1], lng: selectedPOI.location.coordinates[0] }
            : null
        }
        poi={selectedPOI}
      />
    </div>
  );
}

export default NearbySection;
