import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionIcon, Badge, Card, Group, Image, LoadingOverlay, Paper, SimpleGrid,
  Stack, Text, Textarea, Tooltip,
} from '@mantine/core';
import { Dropzone, IMAGE_MIME_TYPE } from '@mantine/dropzone';
import { notifications } from '@mantine/notifications';
import { IconPhoto, IconTrash, IconUpload, IconX } from '@tabler/icons-react';
import { api } from '../../utils/api';
import { rejectionMessage } from './ImageUploadField';
import { fetchLot } from '../parking-lots/lotApi';

// Matches IMAGE_TYPE_CONFIG.parking in ImageUploadField (product decision 9).
const MAX_COUNT = 5;
const MAX_SIZE_MB = 15;

/**
 * Photos for one reusable parking lot (#90 / #161).
 *
 * A lot is not a POI, so this cannot reuse ImageUploadField (which is hardwired
 * to /images/upload/{poi_id}). It posts to /images/upload/parking-lot/{lot_id}
 * instead and reads the lot's own `images` array back from the lot endpoint.
 * The per-photo caption IS the "what should visitors look for?" note: no new
 * image column was needed.
 */
export default function ParkingLotImageUpload({ lotId, label = 'Lot Photos' }) {
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const captionTimers = useRef(new Map());

  const loadImages = useCallback(async () => {
    if (!lotId) return;
    try {
      const lot = await fetchLot(lotId);
      setImages(lot.images || []);
    } catch (error) {
      notifications.show({
        title: 'Could not refresh photos',
        message: error.message || 'The photo list may be out of date.',
        color: 'yellow',
      });
    }
  }, [lotId]);

  useEffect(() => { loadImages(); }, [loadImages]);

  useEffect(() => {
    const timers = captionTimers.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const handleDrop = useCallback(async (files) => {
    if (!lotId) return;
    if (images.length + files.length > MAX_COUNT) {
      notifications.show({
        title: 'Too many files',
        message: `Maximum ${MAX_COUNT} photos allowed for a parking lot`,
        color: 'red',
      });
      return;
    }

    setUploading(true);
    try {
      for (let i = 0; i < files.length; i += 1) {
        const formData = new FormData();
        formData.append('file', files[i]);
        formData.append('display_order', String(images.length + i));
        const response = await api.request(`/images/upload/parking-lot/${lotId}`, {
          method: 'POST',
          body: formData,
        });
        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(errBody.detail || `Upload failed (status ${response.status})`);
        }
      }
      await loadImages();
      notifications.show({ title: 'Success', message: 'Photo uploaded', color: 'green' });
    } catch (error) {
      notifications.show({
        title: 'Upload Failed',
        message: error.message || 'Failed to upload photo',
        color: 'red',
      });
    } finally {
      setUploading(false);
    }
  }, [images.length, loadImages, lotId]);

  const handleDelete = useCallback(async (imageId) => {
    try {
      const response = await api.delete(`/images/image/${imageId}`);
      if (!response.ok) throw new Error(`Delete failed (status ${response.status})`);
      await loadImages();
    } catch (error) {
      notifications.show({
        title: 'Delete Failed',
        message: error.message || 'Failed to delete photo',
        color: 'red',
      });
    }
  }, [loadImages]);

  // Debounced per image so typing a note is not one request per keystroke.
  const handleCaption = useCallback((imageId, value) => {
    setImages((prev) => prev.map((img) => (img.id === imageId ? { ...img, caption: value } : img)));
    const timers = captionTimers.current;
    if (timers.has(imageId)) clearTimeout(timers.get(imageId));
    timers.set(imageId, setTimeout(async () => {
      timers.delete(imageId);
      try {
        const response = await api.put(`/images/image/${imageId}`, { caption: value });
        if (!response.ok) throw new Error(`Save failed (status ${response.status})`);
      } catch (error) {
        notifications.show({
          title: 'Save Failed',
          message: error.message || 'Failed to save the photo note',
          color: 'red',
        });
      }
    }, 1000));
  }, []);

  if (!lotId) {
    return <Text size="sm" c="dimmed">Save the lot first to enable photo upload</Text>;
  }

  return (
    <Stack>
      <Group gap="xs">
        <Text fw={500}>{label}</Text>
        <Badge size="sm" variant="light" color={images.length >= MAX_COUNT ? 'green' : 'blue'}>
          {images.length} of {MAX_COUNT}
        </Badge>
      </Group>

      {images.length > 0 && (
        <Paper p="md" withBorder>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            {images.map((image) => (
              <Card key={image.id} shadow="sm" padding="sm" radius="md" withBorder>
                <Card.Section>
                  <div style={{ position: 'relative' }}>
                    <Image
                      src={image.thumbnail_url || image.url}
                      height={140}
                      alt={image.alt_text || 'Parking lot photo'}
                    />
                    <Tooltip label="Delete">
                      <ActionIcon
                        variant="filled"
                        color="red"
                        size="sm"
                        style={{ position: 'absolute', top: 8, right: 8 }}
                        aria-label="Delete photo"
                        onClick={() => handleDelete(image.id)}
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </div>
                </Card.Section>
                <Textarea
                  mt="xs"
                  size="xs"
                  label="What should visitors look for?"
                  placeholder="e.g., Blue sign next to the red brick wall"
                  autosize
                  minRows={2}
                  value={image.caption || ''}
                  onChange={(e) => handleCaption(image.id, e.currentTarget.value)}
                />
              </Card>
            ))}
          </SimpleGrid>
        </Paper>
      )}

      {images.length < MAX_COUNT && (
        <Dropzone
          onDrop={handleDrop}
          onReject={(rejections) => rejections.forEach((r) => notifications.show({
            title: 'File not accepted',
            message: rejectionMessage(r, MAX_SIZE_MB),
            color: 'red',
          }))}
          maxSize={MAX_SIZE_MB * 1024 * 1024}
          accept={IMAGE_MIME_TYPE}
          loading={uploading}
        >
          <LoadingOverlay visible={uploading} />
          <Group justify="center" gap="xl" style={{ minHeight: 90, pointerEvents: 'none' }}>
            <Dropzone.Accept><IconUpload size={36} stroke={1.5} /></Dropzone.Accept>
            <Dropzone.Reject><IconX size={36} stroke={1.5} /></Dropzone.Reject>
            <Dropzone.Idle><IconPhoto size={36} stroke={1.5} /></Dropzone.Idle>
            <div>
              <Text size="sm" inline>Drag photos here or click to select</Text>
              <Text size="xs" c="dimmed" inline mt={6}>
                Up to {MAX_COUNT - images.length} more, max {MAX_SIZE_MB}MB each
              </Text>
            </div>
          </Group>
        </Dropzone>
      )}
    </Stack>
  );
}
