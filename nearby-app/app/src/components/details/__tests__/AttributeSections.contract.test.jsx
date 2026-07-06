import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';

import AttributeSections from '../AttributeSections';
import { groupsFor, allEntries } from '../../../utils/poiRegistry';
import { widgetFor, WIDGET_BY_TYPE } from '../widgets/dispatcher';
import { bespokeAutoKeysFor } from '../widgets/bespokeCoverage';

// Mock DOMPurify so ProseBlock doesn't need a real sanitizer DOM.
vi.mock('dompurify', () => ({
  default: { sanitize: (html) => html },
}));

const POI_TYPES = [
  'BUSINESS', 'SERVICES', 'PARK', 'TRAIL', 'EVENT',
  'YOUTH_ACTIVITIES', 'JOBS', 'VOLUNTEER_OPPORTUNITIES', 'DISASTER_HUBS',
];

// The 8 admin/PII keys that must NEVER be rendered to users.
const PII_KEYS = [
  'main_contact_name', 'main_contact_email', 'main_contact_phone',
  'offsite_emergency_contact', 'emergency_protocols', 'contact_info',
  'compliance', 'admin_notes',
];

function renderSections(poi) {
  return render(
    <MemoryRouter>
      <AttributeSections poi={poi} />
    </MemoryRouter>
  );
}

describe('AttributeSections contract — widget mapping', () => {
  it.each(POI_TYPES)(
    '%s: every public auto field maps to a known widget',
    (type) => {
      const groups = groupsFor(type);
      for (const { fields } of groups) {
        for (const entry of fields) {
          const Widget = widgetFor(entry);
          expect(
            Widget,
            `field "${entry.key}" (type "${entry.type}") has no widget`
          ).toBeTruthy();
          expect(WIDGET_BY_TYPE).toHaveProperty(entry.type);
        }
      }
    }
  );

  it('no auto field has an unmapped registry type (no silent drops)', () => {
    const unmapped = new Set();
    for (const type of POI_TYPES) {
      for (const { fields } of groupsFor(type)) {
        for (const entry of fields) {
          if (!WIDGET_BY_TYPE[entry.type]) unmapped.add(`${entry.key}:${entry.type}`);
        }
      }
    }
    expect([...unmapped]).toEqual([]);
  });
});

describe('AttributeSections contract — PII never rendered', () => {
  it('none of the 8 PII keys are in any type\'s auto groups', () => {
    for (const type of POI_TYPES) {
      const keys = groupsFor(type).flatMap(({ fields }) => fields.map((f) => f.key));
      for (const pii of PII_KEYS) {
        expect(keys, `${pii} leaked into ${type} auto groups`).not.toContain(pii);
      }
    }
  });

  it('PII keys are audience:"admin" in the registry (source-of-truth guard)', () => {
    const byKey = Object.fromEntries(allEntries().map((e) => [e.key, e]));
    for (const pii of PII_KEYS) {
      const entry = byKey[pii];
      if (entry) {
        expect(entry.audience, `${pii} must be audience:"admin"`).toBe('admin');
      }
    }
  });

  it('does NOT render a PII value even if the serializer wrongly includes it', () => {
    const poi = {
      poi_type: 'BUSINESS',
      // A real public auto field so the component renders something.
      website_url: 'https://example.com',
      // PII values that must never appear in the DOM.
      main_contact_name: 'SECRET PERSON',
      main_contact_email: 'secret@internal.test',
      main_contact_phone: '555-PII',
      emergency_protocols: 'CALL THE SECRET HOTLINE',
      admin_notes: 'INTERNAL ONLY NOTE',
    };
    renderSections(poi);
    expect(screen.queryByText(/SECRET PERSON/)).toBeNull();
    expect(screen.queryByText(/secret@internal\.test/)).toBeNull();
    expect(screen.queryByText(/555-PII/)).toBeNull();
    expect(screen.queryByText(/SECRET HOTLINE/)).toBeNull();
    expect(screen.queryByText(/INTERNAL ONLY NOTE/)).toBeNull();
  });
});

