import { useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
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
                <Search size={20} />
              </span>
              <SearchBar
                ref={searchBarRef}
                inputId="one_search"
                placeholder="What's nearby? Search for locations or interests..."
                onSearch={handleSearch}
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
