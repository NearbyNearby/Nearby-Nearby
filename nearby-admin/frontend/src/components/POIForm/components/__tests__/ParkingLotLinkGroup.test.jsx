import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { useForm } from '@mantine/form';
import ParkingLotLinkGroup, { applyReorder, withSortOrder } from '../ParkingLotLinkGroup';

// jsdom lacks ResizeObserver, which Mantine's Select dropdown needs.
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// ---------------------------------------------------------------------------
// Role is read from AuthContext; each test sets it before rendering.
// ---------------------------------------------------------------------------
let currentRole = 'admin';
vi.mock('../../../../utils/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'someone@nearby.com', role: currentRole } }),
}));

// ---------------------------------------------------------------------------
// Lot data. fetchLot / searchLots are mocked; the permission helpers are the
// real ones so the disabled-Edit assertions exercise the shipped rule.
// ---------------------------------------------------------------------------
const STANDALONE_LOT = {
  id: 'lot-standalone',
  name: 'Main St Municipal Deck',
  owner_poi_id: null,
  owner: null,
  parking_types: ['Garage', 'Accessible Parking'],
  notes: '<p>Enter from Elm St</p>',
  latitude: 35.123456,
  longitude: -79.654321,
  publication_status: 'published',
  images: [{ id: 'img-1', thumbnail_url: 'https://cdn/x.png', caption: 'Blue sign' }],
  linked_poi_count: 2,
};

const OWNED_LOT = {
  id: 'lot-owned',
  name: 'Brewery Overflow Lot',
  owner_poi_id: 'poi-9',
  owner: { id: 'poi-9', name: 'Third Wheel Brewing', poi_type: 'BUSINESS' },
  parking_types: ['Dedicated On-Site Parking Lot'],
  notes: null,
  latitude: null,
  longitude: null,
  publication_status: 'draft',
  images: [],
  linked_poi_count: 1,
};

const LOTS = { [STANDALONE_LOT.id]: STANDALONE_LOT, [OWNED_LOT.id]: OWNED_LOT };

vi.mock('../../../parking-lots/lotApi', async () => {
  const actual = await vi.importActual('../../../parking-lots/lotApi');
  return {
    ...actual,
    fetchLot: vi.fn((id) => Promise.resolve(LOTS[id])),
    searchLots: vi.fn(() => Promise.resolve([STANDALONE_LOT, OWNED_LOT])),
  };
});

// The modal drags in the dropzone/uploader chain; stub it down to the one
// behaviour this component cares about, "a lot was saved -> link it".
vi.mock('../../../parking-lots/ParkingLotModal', () => ({
  default: function MockParkingLotModal({ opened, onSaved }) {
    if (!opened) return null;
    return (
      <button onClick={() => onSaved({ id: 'lot-created', name: 'Brand New Lot' })}>
        Simulate lot saved
      </button>
    );
  },
}));

function TestWrapper({ initialLinks = [], onForm }) {
  const form = useForm({ initialValues: { parking_lot_links: initialLinks } });
  if (onForm) onForm(form);
  return (
    <MantineProvider>
      <ParkingLotLinkGroup form={form} />
    </MantineProvider>
  );
}

const renderGroup = async (props = {}) => {
  const result = render(<TestWrapper {...props} />);
  // Let the mount-time search + linked-lot hydration settle.
  await act(async () => {});
  return result;
};

beforeEach(() => {
  currentRole = 'admin';
  vi.clearAllMocks();
});

