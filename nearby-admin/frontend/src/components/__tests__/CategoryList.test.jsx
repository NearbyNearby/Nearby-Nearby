import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import CategoryList from '../CategoryList';

if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// GET /categories/tree shape, with a two-level branch and a multi-type category.
const TREE = [
  {
    id: 'cat-outdoors',
    name: 'Outdoors',
    parent_id: null,
    applicable_to: ['PARK', 'TRAIL'],
    poi_types: ['PARK', 'TRAIL'],
    is_active: true,
    children: [
      {
        id: 'cat-hiking',
        name: 'Hiking',
        parent_id: 'cat-outdoors',
        applicable_to: ['TRAIL'],
        poi_types: ['TRAIL'],
        is_active: true,
        children: [
          {
            id: 'cat-summit',
            name: 'Summit Hikes',
            parent_id: 'cat-hiking',
            applicable_to: ['TRAIL'],
            poi_types: ['TRAIL'],
            is_active: false,
            children: [],
          },
        ],
      },
    ],
  },
  {
    id: 'cat-food',
    name: 'Food & Drinks',
    parent_id: null,
    applicable_to: ['BUSINESS'],
    poi_types: ['BUSINESS'],
    is_active: true,
    children: [],
  },
];

const getMock = vi.fn();
const postMock = vi.fn();
const putMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('../../utils/api', () => ({
  default: {
    get: (...args) => getMock(...args),
    post: (...args) => postMock(...args),
    put: (...args) => putMock(...args),
    delete: (...args) => deleteMock(...args),
  },
}));

const jsonResponse = (body, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) });

const renderList = async () => {
  const result = render(
    <MantineProvider env="test">
      <MemoryRouter>
        <CategoryList />
      </MemoryRouter>
    </MantineProvider>,
  );
  await act(async () => {});
  return result;
};

beforeEach(() => {
  vi.clearAllMocks();
  getMock.mockImplementation((endpoint) => {
    if (endpoint === '/categories/tree') return jsonResponse(TREE);
    if (endpoint === '/categories/cat-hiking') {
      return jsonResponse({
        id: 'cat-hiking',
        name: 'Hiking',
        parent_id: 'cat-outdoors',
        applicable_to: ['TRAIL'],
        is_active: true,
      });
    }
    return jsonResponse({});
  });
});

