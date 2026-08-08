import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider, Accordion } from '@mantine/core';
import { useForm } from '@mantine/form';

// jsdom polyfills required for Mantine v8 components (Select, Combobox, ScrollArea).
beforeAll(() => {
  if (typeof global.ResizeObserver === 'undefined') {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

// ---------------------------------------------------------------------------
// Stub every sub-section the layout imports so we can mount the layout
// without exercising any API calls, RichTextEditor instances, or context
// providers. We only need to verify Accordion.Item structure here.
// ---------------------------------------------------------------------------
vi.mock('../../sections/CoreInformationSection', () => ({
  CoreInformationSection: () => <div data-testid="stub-core" />,
}));
vi.mock('../../sections/CategoriesSection', () => ({
  CategoriesSection: () => <div data-testid="stub-categories" />,
}));
vi.mock('../../sections/LocationSection', () => ({
  LocationSection: () => <div data-testid="stub-location" />,
}));
vi.mock('../../sections/ContactSection', () => ({
  ContactSection: () => <div data-testid="stub-contact" />,
}));
vi.mock('../../sections/TrailheadAccessPointsSection', () => ({
  default: () => <div data-testid="stub-trailhead" />,
}));
vi.mock('../../sections/FacilitiesSection', () => ({
  FacilitiesSection: () => <div data-testid="stub-facilities" />,
  RentalsSection: () => <div data-testid="stub-rentals" />,
  PlaygroundsSection: () => <div data-testid="stub-playgrounds" />,
}));
vi.mock('../../sections/OutdoorFeaturesSection', () => ({
  OutdoorFeaturesSection: () => <div data-testid="stub-outdoor" />,
  HuntingFishingSection: () => <div data-testid="stub-hunting" />,
  PetPolicySection: () => <div data-testid="stub-pet-policy" />,
}));
vi.mock('../../sections/BusinessDetailsSection', () => ({
  BusinessGallerySection: () => <div data-testid="stub-gallery" />,
}));
vi.mock('../../sections/MiscellaneousSections', () => ({
  InternalContactSection: () => <div data-testid="stub-internal" />,
  PricingMembershipsSection: () => <div data-testid="stub-pricing" />,
  ConnectionsSection: () => <div data-testid="stub-connections" />,
  CommunityConnectionsSection: () => <div data-testid="stub-community" />,
  CorporateComplianceSection: () => <div data-testid="stub-compliance" />,
}));
vi.mock('../../../HoursSelector', () => ({
  default: () => <div data-testid="stub-hours" />,
}));
vi.mock('../../ImageIntegration', () => ({
  FeaturedImageUpload: () => <div data-testid="stub-featured" />,
  DownloadableMapsUpload: () => <div data-testid="stub-downloadable-map" />,
  shouldUseImageUpload: () => true,
}));
vi.mock('../../components/ParkingLocationGroup', () => ({
  ParkingLocationGroup: () => <div data-testid="stub-parking-group" />,
}));
vi.mock('../../components/ParkingLotLinkGroup', () => ({
  default: () => <div data-testid="stub-parking-lot-links" />,
}));
vi.mock('../../components/RestroomLocationGroup', () => ({
  RestroomLocationGroup: () => <div data-testid="stub-restroom-group" />,
}));
vi.mock('../../components/ServiceAnimalAlert', () => ({
  default: () => <div data-testid="stub-service-animal" />,
}));
vi.mock('../_shared', () => ({
  AdminOnlyAccordionItem: () => (
    <Accordion.Item value="admin-only">
      <Accordion.Control>Admin Only</Accordion.Control>
      <Accordion.Panel>stub</Accordion.Panel>
    </Accordion.Item>
  ),
  IdealForGrouped: () => <div data-testid="stub-ideal-for" />,
  FullAmenitiesBlock: () => <div data-testid="stub-amenities-block" />,
  ArrivalMethodsGroup: () => <div data-testid="stub-arrival" />,
  What3WordsInput: () => <div data-testid="stub-w3w" />,
}));

import TrailLayout from '../TrailLayout';

function Harness({ userRole = 'editor' } = {}) {
  const form = useForm({
    initialValues: {
      hours: {},
      poi_type: 'TRAIL',
      listing_type: 'free',
      mobility_access: {},
      trail: {},
    },
  });
  return (
    <MantineProvider>
      <Accordion multiple>
        <TrailLayout form={form} userRole={userRole} poiId="test-id" />
      </Accordion>
    </MantineProvider>
  );
}

// Spec-verbatim expected order — #77 22-accordion target:
// 21 data sections + Admin-Only last.
const EXPECTED_ORDER = [
  'Trail Identity',                      // s1
  'Trail in Park',                       // s2
  'Categories + Discovery',              // s3
  'Hours',                               // s4
  'Address',                             // s5
  'Parking',                             // s6
  'Pricing + Passes',                    // s7
  'Trail Guide',                         // s8
  'Accessibility + Mobility Access',     // s9
  'Public Restrooms',                    // s10
  'Playground',                          // s11
  'On Site Facilities + Amenities',      // s12
  'Pet Policy',                          // s13
  'Alcohol + Smoking',                   // s14
  'Outdoor Features',                    // s15
  'Drone Policy',                        // s16
  'Hunting + Fishing',                   // s17
  'Rentals',                             // s18
  'Locally Found + History',             // s19
  'Images',                              // s20
  'Contact + Compliance',                // s21
];

describe('TrailLayout — #77 22-accordion reorg', () => {
  it('renders all 21 data sections + the Admin Only section in spec order', () => {
    const { container } = render(<Harness userRole="editor" />);
    const controls = container.querySelectorAll('.mantine-Accordion-control');
    const texts = Array.from(controls).map((c) => c.textContent.trim());
    expect(texts.length).toBe(22);
    EXPECTED_ORDER.forEach((expected, idx) => {
      expect(texts[idx]).toContain(expected);
    });
  });

  it('first item is Trail Identity', () => {
    const { container } = render(<Harness userRole="editor" />);
    const firstButton = container.querySelector('.mantine-Accordion-control');
    expect(firstButton.textContent).toMatch(/Trail Identity/);
  });

  it('Admin Only is last; Contact + Compliance is the last data section', () => {
    const { container } = render(<Harness userRole="editor" />);
    const controls = container.querySelectorAll('.mantine-Accordion-control');
    expect(controls[controls.length - 1].textContent.trim()).toBe('Admin Only');
    expect(controls[controls.length - 2].textContent.trim()).toBe('Contact + Compliance');
  });

  it('Admin-Only is the LAST accordion when userRole=admin', () => {
    const { container } = render(<Harness userRole="admin" />);
    const controls = container.querySelectorAll('.mantine-Accordion-control');
    const texts = Array.from(controls).map((c) => c.textContent.trim());
    expect(texts.length).toBe(22);
    expect(texts[21]).toContain('Admin Only');
  });

  it('renders spec-verbatim renamed section titles', () => {
    render(<Harness userRole="editor" />);
    expect(screen.getByText('Parking')).toBeInTheDocument();
    expect(screen.getByText('Pricing + Passes')).toBeInTheDocument();
    expect(screen.getByText('Trail Guide')).toBeInTheDocument();
    expect(screen.getByText('Accessibility + Mobility Access')).toBeInTheDocument();
    expect(screen.getByText('Public Restrooms')).toBeInTheDocument();
    expect(screen.getByText('On Site Facilities + Amenities')).toBeInTheDocument();
    expect(screen.getByText('Alcohol + Smoking')).toBeInTheDocument();
    expect(screen.getByText('Locally Found + History')).toBeInTheDocument();
    expect(screen.getByText('Images')).toBeInTheDocument();
    expect(screen.getByText('Contact + Compliance')).toBeInTheDocument();
  });

  it('removes the legacy Trail Details, Contact & Social Media, and Dynamic Attributes accordions', () => {
    const { container } = render(<Harness userRole="editor" />);
    const texts = Array.from(
      container.querySelectorAll('.mantine-Accordion-control')
    ).map((c) => c.textContent.trim());
    expect(texts).not.toContain('Trail Details');
    expect(texts).not.toContain('Contact & Social Media');
    expect(texts).not.toContain('Parking & Accessibility');
    expect(texts).not.toContain('Dynamic Attributes');
  });

  it('places Accessibility + Mobility Access (s9) before Public Restrooms (s10)', () => {
    const { container } = render(<Harness userRole="editor" />);
    const texts = Array.from(
      container.querySelectorAll('.mantine-Accordion-control')
    ).map((c) => c.textContent.trim());
    const accIdx = texts.findIndex((t) => t === 'Accessibility + Mobility Access');
    const restroomIdx = texts.findIndex((t) => t === 'Public Restrooms');
    expect(accIdx).toBeGreaterThan(-1);
    expect(accIdx).toBeLessThan(restroomIdx);
  });
  // #90/#161: the shared-lot link group lives in the SAME parking panel, below
  // the listing's own parking.
  it('renders the shared parking link group inside the Parking panel', () => {
    const { container } = render(<Harness userRole="editor" />);
    const control = Array.from(container.querySelectorAll('.mantine-Accordion-control'))
      .find((c) => c.textContent.trim() === 'Parking');
    fireEvent.click(control);
    expect(screen.getByTestId('stub-parking-group')).toBeInTheDocument();
    expect(screen.getByTestId('stub-parking-lot-links')).toBeInTheDocument();
  });

  // #147: the trail guide map must be an upload (PDF or image), not a raw URL
  // text field, so visitors can actually download whatever file is there.
  it('Trail Guide uses the downloadable-map file upload, not a URL text field', () => {
    const { container } = render(<Harness userRole="editor" />);
    const control = Array.from(container.querySelectorAll('.mantine-Accordion-control'))
      .find((c) => c.textContent.trim() === 'Trail Guide');
    fireEvent.click(control);
    expect(screen.getByTestId('stub-downloadable-map')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/URL to trail map/i)).not.toBeInTheDocument();
  });
});
