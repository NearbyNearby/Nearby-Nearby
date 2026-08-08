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
// Stub every sub-section the layout imports so we can mount the layout without
// exercising any API calls, RichTextEditor instances, or context providers.
// We only need to verify Accordion.Item structure here.
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
vi.mock('../../sections/RecurringEventSection', () => ({
  default: () => <div data-testid="stub-recurring" />,
}));
vi.mock('../../sections/EventSpecificSections', () => ({
  EventVendorsSection: () => <div data-testid="stub-vendors" />,
  EventMapsSection: () => <div data-testid="stub-maps" />,
  EventVenueSection: () => <div data-testid="stub-venue" />,
  EventStatusSection: () => <div data-testid="stub-status" />,
  EventCostSection: () => <div data-testid="stub-cost" />,
  EventSponsorsSection: () => <div data-testid="stub-sponsors" />,
  EventOrganizerSection: () => <div data-testid="stub-organizer" />,
}));
vi.mock('../../sections/FacilitiesSection', () => ({
  FacilitiesSection: () => <div data-testid="stub-facilities" />,
  PublicAmenitiesSection: () => <div data-testid="stub-public-amenities" />,
  RentalsSection: () => <div data-testid="stub-rentals" />,
  PlaygroundsSection: () => <div data-testid="stub-playgrounds" />,
}));
vi.mock('../../sections/OutdoorFeaturesSection', () => ({
  PetPolicySection: () => <div data-testid="stub-pet-policy" />,
}));
vi.mock('../../sections/BusinessDetailsSection', () => ({
  BusinessGallerySection: () => <div data-testid="stub-gallery" />,
}));
vi.mock('../../sections/MiscellaneousSections', () => ({
  InternalContactSection: () => <div data-testid="stub-internal" />,
  CommunityConnectionsSection: () => <div data-testid="stub-community" />,
  CorporateComplianceSection: () => <div data-testid="stub-compliance" />,
}));
vi.mock('../../components/CheckboxGroupSection', () => ({
  CheckboxGroupSection: () => <div data-testid="stub-checkbox-group" />,
}));
vi.mock('../../components/RestroomLocationGroup', () => ({
  RestroomLocationGroup: () => <div data-testid="stub-restroom-group" />,
}));
vi.mock('../../components/ParkingLocationGroup', () => ({
  ParkingLocationGroup: () => <div data-testid="stub-parking-group" />,
}));
vi.mock('../../components/ParkingLotLinkGroup', () => ({
  default: () => <div data-testid="stub-parking-lot-links" />,
}));
vi.mock('../../components/ServiceAnimalAlert', () => ({
  default: () => <div data-testid="stub-service-animal" />,
}));
vi.mock('../../ImageIntegration', () => ({
  FeaturedImageUpload: () => <div data-testid="stub-featured" />,
  shouldUseImageUpload: () => true,
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
  ConnectivityRow: () => <div data-testid="stub-connectivity" />,
  ArrivalMethodsGroup: () => <div data-testid="stub-arrival" />,
}));

import EventLayout from '../EventLayout';

function Harness({ userRole = 'editor' } = {}) {
  const form = useForm({
    initialValues: {
      hours: {},
      poi_type: 'EVENT',
      listing_type: 'free',
      mobility_access: {},
      event: {},
    },
  });
  return (
    <MantineProvider>
      <Accordion multiple>
        <EventLayout form={form} userRole={userRole} poiId="test-id" />
      </Accordion>
    </MantineProvider>
  );
}

// Spec-verbatim expected order — #73 20-accordion target:
// 19 data sections + Admin-Only last.
const EXPECTED_ORDER = [
  'Event Identity',                      // s1
  'Categories + Discovery',              // s2
  'Event Details',                       // s3
  'Event Venue',                         // s4
  'Event Organizer',                     // s5
  'Event Sponsors',                      // s6
  'Event Vendors',                       // s7
  'Address',                             // s8
  'Parking',                             // s9
  'Accessibility + Mobility Access',     // s10
  'Public Restrooms',                    // s11
  'Playground',                          // s12
  'On Site Facilities + Amenities',      // s13
  'Pet Policy',                          // s14
  'Alcohol + Smoking',                   // s15
  'Rentals',                             // s16
  'Locally Found + History',             // s17
  'Images',                              // s18
  'Contact + Compliance',                // s19
];

describe('EventLayout — #73 20-accordion reorg', () => {
  it('renders all 19 data sections + the Admin Only section in spec order', () => {
    const { container } = render(<Harness userRole="editor" />);
    const controls = container.querySelectorAll('.mantine-Accordion-control');
    const texts = Array.from(controls).map((c) => c.textContent.trim());
    expect(texts.length).toBe(20);
    EXPECTED_ORDER.forEach((expected, idx) => {
      expect(texts[idx]).toContain(expected);
    });
  });

  it('first item is Event Identity', () => {
    const { container } = render(<Harness userRole="editor" />);
    const firstButton = container.querySelector('.mantine-Accordion-control');
    expect(firstButton.textContent).toMatch(/Event Identity/);
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

  it('renders spec-verbatim renamed / new section titles', () => {
    render(<Harness userRole="editor" />);
    expect(screen.getByText('Event Venue')).toBeInTheDocument();
    expect(screen.getByText('Event Sponsors')).toBeInTheDocument();
    expect(screen.getByText('Event Vendors')).toBeInTheDocument();
    expect(screen.getByText('Address')).toBeInTheDocument();
    expect(screen.getByText('Parking')).toBeInTheDocument();
    expect(screen.getByText('Accessibility + Mobility Access')).toBeInTheDocument();
    expect(screen.getByText('On Site Facilities + Amenities')).toBeInTheDocument();
    expect(screen.getByText('Alcohol + Smoking')).toBeInTheDocument();
    expect(screen.getByText('Locally Found + History')).toBeInTheDocument();
    expect(screen.getByText('Images')).toBeInTheDocument();
    expect(screen.getByText('Contact + Compliance')).toBeInTheDocument();
  });

  it('removes the legacy Venue Details, Location & Arrival, Cost & Ticketing, Vendors, Contact & Social Media, Miscellaneous, and standalone Dynamic Attributes accordions', () => {
    const { container } = render(<Harness userRole="editor" />);
    const texts = Array.from(
      container.querySelectorAll('.mantine-Accordion-control')
    ).map((c) => c.textContent.trim());
    expect(texts).not.toContain('Venue Details');
    expect(texts).not.toContain('Location & Arrival');
    expect(texts).not.toContain('Cost & Ticketing');
    expect(texts).not.toContain('Vendors');
    expect(texts).not.toContain('Contact & Social Media');
    expect(texts).not.toContain('Miscellaneous');
    expect(texts).not.toContain('Dynamic Attributes');
  });

  it('places the NEW Event Vendors banner above the vendors gate', () => {
    render(<Harness userRole="editor" />);
    expect(
      screen.getByText(/Are you accepting vendors\? If so, please enter the info below\./)
    ).toBeInTheDocument();
  });

  it('keeps the venue-overrides placeholder banner in Event Venue (Acc 4)', () => {
    render(<Harness userRole="editor" />);
    expect(
      screen.getByText(/Event-specific overrides \(capacity, indoor\/outdoor flag, venue address\)/)
    ).toBeInTheDocument();
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
