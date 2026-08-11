/* Brand social icons for the Contact accordion (#139/#144/#145 item 25).
 * Facebook/Instagram/LinkedIn paths are the same marks used in Footer.jsx,
 * kept local here so this accordion doesn't depend on the footer component.
 * X and TikTok are new additions in the same single-path style. */

const SVG_STYLE = { fillRule: 'evenodd', clipRule: 'evenodd', strokeLinejoin: 'round', strokeMiterlimit: 2 };

export const InstagramIcon = () => (
  <svg width="16" height="16" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" style={SVG_STYLE} aria-hidden="true">
    <g transform="matrix(0.446279,0,0,0.446279,0.011157,-14.2028)"><path d="M224.1,141C160.5,141 109.2,192.3 109.2,255.9C109.2,319.5 160.5,370.8 224.1,370.8C287.7,370.8 339,319.5 339,255.9C339,192.3 287.7,141 224.1,141ZM224.1,330.6C183,330.6 149.4,297.1 149.4,255.9C149.4,214.7 182.9,181.2 224.1,181.2C265.3,181.2 298.8,214.7 298.8,255.9C298.8,297.1 265.2,330.6 224.1,330.6ZM370.5,136.3C370.5,151.2 358.5,163.1 343.7,163.1C328.8,163.1 316.9,151.1 316.9,136.3C316.9,121.5 328.9,109.5 343.7,109.5C358.5,109.5 370.5,121.5 370.5,136.3ZM446.6,163.5C444.9,127.6 436.7,95.8 410.4,69.6C384.2,43.4 352.4,35.2 316.5,33.4C279.5,31.3 168.6,31.3 131.6,33.4C95.8,35.1 64,43.3 37.7,69.5C11.4,95.7 3.3,127.5 1.5,163.4C-0.6,200.4 -0.6,311.3 1.5,348.3C3.2,384.2 11.4,416 37.7,442.2C64,468.4 95.7,476.6 131.6,478.4C168.6,480.5 279.5,480.5 316.5,478.4C352.4,476.7 384.2,468.5 410.4,442.2C436.6,416 444.8,384.2 446.6,348.3C448.7,311.3 448.7,200.5 446.6,163.5ZM398.8,388C391,407.6 375.9,422.7 356.2,430.6C326.7,442.3 256.7,439.6 224.1,439.6C191.5,439.6 121.4,442.2 92,430.6C72.4,422.8 57.3,407.7 49.4,388C37.7,358.5 40.4,288.5 40.4,255.9C40.4,223.3 37.8,153.2 49.4,123.8C57.2,104.2 72.3,89.1 92,81.2C121.5,69.5 191.5,72.2 224.1,72.2C256.7,72.2 326.8,69.6 356.2,81.2C375.8,89 390.9,104.1 398.8,123.8C410.5,153.3 407.8,223.3 407.8,255.9C407.8,288.5 410.5,358.6 398.8,388Z" style={{ fillRule: 'nonzero' }} /></g>
  </svg>
);

export const FacebookIcon = () => (
  <svg width="16" height="16" viewBox="0 0 107 200" xmlns="http://www.w3.org/2000/svg" style={SVG_STYLE} aria-hidden="true">
    <g transform="matrix(0.390198,0,0,0.390625,-8.93162,0)"><path d="M279.14,288L293.36,195.34L204.45,195.34L204.45,135.21C204.45,109.86 216.87,85.15 256.69,85.15L297.11,85.15L297.11,6.26C297.11,6.26 260.43,0 225.36,0C152.14,0 104.28,44.38 104.28,124.72L104.28,195.34L22.89,195.34L22.89,288L104.28,288L104.28,512L204.45,512L204.45,288L279.14,288Z" style={{ fillRule: 'nonzero' }} /></g>
  </svg>
);

export const LinkedinIcon = () => (
  <svg width="16" height="16" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg" style={SVG_STYLE} aria-hidden="true">
    <g transform="matrix(0.0970207,0,0,0.0970207,0,-0.000970207)"><path d="M100.28,448L7.4,448L7.4,148.9L100.28,148.9L100.28,448ZM53.79,108.1C24.09,108.1 0,83.5 0,53.8C-0,24.292 24.282,0.01 53.79,0.01C83.298,0.01 107.58,24.292 107.58,53.8C107.58,83.5 83.48,108.1 53.79,108.1ZM448,448L355.22,448L355.22,302.4C355.22,267.7 354.52,223.2 306.93,223.2C258.64,223.2 251.24,260.9 251.24,299.9L251.24,448L158.46,448L158.46,148.9L247.54,148.9L247.54,189.7L248.84,189.7C261.24,166.2 291.53,141.4 336.72,141.4C430.72,141.4 448,203.3 448,283.7L448,448Z" style={{ fillRule: 'nonzero' }} /></g>
  </svg>
);

export const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={SVG_STYLE} aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" style={{ fillRule: 'nonzero' }} />
  </svg>
);

export const TikTokIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={SVG_STYLE} aria-hidden="true">
    <path d="M16.6 5.82c-.9-.88-1.4-2.07-1.4-3.32h-3.13v13.44a2.59 2.59 0 1 1-1.83-2.47V10.3a5.8 5.8 0 1 0 4.96 5.74V9.01a6.75 6.75 0 0 0 4 1.3V7.19a3.9 3.9 0 0 1-2.6-1.37z" style={{ fillRule: 'nonzero' }} />
  </svg>
);

export const SOCIAL_ICONS = {
  Facebook: FacebookIcon,
  Instagram: InstagramIcon,
  LinkedIn: LinkedinIcon,
  X: XIcon,
  TikTok: TikTokIcon,
};
