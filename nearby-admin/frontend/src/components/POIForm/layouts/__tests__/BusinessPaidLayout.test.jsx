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
vi.mock('../../sections/BusinessDetailsSection', () => ({
  MenuBookingSection: () => <div data-testid="stub-menu" />,
  BusinessGallerySection: () => <div data-testid="stub-gallery" />,
  BusinessEntrySection: () => <div data-testid="stub-business-entry" />,
}));
vi.mock('../../sections/FacilitiesSection', () => ({
  RentalsSection: () => <div data-testid="stub-rentals" />,
  PlaygroundsSection: () => <div data-testid="stub-playground" />,
}));
vi.mock('../../sections/OutdoorFeaturesSection', () => ({
  PetPolicySection: () => <div data-testid="stub-pet-policy" />,
}));
vi.mock('../../sections/MiscellaneousSections', () => ({
  InternalContactSection: () => <div data-testid="stub-internal" />,
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
vi.mock('../../components/PlaygroundLocationGroup', () => ({
  PlaygroundLocationGroup: () => <div data-testid="stub-playground-group" />,
}));
vi.mock('../../components/PayphoneLocationGroup', () => ({
  PayphoneLocationGroup: () => <div data-testid="stub-payphone-group" />,
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
  FeaturedIdealForChips: () => <div data-testid="stub-featured-ideal-for" />,
  FullAmenitiesBlock: () => <div data-testid="stub-amenities-block" />,
  ArrivalMethodsGroup: () => <div data-testid="stub-arrival-methods" />,
  PAYMENT_METHODS: [],
  DISCOUNT_TYPES: [],
}));

import BusinessPaidLayout from '../BusinessPaidLayout';

function Harness({ userRole = 'editor' } = {}) {
  const form = useForm({
    initialValues: {
      hours: {},
      poi_type: 'BUSINESS',
      listing_type: 'paid',
    },
  });
  return (
    <MantineProvider>
      <Accordion multiple>
        <BusinessPaidLayout form={form} userRole={userRole} poiId="test-id" />
      </Accordion>
    </MantineProvider>
  );
}

// Spec-verbatim expected order — #75 18-accordion target:
// 17 data sections + Admin-Only last.
const EXPECTED_ORDER = [
  'Business Identity',                   // s1
  'Categories + Discovery',              // s2
  'Hours',                               // s3
  'Address',                             // s4
  'Parking',                             // s5
  'Menu + Booking',                      // s6
  'Pricing + Passes',                    // s7
  'Accessibility + Mobility Access',     // s8
  'Restrooms',                           // s9
  'Playground',                          // s10
  'On Site Facilities + Amenities',      // s11
  'Pet Policy',                          // s12
  'Alcohol + Smoking',                   // s13
  'Rentals',                             // s14
  'Locally Found + History',             // s15
  'Images',                              // s16
  'Contact + Compliance',                // s17
];

describe('BusinessPaidLayout — #75 18-accordion reorg', () => {
  it('renders all 17 data sections + the Admin Only section in spec order', () => {
    const { container } = render(<Harness userRole="editor" />);
    const controls = container.querySelectorAll('.mantine-Accordion-control');
    const texts = Array.from(controls).map((c) => c.textContent.trim());
    expect(texts.length).toBe(18);
    EXPECTED_ORDER.forEach((expected, idx) => {
      expect(texts[idx]).toContain(expected);
    });
  });

  it('first item is s1-identity (Business Identity)', () => {
    const { container } = render(<Harness userRole="editor" />);
    const firstButton = container.querySelector('.mantine-Accordion-control');
    expect(firstButton).toBeTruthy();
    expect(firstButton.textContent).toMatch(/Business Identity/);
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
    expect(texts.length).toBe(18);
    expect(texts[17]).toContain('Admin Only');
  });

  it('renders spec-verbatim renamed section titles', () => {
    render(<Harness userRole="editor" />);
    expect(screen.getByText('Parking')).toBeInTheDocument();
    expect(screen.getByText('Pricing + Passes')).toBeInTheDocument();
    expect(screen.getByText('Menu + Booking')).toBeInTheDocument();
    expect(screen.getByText('Accessibility + Mobility Access')).toBeInTheDocument();
    expect(screen.getByText('On Site Facilities + Amenities')).toBeInTheDocument();
    expect(screen.getByText('Alcohol + Smoking')).toBeInTheDocument();
    expect(screen.getByText('Locally Found + History')).toBeInTheDocument();
    expect(screen.getByText('Images')).toBeInTheDocument();
    expect(screen.getByText('Contact + Compliance')).toBeInTheDocument();
  });

  it('places Hours (s3) before Address (s4)', () => {
    const { container } = render(<Harness userRole="editor" />);
    const controls = container.querySelectorAll('.mantine-Accordion-control');
    const texts = Array.from(controls).map((c) => c.textContent.trim());
    const hoursIdx = texts.findIndex((t) => /^Hours$/.test(t));
    const addressIdx = texts.findIndex((t) => /^Address$/.test(t));
    expect(hoursIdx).toBeGreaterThan(-1);
    expect(addressIdx).toBeGreaterThan(-1);
    expect(hoursIdx).toBeLessThan(addressIdx);
  });

  it('places Parking (s5) immediately after Address (s4)', () => {
    const { container } = render(<Harness userRole="editor" />);
    const controls = container.querySelectorAll('.mantine-Accordion-control');
    const texts = Array.from(controls).map((c) => c.textContent.trim());
    const addressIdx = texts.findIndex((t) => t === 'Address');
    const parkingIdx = texts.findIndex((t) => t === 'Parking');
    expect(parkingIdx).toBe(addressIdx + 1);
  });

  it('places Alcohol + Smoking (s13) between Pet Policy (s12) and Rentals (s14)', () => {
    const { container } = render(<Harness userRole="editor" />);
    const controls = container.querySelectorAll('.mantine-Accordion-control');
    const texts = Array.from(controls).map((c) => c.textContent.trim());
    const petsIdx = texts.findIndex((t) => t === 'Pet Policy');
    const alcoholIdx = texts.findIndex((t) => t === 'Alcohol + Smoking');
    const rentalsIdx = texts.findIndex((t) => t === 'Rentals');
    expect(petsIdx).toBeLessThan(alcoholIdx);
    expect(alcoholIdx).toBeLessThan(rentalsIdx);
  });

  it('places Images (s16) after Locally Found + History (s15)', () => {
    const { container } = render(<Harness userRole="editor" />);
    const controls = container.querySelectorAll('.mantine-Accordion-control');
    const texts = Array.from(controls).map((c) => c.textContent.trim());
    const locallyIdx = texts.findIndex((t) => t === 'Locally Found + History');
    const imagesIdx = texts.findIndex((t) => t === 'Images');
    expect(locallyIdx).toBeLessThan(imagesIdx);
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
