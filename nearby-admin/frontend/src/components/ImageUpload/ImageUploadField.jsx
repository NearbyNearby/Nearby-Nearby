import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Group,
  Text,
  Image,
  SimpleGrid,
  Card,
  ActionIcon,
  TextInput,
  Textarea,
  Progress,
  Stack,
  Badge,
  Button,
  Paper,
  LoadingOverlay,
  Tooltip,
  Center
} from '@mantine/core';
import { Dropzone, IMAGE_MIME_TYPE } from '@mantine/dropzone';
import { notifications } from '@mantine/notifications';
import {
  IconUpload,
  IconPhoto,
  IconX,
  IconTrash,
  IconEdit,
  IconEye,
  IconGripVertical,
  IconDownload
} from '@tabler/icons-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { modals } from '@mantine/modals';
import { api } from '../../utils/api';

const IMAGE_TYPE_CONFIG = {
  main: { maxCount: 1, maxSizeMB: 15, label: 'Main Image' },
  gallery: { maxCount: 20, maxSizeMB: 15, label: 'Gallery Images' },
  entry: { maxCount: 3, maxSizeMB: 15, label: 'Entry Photos' },
  parking: { maxCount: 5, maxSizeMB: 15, label: 'Parking Photos' },
  restroom: { maxCount: 10, maxSizeMB: 15, label: 'Restroom Photos' },
  rental: { maxCount: 10, maxSizeMB: 15, label: 'Rental Photos' },
  playground: { maxCount: 10, maxSizeMB: 15, label: 'Playground Photos' },
  menu: { maxCount: 10, maxSizeMB: 15, label: 'Menu Photos' },
  trail_head: { maxCount: 10, maxSizeMB: 15, label: 'Trail Head Photos' },
  trail_exit: { maxCount: 10, maxSizeMB: 15, label: 'Trail Exit Photos' },
  access_point: { maxCount: 10, maxSizeMB: 15, label: 'Access Point Photos' },
  map: { maxCount: 5, maxSizeMB: 20, label: 'Maps' },
  downloadable_map: { maxCount: 5, maxSizeMB: 50, label: 'Downloadable Maps' },
  sponsor_logo: { maxCount: 1, maxSizeMB: 15, label: 'Sponsor Logo' }
};

// Map a react-dropzone rejection to a human-readable sentence. Exported for tests.
export function rejectionMessage(fileRejection, maxSizeMB) {
  const name = fileRejection?.file?.name || 'File';
  const codes = (fileRejection?.errors || []).map((e) => e.code);
  if (codes.includes('file-too-large')) {
    return `${name} is larger than the ${maxSizeMB} MB limit.`;
  }
  if (codes.includes('file-invalid-type')) {
    return `${name} isn't a supported image format.`;
  }
  if (codes.includes('too-many-files')) {
    return `${name} exceeds the number of files allowed.`;
  }
  const first = fileRejection?.errors?.[0]?.message;
  return `${name} was rejected${first ? `: ${first}` : '.'}`;
}

