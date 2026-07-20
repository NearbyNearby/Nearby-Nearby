import { Link } from 'react-router-dom';

/**
 * Human-readable sitemap (/sitemap).
 *
 * Lists the site's pages for visitors. The machine-readable /sitemap.xml is
 * unrelated and stays as-is for search engines.
 *
 * Links are drawn from the main navigation and the footer, deduplicated and
 * regrouped so nothing appears twice. Help / FAQ is deliberately absent while
 * that page is empty (#129).
 */
const SECTIONS = [
  {
    title: 'Explore the Site',
    links: [
      { to: '/', label: 'Home' },
      { to: '/explore', label: 'Explore' },
      { to: '/explore?type=EVENT', label: 'Events' },
      { to: '/updates', label: 'Updates' },
      { to: '/disaster-network', label: 'Disaster Network' },
    ],
  },
  {
    title: 'Get Involved',
    links: [
      { to: '/claim-business', label: 'Register Your Business' },
      { to: '/suggest-event', label: 'Suggest an Event' },
      { to: '/community-interest', label: 'Community Interest' },
      { to: '/services', label: 'Services' },
      { to: '/feedback', label: 'Share Your Feedback' },
      { to: '/contact', label: 'Contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { to: '/privacy-policy', label: 'Privacy Policy' },
      { to: '/terms-of-service', label: 'Terms & Conditions' },
    ],
  },
];

function Sitemap() {
  return (
    <>
      <header className="page_header_style_1">
        <div className="wrapper_default">
          <h1 className="page_title">Sitemap</h1>
          <p className="page_excerpt">
            Every page on Nearby Nearby, organized in one place.
          </p>
        </div>
      </header>

      <div className="main_content_padding">
        <div className="wrapper_default simple_grid_123col">
          {SECTIONS.map(section => (
            <section key={section.title}>
              <h2 className="title_style_3">{section.title}</h2>
              <ul>
                {section.links.map(link => (
                  <li key={link.label}>
                    <Link to={link.to}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}

export default Sitemap;
