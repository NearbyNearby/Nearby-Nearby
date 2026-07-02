import { describe, it, expect } from 'vitest';
import { rejectionMessage } from '../ImageUploadField';

describe('rejectionMessage', () => {
  it('returns file-too-large message with size limit', () => {
    const rejection = {
      file: { name: 'photo.jpg' },
      errors: [{ code: 'file-too-large', message: 'File is larger than 15728640 bytes' }]
    };
    expect(rejectionMessage(rejection, 15)).toBe('photo.jpg is larger than the 15 MB limit.');
  });

  it('returns file-invalid-type message', () => {
    const rejection = {
      file: { name: 'photo.xyz' },
      errors: [{ code: 'file-invalid-type', message: 'File type must be image/*' }]
    };
    expect(rejectionMessage(rejection, 15)).toBe("photo.xyz isn't a supported image format.");
  });

  it('returns too-many-files message', () => {
    const rejection = {
      file: { name: 'extra.jpg' },
      errors: [{ code: 'too-many-files', message: 'Too many files' }]
    };
    expect(rejectionMessage(rejection, 15)).toBe('extra.jpg exceeds the number of files allowed.');
  });

  it('falls back to errors[0].message for unknown code', () => {
    const rejection = {
      file: { name: 'weird.jpg' },
      errors: [{ code: 'some-unknown-code', message: 'Something went wrong' }]
    };
    expect(rejectionMessage(rejection, 15)).toBe('weird.jpg was rejected: Something went wrong');
  });

  it('uses "File" as name when file.name is missing', () => {
    const rejection = {
      file: {},
      errors: [{ code: 'file-too-large', message: 'too big' }]
    };
    expect(rejectionMessage(rejection, 20)).toBe('File is larger than the 20 MB limit.');
  });

  it('file-too-large takes priority when multiple codes are present', () => {
    const rejection = {
      file: { name: 'photo.jpg' },
      errors: [
        { code: 'file-too-large', message: 'too big' },
        { code: 'file-invalid-type', message: 'wrong type' }
      ]
    };
    expect(rejectionMessage(rejection, 15)).toBe('photo.jpg is larger than the 15 MB limit.');
  });
});
