import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import CategoryForm from '../CategoryForm';

// Mantine's MultiSelect needs a ResizeObserver, which jsdom lacks.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

const postMock = vi.fn();

vi.mock('../../utils/api', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })),
    post: (...args) => postMock(...args),
    put: vi.fn(),
  },
}));

const jsonResponse = (body, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) });

const renderForm = async () => {
  const result = render(
    <MantineProvider env="test">
      <MemoryRouter>
        <CategoryForm />
      </MemoryRouter>
    </MantineProvider>,
  );
  await act(async () => {});
  return result;
};

// The form requires a name and at least one POI type before it submits.
const fillAndSubmit = async () => {
  fireEvent.change(screen.getByLabelText(/Category Name/), { target: { value: "Women's" } });
  fireEvent.click(screen.getByText('Business'));
  fireEvent.click(screen.getByRole('button', { name: 'Create Category' }));
  await act(async () => {});
};

describe('CategoryForm error surfacing (#192)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the API detail message when the create request fails with 409', async () => {
    postMock.mockReturnValue(
      jsonResponse(
        { detail: 'A category named "Women\'s" already exists under "Hair Salon".' },
        false,
      ),
    );

    await renderForm();
    await fillAndSubmit();

    await waitFor(() => {
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Error',
          message: 'A category named "Women\'s" already exists under "Hair Salon".',
          color: 'red',
        }),
      );
    });
  });

  it('falls back to the generic message when the error body has no detail', async () => {
    postMock.mockReturnValue(jsonResponse({}, false));

    await renderForm();
    await fillAndSubmit();

    await waitFor(() => {
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Error',
          message: 'Failed to create category',
          color: 'red',
        }),
      );
    });
  });
});
