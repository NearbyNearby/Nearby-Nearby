// Canonical list of POI types a category can apply to.
// A category may belong to several types at once (Park + Trail + Business),
// which is why every consumer renders one badge per type rather than a single
// value. `short` is the compact badge label used in the category tree, `label`
// is the full name used in dropdowns, tooltips and filters.
export const POI_TYPE_OPTIONS = [
  { value: 'BUSINESS', label: 'Business', short: 'Bus', color: 'blue' },
  { value: 'SERVICES', label: 'Services', short: 'Svc', color: 'cyan' },
  { value: 'PARK', label: 'Park', short: 'Park', color: 'green' },
  { value: 'TRAIL', label: 'Trail', short: 'Trail', color: 'teal' },
  { value: 'EVENT', label: 'Event', short: 'Event', color: 'grape' },
  { value: 'YOUTH_ACTIVITIES', label: 'Youth Activities', short: 'Youth', color: 'orange' },
  { value: 'JOBS', label: 'Jobs', short: 'Jobs', color: 'indigo' },
  { value: 'VOLUNTEER_OPPORTUNITIES', label: 'Volunteer Opportunities', short: 'Vol', color: 'pink' },
  { value: 'DISASTER_HUBS', label: 'Disaster Hubs', short: 'Hubs', color: 'red' },
];

export const POI_TYPE_MAP = POI_TYPE_OPTIONS.reduce((map, option) => {
  map[option.value] = option;
  return map;
}, {});

// Mantine Select/MultiSelect data for the category form.
export const POI_TYPE_SELECT_DATA = POI_TYPE_OPTIONS.map(({ value, label }) => ({ value, label }));

export function poiTypeMeta(value) {
  return POI_TYPE_MAP[value] || { value, label: value, short: value, color: 'gray' };
}
