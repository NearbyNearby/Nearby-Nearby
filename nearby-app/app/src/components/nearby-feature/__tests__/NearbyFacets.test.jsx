import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NearbyFacets from '../NearbyFacets.jsx';

const baseProps = {
  activeFacets: [],
  onToggleFacet: vi.fn(),
  activePayment: null,
  onPaymentChange: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NearbyFacets', () => {
  it('renders the seven boolean facet chips plus the payment chip', () => {
    render(<NearbyFacets {...baseProps} />);
    ['Pet Friendly', 'Restrooms', 'Accessible', 'Free Wifi', 'Playground', 'Kid Friendly', 'Alcohol']
      .forEach(label => expect(screen.getByText(label)).toBeInTheDocument());
    expect(screen.getByText('Payment')).toBeInTheDocument();
  });

  it('toggles a facet via onToggleFacet with the param key', () => {
    render(<NearbyFacets {...baseProps} />);
    fireEvent.click(screen.getByText('Pet Friendly'));
    expect(baseProps.onToggleFacet).toHaveBeenCalledWith('pet_friendly');
  });

  it('marks an active facet with aria-pressed', () => {
    render(<NearbyFacets {...baseProps} activeFacets={['free_wifi']} />);
    expect(screen.getByText('Free Wifi').closest('button')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Pet Friendly').closest('button')).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens the payment menu and selects a method', () => {
    render(<NearbyFacets {...baseProps} />);
    fireEvent.click(screen.getByText('Payment'));
    fireEvent.click(screen.getByText('Cash'));
    expect(baseProps.onPaymentChange).toHaveBeenCalledWith('Cash');
  });

  it('shows the selected payment method on the chip', () => {
    render(<NearbyFacets {...baseProps} activePayment="Credit Cards" />);
    expect(screen.getByText('Credit Cards')).toBeInTheDocument();
  });
});
