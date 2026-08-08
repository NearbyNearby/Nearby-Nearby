import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import { Text } from '@mantine/core';
import api from '../../../utils/api';
import { emptyInitialValues } from '../constants/initialValues';
import { preparePOIPayload } from '../utils/formCleanup';

// Issue #123: a sponsor logo picked before the POI exists is held as a raw
// File on the sponsor row (`_pendingLogoFile`, set by EventSponsorsSection).
// Once a POI id exists (auto-create, or the very first save), upload each
// pending file the same way ImageUploadField does and swap it for a real
// logo_url/logo_image_id, transparently, without asking the user to re-pick
// anything after save.
async function uploadPendingSponsorLogos(poiId, sponsors) {
  if (!poiId || !Array.isArray(sponsors) || !sponsors.some((s) => s?._pendingLogoFile)) {
    return sponsors;
  }
  const updated = [];
  for (const sponsor of sponsors) {
    if (!sponsor?._pendingLogoFile) {
      updated.push(sponsor);
      continue;
    }
    try {
      const fileFormData = new FormData();
      fileFormData.append('file', sponsor._pendingLogoFile);
      fileFormData.append('image_type', 'sponsor_logo');
      fileFormData.append('context', `sponsor_${sponsor._id}`);
      const response = await api.request(`/images/upload/${poiId}`, {
        method: 'POST',
        body: fileFormData,
      });
      if (response.ok) {
        const uploaded = await response.json();
        const { _pendingLogoFile, ...rest } = sponsor;
        updated.push({
          ...rest,
          logo_url: uploaded.url || uploaded.medium_url || uploaded.thumbnail_url || '',
          logo_image_id: uploaded.id,
        });
      } else {
        // Leave the pending file in place so the user can retry the upload.
        updated.push(sponsor);
      }
    } catch (error) {
      console.error('Sponsor logo upload failed:', error);
      updated.push(sponsor);
    }
  }
  return updated;
}

