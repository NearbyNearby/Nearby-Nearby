import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { useForm } from '@mantine/form';
import AddressAutocomplete from '../AddressAutocomplete';

// Shape of a real Geoapify autocomplete result (format=json).
const RESULT = {
  formatted: '80 Hillsboro Street, Pittsboro, NC 27312, United States of America',
  address_line1: '80 Hillsboro Street',
  housenumber: '80',
  street: 'Hillsboro Street',
  city: 'Pittsboro',
  county: 'Chatham County',
  state: 'North Carolina',
  state_code: 'NC',
  postcode: '27312',
  lat: 35.7213618,
  lon: -79.1769125,
};

let fetchMock;

beforeAll(() => {
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('VITE_GEOAPIFY_API_KEY', 'test-key');
  fetchMock = vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ results: [RESULT] }) }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function Wrapper({ latitude = 35.9132, longitude = -79.0558 }) {
  const form = useForm({
    initialValues: {
      address_street: '',
      address_city: '',
      address_county: '',
      address_state: '',
      address_zip: '',
      latitude,
      longitude,
    },
  });
  return (
    <MantineProvider>
      <AddressAutocomplete form={form} label="Street Address" placeholder="123 Main St" />
      <pre data-testid="form-values">{JSON.stringify(form.values)}</pre>
    </MantineProvider>
  );
}

const formValues = () => JSON.parse(screen.getByTestId('form-values').textContent);
const input = () => screen.getByPlaceholderText('123 Main St');
const requestParams = (call) => new URL(fetchMock.mock.calls[call][0]).searchParams;

async function type(value) {
  await act(async () => {
    fireEvent.change(input(), { target: { value } });
  });
}

async function wait(ms) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('AddressAutocomplete', () => {
  it('asks Geoapify once, only after typing pauses for 1 second', async () => {
    render(<Wrapper />);

    await type('80 H');
    await wait(600);
    await type('80 Hills');
    await wait(999);
    expect(fetchMock).not.toHaveBeenCalled();

    await wait(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const params = requestParams(0);
    expect(params.get('text')).toBe('80 Hills');
    expect(params.get('format')).toBe('json');
    expect(params.get('filter')).toBe('countrycode:us');
    expect(params.get('bias')).toBe('proximity:-79.0558,35.9132');
    expect(params.get('limit')).toBe('5');
    expect(params.get('apiKey')).toBe('test-key');
    expect(screen.getByText(RESULT.formatted)).toBeInTheDocument();
  });

  it('biases to Pittsboro when no pin is set', async () => {
    render(<Wrapper latitude={null} longitude={null} />);

    await type('80 Hills');
    await wait(1000);
    expect(requestParams(0).get('bias')).toBe('proximity:-79.177397,35.720303');
  });

  it('does not search under 3 characters', async () => {
    render(<Wrapper />);

    await type('80');
    await wait(2000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fills the address fields and moves the pin when a suggestion is picked', async () => {
    render(<Wrapper />);

    await type('80 Hills');
    await wait(1000);
    await act(async () => {
      fireEvent.click(screen.getByText(RESULT.formatted));
    });
    await wait(1000);

    expect(formValues()).toEqual({
      address_street: '80 Hillsboro Street',
      address_city: 'Pittsboro',
      address_county: 'Chatham County',
      address_state: 'NC',
      address_zip: '27312',
      latitude: 35.7213618,
      longitude: -79.1769125,
    });
    expect(input()).toHaveValue('80 Hillsboro Street');
    // Picking changes the text, but must not trigger another search.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is a plain input that never calls Geoapify without a key', async () => {
    vi.stubEnv('VITE_GEOAPIFY_API_KEY', '');
    render(<Wrapper />);

    await type('80 Hillsboro');
    await wait(2000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(formValues().address_street).toBe('80 Hillsboro');
  });

  it('aborts a stale request when typing continues', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    render(<Wrapper />);

    await type('80 Hills');
    await wait(1000);
    const stale = fetchMock.mock.calls[0][1].signal;
    expect(stale.aborted).toBe(false);

    await type('80 Hillsboro');
    expect(stale.aborted).toBe(true);
    await wait(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(false);
  });

  it('fails quietly when Geoapify is unreachable', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    render(<Wrapper />);

    await type('80 Hills');
    await wait(1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(formValues().address_street).toBe('80 Hills');
  });
});
