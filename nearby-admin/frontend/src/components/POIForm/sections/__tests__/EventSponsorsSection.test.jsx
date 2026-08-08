import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { useForm } from '@mantine/form';
import { EventSponsorsSection } from '../EventSpecificSections';

// ---------------------------------------------------------------------------
// jsdom does not implement ResizeObserver, which is required by Mantine's
// Select dropdown (ScrollArea).  Polyfill it globally for this test file.
// ---------------------------------------------------------------------------
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// ---------------------------------------------------------------------------
// Mock POISearchSelect — avoids network calls, exposes a simple button that
// fires onSelect with a predictable POI payload.
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
// Mock ImageUploadField — avoids network calls (loadExistingImages) and exposes
// the per-sponsor image_context so tests can assert each sponsor uploads to a
// distinct, stable context. A button simulates a successful upload.
// ---------------------------------------------------------------------------

vi.mock('../../../ImageUpload/ImageUploadField', () => ({
  ImageUploadField: function MockImageUploadField({ context, onImagesChange }) {
    return (
      <div data-testid="image-upload" data-context={context}>
        <button
          onClick={() =>
            onImagesChange &&
            onImagesChange([{ id: `img-${context}`, url: `https://cdn.example.com/${context}.png` }])
          }
        >
          Simulate upload {context}
        </button>
      </div>
    );
  },
}));

// ---------------------------------------------------------------------------
// TestWrapper — provides a real Mantine form so the component can call
// form.setFieldValue, form.values, etc. without mocking the form API.
// ---------------------------------------------------------------------------

