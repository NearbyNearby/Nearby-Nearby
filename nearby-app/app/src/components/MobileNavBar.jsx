
/**
 * Fixed bottom bar on mobile — Search + Menu buttons.
 * Hidden at 1200px+ (desktop). Ported from nn-templates/default-page-01.html lines 32-76.
 */
export default function MobileNavBar({ searchOverlay, navOverlay }) {
  return (
    <div id="mobile_nav_bar">
      {/* Search button */}
      <button
        id="btn_search_nav"
        className={`btn_reset btn_trigger btn_nav_icon_style_1${searchOverlay.isOpen ? ' is_active' : ''}`}
        type="button"
        onClick={() => { navOverlay.close(); searchOverlay.toggle(); }}
        aria-expanded={searchOverlay.isOpen}
        aria-controls="search_overlay"
        ref={searchOverlay.triggerRef}
      >
        <svg className="icon_style_1 icon_open" width="19" height="19" viewBox="0 0 24 25" xmlns="http://www.w3.org/2000/svg" style={{fillRule:'evenodd',clipRule:'evenodd',strokeLinejoin:'round',strokeMiterlimit:2}}>
          <g transform="matrix(0.0468773,0,0,0.0468773,0,0)">
            <path d="M416,208C416,253.9 401.1,296.3 376,330.7L502.6,457.4C515.1,469.9 515.1,490.2 502.6,502.7C490.1,515.2 469.8,515.2 457.3,502.7L330.7,376C296.3,401.2 253.9,416 208,416C93.1,416 0,322.9 0,208C0,93.1 93.1,0 208,0C322.9,0 416,93.1 416,208ZM208,352C287.5,352 352,287.5 352,208C352,128.5 287.5,64 208,64C128.5,64 64,128.5 64,208C64,287.5 128.5,352 208,352Z" style={{fill:'white',fillRule:'nonzero'}}/>
          </g>
        </svg>
        <svg className="icon_style_1 icon_close" width="19" height="19" viewBox="0 0 35 35" xmlns="http://www.w3.org/2000/svg" style={{fillRule:'evenodd',clipRule:'evenodd',strokeLinejoin:'round',strokeMiterlimit:2}}>
          <g transform="matrix(1.04169,0,0,1.04169,7.08309,27.9169)">
            <path d="M10,-12.828L18.586,-21.414C19.366,-22.195 20.634,-22.195 21.414,-21.414C22.195,-20.634 22.195,-19.366 21.414,-18.586L12.828,-10L21.414,-1.414C22.195,-0.634 22.195,0.634 21.414,1.414C20.634,2.195 19.366,2.195 18.586,1.414L10,-7.172L1.414,1.414C0.634,2.195 -0.634,2.195 -1.414,1.414C-2.195,0.634 -2.195,-0.634 -1.414,-1.414L7.172,-10L-1.414,-18.586C-2.195,-19.366 -2.195,-20.634 -1.414,-21.414C-0.634,-22.195 0.634,-22.195 1.414,-21.414L10,-12.828Z" style={{fill:'rgb(26,33,40)'}}/>
          </g>
        </svg>
        <span className="text_nav_style_1">Search</span>
      </button>

      {/* Menu button */}
      <button
        id="btn_overlay_navigation"
        className={`btn_reset btn_trigger btn_nav_icon_style_1${navOverlay.isOpen ? ' is_active' : ''}`}
        type="button"
        onClick={() => { searchOverlay.close(); navOverlay.toggle(); }}
        aria-expanded={navOverlay.isOpen}
        aria-controls="nav_overlay"
        ref={navOverlay.triggerRef}
      >
        <svg className="icon_style_1 icon_open" width="19" height="19" viewBox="0 0 33 29" xmlns="http://www.w3.org/2000/svg" style={{fillRule:'evenodd',clipRule:'evenodd',strokeLinejoin:'round',strokeMiterlimit:2}}>
          <g transform="matrix(0.999972,0,0,1,-1893.73,-1610.08)">
            <path d="M1926.06,1624.36C1926.06,1625.48 1925.15,1626.38 1924.04,1626.38L1895.8,1626.38C1894.69,1626.38 1893.78,1625.48 1893.78,1624.36C1893.78,1623.24 1894.69,1622.33 1895.8,1622.33L1924.04,1622.33C1925.15,1622.33 1926.06,1623.24 1926.06,1624.36Z" style={{fill:'white'}}/>
          </g>
          <g transform="matrix(0.999972,0,0,1,-1893.73,-1622.33)">
            <path d="M1926.06,1624.36C1926.06,1625.48 1925.15,1626.38 1924.04,1626.38L1895.8,1626.38C1894.69,1626.38 1893.78,1625.48 1893.78,1624.36C1893.78,1623.24 1894.69,1622.33 1895.8,1622.33L1924.04,1622.33C1925.15,1622.33 1926.06,1623.24 1926.06,1624.36Z" style={{fill:'white'}}/>
          </g>
          <g transform="matrix(0.999972,0,0,1,-1893.73,-1597.83)">
            <path d="M1926.06,1624.36C1926.06,1625.48 1925.15,1626.38 1924.04,1626.38L1895.8,1626.38C1894.69,1626.38 1893.78,1625.48 1893.78,1624.36C1893.78,1623.24 1894.69,1622.33 1895.8,1622.33L1924.04,1622.33C1925.15,1622.33 1926.06,1623.24 1926.06,1624.36Z" style={{fill:'white'}}/>
          </g>
        </svg>
        <svg className="icon_style_1 icon_close" width="19" height="19" viewBox="0 0 35 35" xmlns="http://www.w3.org/2000/svg" style={{fillRule:'evenodd',clipRule:'evenodd',strokeLinejoin:'round',strokeMiterlimit:2}}>
          <g transform="matrix(1.04169,0,0,1.04169,7.08309,27.9169)">
            <path d="M10,-12.828L18.586,-21.414C19.366,-22.195 20.634,-22.195 21.414,-21.414C22.195,-20.634 22.195,-19.366 21.414,-18.586L12.828,-10L21.414,-1.414C22.195,-0.634 22.195,0.634 21.414,1.414C20.634,2.195 19.366,2.195 18.586,1.414L10,-7.172L1.414,1.414C0.634,2.195 -0.634,2.195 -1.414,1.414C-2.195,0.634 -2.195,-0.634 -1.414,-1.414L7.172,-10L-1.414,-18.586C-2.195,-19.366 -2.195,-20.634 -1.414,-21.414C-0.634,-22.195 0.634,-22.195 1.414,-21.414L10,-12.828Z" style={{fill:'rgb(26,33,40)'}}/>
          </g>
        </svg>
        <span className="text_nav_style_1">Menu</span>
      </button>
    </div>
  );
}
