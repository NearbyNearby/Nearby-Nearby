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

import ParkLayout from '../ParkLayout';

function Harness({ userRole = 'editor' } = {}) {
  const form = useForm({
    initialValues: {
      hours: {},
      poi_type: 'PARK',
      listing_type: 'free',
      mobility_access: {},
    },
  });
  return (
    <MantineProvider>
      <Accordion multiple>
        <ParkLayout form={form} userRole={userRole} poiId="test-id" />
      </Accordion>
    </MantineProvider>
  );
}

// Spec-verbatim expected order — #76 20-accordion target:
// 19 data sections + Admin-Only last.
const EXPECTED_ORDER = [
  'Park Identity',                       // s1
  'Categories + Discovery',              // s2
  'Hours',                               // s3
  'Address',                             // s4
  'Parking',                             // s5
  'Pricing + Memberships',               // s6
  'Accessibility + Mobility Access',     // s7
  'Public Restrooms',                    // s8
  'Playground',                          // s9
  'Facilities + Amenities',              // s10
  'Pet Policy',                          // s11
  'Alcohol + Smoking',                   // s12
  'Outdoor Features',                    // s13
  'Drone Policy',                        // s14
  'Hunting + Fishing',                   // s15
  'Rentals',                             // s16
  'Locally Found + History',             // s17
  'Images',                              // s18
  'Contact + Compliance',                // s19
];

describe('ParkLayout — #76 20-accordion reorg', () => {
  it('renders all 19 data sections + the Admin Only section in spec order', () => {
    const { container } = render(<Harness userRole="editor" />);
    const controls = container.querySelectorAll('.mantine-Accordion-control');
    const texts = Array.from(controls).map((c) => c.textContent.trim());
    expect(texts.length).toBe(20);
    EXPECTED_ORDER.forEach((expected, idx) => {
      expect(texts[idx]).toContain(expected);
    });
  });

  it('first item is Park Identity', () => {
    const { container } = render(<Harness userRole="editor" />);
    const firstButton = container.querySelector('.mantine-Accordion-control');
    expect(firstButton.textContent).toMatch(/Park Identity/);
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
    expect(texts.length).toBe(20);
    expect(texts[19]).toContain('Admin Only');
  });

  it('renders spec-verbatim renamed section titles', () => {
    render(<Harness userRole="editor" />);
    expect(screen.getByText('Parking')).toBeInTheDocument();
    expect(screen.getByText('Accessibility + Mobility Access')).toBeInTheDocument();
    expect(screen.getByText('Public Restrooms')).toBeInTheDocument();
    expect(screen.getByText('Alcohol + Smoking')).toBeInTheDocument();
    expect(screen.getByText('Locally Found + History')).toBeInTheDocument();
    expect(screen.getByText('Images')).toBeInTheDocument();
    expect(screen.getByText('Contact + Compliance')).toBeInTheDocument();
    expect(screen.getByText('Pricing + Memberships')).toBeInTheDocument();
  });

  it('removes the legacy Entry Notes and Contact + Social Media accordions', () => {
    const { container } = render(<Harness userRole="editor" />);
    const texts = Array.from(
      container.querySelectorAll('.mantine-Accordion-control')
    ).map((c) => c.textContent.trim());
    expect(texts).not.toContain('Entry Notes');
    expect(texts).not.toContain('Contact & Social Media');
    expect(texts).not.toContain('Dynamic Attributes');
  });

  it('places Accessibility + Mobility Access (s7) before Public Restrooms (s8)', () => {
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
});