describe('AttributeSections contract — bespoke/hidden never auto-rendered', () => {
  it('renders no field whose registry render is bespoke or hidden', () => {
    const byKey = Object.fromEntries(allEntries().map((e) => [e.key, e]));
    for (const type of POI_TYPES) {
      for (const { fields } of groupsFor(type)) {
        for (const entry of fields) {
          expect(byKey[entry.key].render, `${entry.key} in ${type}`).toBe('auto');
        }
      }
    }
  });
});

describe('AttributeSections contract — bespoke-covered auto fields excluded (no double-render)', () => {
  // Regression guard for the B4 double-render bug: these render:"auto" public
  // fields are ALSO hand-rendered by their detail page's curated sections, so
  // they MUST be in bespokeAutoKeysFor(type) or the auto-renderer duplicates them.
  // (ParkDetail paints alcohol/entry/playground/hunting; GenericDetail paints
  //  cost + pets in its QuickInfoRow.)
  const HAND_RENDERED = {
    PARK: ['alcohol_available', 'park_entry_notes', 'playground_notes', 'hunting_fishing_info'],
    SERVICES: ['cost', 'pet_options'],
    YOUTH_ACTIVITIES: ['cost', 'pet_options'],
    JOBS: ['cost', 'pet_options'],
    VOLUNTEER_OPPORTUNITIES: ['cost', 'pet_options'],
    DISASTER_HUBS: ['cost', 'pet_options'],
  };

  it.each(Object.keys(HAND_RENDERED))(
    '%s: hand-rendered auto fields are excluded from the auto-renderer',
    (type) => {
      const excluded = new Set(bespokeAutoKeysFor(type));
      const rendered = new Set(
        groupsFor(type).flatMap(({ fields }) => fields.map((f) => f.key))
      );
      for (const key of HAND_RENDERED[type]) {
        expect(
          excluded.has(key) || !rendered.has(key),
          `"${key}" is hand-rendered by ${type} but the auto-renderer also emits it (double render)`
        ).toBe(true);
      }
    }
  );
});

describe('AttributeSections contract — value rendering', () => {
  it('renders non-empty auto fields and skips empty ones', () => {
    const poi = {
      poi_type: 'BUSINESS',
      website_url: 'https://shop.example.com',      // url -> LinkRow
      email: 'hello@example.com',                   // email -> EmailRow
      payment_methods: ['Cash', 'Credit Cards'],    // multi -> ChipList
      cell_service: 'Good',                         // enum -> EnumPill
      byob_allowed: true,                            // boolean true -> pill
      available_for_rent: false,                     // boolean false -> skipped
      pricing_details: '',                           // richtext empty -> skipped
      gift_cards: [],                                // multi empty -> skipped
    };
    renderSections(poi);

    // Present
    expect(screen.getByText('hello@example.com')).toBeInTheDocument();
    expect(screen.getByText('Cash')).toBeInTheDocument();
    expect(screen.getByText('Credit Cards')).toBeInTheDocument();
    expect(screen.getByText('Good')).toBeInTheDocument();

    // Boolean true renders a positive pill (byob_allowed label)
    const byobEntry = allEntries().find((e) => e.key === 'byob_allowed');
    const byobLabel = byobEntry.label || 'Byob Allowed';
    expect(screen.getByText(byobLabel)).toBeInTheDocument();
  });

  it('renders nothing when poi has no non-empty auto fields', () => {
    const { container } = renderSections({ poi_type: 'BUSINESS' });
    expect(container.querySelector('#attribute_sections_box')).toBeNull();
  });

  it('returns null without a poi_type', () => {
    const { container } = renderSections({});
    expect(container.firstChild).toBeNull();
  });

  it('honors excludeKeys (no double-render of bespoke-covered auto fields)', () => {
    const poi = {
      poi_type: 'BUSINESS',
      email: 'covered@example.com',
      payment_methods: ['Cash'],
    };
    render(
      <MemoryRouter>
        <AttributeSections poi={poi} excludeKeys={['email']} />
      </MemoryRouter>
    );
    expect(screen.queryByText('covered@example.com')).toBeNull();
    expect(screen.getByText('Cash')).toBeInTheDocument();
  });
});
