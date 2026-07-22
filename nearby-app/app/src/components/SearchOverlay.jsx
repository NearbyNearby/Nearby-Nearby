import { useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Overlay from './Overlay';
import SearchBar from './SearchBar';

/**
 * Full-screen search overlay — ported from nn-templates/default-page-01.html lines 350-398.
 * Connects to existing hybrid-search API via the SearchBar component.
 */
export default function SearchOverlay({ isOpen, onClose, panelRef }) {
  const navigate = useNavigate();
  const searchBarRef = useRef(null);

  const handleClose = () => {
    searchBarRef.current?.closeDropdown();
    onClose();
  };

  const handleSearch = (query) => {
    searchBarRef.current?.closeDropdown();
    onClose();
    navigate(`/explore?q=${encodeURIComponent(query)}`);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const query = searchBarRef.current?.getQuery?.()?.trim();
    if (query) handleSearch(query);
  };

  return (
    <Overlay
      id="search_overlay"
      isOpen={isOpen}
      onClose={handleClose}
      panelRef={panelRef}
      className="search_overlay_box"
    >
      <h2 className="search_main_title">Search</h2>

      <div id="search_box_header">
        <form id="search_form_header" role="search" aria-label="one search" onSubmit={handleSubmit}>
          <div className="search_container">
            <label htmlFor="one_search" className="visually_hidden">
              Search for locations or interests
            </label>
            <div className="search_input_wrapper">
              <span className="search_icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 25" xmlns="http://www.w3.org/2000/svg" style={{fillRule:'evenodd',clipRule:'evenodd',strokeLinejoin:'round',strokeMiterlimit:2}}>
                  <g transform="matrix(0.0468773,0,0,0.0468773,0,0)">
                    <path d="M416,208C416,253.9 401.1,296.3 376,330.7L502.6,457.4C515.1,469.9 515.1,490.2 502.6,502.7C490.1,515.2 469.8,515.2 457.3,502.7L330.7,376C296.3,401.2 253.9,416 208,416C93.1,416 0,322.9 0,208C0,93.1 93.1,0 208,0C322.9,0 416,93.1 416,208ZM208,352C287.5,352 352,287.5 352,208C352,128.5 287.5,64 208,64C128.5,64 64,128.5 64,208C64,287.5 128.5,352 208,352Z" style={{fill:'rgb(86,37,86)',fillRule:'nonzero'}}/>
                  </g>
                </svg>
              </span>
              <SearchBar
                ref={searchBarRef}
                inputId="one_search"
                placeholder="What's nearby? Search for locations or interests..."
                onSearch={handleSearch}
                showSuggestions={false}
              />
            </div>
            <button type="submit" className="button btn_search">Search</button>
          </div>
          <span id="search_hint" className="visually_hidden">
            Enter a location or interest to search
          </span>
        </form>
      </div>

      <p className="search_terms_text">
        All verified and based on what's actually nearby. By clicking Search, you agree to our{' '}
        <Link to="/terms-of-service" onClick={onClose}>Terms of Service</Link>.
      </p>
    </Overlay>
  );
}
