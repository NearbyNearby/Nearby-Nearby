import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Overlay from './Overlay';
import NNLogo from './NNLogo';

/**
 * Redesigned header/navbar — ported from nn-templates/default-page-01.html
 * Uses accessible menu with ARIA roles, desktop hover, mobile overlay.
 */
export default function Navbar({ navOverlay, searchOverlay }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);
  const location = useLocation();

  // Close submenu on route change
  useEffect(() => { setMoreOpen(false); }, [location]);

  // Close submenu on click outside
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [moreOpen]);

  // Close submenu when crossing the 1200px breakpoint
  useEffect(() => {
    const handler = () => setMoreOpen(false);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Desktop hover handlers for submenu
  const handleMouseEnter = useCallback(() => {
    if (window.innerWidth >= 1200) setMoreOpen(true);
  }, []);
  const handleMouseLeave = useCallback(() => {
    if (window.innerWidth >= 1200) setMoreOpen(false);
  }, []);

  return (
    <header id="header_primary_parent">
      <div id="logo1">
        <Link id="link_logo_primary1" to="/" aria-label="Nearby Nearby home">
          <NNLogo className="navbar-logo-img" />
        </Link>
      </div>

      <div id="wrapper_header_primary">
        {/* Nav overlay — mobile: fixed panel, desktop: inline */}
        <Overlay
          id="nav_overlay"
          isOpen={navOverlay.isOpen}
          onClose={navOverlay.close}
          panelRef={navOverlay.panelRef}
          className="nav_overlay_box"
        >
          <div id="navigation_primary1">
            <div id="logo2">
              <Link to="/" onClick={navOverlay.close} aria-label="Nearby Nearby home">
                <NNLogo className="navbar-logo-img" />
              </Link>
            </div>

            <nav aria-label="main navigation" id="aaa_menu_primary1">
              <div className="aaa_menu_wrapper_inner1">
                <ul role="menubar" className="aaa_menu_1">
                  {/* Search button (desktop header) */}
                  <li role="none" className="aaa_menu_1_list_item search_link_parent_header">
                    <button
                      id="btn_search_nav_header"
                      className={`btn_reset btn_trigger btn_nav_icon_style_2${searchOverlay.isOpen ? ' is_active' : ''}`}
                      type="button"
                      onClick={() => { navOverlay.close(); searchOverlay.toggle(); }}
                      aria-expanded={searchOverlay.isOpen}
                      aria-controls="search_overlay"
                    >
                      <svg className="icon_style_1 icon_open" width="19" height="19" viewBox="0 0 24 25" xmlns="http://www.w3.org/2000/svg" style={{fillRule:'evenodd',clipRule:'evenodd',strokeLinejoin:'round',strokeMiterlimit:2}}>
                        <g transform="matrix(0.0468773,0,0,0.0468773,0,0)">
                          <path d="M416,208C416,253.9 401.1,296.3 376,330.7L502.6,457.4C515.1,469.9 515.1,490.2 502.6,502.7C490.1,515.2 469.8,515.2 457.3,502.7L330.7,376C296.3,401.2 253.9,416 208,416C93.1,416 0,322.9 0,208C0,93.1 93.1,0 208,0C322.9,0 416,93.1 416,208ZM208,352C287.5,352 352,287.5 352,208C352,128.5 287.5,64 208,64C128.5,64 64,128.5 64,208C64,287.5 128.5,352 208,352Z" style={{fill:'#562556',fillRule:'nonzero'}}/>
                        </g>
                      </svg>
                      <span className="text_nav_style_2">Search</span>
                    </button>
                  </li>

                  <li role="none" className="aaa_menu_1_list_item">
                    <Link role="menuitem" to="/" className="aaa_menu_1_link" onClick={navOverlay.close}>Home</Link>
                  </li>
                  <li role="none" className="aaa_menu_1_list_item">
                    <Link role="menuitem" to="/explore" className="aaa_menu_1_link" onClick={navOverlay.close}>Explore</Link>
                  </li>
                  <li role="none" className="aaa_menu_1_list_item">
                    <Link role="menuitem" to="/explore?type=EVENT" className="aaa_menu_1_link" onClick={navOverlay.close}>Events</Link>
                  </li>
                  <li role="none" className="aaa_menu_1_list_item">
                    <Link role="menuitem" to="/disaster-network" className="aaa_menu_1_link" onClick={navOverlay.close}>Disaster</Link>
                  </li>
                  <li role="none" className="aaa_menu_1_list_item">
                    <Link role="menuitem" to="/updates" className="aaa_menu_1_link" onClick={navOverlay.close}>Updates</Link>
                  </li>

                  {/* More dropdown — submenu always in DOM, toggled via class */}
                  <li
                    role="none"
                    className={`aaa_menu_1_list_item aaa_menu_1_has_sub_menu${moreOpen ? ' aaa_menu_open' : ''}`}
                    ref={moreRef}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                  >
                    <a
                      role="menuitem"
                      href="#"
                      className="aaa_menu_1_link"
                      aria-haspopup="true"
                      onClick={(e) => { e.preventDefault(); setMoreOpen(v => !v); }}
                    >
                      More
                    </a>
                    <button
                      type="button"
                      className="aaa_menu_1_dd_button"
                      aria-expanded={moreOpen}
                      aria-label="show submenu"
                      onClick={() => setMoreOpen(v => !v)}
                    >
                      &#9662;
                    </button>
                    <ul role="menu" className={`aaa_menu_1_sub_menu${moreOpen ? ' aaa_menu_open' : ''}`}>
                      <li role="none" className="aaa_menu_1_list_item">
                        <Link role="menuitem" to="/help" className="aaa_menu_1_link" onClick={navOverlay.close}>Help / FAQ's</Link>
                      </li>
                      <li role="none" className="aaa_menu_1_list_item">
                        <Link role="menuitem" to="/contact" className="aaa_menu_1_link" onClick={navOverlay.close}>Contact</Link>
                      </li>
                      <li role="none" className="aaa_menu_1_list_item">
                        <Link role="menuitem" to="/claim-business" className="aaa_menu_1_link" onClick={navOverlay.close}>Register Your Business</Link>
                      </li>
                    </ul>
                  </li>
                </ul>
              </div>
            </nav>

          </div>
        </Overlay>

{/* Account box removed per user request */}
      </div>

    </header>
  );
}