function TestWrapper({ initialSponsors = [], id, onForm }) {
  const form = useForm({
    initialValues: {
      event: { sponsors: initialSponsors },
    },
  });

  // Expose the live form to the test so assertions can read form.values.
  if (onForm) onForm(form);

  return (
    <MantineProvider>
      <EventSponsorsSection form={form} id={id} />
    </MantineProvider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EventSponsorsSection', () => {
  it('renders "Add Sponsor" button', () => {
    render(<TestWrapper />);
    expect(screen.getByRole('button', { name: /add sponsor/i })).toBeInTheDocument();
  });

  it('clicking "Add Sponsor" adds a new sponsor row', async () => {
    render(<TestWrapper />);

    // No sponsor rows (no Switch) initially
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add sponsor/i }));
    });

    // After adding, a Switch should appear for toggling POI link vs manual
    expect(screen.getAllByRole('switch').length).toBeGreaterThanOrEqual(1);
  });

  it('new sponsor row defaults to manual entry mode (POISearchSelect not shown)', async () => {
    render(<TestWrapper />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add sponsor/i }));
    });

    // POISearchSelect should NOT be shown by default (manual mode is default)
    expect(screen.queryByTestId('poi-search-select')).not.toBeInTheDocument();
  });

  it('toggling the switch in a sponsor row reveals POISearchSelect', async () => {
    render(<TestWrapper />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add sponsor/i }));
    });

    const toggle = screen.getByRole('switch');
    await act(async () => {
      fireEvent.click(toggle);
    });

    expect(screen.getByTestId('poi-search-select')).toBeInTheDocument();
  });

  it('manual mode shows name, url, and a logo file picker when unsaved', async () => {
    const { container } = render(<TestWrapper />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add sponsor/i }));
    });

    // Switch is OFF by default → manual fields visible
    expect(screen.getByText(/sponsor name/i)).toBeInTheDocument();
    expect(screen.getByText(/sponsor url/i)).toBeInTheDocument();
    // Issue #123: the raw "Logo URL" box / blocking "save first" message was
    // replaced with a FileInput so a logo can be picked immediately; it
    // uploads automatically once the POI has been saved.
    expect(screen.queryByText(/logo url/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/save the poi first/i)).not.toBeInTheDocument();
    expect(screen.getByText(/sponsor logo/i)).toBeInTheDocument();
    // Mantine's FileInput doesn't expose its placeholder as a DOM attribute
    // on the (visually hidden) native <input type="file">, so target it by type.
    expect(container.querySelector('input[type="file"]')).toBeInTheDocument();
  });

  it('picking a logo file before the POI is saved holds it as _pendingLogoFile (#123)', async () => {
    let liveForm;
    const { container } = render(<TestWrapper onForm={(f) => { liveForm = f; }} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add sponsor/i }));
    });

    const file = new File(['logo-bytes'], 'logo.png', { type: 'image/png' });
    const fileInput = container.querySelector('input[type="file"]');

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(liveForm.values.event.sponsors[0]._pendingLogoFile).toBe(file);
  });

  it('shows the real image uploader (no pending-file picker) once the POI has an id', async () => {
    const { container } = render(<TestWrapper id="poi-1" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add sponsor/i }));
    });

    expect(screen.getByTestId('image-upload')).toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).not.toBeInTheDocument();
  });

  it('tier select is available in manual mode', async () => {
    render(<TestWrapper />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add sponsor/i }));
    });

    // Label text "Tier" should be present
    expect(screen.getByText('Tier')).toBeInTheDocument();
  });

  it('tier select is available in POI link mode', async () => {
    render(<TestWrapper />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add sponsor/i }));
    });

    const toggle = screen.getByRole('switch');
    await act(async () => {
      fireEvent.click(toggle);
    });

    // Tier label should still be present after switching to POI link mode
    expect(screen.getByText('Tier')).toBeInTheDocument();
  });

  it('remove button removes the sponsor row', async () => {
    render(<TestWrapper />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add sponsor/i }));
    });

    // A Switch appeared — confirm row is present
    expect(screen.getAllByRole('switch').length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    });

    // After removal no switch should remain
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('renders existing sponsors from initial data (manual sponsor)', () => {
    render(
      <TestWrapper
        initialSponsors={[{ name: 'Acme Corp', url: 'https://acme.com', logo_url: '', tier: 'Gold' }]}
      />
    );

    // The sponsor name input should be pre-filled
    expect(screen.getByDisplayValue('Acme Corp')).toBeInTheDocument();
  });

  it('renders existing POI-linked sponsor from initial data', () => {
    render(
      <TestWrapper
        initialSponsors={[{ poi_id: 'some-uuid', name: 'Linked Biz', tier: 'Platinum' }]}
      />
    );

    // When poi_id is present the row should start in link mode → POISearchSelect shown
    expect(screen.getByTestId('poi-search-select')).toBeInTheDocument();
  });

  // Bug #87: logo image upload
  it('shows the logo image uploader (not a URL box) when the POI is saved', async () => {
    render(
      <TestWrapper
        id="event-uuid"
        initialSponsors={[{ _id: 's1', name: 'Acme', tier: 'Gold' }]}
      />
    );

    expect(screen.getByTestId('image-upload')).toBeInTheDocument();
    expect(screen.queryByText(/logo url/i)).not.toBeInTheDocument();
  });

  it('scopes each sponsor logo to its own stable image_context', () => {
    render(
      <TestWrapper
        id="event-uuid"
        initialSponsors={[
          { _id: 's1', name: 'Acme', tier: 'Gold' },
          { _id: 's2', name: 'Globex', tier: 'Silver' },
        ]}
      />
    );

    const uploaders = screen.getAllByTestId('image-upload');
    const contexts = uploaders.map((u) => u.getAttribute('data-context'));
    expect(contexts).toContain('sponsor_s1');
    expect(contexts).toContain('sponsor_s2');
    // Distinct contexts → logos never collide between sponsors.
    expect(new Set(contexts).size).toBe(2);
  });

  it('mirrors an uploaded logo onto sponsor.logo_url for the public app', async () => {
    let formRef;
    render(
      <TestWrapper
        id="event-uuid"
        initialSponsors={[{ _id: 's1', name: 'Acme', tier: 'Gold' }]}
        onForm={(f) => { formRef = f; }}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /simulate upload sponsor_s1/i }));
    });

    const sponsor = formRef.values.event.sponsors[0];
    expect(sponsor.logo_url).toBe('https://cdn.example.com/sponsor_s1.png');
    expect(sponsor.logo_image_id).toBe('img-sponsor_s1');
  });

  it('backfills a stable _id for legacy sponsors that lack one', async () => {
    let formRef;
    render(
      <TestWrapper
        id="event-uuid"
        initialSponsors={[{ name: 'Legacy Co', tier: 'Bronze', logo_url: 'https://old/logo.png' }]}
        onForm={(f) => { formRef = f; }}
      />
    );

    // The mount effect backfills _id so the logo context is stable.
    await act(async () => {});
    expect(formRef.values.event.sponsors[0]._id).toBeTruthy();
  });
});
