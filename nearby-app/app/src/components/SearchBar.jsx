import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiUrl } from '../config';
import { getPOIUrl } from '../utils/slugify';
import SearchDropdown from './SearchDropdown';

const SearchBar = forwardRef(function SearchBar({
  placeholder = "What's nearby? Search for locations or interests...",
  openInNewTab = false,
  nearbyPoiIds = null,
  onFilterNearby = null,
  onSearch = null,       // callback fired on Enter (no dropdown selection) or search button
  selectedType = null,   // optional POI type filter (e.g. "BUSINESS")
  initialQuery = '',     // pre-fill query
  showSuggestions = true, // when false, no fuzzy dropdown — text entry + Enter/Search only (#114)
  inputId,
}, ref) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Expose query value, focus, and closeDropdown to parent via ref
  useImperativeHandle(ref, () => ({
    getQuery: () => searchQuery,
    focus: () => inputRef.current?.focus(),
    closeDropdown: () => {
      setShowDropdown(false);
      setSearchResults([]);
      setSelectedIndex(-1);
      // Do NOT clear searchQuery — it persists via the URL to Explore.
    },
  }));

  // Sync initialQuery prop changes
  useEffect(() => {
    if (initialQuery !== undefined && initialQuery !== searchQuery) {
      setSearchQuery(initialQuery);
    }
  }, [initialQuery]);

  // When in nearby filter mode and query is cleared, reset the filter
  useEffect(() => {
    if (nearbyPoiIds && onFilterNearby && searchQuery.trim().length === 0) {
      onFilterNearby(null);
    }
  }, [searchQuery, nearbyPoiIds, onFilterNearby]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      const portalEl = document.getElementById('search-dropdown-portal');
      if (portalEl && portalEl.contains(event.target)) return;
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search API call.
  // nearbyPoiIds is a dependency so the nearby-mode intersection is recomputed
  // when the nearby set changes under an active query (e.g. removing a facet or
  // widening the radius grows the set): without it the previously-emitted
  // filtered ids stay computed against the old, narrower set and the newly-in-
  // range matches would be wrongly hidden until the user re-typed.
  useEffect(() => {
    // #114: overlay search passes showSuggestions=false — no fuzzy dropdown at all.
    if (!showSuggestions) return;
    const delayDebounce = setTimeout(() => {
      if (searchQuery.trim().length > 0) {
        fetchSearchResults(searchQuery);
      } else {
        setSearchResults([]);
        setShowDropdown(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, selectedType, nearbyPoiIds, showSuggestions]);

  const fetchSearchResults = async (query) => {
    setIsLoading(true);
    try {
      let url = `api/pois/hybrid-search?q=${encodeURIComponent(query)}&limit=50`;
      if (selectedType && selectedType !== 'All') {
        url += `&poi_type=${encodeURIComponent(selectedType)}`;
      }
      const response = await fetch(getApiUrl(url));
      if (response.ok) {
        const data = await response.json();

        if (nearbyPoiIds && onFilterNearby) {
          const nearbyIdSet = new Set(nearbyPoiIds);
          const filteredResults = data.filter(poi => nearbyIdSet.has(poi.id));
          setSearchResults(filteredResults);
          setShowDropdown(filteredResults.length > 0 || query.trim().length > 0);
          onFilterNearby(filteredResults.map(poi => poi.id));
        } else {
          setSearchResults(data.slice(0, 8));
          setShowDropdown(query.trim().length > 0);
        }
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
      if (nearbyPoiIds && onFilterNearby) {
        onFilterNearby(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setSearchQuery(e.target.value);
    setSelectedIndex(-1);
  };

  const handleResultClick = (poi) => {
    const url = getPOIUrl(poi);
    if (openInNewTab) {
      window.open(url, '_blank');
    } else {
      navigate(url);
    }
    setShowDropdown(false);
    setSearchQuery('');
  };

  const handleSearchAll = (query) => {
    setShowDropdown(false);
    if (onSearch) {
      onSearch(query);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
        handleResultClick(searchResults[selectedIndex]);
      } else if (searchQuery.trim() && onSearch) {
        setShowDropdown(false);
        onSearch(searchQuery.trim());
      }
      return;
    }

    if (!showDropdown || searchResults.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < searchResults.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Escape':
        setShowDropdown(false);
        break;
      default:
        break;
    }
  };

  return (
    <div className="search-bar-wrapper" ref={searchRef}>
      <div className="search-bar-input">
        <span className="search-bar-input__icon" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <input
          type="search"
          id={inputId}
          placeholder={placeholder}
          aria-label="Search for locations or interests"
          value={searchQuery}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          ref={inputRef}
        />
      </div>
      <SearchDropdown
        visible={showDropdown && showSuggestions}
        anchorEl={inputRef.current}
        isLoading={isLoading}
        results={searchResults}
        selectedIndex={selectedIndex}
        onItemClick={handleResultClick}
        onItemHover={setSelectedIndex}
        onClose={() => setShowDropdown(false)}
        query={searchQuery}
        onSearchAll={handleSearchAll}
      />
    </div>
  );
});

export default SearchBar;
