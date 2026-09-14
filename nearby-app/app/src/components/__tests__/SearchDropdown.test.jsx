import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import SearchDropdown from '../SearchDropdown';

function renderDropdown(results) {
  const anchor = document.createElement('div');
  document.body.appendChild(anchor);
  return render(
    <MemoryRouter>
      <SearchDropdown visible anchorEl={anchor} isLoading={false} results={results} selectedIndex={-1} />
    </MemoryRouter>
  );
}

describe('SearchDropdown badge (#126)', () => {
  it('prefixes an event\'s category with "Event:" so it differs from a same-category business', () => {
    renderDropdown([
      { id: 'e1', name: 'Pittsboro Farmers Market', poi_type: 'EVENT', main_category: { name: 'Farmers Market' } },
      { id: 'b1', name: 'Pittsboro Farmers Market', poi_type: 'BUSINESS', main_category: { name: 'Farmers Market' } },
    ]);
    expect(screen.getByText('Event: Farmers Market')).toBeInTheDocument();
    expect(screen.getByText('Farmers Market')).toBeInTheDocument();
  });

  it('falls back to the type label when there is no category', () => {
    renderDropdown([{ id: 'e2', name: 'Pub Trivia', poi_type: 'EVENT' }]);
    expect(screen.getByText('Event')).toBeInTheDocument();
  });
});
