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
vi.mock('../../components/ParkingLotLinkGroup', () => ({
  default: () => <div data-testid="stub-parking-lot-links" />,
}));
vi.mock('../../components/RestroomLocationGroup', () => ({
  RestroomLocationGroup: () => <div data-testid="stub-restroom-group" />,
}));
vi.mock('../../ImageIntegration', () => ({
  FeaturedImageUpload: () => <div data-testid="stub-logo" />,
  shouldUseImageUpload: () => true,
}));
vi.mock('../../sections/OutdoorFeaturesSection', () => ({
  PetPolicySection: () => <div data-testid="stub-pet-policy" />,
}));
vi.mock('../../sections/MiscellaneousSections', () => ({
  InternalContactSection: () => <div data-testid="stub-internal" />,
  CorporateComplianceSection: () => <div data-testid="stub-compliance" />,
}));
vi.mock('../../../HoursSelector', () => ({
  default: () => <div data-testid="stub-hours" />,
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
}));

import BusinessFreeLayout from '../BusinessFreeLayout';

function Harness({ userRole = 'editor' } = {}) {
  const form = useForm({ initialValues: { hours: {}, poi_type: 'BUSINESS' } });
  return (
    <MantineProvider>
      <Accordion multiple>
        <BusinessFreeLayout form={form} userRole={userRole} poiId="test-id" />
      </Accordion>
    </MantineProvider>
  );
}

describe('BusinessFreeLayout — #74 reorg', () => {
  it('renders 13 Accordion.Item blocks including the always-on Admin Only section', () => {
    const { container } = render(<Harness userRole="editor" />);
    const items = container.querySelectorAll('[data-accordion-control="true"], .mantine-Accordion-control');
    expect(items.length).toBe(13);
  });

  it('first accordion item is s1-identity', () => {
    const { container } = render(<Harness userRole="editor" />);
    const firstButton = container.querySelector('.mantine-Accordion-control');
    expect(firstButton).toBeTruthy();
    expect(firstButton.textContent).toMatch(/Business Identity/);
  });

  it('renders spec-required section titles verbatim', () => {
    render(<Harness userRole="editor" />);
    expect(screen.getByText('Parking')).toBeInTheDocument();
    expect(screen.getByText('Pricing + Passes')).toBeInTheDocument();
    expect(screen.getByText('Accessibility + Mobility Access')).toBeInTheDocument();
    expect(screen.getByText('Public Restrooms')).toBeInTheDocument();
    expect(screen.getByText('Alcohol + Smoking')).toBeInTheDocument();
    expect(screen.getByText('Images')).toBeInTheDocument();
    expect(screen.getByText('Contact + Compliance')).toBeInTheDocument();
  });

  it('renders sections in the #74 spec order', () => {
    const { container } = render(<Harness userRole="editor" />);
    const controls = container.querySelectorAll('.mantine-Accordion-control');
    const texts = Array.from(controls).map((c) => c.textContent.trim());
    const expectedOrder = [
      'Business Identity',
      'Categories + Discovery',
      'Hours',
      'Address',
      'Parking',
      'Pricing + Passes',
      'Accessibility + Mobility Access',
      'Public Restrooms',
      'Pet Policy',
      'Alcohol + Smoking',
      'Images',
      'Contact + Compliance',
    ];
    expectedOrder.forEach((expected, idx) => {
      expect(texts[idx]).toContain(expected);
    });
  });

  it('places Hours before Address', () => {
    const { container } = render(<Harness userRole="editor" />);
    const controls = container.querySelectorAll('.mantine-Accordion-control');
    const texts = Array.from(controls).map((c) => c.textContent.trim());
    const hoursIdx = texts.findIndex((t) => /^Hours$/.test(t));
    const addressIdx = texts.findIndex((t) => /^Address$/.test(t));
    expect(hoursIdx).toBeGreaterThan(-1);
    expect(addressIdx).toBeGreaterThan(-1);
    expect(hoursIdx).toBeLessThan(addressIdx);
  });

  it('places Pricing + Passes immediately after Parking', () => {
    const { container } = render(<Harness userRole="editor" />);
    const controls = container.querySelectorAll('.mantine-Accordion-control');
    const texts = Array.from(controls).map((c) => c.textContent.trim());
    const parkingIdx = texts.findIndex((t) => t === 'Parking');
    const pricingIdx = texts.findIndex((t) => t === 'Pricing + Passes');
    expect(parkingIdx).toBeGreaterThan(-1);
    expect(pricingIdx).toBe(parkingIdx + 1);
  });

  it('renders Admin-Only item as the LAST accordion when userRole=admin', () => {
    const { container } = render(<Harness userRole="admin" />);
    const controls = container.querySelectorAll('.mantine-Accordion-control');
    const texts = Array.from(controls).map((c) => c.textContent.trim());
    expect(texts.length).toBe(13);
    expect(texts[12]).toContain('Admin Only');
  });
  // #90/#161: the shared-lot link group lives in the SAME parking panel, below
  // the listing's own parking.
  it('renders the shared parking link group inside the Parking panel', () => {
    const { container } = render(<Harness userRole="editor" />);
    const control = Array.from(container.querySelectorAll('.mantine-Accordion-control'))
      .find((c) => c.textContent.trim() === 'Parking');
    fireEvent.click(control);
    // Business Free gets no own-lot repeat, only the shared-lot link group.
    expect(screen.queryByTestId('stub-parking-group')).not.toBeInTheDocument();
    expect(screen.getByTestId('stub-parking-lot-links')).toBeInTheDocument();
  });
});
