import { Link } from 'react-router-dom';
import { updates } from '../data/updates';

// /updates — index of all Nearby Nearby update posts. Reuses the homepage
// blog-card styles (query_*_style3 / blog_feed_3wide) for visual consistency,
// but links internally to /updates/:slug instead of the old external blog.
function Updates() {
  return (
    <>
      <header className="page_header_style_1">
        <div className="wrapper_default">
          <h1 className="page_title">Updates</h1>
          <p className="page_excerpt">
            Nearby Nearby announcements, press releases, updates, and guides &ndash; stay informed!
          </p>
        </div>
      </header>

      <div className="main_content_padding">
        <div className="wrapper_wide blog_feed_3wide">
          {updates.map(post => {
            const to = `/updates/${post.slug}`;
            return (
              <div key={post.slug} className="query_single_item_style3">
                <div className="query_image_style3">
                  <Link className="query_img_link_style3" to={to}>
                    <img src={post.image} alt={post.title} loading="lazy" />
                  </Link>
                </div>
                <div className="query_content_style3">
                  <p className="query_date_style3">{post.dateLabel}</p>
                  <h2 className="query_content_title_style3">
                    <Link to={to}>{post.title}</Link>
                  </h2>
                  {/* Excerpt hidden for now — restore to show a summary under each title */}
                  {/* <p className="query_excerpt_text_style3">{post.excerpt}</p> */}
                  <Link to={to}>Read More</Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default Updates;
