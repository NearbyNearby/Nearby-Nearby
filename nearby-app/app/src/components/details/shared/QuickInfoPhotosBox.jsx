// The quick-info + photos box (#poi_quick_info_photos_box) is hidden on ALL POI
// detail pages per the POI Accordion show/hide doc. This stub renders nothing.
// To restore: delete this stub and uncomment the original implementation below.
export default function QuickInfoPhotosBox() {
  return null;
}

/*
export default function QuickInfoPhotosBox({ title, quickInfoRows, images, onOpenLightbox }) {
  const gridImages = images ? images.slice(0, 8) : [];

  return (
    <div id="poi_quick_info_photos_box" className="box_style_1">
      <div className="poi_quick_info">
        {title && <div className="poi_quick_info_title">{title}</div>}
        {quickInfoRows}
      </div>

      {gridImages.length > 0 && (
        <div className="poi_photos">
          {gridImages.map((img, idx) => (
            <a
              key={img.id || idx}
              className="photo_overlay"
              href={img.url}
              onClick={(e) => {
                e.preventDefault();
                onOpenLightbox?.(idx);
              }}
            >
              <img
                src={img.thumbnail_url}
                alt={img.alt_text}
                height="100"
                width="100"
                loading="lazy"
              />
            </a>
          ))}
          {images && images.length > 8 && (
            <button
              type="button"
              className="pd-see-all-photos"
              onClick={() => onOpenLightbox?.(0)}
            >
              See All Photos ({images.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
*/
