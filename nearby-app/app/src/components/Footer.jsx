import { useState } from 'react';
import { Link } from 'react-router-dom';
import NNLogo from './NNLogo';
import InstallButton from './InstallButton';
import { getApiUrl } from '../config';

/**
 * 3-layer footer — ported from nn-templates/default-page-01.html
 * Layer 1: Email newsletter (purple bg)
 * Layer 2: Community interest (gold bg)
 * Layer 3: Main footer (4 columns + copyright bar)
 */
export default function Footer() {
  // Footer newsletter mirrors SignupBar — both POST to /api/waitlist.
  const [status, setStatus] = useState({ state: 'idle', message: '' }); // idle | submitting | success | error

  const handleSubscribe = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const email = new FormData(form).get('email');
    if (!email || typeof email !== 'string') return;
    setStatus({ state: 'submitting', message: '' });
    try {
      const res = await fetch(getApiUrl('api/waitlist'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.ok) {
        setStatus({ state: 'success', message: "Thanks! You're on the list." });
        form.reset();
      } else {
        const body = await res.json().catch(() => ({}));
        setStatus({ state: 'error', message: body?.detail || 'Subscription failed. Please try again.' });
      }
    } catch {
      setStatus({ state: 'error', message: 'Network error. Please try again.' });
    }
  };

  return (
    <>
      {/* ── Layer 1: Email newsletter ─────────────────────────── */}
      <div id="footer_layer_email">
        <div id="footer_layer_email_wrapper" className="wrapper_default">
          <div className="email_intro_box">
            <svg className="email_icon" width="153" height="150" viewBox="0 0 153 150" xmlns="http://www.w3.org/2000/svg" style={{fillRule:'evenodd',clipRule:'evenodd',strokeLinejoin:'round',strokeMiterlimit:2}}>
              <g transform="matrix(0.16375,0,0,0.16375,-21.8905,-23.6381)">
                <path d="M1066.3,489.02C1066.3,488.708 1066.14,488.458 1066.12,488.157C1066.09,487.618 1066.05,487.102 1065.94,486.559C1065.83,486.008 1065.65,485.493 1065.47,484.95C1065.28,484.375 1065.09,483.832 1064.82,483.305C1064.59,482.825 1064.32,482.379 1064.02,481.926C1063.87,481.7 1063.84,481.434 1063.68,481.219C1063.5,480.981 1063.23,480.86 1063.02,480.629C1062.62,480.161 1062.19,479.743 1061.73,479.332C1061.5,479.141 1061.39,478.864 1061.14,478.672L974.894,413.57L994.574,284.45C995.652,277.384 990.793,270.77 983.726,269.688L733.846,231.598L633.146,155.578C613.322,140.613 586.693,140.613 566.869,155.578L511.131,197.648L341.581,171.8C334.515,170.722 327.901,175.581 326.819,182.648L300.276,356.788L138.846,478.638C138.608,478.818 138.487,479.095 138.256,479.298C137.787,479.705 137.369,480.127 136.959,480.595C136.768,480.822 136.49,480.931 136.299,481.185C136.131,481.4 136.108,481.666 135.963,481.892C135.662,482.349 135.401,482.791 135.158,483.271C134.893,483.81 134.701,484.349 134.51,484.916C134.33,485.455 134.151,485.97 134.041,486.525C133.932,487.052 133.897,487.568 133.861,488.123C133.838,488.424 133.682,488.674 133.682,488.986L133.682,1000.59C133.682,1000.74 133.729,1000.9 133.729,1001.06C133.74,1002.04 133.955,1003.03 134.029,1004.02C135.842,1032.72 159.529,1055.58 188.677,1055.58L1011.24,1055.58C1040.38,1055.58 1064.09,1032.72 1065.88,1004.02C1065.96,1003.03 1066.17,1002.04 1066.19,1001.06C1066.19,1000.9 1066.23,1000.74 1066.23,1000.59L1066.23,488.986L1066.3,489.02ZM1039.55,956.04L718.324,758.15L1040.39,515.03L1040.39,956.65C1040.09,956.459 1039.86,956.228 1039.55,956.037L1039.55,956.04ZM1031.85,489.02L954.511,547.399L970.472,442.689L1031.85,489.02ZM582.481,176.28C593.126,168.241 606.887,168.241 617.543,176.28L679.981,223.417L546.911,203.136L582.481,176.28ZM350.501,199.393L967.021,293.366L924.9,569.746L617.54,801.756C606.895,809.795 593.134,809.795 582.478,801.756L292.088,582.556L350.501,199.393ZM481.711,758.133L160.481,956.023C160.18,956.214 159.942,956.445 159.641,956.636L159.641,515.016L481.711,758.133ZM268.601,564.813L168.191,489.008L294.721,393.5L268.601,564.813ZM198.316,1029.7C181.074,1029.7 166.601,1021.59 161.441,1009.05C156.749,997.625 161.585,985.758 174.066,978.078L500.696,776.868C501.751,776.22 502.508,775.309 503.301,774.43L566.891,822.43C576.802,829.907 588.418,833.65 600.024,833.65C611.629,833.65 623.254,829.907 633.157,822.43L696.747,774.43C697.54,775.305 698.294,776.22 699.353,776.868L1025.98,978.078C1038.46,985.758 1043.3,997.625 1038.61,1009.05C1033.46,1021.6 1018.99,1029.7 1001.73,1029.7L198.316,1029.7ZM391.226,539.763C392.304,532.697 398.906,527.833 405.988,528.915L808.218,590.224C815.284,591.302 820.148,597.904 819.066,604.986C818.093,611.392 812.574,615.99 806.273,615.99C805.624,615.99 804.964,615.943 804.304,615.834L402.074,554.525C395.008,553.447 390.144,546.845 391.226,539.763L391.226,539.763ZM409.538,445.419C410.616,438.353 417.218,433.478 424.3,434.571L826.53,495.88C833.596,496.958 838.46,503.56 837.378,510.642C836.405,517.048 830.886,521.646 824.585,521.646C823.936,521.646 823.276,521.599 822.616,521.49L420.386,460.181C413.32,459.103 408.456,452.501 409.538,445.419L409.538,445.419ZM427.85,351.075C428.928,344.009 435.53,339.145 442.612,340.227L643.732,370.875C650.798,371.953 655.662,378.555 654.58,385.637C653.607,392.043 648.088,396.641 641.787,396.641C641.138,396.641 640.478,396.594 639.818,396.485L438.698,365.837C431.632,364.759 426.768,358.157 427.85,351.075L427.85,351.075Z" style={{fill:'white',fillRule:'nonzero'}} />
              </g>
            </svg>
            <div className="email_text_box">
              <div className="email_title title_style_3">Email Newsletter</div>
              <p className="email_subtitle">Get notified by email of enhancements and updates!</p>
            </div>
          </div>

          <div className="email_form_box">
            <form id="email_form_header" aria-label="Email newsletter subscription" onSubmit={handleSubscribe} noValidate>
              <div className="email_container">
                <label htmlFor="email_subscribe" className="visually_hidden">
                  Email address
                </label>
                <div className="email_input_wrapper">
                  <input
                    type="email"
                    id="email_subscribe"
                    name="email"
                    placeholder="Enter your email"
                    autoComplete="email"
                    aria-describedby="email_hint"
                    aria-required="true"
                    required
                    disabled={status.state === 'submitting'}
                  />
                </div>
                <button type="submit" className="button btn_subscribe" disabled={status.state === 'submitting'}>
                  {status.state === 'submitting' ? 'Subscribing…' : 'Subscribe'}
                </button>
              </div>
              <span id="email_hint" className="visually_hidden">
                Enter your email address to subscribe to email updates
              </span>
              <div
                id="email_status"
                role="status"
                aria-live="polite"
                className={`email_status ${status.state}`}
              >
                {status.message}
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* ── Layer 2: Community interest ───────────────────────── */}
      <div id="footer_layer_community">
        <div id="footer_layer_community_wrapper" className="wrapper_default">
          <h3 className="footer_layer_community_title">Want Nearby Nearby in Your Community?</h3>
          <p className="footer_layer_community_excerpt">We're just getting started!</p>
          <p className="footer_layer_community_text">Tell us if you want us in your community. If you're outside North Carolina, don't worry, we're coming nationwide soon, including rural towns and urban communities!</p>
          <p>
            <Link
              className="button"
              to="/community-interest"
              title="link to community interest page"
            >
              Let&apos;s Bring it Home
            </Link>
          </p>
        </div>
      </div>

      {/* ── Layer 3: Main footer ──────────────────────────────── */}
      <footer id="footer_footer">
        <div id="footer_wrapper" className="wrapper_wide">
          <div className="footer_col_1">
            <NNLogo id="logo_footer_1" />
            <p className="stay_connected_title">Stay Connected</p>
            <div className="footer_social_box">
              <a className="icon_icon" href="https://www.instagram.com/itsnearbynearby/" target="_blank" rel="noopener noreferrer" title="link to social media account Instagram">
                <span className="icon_holder">
                  <svg width="100%" height="100%" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" style={{fillRule:'evenodd',clipRule:'evenodd',strokeLinejoin:'round',strokeMiterlimit:2}}>
                    <g transform="matrix(0.446279,0,0,0.446279,0.011157,-14.2028)"><path d="M224.1,141C160.5,141 109.2,192.3 109.2,255.9C109.2,319.5 160.5,370.8 224.1,370.8C287.7,370.8 339,319.5 339,255.9C339,192.3 287.7,141 224.1,141ZM224.1,330.6C183,330.6 149.4,297.1 149.4,255.9C149.4,214.7 182.9,181.2 224.1,181.2C265.3,181.2 298.8,214.7 298.8,255.9C298.8,297.1 265.2,330.6 224.1,330.6ZM370.5,136.3C370.5,151.2 358.5,163.1 343.7,163.1C328.8,163.1 316.9,151.1 316.9,136.3C316.9,121.5 328.9,109.5 343.7,109.5C358.5,109.5 370.5,121.5 370.5,136.3ZM446.6,163.5C444.9,127.6 436.7,95.8 410.4,69.6C384.2,43.4 352.4,35.2 316.5,33.4C279.5,31.3 168.6,31.3 131.6,33.4C95.8,35.1 64,43.3 37.7,69.5C11.4,95.7 3.3,127.5 1.5,163.4C-0.6,200.4 -0.6,311.3 1.5,348.3C3.2,384.2 11.4,416 37.7,442.2C64,468.4 95.7,476.6 131.6,478.4C168.6,480.5 279.5,480.5 316.5,478.4C352.4,476.7 384.2,468.5 410.4,442.2C436.6,416 444.8,384.2 446.6,348.3C448.7,311.3 448.7,200.5 446.6,163.5ZM398.8,388C391,407.6 375.9,422.7 356.2,430.6C326.7,442.3 256.7,439.6 224.1,439.6C191.5,439.6 121.4,442.2 92,430.6C72.4,422.8 57.3,407.7 49.4,388C37.7,358.5 40.4,288.5 40.4,255.9C40.4,223.3 37.8,153.2 49.4,123.8C57.2,104.2 72.3,89.1 92,81.2C121.5,69.5 191.5,72.2 224.1,72.2C256.7,72.2 326.8,69.6 356.2,81.2C375.8,89 390.9,104.1 398.8,123.8C410.5,153.3 407.8,223.3 407.8,255.9C407.8,288.5 410.5,358.6 398.8,388Z" style={{fillRule:'nonzero'}} /></g>
                  </svg>
                </span>
              </a>
              <a className="icon_icon" href="https://www.facebook.com/ItsNearbyNearby" target="_blank" rel="noopener noreferrer" title="link to social media account Facebook">
                <span className="icon_holder">
                  <svg width="100%" height="100%" viewBox="0 0 107 200" xmlns="http://www.w3.org/2000/svg" style={{fillRule:'evenodd',clipRule:'evenodd',strokeLinejoin:'round',strokeMiterlimit:2}}>
                    <g transform="matrix(0.390198,0,0,0.390625,-8.93162,0)"><path d="M279.14,288L293.36,195.34L204.45,195.34L204.45,135.21C204.45,109.86 216.87,85.15 256.69,85.15L297.11,85.15L297.11,6.26C297.11,6.26 260.43,0 225.36,0C152.14,0 104.28,44.38 104.28,124.72L104.28,195.34L22.89,195.34L22.89,288L104.28,288L104.28,512L204.45,512L204.45,288L279.14,288Z" style={{fillRule:'nonzero'}} /></g>
                  </svg>
                </span>
              </a>
              <a className="icon_icon" href="https://www.linkedin.com/company/nearby-nearby/" target="_blank" rel="noopener noreferrer" title="link to social media account LinkedIn">
                <span className="icon_holder">
                  <svg viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg" style={{fillRule:'evenodd',clipRule:'evenodd',strokeLinejoin:'round',strokeMiterlimit:2}}>
                    <g transform="matrix(0.0970207,0,0,0.0970207,0,-0.000970207)"><path d="M100.28,448L7.4,448L7.4,148.9L100.28,148.9L100.28,448ZM53.79,108.1C24.09,108.1 0,83.5 0,53.8C-0,24.292 24.282,0.01 53.79,0.01C83.298,0.01 107.58,24.292 107.58,53.8C107.58,83.5 83.48,108.1 53.79,108.1ZM448,448L355.22,448L355.22,302.4C355.22,267.7 354.52,223.2 306.93,223.2C258.64,223.2 251.24,260.9 251.24,299.9L251.24,448L158.46,448L158.46,148.9L247.54,148.9L247.54,189.7L248.84,189.7C261.24,166.2 291.53,141.4 336.72,141.4C430.72,141.4 448,203.3 448,283.7L448,448Z" style={{fillRule:'nonzero'}} /></g>
                  </svg>
                </span>
              </a>
            </div>
          </div>

          <div className="footer_col_2">
            <p className="title_style_4 footer_title_style_1">About</p>
            <p className="footer_about_text">From local businesses to parks and events, we're making it easier for rural communities to discover, support, and celebrate what makes their towns unique.</p>
            <p><InstallButton variant="footer" /></p>
          </div>

          <div className="footer_col_3">
            <p className="title_style_4 footer_title_style_1">Get Involved</p>
            <ul className="list_footer">
              <li><Link to="/services">Services</Link></li>
              <li><Link to="/feedback">Share Your Feedback</Link></li>
              <li><Link to="/claim-business">Register a Business</Link></li>
              <li><Link to="/community-interest">Community Interest</Link></li>
              <li><Link to="/contact">Contact Us</Link></li>
            </ul>
          </div>

          <div className="footer_col_4">
            <p className="title_style_4 footer_title_style_1">Links</p>
            <ul className="list_footer">
              <li><Link to="/">Home</Link></li>
              <li><Link to="/explore">Explore</Link></li>
              <li><Link to="/help">Help / FAQ's</Link></li>
              <li><Link to="/suggest-event">Suggest an Event</Link></li>
              <li><Link to="/disaster-network">Disaster Network</Link></li>
            </ul>
          </div>
        </div>

        <div id="footer_end">
          <div className="end_item copyright_date">&copy; {new Date().getFullYear()} Nearby Nearby. Patent Pending.</div>
          <div className="end_item"><Link to="/privacy-policy">Privacy Policy</Link></div>
          <div className="end_item"><Link to="/terms-of-service">Terms &amp; Conditions</Link></div>
          <div className="end_item"><Link to="/sitemap">Sitemap</Link></div>
        </div>
      </footer>
    </>
  );
}