export function ImageUploadField({
  poiId,
  imageType,
  context,
  label,
  description,
  existingImages = [],
  onImagesChange,
  required = false,
  disabled = false
}) {
  const [images, setImages] = useState(existingImages);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const openRef = useRef(() => {});
  const metadataTimers = useRef(new Map());

  const config = IMAGE_TYPE_CONFIG[imageType] || {};
  const maxCount = config.maxCount || 1;
  const maxSizeMB = config.maxSizeMB || 10;
  const displayLabel = label || config.label || 'Upload Images';

  useEffect(() => {
    // Load existing images if poiId is provided
    if (poiId && !existingImages.length) {
      loadExistingImages();
    }
  }, [poiId, imageType, context]);

  useEffect(() => {
    const timers = metadataTimers.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const loadExistingImages = async () => {
    try {
      const response = await api.get(`/images/poi/${poiId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      // Backend returns only original images (variants are excluded server-side)
      // and attaches variant URLs to each original, so no client-side dedup is
      // needed. Every row here is an original, so its id is safe to delete/edit.
      let filteredImages = data.filter(img => img.image_type === imageType);

      if (context) {
        filteredImages = filteredImages.filter(img => img.image_context === context);
      }

      setImages(filteredImages);
      if (onImagesChange) {
        onImagesChange(filteredImages);
      }
    } catch (error) {
      console.error('Error loading images:', error);
      notifications.show({
        title: 'Could not refresh images',
        message: 'The image list may be out of date. Reload the page to see the latest.',
        color: 'yellow'
      });
    }
  };

  const handleDrop = useCallback(async (files) => {
    if (!poiId) {
      notifications.show({
        title: 'Error',
        message: 'Please save the POI first before uploading images',
        color: 'red'
      });
      return;
    }

    // Check if adding these files would exceed max count
    if (images.length + files.length > maxCount) {
      notifications.show({
        title: 'Too many files',
        message: `Maximum ${maxCount} image(s) allowed for ${displayLabel}`,
        color: 'red'
      });
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('image_type', imageType);
      if (context) {
        formData.append('context', context);
      }

      // Upload files one by one to show progress
      const uploadedImages = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileFormData = new FormData();
        fileFormData.append('file', file);
        fileFormData.append('image_type', imageType);
        if (context) {
          fileFormData.append('context', context);
        }
        fileFormData.append('display_order', images.length + i);

        const response = await api.request(`/images/upload/${poiId}`, {
          method: 'POST',
          body: fileFormData
        });

        if (!response.ok) {
          // Surface the real backend reason (e.g. "Maximum N images allowed",
          // "File too large", "S3 not configured") instead of a generic message.
          const errBody = await response.json().catch(() => ({}));
          let message = errBody.detail || `Upload failed (status ${response.status})`;
          if (response.status === 413 && !errBody.detail) {
            // nginx rejects oversized bodies with an HTML page, not JSON.
            message = 'File too large for the server. Please use a smaller image.';
          }
          throw new Error(message);
        }

        const uploadedImage = await response.json();
        uploadedImages.push(uploadedImage);

        // Update progress
        const percentCompleted = Math.round(((i + 1) / files.length) * 100);
        setUploadProgress(percentCompleted);
      }

      // Reload images after successful upload
      await loadExistingImages();

      notifications.show({
        title: 'Success',
        message: `Uploaded ${uploadedImages.length} image(s) successfully`,
        color: 'green'
      });
    } catch (error) {
      notifications.show({
        title: 'Upload Failed',
        message: error.message || 'Failed to upload images',
        color: 'red'
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [poiId, imageType, context, images.length, maxCount]);

  const handleDelete = useCallback((imageId) => {
    modals.openConfirmModal({
      title: 'Delete Image',
      centered: true,
      children: (
        <Text size="sm">
          Are you sure you want to delete this image? This action cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          const response = await api.delete(`/images/image/${imageId}`);

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          // Reload images
          await loadExistingImages();

          notifications.show({
            title: 'Success',
            message: 'Image deleted successfully',
            color: 'green'
          });
        } catch (error) {
          notifications.show({
            title: 'Delete Failed',
            message: error.message || 'Failed to delete image',
            color: 'red'
          });
        }
      }
    });
  }, []);

  const handleUpdateMetadata = useCallback((imageId, field, value) => {
    // Update local state immediately for better UX
    setImages(prev => prev.map(img =>
      img.id === imageId ? { ...img, [field]: value } : img
    ));

    // Debounce the API call per image+field so concurrent edits to different
    // fields or cards do not cancel each other's pending save.
    const timerKey = `${imageId}:${field}`;
    const timers = metadataTimers.current;
    if (timers.has(timerKey)) {
      clearTimeout(timers.get(timerKey));
    }
    timers.set(timerKey, setTimeout(async () => {
      timers.delete(timerKey);
      try {
        const response = await api.put(`/images/image/${imageId}`, { [field]: value });
        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(errBody.detail || `Save failed (status ${response.status})`);
        }
      } catch (error) {
        console.error('Error updating image metadata:', error);
        notifications.show({
          title: 'Save Failed',
          message: error.message || 'Failed to save image details',
          color: 'red'
        });
      }
    }, 1000));
  }, []);

  const handleReject = useCallback((fileRejections) => {
    fileRejections.forEach((rejection) => {
      notifications.show({
        title: 'File not accepted',
        message: rejectionMessage(rejection, maxSizeMB),
        color: 'red'
      });
    });
  }, [maxSizeMB]);

  const handleReorder = useCallback(async (result) => {
    if (!result.destination) return;

    const items = Array.from(images);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setImages(items);

    // Update display order in backend
    try {
      const imageIds = items.map(img => img.id);
      const response = await api.put(`/images/poi/${poiId}/reorder/${imageType}`, {
        image_ids: imageIds
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error reordering images:', error);
      // Reload to get correct order from server
      await loadExistingImages();
    }
  }, [images, poiId, imageType]);

  const isGalleryType = imageType === 'gallery' && maxCount > 1;

  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <div>
          <Text fw={500} size="lg">{displayLabel}</Text>
          {description && (
            <Text size="sm" c="dimmed" mt={4}>{description}</Text>
          )}
          <Text size="xs" c="dimmed" mt={4}>
            Each uploaded image is automatically optimized into 3 sizes (original, medium, thumbnail) for best performance
          </Text>
          <Group mt="sm" gap="xs">
            <Badge size="md" variant="light" color={images.length >= maxCount ? 'green' : 'blue'}>
              {images.length} of {maxCount} image{maxCount > 1 ? 's' : ''} uploaded
            </Badge>
            <Badge size="md" variant="light" color="gray">
              Max {maxSizeMB}MB per file
            </Badge>
            {maxCount > 1 && (
              <Badge size="md" variant="outline" color="grape">
                {maxCount - images.length} remaining
              </Badge>
            )}
          </Group>
        </div>
      </Group>

      {/* Existing Images */}
      {images.length > 0 && (
        <Paper p="md" withBorder>
          {isGalleryType ? (
            <DragDropContext onDragEnd={handleReorder}>
              <Droppable droppableId="images" direction="horizontal">
                {(provided) => (
                  <SimpleGrid
                    cols={{ base: 2, sm: 3, md: 4 }}
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                  >
                    {images.map((image, index) => (
                      <Draggable
                        key={image.id}
                        draggableId={image.id}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            style={{
                              ...provided.draggableProps.style,
                              opacity: snapshot.isDragging ? 0.5 : 1
                            }}
                          >
                            <ImageCard
                              image={image}
                              onDelete={() => handleDelete(image.id)}
                              onUpdateMetadata={handleUpdateMetadata}
                              dragHandleProps={provided.dragHandleProps}
                              showDragHandle={isGalleryType}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </SimpleGrid>
                )}
              </Droppable>
            </DragDropContext>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: maxCount > 1 ? 2 : 1 }}>
              {images.map((image) => (
                <ImageCard
                  key={image.id}
                  image={image}
                  onDelete={() => handleDelete(image.id)}
                  onUpdateMetadata={handleUpdateMetadata}
                  showDragHandle={false}
                />
              ))}
            </SimpleGrid>
          )}
        </Paper>
      )}

      {/* Upload Dropzone */}
      {images.length < maxCount && (
        <Dropzone
          openRef={openRef}
          onDrop={handleDrop}
          onReject={handleReject}
          maxSize={maxSizeMB * 1024 * 1024}
          accept={imageType === 'downloadable_map' ? [...IMAGE_MIME_TYPE, 'application/pdf'] : IMAGE_MIME_TYPE}
          loading={uploading}
          disabled={disabled || !poiId}
        >
          <LoadingOverlay visible={uploading} />

          <Group justify="center" gap="xl" style={{ minHeight: 120, pointerEvents: 'none' }}>
            <Dropzone.Accept>
              <IconUpload size={50} stroke={1.5} />
            </Dropzone.Accept>
            <Dropzone.Reject>
              <IconX size={50} stroke={1.5} />
            </Dropzone.Reject>
            <Dropzone.Idle>
              <IconPhoto size={50} stroke={1.5} />
            </Dropzone.Idle>

            <div>
              <Text size="xl" inline>
                Drag images here or click to select
              </Text>
              <Text size="sm" c="dimmed" inline mt={7}>
                {imageType === 'downloadable_map'
                  ? 'Attach images or PDF files'
                  : `Attach up to ${maxCount - images.length} image(s)`}
              </Text>
            </div>
          </Group>

          {uploadProgress > 0 && (
            <Progress value={uploadProgress} mt="md" animated />
          )}
        </Dropzone>
      )}

      {!poiId && (
        <Text size="sm" c="dimmed" ta="center">
          Save the POI first before uploading images
        </Text>
      )}
    </Stack>
  );
}

// Individual Image Card Component
function ImageCard({ image, onDelete, onUpdateMetadata, dragHandleProps, showDragHandle }) {
  const [editing, setEditing] = useState(false);

  return (
    <Card shadow="sm" padding="sm" radius="md" withBorder>
      <Card.Section>
        <div style={{ position: 'relative' }}>
          <Image
            src={image.url || image.thumbnail_url}
            height={160}
            alt={image.alt_text || 'Uploaded image'}
            fallbackSrc="/placeholder-image.png"
          />

          <Group
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              gap: 4
            }}
          >
            {showDragHandle && (
              <ActionIcon
                {...dragHandleProps}
                variant="filled"
                color="gray"
                size="sm"
                style={{ cursor: 'grab' }}
              >
                <IconGripVertical size={14} />
              </ActionIcon>
            )}

            <Tooltip label="View full size">
              <ActionIcon
                variant="filled"
                color="blue"
                size="sm"
                onClick={() => window.open(image.url, '_blank')}
              >
                <IconEye size={14} />
              </ActionIcon>
            </Tooltip>

            <Tooltip label="Delete">
              <ActionIcon
                variant="filled"
                color="red"
                size="sm"
                onClick={onDelete}
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </div>
      </Card.Section>

      <Stack gap="xs" mt="xs">
        {editing ? (
          <>
            <TextInput
              size="xs"
              placeholder="Alt text"
              value={image.alt_text || ''}
              onChange={(e) => onUpdateMetadata(image.id, 'alt_text', e.target.value)}
            />
            <Textarea
              size="xs"
              placeholder="Caption"
              value={image.caption || ''}
              onChange={(e) => onUpdateMetadata(image.id, 'caption', e.target.value)}
              minRows={2}
            />
            <Button
              size="xs"
              variant="light"
              onClick={() => setEditing(false)}
            >
              Done
            </Button>
          </>
        ) : (
          <>
            {/* Issue #121: show the saved alt text / caption (what editors
                actually annotated) instead of the raw filename, so it's
                obvious at a glance which photos still need metadata. Falls
                back to the filename when neither has been set. */}
            {image.caption ? (
              <Text size="xs" truncate>{image.caption}</Text>
            ) : image.alt_text ? (
              <Text size="xs" truncate>{image.alt_text}</Text>
            ) : image.original_filename ? (
              <Text size="xs" c="dimmed" truncate>
                {image.original_filename}
              </Text>
            ) : null}
            <Button
              size="xs"
              variant="subtle"
              leftSection={<IconEdit size={14} />}
              onClick={() => setEditing(true)}
            >
              Edit metadata
            </Button>
          </>
        )}
      </Stack>
    </Card>
  );
}