export const usePOIHandlers = (id, isEditing, form, setPoiId) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // Load POI data if editing
  useEffect(() => {
    if (isEditing) {
      const fetchPOI = async () => {
        try {
          const response = await api.get(`/pois/${id}`);

          // Check if response is ok
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const poi = await response.json();
          console.log('Fetched POI data:', poi);

          // Transform the data to match form structure
          const formData = {
            ...emptyInitialValues,
            ...poi,
            longitude: poi.location?.coordinates?.[0] || emptyInitialValues.longitude,
            latitude: poi.location?.coordinates?.[1] || emptyInitialValues.latitude,
            category_ids: poi.categories ? poi.categories.map(c => c.id) : [],
            main_category_id: poi.main_category?.id || null,
            primary_type_id: poi.primary_type_id || null,
            business: poi.business || emptyInitialValues.business,
            park: poi.park || emptyInitialValues.park,
            trail: poi.trail || emptyInitialValues.trail,
            event: poi.event || emptyInitialValues.event
          };

          // Ensure all array fields are arrays, not null.
          // NOTE: Issue #43 — `ideal_for` is now an object ({atmosphere, age_group,
          // social_settings, local_special, special_needs}), not an array. Handle below.
          const arrayFields = [
            'ideal_for_key', 'parking_types', 'payment_methods',
            // 'key_facilities' removed — renamed _deprecated_key_facilities (Migration A #34)
            // 'ideal_for' removed — now an object {atmosphere, age_group, social_settings, local_special, special_needs} (Issue #43)
            // 'wheelchair_accessible' removed — column dropped (Issue #45 PR2 Migration B)
            'alcohol_options', 'smoking_options', 'wifi_options',
            'pet_options', 'public_toilets', 'youth_amenities', 'business_amenities',
            'entertainment_options', 'natural_features', 'outdoor_types', 'things_to_do',
            'hunting_types', 'fishing_types', 'licenses_required', 'playground_types',
            'playground_surface_types', 'downloadable_maps', 'parking_locations',
            'toilet_locations', 'delivery_links',
            'reservation_links', 'appointment_links', 'online_ordering_links',
            'service_locations', 'locally_found_at', 'article_links',
            'organization_memberships', 'payphone_locations',
            'facilities_options'
            // Removed deprecated photo fields: rental_photos, menu_photos, parking_photos
          ];

          arrayFields.forEach(field => {
            if (formData[field] === null || formData[field] === undefined || !Array.isArray(formData[field])) {
              formData[field] = emptyInitialValues[field] || [];
            }
          });

          // Issue #43 — `ideal_for` is an object of 5 string-array groups.
          // Coerce legacy flat arrays / null / missing values into the canonical shape.
          {
            const idealDefault = emptyInitialValues.ideal_for || {
              atmosphere: [], age_group: [], social_settings: [], local_special: [], special_needs: []
            };
            const incoming = formData.ideal_for;
            if (!incoming || Array.isArray(incoming) || typeof incoming !== 'object') {
              // Legacy flat array data is no longer surfaced; safe to reset.
              formData.ideal_for = { ...idealDefault };
            } else {
              formData.ideal_for = {
                ...idealDefault,
                ...incoming,
              };
              // Normalize any non-array group value back to []
              Object.keys(idealDefault).forEach(k => {
                if (!Array.isArray(formData.ideal_for[k])) formData.ideal_for[k] = [];
              });
            }
          }

          // Ensure all subtype objects exist with proper initialization
          if (!formData.business && formData.poi_type === 'BUSINESS') {
            formData.business = { ...emptyInitialValues.business };
          }
          if (!formData.park && formData.poi_type === 'PARK') {
            formData.park = { ...emptyInitialValues.park };
          }
          if (!formData.trail && formData.poi_type === 'TRAIL') {
            formData.trail = { ...emptyInitialValues.trail };
          }
          if (!formData.event && formData.poi_type === 'EVENT') {
            formData.event = { ...emptyInitialValues.event };
          }

          // Handle hours field specially
          if (!formData.hours || formData.hours === null) {
            formData.hours = emptyInitialValues.hours || {};
          }

          // Handle all string/text fields - convert null to empty string
          const stringFields = [
            'name', 'teaser_paragraph', 'description_long', 'description_short', 'status_message',
            'address_full', 'address_street', 'address_city', 'address_zip', 'website_url',
            'phone_number', 'email', 'instagram_username', 'facebook_username', 'x_username',
            'tiktok_username', 'linkedin_username', 'main_contact_name', 'main_contact_email',
            'main_contact_phone', 'offsite_emergency_contact', 'emergency_protocols',
            'cost', 'pricing_details', 'history_paragraph', 'featured_image',
            'parking_notes', 'wheelchair_details', 'smoking_details',
            // 'public_transit_info' removed — renamed _deprecated_public_transit_info (Migration A #33)
            'drone_usage', 'drone_policy', 'pet_policy', 'toilet_description', 'rental_info',
            'rental_pricing', 'rental_link', 'price_range_per_person', 'pricing', 'gift_cards',
            'menu_link', 'community_impact', 'night_sky_viewing', 'birding_wildlife',
            'hunting_fishing_info', 'membership_details', 'camping_lodging', 'playground_notes',
            'pets_allowed', 'alcohol_available', 'public_toilets_available', 'toilet_photos',
            'park_entry_notes', 'business_entry_notes', 'appointment_booking_url',
            'primary_parking_name'
            // Removed deprecated photo fields: park_entry_photo, parking_lot_photo, business_entry_photo
          ];

          stringFields.forEach(field => {
            if (formData[field] === null || formData[field] === undefined) {
              formData[field] = '';
            }
          });

          // Ensure compliance object is never null
          if (!formData.compliance || typeof formData.compliance !== 'object') {
            formData.compliance = {};
          }

          // Ensure mobility_access object is never null
          if (!formData.mobility_access || typeof formData.mobility_access !== 'object') {
            formData.mobility_access = {};
          }

          // Derive UI control fields from actual data arrays
          // (alcohol_available is now a real persisted column — Issue #69 — so it
          // is NOT derived; it loads directly from the backend.)
          formData.public_toilets_available = (formData.public_toilets && formData.public_toilets.length > 0) ? 'yes' : 'no';
          formData.pets_allowed = (formData.pet_options && formData.pet_options.length > 0) ? 'yes' : 'no';

          // Handle numeric fields that should be null or numbers
          const numericFields = ['front_door_latitude', 'front_door_longitude', 'primary_parking_lat', 'primary_parking_lng'];
          numericFields.forEach(field => {
            if (formData[field] === '' || formData[field] === 'null') {
              formData[field] = null;
            }
          });

          // Handle nested string fields
          if (formData.trail) {
            const trailStringFields = [
              'length_text', 'difficulty', 'difficulty_description', 'route_type',
              'trail_markings', 'trailhead_access_details', 'downloadable_trail_map'
              // Removed: trailhead_entrance_photo, trailhead_exit_photo (dropped by w63c_001).
              // Removed earlier: trailhead_photo, trail_exit_photo.
            ];
            trailStringFields.forEach(field => {
              if (formData.trail[field] === null || formData.trail[field] === undefined) {
                formData.trail[field] = '';
              }
            });

            // Handle trail numeric fields
            // trail_exit_latitude/longitude dropped by w63c_001 — exits live in access_points[].
            const trailNumericFields = [
              'trailhead_latitude', 'trailhead_longitude'
            ];
            trailNumericFields.forEach(field => {
              if (formData.trail[field] === '' || formData.trail[field] === 'null') {
                formData.trail[field] = null;
              }
            });
          }

          if (formData.event) {
            const eventStringFields = [
              'organizer_name', 'food_and_drink_info', 'vendor_fee',
              'vendor_application_info', 'vendor_requirements',
              'event_entry_notes',
              // Task 134-136
              'event_status', 'cancellation_paragraph', 'new_event_link',
              // Task 137 — DEPRECATED (Issue #42). Use main_category_id /
              // MainCategorySelector instead of the legacy string field.
              // Task 138
              'organizer_email', 'organizer_phone', 'organizer_website',
              // Task 139
              'cost_type',
            ];
            eventStringFields.forEach(field => {
              if (formData.event[field] === null || formData.event[field] === undefined) {
                formData.event[field] = '';
              }
            });

            // Convert datetime strings to Date objects for DateTimePicker
            const eventDateFields = ['start_datetime', 'end_datetime', 'recurrence_end_date', 'vendor_application_deadline'];
            eventDateFields.forEach(field => {
              if (formData.event[field] && typeof formData.event[field] === 'string') {
                formData.event[field] = new Date(formData.event[field]);
              }
            });

            // Ensure event array fields are arrays
            const eventArrayFields = ['venue_settings', 'coat_check_options', 'vendor_types', 'vendor_poi_links', 'excluded_dates', 'manual_dates', 'ticket_links', 'sponsors'];
            eventArrayFields.forEach(field => {
              if (!Array.isArray(formData.event[field])) {
                formData.event[field] = [];
              }
            });
          }

          // Final validation: ensure no undefined values
          const ensureNoUndefined = (obj, path = '') => {
            Object.keys(obj).forEach(key => {
              const currentPath = path ? `${path}.${key}` : key;
              if (obj[key] === undefined) {
                console.warn(`⚠️ Found undefined value at ${currentPath}, setting to appropriate default`);
                if (emptyInitialValues[key] !== undefined) {
                  obj[key] = emptyInitialValues[key];
                } else if (Array.isArray(emptyInitialValues[key])) {
                  obj[key] = [];
                } else if (typeof emptyInitialValues[key] === 'object' && emptyInitialValues[key] !== null) {
                  obj[key] = {};
                } else if (typeof emptyInitialValues[key] === 'string') {
                  obj[key] = '';
                } else if (typeof emptyInitialValues[key] === 'number') {
                  obj[key] = null;
                } else if (typeof emptyInitialValues[key] === 'boolean') {
                  obj[key] = false;
                } else {
                  obj[key] = '';
                }
              } else if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
                ensureNoUndefined(obj[key], currentPath);
              }
            });
          };

          ensureNoUndefined(formData);
          console.log('Form data after transformation:', formData);

          // Set form values with error handling
          try {
            form.setValues(formData);
            console.log('Form values set successfully');
          } catch (formError) {
            console.error('Error setting form values:', formError);
            throw new Error(`Form validation error: ${formError.message}`);
          }
        } catch (error) {
          console.error('Error loading POI:', error);
          notifications.show({
            title: 'Error',
            message: `Failed to load POI data: ${error.message}`,
            color: 'red'
          });
        }
      };
      fetchPOI();
    }
  }, [id, isEditing]);

  // Issue #123: flush any sponsor logo picked before the POI existed as soon
  // as an id shows up (typically right after auto-create resolves). Handles
  // the case where the user picked a file DURING that brief gap, which the
  // explicit post-create flush in handleSubmit/handleAutoCreate can't catch
  // because it only sees sponsors that existed at the moment the POI was
  // actually created.
  useEffect(() => {
    if (!id) return;
    const sponsors = form.values.event?.sponsors;
    if (!Array.isArray(sponsors) || !sponsors.some((s) => s?._pendingLogoFile)) return;
    uploadPendingSponsorLogos(id, sponsors).then((updated) => {
      form.setFieldValue('event.sponsors', updated);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Helper to extract validation error details from 422 response
  const extractValidationError = async (response) => {
    try {
      const errorData = await response.json();
      console.error('Validation error details:', errorData);

      if (errorData.detail) {
        // Pydantic validation errors come as an array
        if (Array.isArray(errorData.detail)) {
          const errors = errorData.detail.map(err => {
            const field = err.loc ? err.loc.join('.') : 'unknown';
            return `${field}: ${err.msg}`;
          });
          return errors.join('\n');
        }
        // Simple string error
        return errorData.detail;
      }
      return JSON.stringify(errorData);
    } catch (e) {
      return `HTTP ${response.status}`;
    }
  };

  const handleSubmit = async (values, publicationStatus = 'published') => {
    setLoading(true);

    // Show loading notification
    const actionText = publicationStatus === 'draft' ?
      (isEditing && form.values.publication_status === 'published' ? 'unpublishing' : 'saving draft') :
      (isEditing ? 'updating' : 'publishing');

    const loadingNotification = notifications.show({
      title: `${actionText.charAt(0).toUpperCase() + actionText.slice(1)}...`,
      message: `Please wait while we ${actionText} your POI`,
      loading: true,
      autoClose: false,
    });

    // Prepare payload using shared utility
    const payload = preparePOIPayload(values);
    payload.publication_status = publicationStatus;

    try {
      let response;
      let poiId = id;

      if (isEditing) {
        // Update existing POI
        response = await api.put(`/pois/${id}`, payload);

        if (!response.ok) {
          const errorDetails = await extractValidationError(response);
          throw new Error(errorDetails);
        }

        notifications.update({
          id: loadingNotification,
          title: 'Success!',
          message: publicationStatus === 'draft' && form.values.publication_status === 'published' ?
            'POI unpublished successfully!' :
            `POI ${publicationStatus === 'draft' ? 'saved as draft' : 'updated'} successfully!`,
          color: 'green',
          loading: false,
          autoClose: 3000
        });

        // Only navigate away if publishing (not if saving draft)
        if (publicationStatus === 'published') {
          window.location.href = '/';
        } else {
          // Stay on the edit page for drafts - just reload to get fresh data
          window.location.reload();
        }
      } else {
        // Create new POI
        response = await api.post('/pois/', payload);

        if (!response.ok) {
          const errorDetails = await extractValidationError(response);
          throw new Error(errorDetails);
        }

        const createdPoi = await response.json();
        poiId = createdPoi.id;

        // Issue #123: flush any sponsor logo picked before the POI existed,
        // now that we have a real id to upload it against. The create payload
        // went out before the upload, so its sponsor rows lack logo_url and
        // logo_image_id; persist the uploaded references with a follow-up PUT
        // before navigating away, or the uploaded image is orphaned.
        if (values.event?.sponsors?.some((s) => s?._pendingLogoFile)) {
          try {
            const updated = await uploadPendingSponsorLogos(poiId, values.event.sponsors);
            if (payload.event && updated.some((s) => s?.logo_image_id)) {
              payload.event.sponsors = updated.map(({ _pendingLogoFile, ...rest }) => rest);
              await api.put(`/pois/${poiId}`, payload);
            }
          } catch (error) {
            // The POI itself was created fine; a failed logo persist should
            // not turn the whole save into an error.
            console.error('Persisting sponsor logos after create failed:', error);
          }
        }

        notifications.update({
          id: loadingNotification,
          title: 'Success!',
          message: `POI ${publicationStatus === 'draft' ? 'saved as draft' : 'published'} successfully!`,
          color: 'green',
          loading: false,
          autoClose: 3000
        });

        // For new POIs
        if (publicationStatus === 'published') {
          window.location.href = '/';
        } else if (poiId) {
          window.location.href = `/poi/${poiId}/edit`;
        } else {
          window.location.href = '/';
        }
      }
    } catch (error) {
      console.error('API Error:', error);

      let errorMessage = 'An unknown error occurred';
      if (error.message) {
        errorMessage = error.message;
      }

      notifications.update({
        id: loadingNotification,
        title: 'Error',
        message: errorMessage,
        color: 'red',
        loading: false,
        autoClose: 10000
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAutoCreate = async () => {
    // Create a minimal draft POI with default values
    const poiType = form.values.poi_type || 'BUSINESS';
    const minimalPOI = {
      name: 'New POI',
      teaser_paragraph: '',
      poi_type: poiType,
      listing_type: form.values.listing_type || 'free',
      publication_status: 'draft',
      status: 'active',
      primary_type_id: form.values.primary_type_id || null,
      latitude: form.values.latitude || 0,
      longitude: form.values.longitude || 0,
      location: {
        type: 'Point',
        coordinates: [form.values.longitude || 0, form.values.latitude || 0]
      },
      category_ids: [],
      is_verified: false,
      is_disaster_hub: false
    };

    // Add required subtype data based on POI type
    if (poiType === 'BUSINESS') {
      minimalPOI.business = { price_range: '$' };
    } else if (poiType === 'PARK') {
      minimalPOI.park = { drone_usage_policy: '' };
    } else if (poiType === 'TRAIL') {
      minimalPOI.trail = {
        length_text: '',
        difficulty: null,
        difficulty_description: null,
        route_type: null,
        trailhead_latitude: null,
        trailhead_longitude: null
        // trail_exit_latitude / trail_exit_longitude dropped by w63c_001 —
        // exit coords now live inside access_points[] entries.
      };
    } else if (poiType === 'EVENT') {
      minimalPOI.event = {
        start_datetime: new Date().toISOString(),
        end_datetime: null,
        organizer_name: ''
      };
    }

    try {
      const response = await api.post('/pois/', minimalPOI);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const createdPoi = await response.json();

      if (createdPoi.id) {
        // Update the form with the created POI's data
        form.setFieldValue('name', 'New POI');
        form.setFieldValue('publication_status', 'draft');

        // Update the POI ID in the parent component
        if (setPoiId) {
          setPoiId(createdPoi.id);
        }

        return createdPoi.id;
      }
      return null;
    } catch (error) {
      console.error('Auto-create error:', error);
      notifications.show({
        title: 'Notice',
        message: 'Form initialized without auto-save. Please fill and save manually.',
        color: 'blue'
      });
      return null;
    }
  };

  const handleDelete = async () => {
    modals.openConfirmModal({
      title: 'Delete POI',
      centered: true,
      children: (
        <Text size="sm">
          Are you sure you want to delete this POI? This action cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete POI', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        setLoading(true);
        const loadingNotification = notifications.show({
          title: 'Deleting...',
          message: 'Please wait while we delete your POI',
          loading: true,
          autoClose: false,
        });

        try {
          await api['delete'](`/pois/${id}`);
          notifications.update({
            id: loadingNotification,
            title: 'Success!',
            message: 'POI deleted successfully!',
            color: 'green',
            loading: false,
            autoClose: 3000
          });
          window.location.href = '/';
        } catch (error) {
          notifications.update({
            id: loadingNotification,
            title: 'Error',
            message: 'Failed to delete POI. Please try again.',
            color: 'red',
            loading: false,
            autoClose: 5000
          });
        } finally {
          setLoading(false);
        }
      }
    });
  };

  // Silent delete for draft cleanup (no confirmation dialog)
  const handleSilentDelete = async () => {
    setLoading(true);
    try {
      await api['delete'](`/pois/${id}`);
      // No notification for silent delete during navigation
    } catch (error) {
      console.error('Error deleting draft:', error);
      // Still proceed with navigation even if delete fails
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    handleSubmit,
    handleDelete,
    handleSilentDelete,
    handleAutoCreate
  };
};