import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { ParkingLocationGroup } from '../ParkingLocationGroup';
import { shareLotFromPoi } from '../../../parking-lots/lotApi';

// jsdom lacks ResizeObserver, which Mantine components need.
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

vi.mock('../../../parking-lots/lotApi', () => ({
  shareLotFromPoi: vi.fn(() => Promise.resolve({ alreadyShared: false, lot: { id: 'lot-1' } })),
}));

vi.mock('../../ImageIntegration', () => ({
  ParkingPhotosUpload: () => <div data-testid="stub-parking-photos" />,
}));

function TestWrapper({ poiId = 'poi-1', initialValues }) {
  const form = useForm({ initialValues });
  return (
    <MantineProvider>
      <ParkingLocationGroup form={form} id={poiId} />
    </MantineProvider>
  );
}

const renderGroup = async (props = {}) => {
  const result = render(<TestWrapper {...props} />);
  await act(async () => {});
  return result;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ParkingLocationGroup Share this lot', () => {
  it('hides the share button without a POI id', async () => {
    render(<TestWrapper poiId={null} initialValues={{ parking_locations: [
      { name: 'Main Lot', lat: 35.8, lng: -79.0 },
    ] }} />);
    await act(async () => {});
    expect(screen.queryByRole('button', { name: /share this lot/i })).not.toBeInTheDocument();
  });

  it('disables the share button for a row with no pin, with a hint', async () => {
    await renderGroup({ initialValues: { parking_locations: [
      { name: 'Main Lot', lat: null, lng: null },
    ] } });
    const button = screen.getByRole('button', { name: /share this lot/i });
    expect(button).toBeDisabled();
    // The hint rides on a tooltip, which Mantine only mounts on hover.
    await act(async () => {
      fireEvent.mouseEnter(button.parentElement);
    });
    expect(
      await screen.findByText(/add a name and a pin first/i),
    ).toBeInTheDocument();
  });

  it('calls the API with the row data and confirms a new share', async () => {
    const showSpy = vi.spyOn(notifications, 'show');
    await renderGroup({ initialValues: { parking_locations: [
      { name: 'Main Lot', lat: 35.8, lng: -79.0, w3w: 'filled.count.soap', notes: 'gravel',
        parking_types: ['Garage'], accessible_parking_details: ['Van accessible space available (8 foot access aisle)'] },
    ] } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /share this lot/i }));
    });
    await waitFor(() => expect(shareLotFromPoi).toHaveBeenCalledTimes(1));
    expect(shareLotFromPoi).toHaveBeenCalledWith('poi-1', expect.objectContaining({
      name: 'Main Lot', lat: 35.8, lng: -79.0, w3w: 'filled.count.soap', notes: 'gravel',
    }));
    await waitFor(() => expect(showSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Shared', color: 'green' }),
    ));
  });

  it('reports an already-shared lot', async () => {
    shareLotFromPoi.mockResolvedValueOnce({ alreadyShared: true, lot: { id: 'lot-1' } });
    const showSpy = vi.spyOn(notifications, 'show');
    await renderGroup({ initialValues: { parking_locations: [
      { name: 'Main Lot', lat: 35.8, lng: -79.0 },
    ] } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /share this lot/i }));
    });
    await waitFor(() => expect(showSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Already shared' }),
    ));
  });
});
