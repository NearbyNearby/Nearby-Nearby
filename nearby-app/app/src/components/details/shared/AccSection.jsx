import { useState } from 'react';
import { useAccordionGroup } from './accordionGroupContext';

// Stable, unique DOM id per accordion, derived from its title so the SAME
// accordion has the SAME id across every POI type (e.g. "Pet Policy" ->
// poi_acc_pet_policy, "About + Hours" -> poi_acc_about_hours).
function accSlug(title) {
  return (title || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export default function AccSection({ title, defaultOpen = false, col1, col2, children }) {
  const group = useAccordionGroup();
  const [localOpen, setLocalOpen] = useState(!!defaultOpen);

  const hasC1 = col1 && (Array.isArray(col1) ? col1.some(Boolean) : true);
  const hasC2 = col2 && (Array.isArray(col2) ? col2.some(Boolean) : true);
  const hasChildren = children && (Array.isArray(children) ? children.some(Boolean) : true);

  if (!hasC1 && !hasC2 && !hasChildren) return null;

  const slug = accSlug(title);
  const sectionId = `poi_acc_${slug}`;
  const panelId = `acc_panel_${slug}`;
  // Single-open when inside an AccordionGroup; otherwise self-managed.
  const open = group ? group.openId === sectionId : localOpen;
  const toggleOpen = () => (group ? group.toggle(sectionId) : setLocalOpen((o) => !o));
  const useColumns = hasC1 || hasC2;

  return (
    <div id={sectionId} className={`acc_section${open ? ' acc_active' : ''}`}>
      <button
        className="btn_reset acc_head"
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggleOpen}
      >
        <h3 className="acc_title">{title}</h3>
        <div className="acc_toggles">
          <span className="acc_toggle_element">
            <svg
              className="acc_toggle_icon"
              viewBox="0 0 8 12"
              version="1.1"
              xmlns="http://www.w3.org/2000/svg"
              style={{ fillRule: 'evenodd', clipRule: 'evenodd', strokeLinejoin: 'round', strokeMiterlimit: 2 }}
              aria-hidden="true"
            >
              <g transform="matrix(1.68264e-18,-0.0274797,0.0274797,1.68264e-18,-3.39359,12.1554)">
                <path d="M207.029,381.476L12.686,187.132C3.313,177.759 3.313,162.563 12.686,153.191L35.353,130.524C44.71,121.167 59.875,121.149 69.254,130.484L224,284.505L378.745,130.484C388.124,121.149 403.289,121.167 412.646,130.524L435.313,153.191C444.686,162.564 444.686,177.76 435.313,187.132L240.971,381.476C231.598,390.848 216.402,390.848 207.029,381.476Z" />
              </g>
            </svg>
          </span>
        </div>
      </button>
      {useColumns ? (
        <div
          id={panelId}
          className="acc_content basic_column_parent column_grid_5050"
          role="region"
          style={{ display: open ? 'grid' : 'none' }}
        >
          <div className="acc_col_1">{hasC1 ? col1 : null}</div>
          <div className="acc_col_2">{hasC2 ? col2 : null}</div>
        </div>
      ) : (
        <div
          id={panelId}
          className="acc_content"
          role="region"
          style={{ display: open ? 'block' : 'none' }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
