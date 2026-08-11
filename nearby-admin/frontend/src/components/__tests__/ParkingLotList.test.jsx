import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import ParkingLotList from '../ParkingLotList';

if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

let currentRole = 'admin';
vi.mock('../../utils/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'someone@nearby.com', role: currentRole } }),
}));

const LOTS = [
  {
    id: 'lot-standalone',
    name: 'Main St Municipal Deck',
    owner_poi_id: null,
    owner: null,
    latitude: 35.12345,
    longitude: -79.54321,
    publication_status: 'published',
    linked_poi_count: 3,
  },
  {
    id: 'lot-owned',
    name: 'Brewery Overflow Lot',
    owner_poi_id: 'poi-9',
    owner: { id: 'poi-9', name: 'Third Wheel Brewing' },
    latitude: null,
    longitude: null,
    publication_status: 'draft',
    linked_poi_count: 0,
  },
];

const deleteLotMock = vi.fn();
vi.mock('../parking-lots/lotApi', async () => {
  const actual = await vi.importActual('../parking-lots/lotApi');
  return {
    ...actual,
    searchLots: vi.fn(() => Promise.resolve(LOTS)),
    fetchLinkedPois: vi.fn(() => Promise.resolve([
      { id: 'poi-1', name: 'Jordan Lake', poi_type: 'PARK', publication_status: 'published' },
    ])),
    deleteLot: (...args) => deleteLotMock(...args),
  };
});

const renderList = async () => {
  const result = render(
    <MantineProvider env="test">
      <MemoryRouter>
        <ParkingLotList />
      </MemoryRouter>
    </MantineProvider>,
  );
  await act(async () => {});
  return result;
};

beforeEach(() => {
  currentRole = 'admin';
  vi.clearAllMocks();
  deleteLotMock.mockReset();
});

describe('ParkingLotList', () => {
  it('renders a row per lot with owner, coords, link count and status', async () => {
    await renderList();

    await waitFor(() => expect(screen.getByText('Main St Municipal Deck')).toBeInTheDocument());
    expect(screen.getByText('Standalone')).toBeInTheDocument();
    expect(screen.getByText('Owned by Third Wheel Brewing')).toBeInTheDocument();
    expect(screen.getByText('35.12345, -79.54321')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('published')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
  });

  it('filters rows by the search box', async () => {
    await renderList();
    await waitFor(() => expect(screen.getByText('Main St Municipal Deck')).toBeInTheDocument());

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/search parking lots/i), {
        target: { value: 'brewery' },
      });
    });

    expect(screen.queryByText('Main St Municipal Deck')).not.toBeInTheDocument();
    expect(screen.getByText('Brewery Overflow Lot')).toBeInTheDocument();
  });

  it('blocks an editor from creating, editing a standalone lot, or deleting', async () => {
    currentRole = 'editor';
    await renderList();
    await waitFor(() => expect(screen.getByText('Main St Municipal Deck')).toBeInTheDocument());

    expect(screen.queryByRole('link', { name: /create new parking lot/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Edit Main St Municipal Deck')).toBeDisabled();
    expect(screen.getByLabelText('Edit Brewery Overflow Lot')).not.toBeDisabled();
    expect(screen.getByLabelText('Delete Main St Municipal Deck')).toBeDisabled();
  });

  it('re-confirms with the linked count when the delete comes back 409', async () => {
    deleteLotMock.mockResolvedValueOnce({ conflict: true, linkedPoiCount: 3 });
    deleteLotMock.mockResolvedValueOnce({ conflict: false });
    await renderList();
    await waitFor(() => expect(screen.getByText('Main St Municipal Deck')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Delete Main St Municipal Deck'));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    });

    expect(deleteLotMock).toHaveBeenLastCalledWith('lot-standalone', { force: false });
    expect(await screen.findByText(/still link/i)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /delete anyway/i }));
    });
    expect(deleteLotMock).toHaveBeenLastCalledWith('lot-standalone', { force: true });
  });

  it('lists the POIs linking a lot', async () => {
    await renderList();
    await waitFor(() => expect(screen.getByText('Main St Municipal Deck')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByLabelText('View POIs linked to Main St Municipal Deck'));
    });

    expect(await screen.findByText('Jordan Lake')).toBeInTheDocument();
  });
});
