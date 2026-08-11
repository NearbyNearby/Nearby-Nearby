import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';

// Friendly display names for POI types
const TYPE_LABELS = {
  BUSINESS: 'Business',
  PARK: 'Park',
  TRAIL: 'Trail',
  EVENT: 'Event',
};

function SearchDropdown({
  visible,
  anchorEl,
  isLoading,
  results,
  selectedIndex,
  onItemClick,
  onItemHover,
  onClose,
  query = '',
  onSearchAll = null,
}) {
  const portalRootRef = useRef(null);
  const [position, setPosition] = useState(null);

  // Create a container for the portal if it doesn't exist
  if (!portalRootRef.current) {
    const div = document.createElement('div');
    div.setAttribute('id', 'search-dropdown-portal');
    portalRootRef.current = div;
  }

  useEffect(() => {
    const el = portalRootRef.current;
    document.body.appendChild(el);
    return () => {
      document.body.removeChild(el);
    };
  }, []);

  // Recalculate position when visible, on scroll, and on resize
  useEffect(() => {
    const updatePosition = () => {
      if (!anchorEl) return;
      const rect = anchorEl.getBoundingClientRect();
      setPosition({
        top: Math.round(rect.bottom + 8 + window.scrollY),
        left: Math.round(rect.left + window.scrollX),
        width: Math.round(rect.width),
      });
    };

    if (visible) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    }
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [visible, anchorEl]);

  useEffect(() => {
    const onDocMouseDown = (e) => {
      const portalEl = portalRootRef.current;
      if (!portalEl) return;
      const clickedInsidePortal = portalEl.contains(e.target);
      const clickedInAnchor = anchorEl && anchorEl.contains && anchorEl.contains(e.target);
      if (!clickedInsidePortal && !clickedInAnchor) {
        onClose?.();
      }
    };
    if (visible) {
      document.addEventListener('mousedown', onDocMouseDown);
    }
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [visible, anchorEl, onClose]);

  if (!visible || !position) return null;

  const style = {
    position: 'absolute',
    top: position.top,
    left: position.left,
    width: position.width,
    zIndex: 10000,
  };

  const trimmedQuery = query.trim();

  const content = (
    <div className="search-dropdown" style={style} role="listbox">
      {isLoading ? (
        <div className="search-dropdown__state">Searching...</div>
      ) : results && results.length > 0 ? (
        <>
          <ul className="search-dropdown__list">
            {results.map((poi, index) => {
              // #126: show the POI's primary category (e.g. "Shopping & Retail");
              // fall back to the generic type label when no main_category is set.
              const badgeLabel = poi.main_category?.name || TYPE_LABELS[poi.poi_type] || poi.poi_type;
              return (
                <li
                  key={poi.id}
                  className={`search-dropdown__item ${index === selectedIndex ? 'search-dropdown__item--selected' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onItemClick?.(poi); }}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onItemClick?.(poi); }}
                  onMouseEnter={() => onItemHover?.(index)}
                >
                  <div className="search-dropdown__content">
                    <div className="search-dropdown__name-row">
                      <span className="search-dropdown__name">{poi.name}</span>
                      <span className="search-dropdown__type-badge">{badgeLabel}</span>
                    </div>
                    {(poi.address_city || poi.address_state) && (
                      <div className="search-dropdown__city">
                        {[
                          poi.address_city,
                          poi.address_state === 'NC' ? 'North Carolina' : poi.address_state
                        ].filter(Boolean).join(', ')}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {/* "Search all" footer */}
          {trimmedQuery && onSearchAll && (
            <div
              className="search-dropdown__footer"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onSearchAll(trimmedQuery); }}
            >
              <Search size={14} />
              <span>Search for &lsquo;{trimmedQuery}&rsquo; in Explore</span>
            </div>
          )}
        </>
      ) : trimmedQuery ? (
        <div className="search-dropdown__empty">
          <p className="search-dropdown__empty-text">
            We can&rsquo;t find &lsquo;{trimmedQuery}&rsquo;
          </p>
          <Link
            to={`/suggest-place?name=${encodeURIComponent(trimmedQuery)}`}
            className="search-dropdown__suggest-link"
            onMouseDown={() => onClose?.()}
          >
            Suggest this place
          </Link>
          {onSearchAll && (
            <div
              className="search-dropdown__footer"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onSearchAll(trimmedQuery); }}
            >
              <Search size={14} />
              <span>Search for &lsquo;{trimmedQuery}&rsquo; in Explore</span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );

  return createPortal(content, portalRootRef.current);
}

export default SearchDropdown;