describe('ParkingLotLinkGroup', () => {
  it('renders the group heading and the link picker', async () => {
    await renderGroup();
    expect(screen.getByText('Additional / Shared Parking')).toBeInTheDocument();
    expect(screen.getByText('Link an existing parking lot')).toBeInTheDocument();
    expect(screen.getByText(/no shared parking lots linked yet/i)).toBeInTheDocument();
  });

  it('renders linked lots from form values with owner badge, coords and chips', async () => {
    await renderGroup({
      initialLinks: [
        { parking_lot_id: 'lot-standalone', sort_order: 0, label: '' },
        { parking_lot_id: 'lot-owned', sort_order: 1, label: 'Free after 5pm' },
      ],
    });

    await waitFor(() => expect(screen.getByText('Main St Municipal Deck')).toBeInTheDocument());
    expect(screen.getByText('Brewery Overflow Lot')).toBeInTheDocument();
    expect(screen.getByText('Public lot - NN managed')).toBeInTheDocument();
    expect(screen.getByText('Owned by Third Wheel Brewing')).toBeInTheDocument();
    expect(screen.getByText('35.123456, -79.654321')).toBeInTheDocument();
    expect(screen.getByText('Garage')).toBeInTheDocument();
    // Notes preview is plain text, not raw HTML.
    expect(screen.getByText('Enter from Elm St')).toBeInTheDocument();
    // Draft lots are badged so an editor sees why they may not be public yet.
    expect(screen.getByText('Draft')).toBeInTheDocument();
    // Linker-owned label round-trips into its input.
    expect(screen.getByDisplayValue('Free after 5pm')).toBeInTheDocument();
  });

  it('disables Edit on a standalone lot for an editor, with the reason in a tooltip', async () => {
    currentRole = 'editor';
    await renderGroup({
      initialLinks: [
        { parking_lot_id: 'lot-standalone', sort_order: 0, label: '' },
        { parking_lot_id: 'lot-owned', sort_order: 1, label: '' },
      ],
    });

    await waitFor(() => expect(screen.getByText('Main St Municipal Deck')).toBeInTheDocument());
    const disabledEdit = screen.getByLabelText('Edit Main St Municipal Deck');
    expect(disabledEdit).toBeDisabled();
    // An owned lot is ordinary POI content, so an editor may still edit it.
    expect(screen.getByLabelText('Edit Brewery Overflow Lot')).not.toBeDisabled();

    // The reason rides on a tooltip, which Mantine only mounts on hover.
    await act(async () => {
      fireEvent.mouseEnter(disabledEdit.parentElement);
    });
    expect(
      await screen.findByText('Only an admin may edit a shared standalone parking lot'),
    ).toBeInTheDocument();
  });

  it('lets an admin edit a standalone lot', async () => {
    await renderGroup({ initialLinks: [{ parking_lot_id: 'lot-standalone', sort_order: 0 }] });
    await waitFor(() => expect(screen.getByText('Main St Municipal Deck')).toBeInTheDocument());
    expect(screen.getByLabelText('Edit Main St Municipal Deck')).not.toBeDisabled();
  });

  it('offers "Create new lot" to an admin', async () => {
    await renderGroup();
    expect(screen.getByRole('button', { name: /create new lot/i })).toBeInTheDocument();
  });

  it('hides "Create new lot" from an editor', async () => {
    currentRole = 'editor';
    await renderGroup();
    expect(screen.queryByRole('button', { name: /create new lot/i })).not.toBeInTheDocument();
  });

  it('links a newly created lot and emits the dict payload', async () => {
    let formRef;
    await renderGroup({ onForm: (f) => { formRef = f; } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create new lot/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /simulate lot saved/i }));
    });

    expect(formRef.values.parking_lot_links).toEqual([
      { parking_lot_id: 'lot-created', sort_order: 0, label: '' },
    ]);
  });

  it('unlinks a lot and renumbers sort_order on the rest', async () => {
    let formRef;
    await renderGroup({
      initialLinks: [
        { parking_lot_id: 'lot-standalone', sort_order: 0, label: 'first' },
        { parking_lot_id: 'lot-owned', sort_order: 1, label: 'second' },
      ],
      onForm: (f) => { formRef = f; },
    });

    await waitFor(() => expect(screen.getByText('Main St Municipal Deck')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Unlink Main St Municipal Deck'));
    });

    expect(formRef.values.parking_lot_links).toEqual([
      { parking_lot_id: 'lot-owned', sort_order: 0, label: 'second' },
    ]);
  });

  it('writes the per-link label back onto the edge, not the lot', async () => {
    let formRef;
    await renderGroup({
      initialLinks: [{ parking_lot_id: 'lot-standalone', sort_order: 0, label: '' }],
      onForm: (f) => { formRef = f; },
    });

    await waitFor(() => expect(screen.getByText('Main St Municipal Deck')).toBeInTheDocument());
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/free after 5pm/i), {
        target: { value: '3 minute walk' },
      });
    });

    expect(formRef.values.parking_lot_links[0]).toEqual({
      parking_lot_id: 'lot-standalone',
      sort_order: 0,
      label: '3 minute walk',
    });
  });

  it('renders a drag handle per linked lot', async () => {
    await renderGroup({
      initialLinks: [
        { parking_lot_id: 'lot-standalone', sort_order: 0 },
        { parking_lot_id: 'lot-owned', sort_order: 1 },
      ],
    });
    await waitFor(() => expect(screen.getByText('Main St Municipal Deck')).toBeInTheDocument());
    expect(screen.getByLabelText('Reorder Main St Municipal Deck')).toBeInTheDocument();
    expect(screen.getByLabelText('Reorder Brewery Overflow Lot')).toBeInTheDocument();
  });
});

describe('ParkingLotLinkGroup reorder helpers', () => {
  const links = [
    { parking_lot_id: 'a', sort_order: 0, label: 'a' },
    { parking_lot_id: 'b', sort_order: 1, label: 'b' },
    { parking_lot_id: 'c', sort_order: 2, label: 'c' },
  ];

  it('moves an entry and renumbers sort_order to match the new positions', () => {
    expect(applyReorder(links, 2, 0)).toEqual([
      { parking_lot_id: 'c', sort_order: 0, label: 'c' },
      { parking_lot_id: 'a', sort_order: 1, label: 'a' },
      { parking_lot_id: 'b', sort_order: 2, label: 'b' },
    ]);
  });

  it('leaves the source array untouched', () => {
    applyReorder(links, 0, 2);
    expect(links.map((l) => l.parking_lot_id)).toEqual(['a', 'b', 'c']);
  });

  it('withSortOrder numbers by index', () => {
    expect(withSortOrder([{ parking_lot_id: 'x', sort_order: 9 }])).toEqual([
      { parking_lot_id: 'x', sort_order: 0 },
    ]);
  });
});
