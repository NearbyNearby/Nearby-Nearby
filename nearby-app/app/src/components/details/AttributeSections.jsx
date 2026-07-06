// Registry-driven auto-render of a POI's public "auto" attribute fields.
//
// Source of truth: shared/poi_fields.json (via poiRegistry.groupsFor). Bespoke
// and hidden fields are excluded by groupsFor (render !== "auto"), so this
// component never double-renders a field a detail page already shows in its
// hero / bespoke sections.
//
// For each ordered group it renders an accordion section; for each field it
// dispatches on entry.type to a widget. Empty values (per the render_rule) are
// skipped, and a group with no non-empty fields is omitted entirely.

import { AccSection } from './shared';
import { groupsFor } from '../../utils/poiRegistry';
import { widgetFor } from './widgets/dispatcher';
import { isEmptyValue } from './widgets/widgetUtils';

// The 8 admin/PII keys that must NEVER reach the auto-renderer. They are
// audience:"admin" so groupsFor already excludes them — this is a defensive
// belt-and-suspenders guard.
const PII_KEYS = new Set([
  'main_contact_name',
  'main_contact_email',
  'main_contact_phone',
  'offsite_emergency_contact',
  'emergency_protocols',
  'contact_info',
  'compliance',
  'admin_notes',
]);

/**
 * Render the auto fields for one field, returning a React node or null.
 * Booleans are special: only `true` produces output (positive pill), so we let
 * the widget decide rather than gating on isEmptyValue here.
 */
function renderField(entry, poi) {
  if (PII_KEYS.has(entry.key)) return null;
  const Widget = widgetFor(entry);
  if (!Widget) return null; // unmapped type — skip rather than crash
  const value = poi?.[entry.key];

  if (entry.type === 'boolean') {
    if (value !== true) return null;
  } else if (isEmptyValue(value)) {
    return null;
  }

  return <Widget key={entry.key} entry={entry} value={value} poi={poi} />;
}

/**
 * @param {object}   props.poi
 * @param {string[]} [props.excludeKeys] auto-field keys this POI type already
 *   renders in a hand-built ("bespoke-style") section, so AttributeSections must
 *   NOT render them again. The registry still drives everything else; this is the
 *   per-page "already covered" allowlist that prevents double-rendering.
 * @param {boolean}  [props.bare] render only the AccSection list (no
 *   poi_accordion_box wrapper, all sections closed) so the sections can live
 *   INSIDE a detail page's existing accordion parent — one curated stack per
 *   page (Barry's single-poi layout), not a second stack below it.
 */
export default function AttributeSections({ poi, excludeKeys = [], bare = false }) {
  if (!poi || !poi.poi_type) return null;

  const exclude = new Set(excludeKeys);
  const groups = groupsFor(poi.poi_type);

  const renderedSections = groups
    .map(({ group, fields }) => {
      const nodes = fields
        .filter((entry) => !exclude.has(entry.key))
        .map((entry) => renderField(entry, poi))
        .filter(Boolean);
      if (nodes.length === 0) return null;
      return { group, nodes };
    })
    .filter(Boolean);

  if (renderedSections.length === 0) return null;

  const sections = renderedSections.map(({ group, nodes }, idx) => (
    <AccSection
      key={group}
      id={`attr_${group.replace(/\s+/g, '_').toLowerCase()}`}
      title={group}
      defaultOpen={!bare && idx === 0}
      col1={nodes}
    />
  ));

  if (bare) return <>{sections}</>;

  return (
    <div id="attribute_sections_box" className="poi_accordion_box">
      <div className="poi_accordion_parent accordionjs">
        {sections}
      </div>
    </div>
  );
}
