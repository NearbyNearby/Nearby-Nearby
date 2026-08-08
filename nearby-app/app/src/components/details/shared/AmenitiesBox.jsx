export default function AmenitiesBox({ title = 'Amenities', amenitiesList }) {
  if (!amenitiesList || amenitiesList.length === 0) return null;
  return (
    <div id="poi_amenities_box" className="box_style_1">
      <div className="poi_quick_info_title">{title}</div>
      <div className="poi_amenities_text_list">
        {amenitiesList.map((a, i) => (
          <span className="poi_amenities_text_item" key={i}>{a}</span>
        ))}
      </div>
    </div>
  );
}
