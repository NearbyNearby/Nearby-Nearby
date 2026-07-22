import { useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import SearchBar from './SearchBar';

export default function Hero({ children }) {
  const searchBarRef = useRef(null);
  const navigate = useNavigate();

  const handleSearch = (query) => {
    navigate(`/explore?q=${encodeURIComponent(query)}`);
  };

  const handleSearchButton = (e) => {
    e.preventDefault();
    const query = searchBarRef.current?.getQuery?.()?.trim();
    if (query) handleSearch(query);
  };

  return (
    <div className="page_wrapper_gradient_1">
      <header id="home_layer_search">
        <div className="wrapper_default text_align_center">
          <h1 className="page_title">What's Nearby</h1>
          <p className="page_excerpt pb40px">
            One Search shows local businesses, events, parks, trails and more. <span className="text_color_white">No Ads. No Clutter.</span>
          </p>
        </div>
      </header>

      <div className="search_box_page_container">
        <div id="search_box_page" className='wrapper_default'>
          <form id="search_form_page" role="search" aria-label="one search" onSubmit={handleSearchButton}>
            <div className="search_container">
              <div className="search_input_wrapper">
                <span className="search_icon" aria-hidden="true">
                  <Search size={20} />
                </span>
                <SearchBar
                  ref={searchBarRef}
                  placeholder="What's nearby? Search for locations or interests..."
                  onSearch={handleSearch}
                />
              </div>
              <button className="button btn_search btn_search_gold" type="submit">Search</button>
            </div>
          </form>
        </div>
        <p className="search_terms_text text_color_white">
          All verified and based on what's actually nearby. By clicking Search, you agree to our{' '}
          <Link to="/terms-of-service" className="text_color_white">Terms of Service</Link>.
        </p>
      </div>

      {children}
    </div>
  );
}
