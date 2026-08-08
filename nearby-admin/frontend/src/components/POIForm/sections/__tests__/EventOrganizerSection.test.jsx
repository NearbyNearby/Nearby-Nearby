import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { useForm } from '@mantine/form';
import { EventOrganizerSection } from '../EventSpecificSections';

// ---------------------------------------------------------------------------
// jsdom does not implement ResizeObserver — polyfill for Mantine Select.
// ---------------------------------------------------------------------------
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// ---------------------------------------------------------------------------
// Mock POISearchSelect — avoids network calls.
// ---------------------------------------------------------------------------

vi.mock('../../../common/POISearchSelect', () => ({
  default: function MockPOISearchSelect({ onSelect, placeholder }) {
    return (
      <div data-testid="poi-search-select">
        <input placeholder={placeholder} />
        <button
          onClick={() =>
            onSelect({
              id: 'test-uuid',
              name: 'Test POI',
              slug: 'test-poi',
              poi_type: 'BUSINESS',
              address_city: 'Durham',
              email: 'contact@testpoi.com',
              phone_number: '919-555-0100',
              website_url: 'https://testpoi.com',
              instagram_username: 'testpoi',
              facebook_username: 'testpoifb',
            })
          }
        >
          Select Test POI
        </button>
      </div>
    );
  },
}));

// ---------------------------------------------------------------------------
// TestWrapper
// ---------------------------------------------------------------------------

function TestWrapper({ initialValues = {} }) {
  const form = useForm({
    initialValues: {
      event: {
        organizer_name: '',
        organizer_email: '',
        organizer_phone: '',
        organizer_website: '',
        organizer_social_media: {},
        organizer_poi_id: null,
        ...initialValues,
      },
    },
  });

  return (
    <MantineProvider>
      <EventOrganizerSection form={form} />
    </MantineProvider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EventOrganizerSection', () => {
  it('renders organizer name field', () => {
    render(<TestWrapper />);
    expect(screen.getByText(/organizer name/i)).toBeInTheDocument();
  });

  it('renders organizer email field', () => {
    render(<TestWrapper />);
    expect(screen.getByText(/organizer email/i)).toBeInTheDocument();
  });

  it('renders organizer phone field', () => {
    render(<TestWrapper />);
    expect(screen.getByText(/organizer phone/i)).toBeInTheDocument();
  });

  it('renders organizer website field', () => {
    render(<TestWrapper />);
    expect(screen.getByText(/organizer website/i)).toBeInTheDocument();
  });

  it('"Link to POI" toggle is visible', () => {
    render(<TestWrapper />);
    expect(screen.getByRole('switch', { name: /link to poi/i })).toBeInTheDocument();
  });

  it('POISearchSelect is hidden when "Link to POI" toggle is off', () => {
    render(<TestWrapper />);
    expect(screen.queryByTestId('poi-search-select')).not.toBeInTheDocument();
  });

  it('toggling "Link to POI" shows POISearchSelect', async () => {
    render(<TestWrapper />);

    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: /link to poi/i }));
    });

    expect(screen.getByTestId('poi-search-select')).toBeInTheDocument();
  });

  it('selecting a POI auto-fills organizer_name input', async () => {
    render(<TestWrapper />);

    // Enable POI linking
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: /link to poi/i }));
    });

    // Click "Select Test POI" in the mock
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select test poi/i }));
    });

    // Organizer name input should now have "Test POI"
    expect(screen.getByDisplayValue('Test POI')).toBeInTheDocument();
  });

  it('selecting a POI copies its contact info (#122)', async () => {
    render(<TestWrapper />);

    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: /link to poi/i }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select test poi/i }));
    });

    expect(screen.getByDisplayValue('contact@testpoi.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('919-555-0100')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://testpoi.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('testpoi')).toBeInTheDocument();
    expect(screen.getByDisplayValue('testpoifb')).toBeInTheDocument();
  });

  it('renders pre-filled organizer name from initial values', () => {
    render(<TestWrapper initialValues={{ organizer_name: 'Durham Arts Council' }} />);
    expect(screen.getByDisplayValue('Durham Arts Council')).toBeInTheDocument();
  });

  it('renders POISearchSelect when organizer_poi_id is already set in initial values', () => {
    render(<TestWrapper initialValues={{ organizer_poi_id: 'existing-uuid', organizer_name: 'My Org' }} />);
    // When a poi_id is already set, the toggle should be ON and the search select visible
    expect(screen.getByTestId('poi-search-select')).toBeInTheDocument();
  });
});
