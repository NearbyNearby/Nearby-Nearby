import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import BusinessDetail from '../BusinessDetail';

// Mock child components that pull in heavy deps (Leaflet, etc.), same pattern
// as EventDetail.test.jsx in this directory.
vi.mock('../../nearby-feature/NearbySection', () => ({
  default: function MockNearby() {
    return <div data-testid="nearby-section" />;
  },
}));

vi.mock('dompurify', () => ({
  default: {
    sanitize: (html) => html,
  },
}));

function renderDetail(overrides = {}) {
  const poi = {
    id: 'test-id',
    name: 'The Quiltmaker Cafe',
    poi_type: 'BUSINESS',
    location: { type: 'Point', coordinates: [-79.1, 35.7] },
    images: [],
    ...overrides,
  };
  return render(
    <MemoryRouter>
      <BusinessDetail poi={poi} />
    </MemoryRouter>
  );
}

describe('BusinessDetail: follow-up pass (#183)', () => {
  it('keeps the teaser paragraph out of About + Hours', () => {
    // item 3
    renderDetail({ teaser_paragraph: '<p>A Donation Supported Community Cafe.</p>', description_long: 'Long copy.' });
    const about = document.getElementById('poi_acc_about_hours');
    expect(about).toHaveTextContent('Long copy.');
    expect(about).not.toHaveTextContent('A Donation Supported Community Cafe.');
  });

  it('shows General Pricing and Pricing Details, not the hidden "$" as Average Price', () => {
    // item 4: new drafts carry business.price_range "$", which no admin field shows
    renderDetail({
      business: { price_range: '$' },
      price_range_per_person: '',
      pricing: 'Give what you can!',
      pricing_details: 'Each meal carries a suggested contribution.',
      payment_methods: ['Cash'],
    });
    const pricing = document.getElementById('poi_acc_pricing_offers');
    expect(pricing).not.toHaveTextContent('Average Price');
    expect(pricing).toHaveTextContent('General Pricing');
    expect(pricing).toHaveTextContent('Give what you can!');
    expect(pricing).toHaveTextContent('Pricing Details');
    expect(pricing).toHaveTextContent('Payment Methods');
    expect(pricing).not.toHaveTextContent('Price Range Per Person');
  });

  it('labels a set price range with its admin name', () => {
    renderDetail({ price_range_per_person: '$25 and under' });
    const pricing = document.getElementById('poi_acc_pricing_offers');
    expect(pricing).toHaveTextContent('Price Range Per Person');
    expect(pricing).toHaveTextContent('$25 and under');
  });
});
