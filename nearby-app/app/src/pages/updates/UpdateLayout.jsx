import { Link } from 'react-router-dom';

// Shared shell for a single Update post. Renders the default page template
// (page_header_style_1 / wrapper_default / main_content_padding) with the
// post's date, title, and excerpt in the header, the featured image, the post
// body (children), and an "All Updates" button at the end.
function UpdateLayout({ title, dateLabel, excerpt, image, children }) {
  return (
    <>
      <header className="page_header_style_1">
        <div className="wrapper_default update_header">
          {dateLabel && <p className="update_meta">{dateLabel}</p>}
          <h1 className="page_title">{title}</h1>
          {excerpt && <p className="page_excerpt update_excerpt">{excerpt}</p>}
        </div>
      </header>

      <div className="main_content_padding">
        <article className="wrapper_default">
          {image && (
            <figure className="update_featured_image">
              <img src={image} alt={title} />
            </figure>
          )}
          {children}
          <div className="update_back">
            <Link to="/updates" className="button">&larr; All Updates</Link>
          </div>
        </article>
      </div>
    </>
  );
}

export default UpdateLayout;