describe('CategoryList tree', () => {
  it('renders top-level categories collapsed with a subcategory count', async () => {
    await renderList();

    await waitFor(() => expect(screen.getByText('Outdoors')).toBeInTheDocument());
    expect(screen.getByText('Food & Drinks')).toBeInTheDocument();
    expect(screen.getByText('1 sub')).toBeInTheDocument();
    // Children stay hidden until the branch is expanded.
    expect(screen.queryByText('Hiking')).not.toBeInTheDocument();
    expect(screen.getByText('4 categories, 2 at the top level')).toBeInTheDocument();
  });

  it('expands and collapses a branch', async () => {
    await renderList();
    await waitFor(() => expect(screen.getByText('Outdoors')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Expand Outdoors'));
    expect(screen.getByText('Hiking')).toBeInTheDocument();
    // Grandchildren need their own toggle.
    expect(screen.queryByText('Summit Hikes')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Expand Hiking'));
    expect(screen.getByText('Summit Hikes')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Collapse Outdoors'));
    expect(screen.queryByText('Hiking')).not.toBeInTheDocument();
  });

  it('expands every branch with Expand all', async () => {
    await renderList();
    await waitFor(() => expect(screen.getByText('Outdoors')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Expand all'));
    expect(screen.getByText('Hiking')).toBeInTheDocument();
    expect(screen.getByText('Summit Hikes')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Collapse all'));
    expect(screen.queryByText('Hiking')).not.toBeInTheDocument();
  });

  it('shows a POI type badge per applicable type and flags inactive categories', async () => {
    await renderList();
    await waitFor(() => expect(screen.getByText('Outdoors')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Expand all'));

    // Outdoors belongs to Park and Trail at the same time.
    expect(screen.getByText('Park')).toBeInTheDocument();
    expect(screen.getAllByText('Trail').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('Bus')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('filters the tree by search term and keeps matching ancestors visible', async () => {
    await renderList();
    await waitFor(() => expect(screen.getByText('Outdoors')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Search categories'), { target: { value: 'summit' } });

    // Matches auto-expand so the hit is visible without clicking.
    expect(screen.getByText('Summit Hikes')).toBeInTheDocument();
    expect(screen.getByText('Outdoors')).toBeInTheDocument();
    expect(screen.getByText('Hiking')).toBeInTheDocument();
    expect(screen.queryByText('Food & Drinks')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 3 of 4 categories')).toBeInTheDocument();
  });

  it('keeps the real subcategory count and the delete guard when a filter hides the children', async () => {
    await renderList();
    await waitFor(() => expect(screen.getByText('Outdoors')).toBeInTheDocument());

    // "Outdoors" matches, none of its descendants do, so the filtered node
    // carries no children. It is still a parent and still undeletable.
    fireEvent.change(screen.getByLabelText('Search categories'), { target: { value: 'Outdoors' } });

    expect(screen.getByText('Showing 1 of 4 categories')).toBeInTheDocument();
    expect(screen.queryByText('Hiking')).not.toBeInTheDocument();
    expect(screen.getByText('1 sub')).toBeInTheDocument();
    expect(screen.getByLabelText('Delete Outdoors')).toBeDisabled();
    // Nothing to expand to while filtered, so no dead chevron.
    expect(screen.queryByLabelText('Expand Outdoors')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Collapse Outdoors')).not.toBeInTheDocument();
  });

  it('filters the tree by POI type', async () => {
    await renderList();
    await waitFor(() => expect(screen.getByText('Outdoors')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Business (1)'));

    expect(screen.getByText('Food & Drinks')).toBeInTheDocument();
    expect(screen.queryByText('Outdoors')).not.toBeInTheDocument();
  });

  it('opens the editor drawer prefilled with the parent when adding a subcategory', async () => {
    await renderList();
    await waitFor(() => expect(screen.getByText('Outdoors')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Add subcategory under Outdoors'));
    await act(async () => {});

    expect(screen.getByText('New subcategory under "Outdoors"')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    // The parent picker is prefilled with the node the plus button belongs to.
    expect(within(dialog).getByDisplayValue('Outdoors')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Category Name/)).toHaveValue('');
  });

  it('opens the editor drawer with existing values when a category is clicked', async () => {
    await renderList();
    await waitFor(() => expect(screen.getByText('Outdoors')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Expand all'));

    fireEvent.click(screen.getByText('Hiking'));
    await act(async () => {});

    expect(getMock).toHaveBeenCalledWith('/categories/cat-hiking');
    const dialog = screen.getByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getByLabelText(/Category Name/)).toHaveValue('Hiking'),
    );
    expect(within(dialog).getByDisplayValue('Outdoors')).toBeInTheDocument();
    expect(screen.getByText('Edit category')).toBeInTheDocument();
  });

  it('blocks deletion of a category that still has subcategories', async () => {
    await renderList();
    await waitFor(() => expect(screen.getByText('Outdoors')).toBeInTheDocument());

    expect(screen.getByLabelText('Delete Outdoors')).toBeDisabled();
    expect(screen.getByLabelText('Delete Food & Drinks')).not.toBeDisabled();
  });

  it('deletes a leaf category after confirmation', async () => {
    deleteMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    await renderList();
    await waitFor(() => expect(screen.getByText('Outdoors')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Delete Food & Drinks'));
    await act(async () => {});
    fireEvent.click(screen.getByText('Delete Category'));
    await act(async () => {});

    expect(deleteMock).toHaveBeenCalledWith('/categories/cat-food');
  });
});
