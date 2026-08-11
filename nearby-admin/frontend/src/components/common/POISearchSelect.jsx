import { useState, useRef, useCallback, useLayoutEffect } from 'react';
import {
  TextInput,
  Paper,
  Text,
  Badge,
  Loader,
  Group,
  Stack,
  Box,
  Portal,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import api from '../../utils/api';

/**
 * POISearchSelect
 *
 * Reusable component for searching and selecting POIs from the database.
 *
 * Props:
 *   onSelect      (fn)      - Called with { id, name, slug, poi_type, address_city,
 *                             email, phone_number, website_url, instagram_username,
 *                             facebook_username } on selection (the extra contact
 *                             fields let callers, e.g. Event Organizer linking
 *                             for issue #122, prefill from the selected POI)
 *   placeholder   (string)  - Input placeholder text
 *   filterTypes   (string[])- Optional array of POI type strings to restrict results
 *   label         (string)  - Optional label rendered above the input
 *
 * The results panel is rendered in a Portal (attached to document.body) so it
 * cannot be clipped by an ancestor's overflow, nor trapped underneath a sibling
 * card by a low stacking context. It is positioned in viewport coordinates from
 * the input's bounding rect and given an explicit solid background + high
 * z-index so it visibly overlays the content below it.
 */
export default function POISearchSelect({
  onSelect,
  placeholder = 'Search POIs...',
  filterTypes,
  label,
}) {
  const [inputValue, setInputValue] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownRect, setDropdownRect] = useState(null);

  const debounceRef = useRef(null);
  const inputWrapperRef = useRef(null);

  // Measure the input so the portalled panel can align under it in viewport
  // coordinates. Recomputed whenever the dropdown opens and on scroll/resize.
  const updateDropdownRect = useCallback(() => {
    const el = inputWrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setDropdownRect({
      top: rect.bottom + 2,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  useLayoutEffect(() => {
    if (!showDropdown) return undefined;
    updateDropdownRect();
    window.addEventListener('scroll', updateDropdownRect, true);
    window.addEventListener('resize', updateDropdownRect);
    return () => {
      window.removeEventListener('scroll', updateDropdownRect, true);
      window.removeEventListener('resize', updateDropdownRect);
    };
  }, [showDropdown, updateDropdownRect]);

  function buildUrl(query) {
    const params = new URLSearchParams();
    params.set('search', query);
    params.set('limit', '10');

    if (filterTypes && filterTypes.length > 0) {
      filterTypes.forEach((type) => params.append('poi_type', type));
    }

    // Admin-only linking flows (vendors, sponsors, organizer) use the admin
    // endpoint so DRAFT businesses are selectable. The public /pois/ route only
    // returns published POIs, which hides most in-progress listings. api.get
    // sends the auth token that /admin/pois/ requires.
    return `/admin/pois/?${params.toString()}`;
  }

  async function fetchResults(query) {
    if (!query.trim()) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    setLoading(true);
    try {
      const response = await api.get(buildUrl(query));
      if (response && response.ok) {
        const data = await response.json();
        // The /admin/pois/ endpoint returns a RAW ARRAY; older/paginated shapes
        // wrap results in { items: [...] }. Handle both so results are never dropped.
        const items = Array.isArray(data) ? data : (data.items ?? []);
        setResults(items);
        setShowDropdown(true);
      } else {
        // Surface API failures so an empty dropdown is distinguishable from a
        // genuine "no matches" result.
        const status = response ? response.status : 'no response';
        console.error('POISearchSelect: POI search failed', status);
        notifications.show({
          title: 'Search failed',
          message: 'Could not search POIs. Please try again.',
          color: 'red',
        });
        setResults([]);
        setShowDropdown(true);
      }
    } catch (error) {
      console.error('POISearchSelect: POI search request errored', error);
      notifications.show({
        title: 'Search failed',
        message: 'Could not search POIs. Please try again.',
        color: 'red',
      });
      setResults([]);
      setShowDropdown(true);
    } finally {
      setLoading(false);
    }
  }

  function handleInputChange(event) {
    const value = event.currentTarget.value;
    setInputValue(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!value.trim()) {
      setResults([]);
      setShowDropdown(false);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      fetchResults(value);
    }, 300);
  }

  function handleSelect(poi) {
    onSelect({
      id: poi.id,
      name: poi.name,
      slug: poi.slug,
      poi_type: poi.poi_type,
      address_city: poi.address_city,
      // Contact fields so callers can prefill from the selected POI (#122).
      email: poi.email,
      phone_number: poi.phone_number,
      website_url: poi.website_url,
      instagram_username: poi.instagram_username,
      facebook_username: poi.facebook_username,
    });
    setInputValue(poi.name);
    setShowDropdown(false);
    setResults([]);
  }

  function handleBlur() {
    // Small delay so click events on dropdown items fire before hiding
    setTimeout(() => setShowDropdown(false), 150);
  }

  function handleFocus() {
    if (results.length > 0) {
      setShowDropdown(true);
    }
  }

  return (
    <Box ref={inputWrapperRef} style={{ position: 'relative' }}>
      <TextInput
        label={label}
        placeholder={placeholder}
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        rightSection={loading ? <Loader size="xs" /> : null}
      />

      {showDropdown && dropdownRect && (
        <Portal>
          <Paper
            shadow="md"
            withBorder
            bg="white"
            style={{
              position: 'fixed',
              top: dropdownRect.top,
              left: dropdownRect.left,
              width: dropdownRect.width,
              zIndex: 3000,
              maxHeight: 300,
              overflowY: 'auto',
              backgroundColor: 'var(--mantine-color-body, #fff)',
            }}
          >
            {results.length === 0 ? (
              <Box p="sm">
                <Text size="sm" c="dimmed">
                  No results found
                </Text>
              </Box>
            ) : (
              <Stack gap={0}>
                {results.map((poi) => (
                  <Box
                    key={poi.id}
                    p="sm"
                    style={{
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--mantine-color-gray-2)',
                    }}
                    onMouseDown={() => handleSelect(poi)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        'var(--mantine-color-gray-0)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '';
                    }}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <Stack gap={2}>
                        <Text size="sm" fw={500} lineClamp={1}>
                          {poi.name}
                        </Text>
                        {poi.address_city && (
                          <Text size="xs" c="dimmed">
                            {poi.address_city}
                          </Text>
                        )}
                      </Stack>
                      <Badge size="xs" variant="light" style={{ flexShrink: 0 }}>
                        {poi.poi_type}
                      </Badge>
                    </Group>
                  </Box>
                ))}
              </Stack>
            )}
          </Paper>
        </Portal>
      )}
    </Box>
  );
}
