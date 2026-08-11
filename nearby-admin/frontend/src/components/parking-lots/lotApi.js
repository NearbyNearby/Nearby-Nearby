// Shared client helpers for the reusable parking lots API (#90 / #161).
//
// Used by the POI form's link group, the create/edit modal, and the
// /parking-lots management pages so the request shapes stay in one place.
import { api } from '../../utils/api';

export const EXPECT_TO_PAY_OPTIONS = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' },
  { value: 'sometimes', label: 'Sometimes' },
];

export const PUBLICATION_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

export const emptyLotValues = () => ({
  name: '',
  parking_types: [],
  accessible_parking_details: [],
  notes: '',
  latitude: null,
  longitude: null,
  what3words: '',
  address_hint: '',
  expect_to_pay: 'no',
  publication_status: 'draft',
});

/** API response -> form values (nulls become the empty shapes Mantine wants). */
export const lotToFormValues = (lot) => ({
  ...emptyLotValues(),
  name: lot?.name || '',
  parking_types: lot?.parking_types || [],
  accessible_parking_details: lot?.accessible_parking_details || [],
  notes: lot?.notes || '',
  latitude: lot?.latitude ?? null,
  longitude: lot?.longitude ?? null,
  what3words: lot?.what3words || '',
  address_hint: lot?.address_hint || '',
  expect_to_pay: lot?.expect_to_pay || 'no',
  publication_status: lot?.publication_status || 'draft',
});

/** Pull the backend's error text out of a failed response. */
async function errorFrom(response, fallback) {
  const body = await response.json().catch(() => ({}));
  const detail = body?.detail;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && detail.detail) return detail.detail;
  return fallback;
}

export async function fetchLot(lotId) {
  const response = await api.get(`/parking-lots/${lotId}`);
  if (!response || !response.ok) {
    throw new Error(await errorFrom(response, 'Failed to load parking lot'));
  }
  return response.json();
}

export async function searchLots({ q = '', limit = 20 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (q) params.set('q', q);
  const response = await api.get(`/parking-lots/?${params.toString()}`);
  if (!response || !response.ok) {
    throw new Error(await errorFrom(response, 'Failed to search parking lots'));
  }
  return response.json();
}

/** Create (no lotId) or update (lotId) a lot. Returns the saved lot. */
export async function saveLot(values, { lotId = null, ownerPoiId = null } = {}) {
  const payload = {
    ...values,
    notes: values.notes || null,
    what3words: values.what3words || null,
    address_hint: values.address_hint || null,
  };
  if (!lotId) payload.owner_poi_id = ownerPoiId;
  const response = lotId
    ? await api.put(`/parking-lots/${lotId}`, payload)
    : await api.post('/parking-lots/', payload);
  if (!response || !response.ok) {
    throw new Error(await errorFrom(response, 'Failed to save parking lot'));
  }
  return response.json();
}

/**
 * Delete a lot. Resolves to `{ conflict: true, linkedPoiCount }` on the 409 the
 * backend raises while POIs still link it, so the caller can re-confirm and
 * retry with `force`.
 */
export async function deleteLot(lotId, { force = false } = {}) {
  const response = await api.delete(`/parking-lots/${lotId}${force ? '?force=true' : ''}`);
  if (response && response.status === 409) {
    const body = await response.json().catch(() => ({}));
    const detail = body?.detail || {};
    return { conflict: true, linkedPoiCount: detail.linked_poi_count ?? 0 };
  }
  if (!response || !response.ok) {
    throw new Error(await errorFrom(response, 'Failed to delete parking lot'));
  }
  return { conflict: false };
}

export async function fetchLinkedPois(lotId) {
  const response = await api.get(`/parking-lots/${lotId}/linked-pois`);
  if (!response || !response.ok) {
    throw new Error(await errorFrom(response, 'Failed to load linked POIs'));
  }
  return response.json();
}

/**
 * Who may edit a lot. A standalone lot is shared infrastructure whose edit
 * propagates to every POI that links it, so it is admin-only; an owned lot is
 * ordinary POI content that an editor may write. Mirrors
 * `_require_admin_for_standalone` in the backend.
 */
export function canEditLot(lot, role) {
  if (role === 'admin') return true;
  if (role !== 'editor') return false;
  return Boolean(lot?.owner_poi_id);
}

export function lotEditDeniedReason(lot, role) {
  if (canEditLot(lot, role)) return null;
  if (lot?.owner_poi_id) return 'You do not have permission to edit this parking lot';
  return 'Only an admin may edit a shared standalone parking lot';
}
