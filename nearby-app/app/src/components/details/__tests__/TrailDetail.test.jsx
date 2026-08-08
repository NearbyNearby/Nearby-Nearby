import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import TrailDetail from '../TrailDetail';

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

function buildPoi(overrides = {}) {
  const { trail: trailOverrides, ...rest } = overrides;
  return {
    id: 'test-id',
    name: 'Test Trail',
    poi_type: 'TRAIL',
    location: { type: 'Point', coordinates: [-79.1, 35.7] },
    images: [],
    ...rest,
    trail: {
      route_type: 'loop',
      length_text: '2.5 miles',
      mile_markers: true,
      ...trailOverrides,
    },
  };
}

function renderDetail(poiOverrides = {}) {
  const poi = buildPoi(poiOverrides);
  return render(
    <MemoryRouter>
      <TrailDetail poi={poi} />
    </MemoryRouter>
  );
}

describe('TrailDetail: Trail Guide downloadable map (#147)', () => {
  it('renders a download link for a downloadable_map image', () => {
    renderDetail({
      images: [
        { id: 'img-1', type: 'downloadable_map', url: 'https://cdn.example.com/trail-map.pdf' },
      ],
    });
    const link = screen.getByRole('link', { name: /download trail map/i, hidden: true });
    expect(link).toHaveAttribute('href', 'https://cdn.example.com/trail-map.pdf');
  });

  it('labels multiple downloadable_map images distinctly', () => {
    renderDetail({
      images: [
        { id: 'img-1', type: 'downloadable_map', url: 'https://cdn.example.com/map-1.pdf' },
        { id: 'img-2', type: 'downloadable_map', url: 'https://cdn.example.com/map-2.jpg' },
      ],
    });
    expect(screen.getByRole('link', { name: /download trail map 1/i, hidden: true })).toHaveAttribute(
      'href', 'https://cdn.example.com/map-1.pdf'
    );
    expect(screen.getByRole('link', { name: /download trail map 2/i, hidden: true })).toHaveAttribute(
      'href', 'https://cdn.example.com/map-2.jpg'
    );
  });

  it('does not render a download link when there is no downloadable_map image', () => {
    renderDetail({ images: [{ id: 'img-1', type: 'gallery', url: 'https://cdn.example.com/photo.jpg' }] });
    expect(screen.queryByRole('link', { name: /download trail map/i, hidden: true })).not.toBeInTheDocument();
  });
});
