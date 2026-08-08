import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ImageUploadField } from '../ImageUploadField';

// jsdom does not implement ResizeObserver — polyfill for Mantine/Dropzone.
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

vi.mock('../../../utils/api', () => ({
  api: { get: vi.fn(), delete: vi.fn(), put: vi.fn(), request: vi.fn() },
}));

function renderField(images) {
  return render(
    <MantineProvider>
      <ImageUploadField
        poiId="poi-1"
        imageType="gallery"
        existingImages={images}
      />
    </MantineProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ImageUploadField — photo card caption display (#121)', () => {
  it('shows the saved caption instead of the filename', () => {
    renderField([
      { id: 'img-1', url: 'http://example.com/img.jpg', original_filename: 'IMG_1234.jpg', caption: 'Front entrance at dusk' },
    ]);
    expect(screen.getByText('Front entrance at dusk')).toBeInTheDocument();
    expect(screen.queryByText('IMG_1234.jpg')).not.toBeInTheDocument();
  });

  it('falls back to alt text when no caption is saved', () => {
    renderField([
      { id: 'img-1', url: 'http://example.com/img.jpg', original_filename: 'IMG_1234.jpg', alt_text: 'Wheelchair ramp' },
    ]);
    expect(screen.getByText('Wheelchair ramp')).toBeInTheDocument();
    expect(screen.queryByText('IMG_1234.jpg')).not.toBeInTheDocument();
  });

  it('falls back to the filename when neither alt text nor caption is saved', () => {
    renderField([
      { id: 'img-1', url: 'http://example.com/img.jpg', original_filename: 'IMG_1234.jpg' },
    ]);
    expect(screen.getByText('IMG_1234.jpg')).toBeInTheDocument();
  });
});
