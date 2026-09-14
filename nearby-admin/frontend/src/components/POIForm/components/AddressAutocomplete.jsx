import React, { useEffect, useRef, useState } from 'react';
import { Autocomplete } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { DebouncedTextInput } from '../../DebouncedTextInput';
import { getDebouncedInputProps } from '../constants/helpers';

// Pittsboro, the map's default center, biases results until a pin is set.
const DEFAULT_BIAS = { lat: 35.720303, lng: -79.177397 };
const MIN_CHARS = 3;
const TYPING_PAUSE_MS = 1000;

function GeoapifyAutocomplete({ form, apiKey, ...props }) {
  const externalValue = form.values.address_street;
  const [text, setText] = useState(externalValue || '');
  const [results, setResults] = useState([]);
  const isInitialMount = useRef(true);
  const timerRef = useRef();
  const abortRef = useRef();
  // Street from the last pick, so the onChange Mantine fires after a pick
  // shows the street instead of the full label and does not refetch.
  const pickedStreetRef = useRef(null);

  const writeStreet = useDebouncedCallback((value) => {
    form.setFieldValue('address_street', value);
  }, 300);

  // Sync values loaded into the form after mount, like DebouncedTextInput.
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (externalValue !== undefined && externalValue !== text) {
      setText(externalValue || '');
    }
  }, [externalValue]);

  useEffect(() => () => {
    clearTimeout(timerRef.current);
    abortRef.current?.abort();
  }, []);

  const fetchSuggestions = (query) => {
    const controller = new AbortController();
    abortRef.current = controller;
    const { latitude, longitude } = form.values;
    const bias = Number.isFinite(latitude) && Number.isFinite(longitude)
      ? { lat: latitude, lng: longitude }
      : DEFAULT_BIAS;
    const params = new URLSearchParams({
      text: query,
      format: 'json',
      filter: 'countrycode:us',
      bias: `proximity:${bias.lng},${bias.lat}`,
      limit: '5',
      apiKey,
    });
    fetch(`https://api.geoapify.com/v1/geocode/autocomplete?${params}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        // Autocomplete options must be unique strings.
        const seen = new Set();
        setResults((data.results || []).filter((r) => (
          r.formatted && !seen.has(r.formatted) && seen.add(r.formatted)
        )));
      })
      // Suggestions are a convenience; typing still works without them.
      .catch(() => {});
  };

  const handleChange = (value) => {
    clearTimeout(timerRef.current);
    abortRef.current?.abort();
    if (pickedStreetRef.current !== null) {
      setText(pickedStreetRef.current);
      pickedStreetRef.current = null;
      return;
    }
    setText(value);
    writeStreet(value);
    if (value.trim().length < MIN_CHARS) {
      setResults([]);
      return;
    }
    timerRef.current = setTimeout(() => fetchSuggestions(value.trim()), TYPING_PAUSE_MS);
  };

  const handlePick = (formatted) => {
    const r = results.find((result) => result.formatted === formatted);
    const street = r.street
      ? [r.housenumber, r.street].filter(Boolean).join(' ')
      : r.address_line1;
    writeStreet.cancel();
    pickedStreetRef.current = street;
    form.setFieldValue('address_street', street);
    const city = r.city || r.town || r.village || r.hamlet;
    if (city) form.setFieldValue('address_city', city);
    if (r.county) form.setFieldValue('address_county', r.county);
    if (r.state_code) form.setFieldValue('address_state', r.state_code);
    if (r.postcode) form.setFieldValue('address_zip', r.postcode);
    // Moves the LocationMap pin, which can then be dragged to fine-tune.
    form.setFieldValue('latitude', r.lat);
    form.setFieldValue('longitude', r.lon);
    setResults([]);
  };

  return (
    <Autocomplete
      {...props}
      value={text}
      onChange={handleChange}
      onOptionSubmit={handlePick}
      data={results.map((r) => r.formatted)}
      filter={({ options }) => options}
    />
  );
}

/**
 * Street Address field with Geoapify suggestions. Picking one fills the
 * address fields and moves the map pin. Without VITE_GEOAPIFY_API_KEY it is
 * the plain debounced input and makes no requests.
 */
export default function AddressAutocomplete({ form, ...props }) {
  const apiKey = import.meta.env.VITE_GEOAPIFY_API_KEY;
  if (!apiKey) {
    return <DebouncedTextInput {...props} {...getDebouncedInputProps(form, 'address_street')} />;
  }
  return <GeoapifyAutocomplete form={form} apiKey={apiKey} {...props} />;
}
