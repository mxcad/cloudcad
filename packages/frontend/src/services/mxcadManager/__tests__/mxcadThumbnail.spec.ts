///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock api-sdk
vi.mock('@/api-sdk', () => ({
  mxCadControllerUploadThumbnail: vi.fn(),
  mxCadControllerCheckThumbnail: vi.fn(),
}));

// Mock utils
vi.mock('@/utils/errorHandler', () => ({
  handleError: vi.fn(),
}));

import {
  checkThumbnail,
  uploadThumbnail,
  generateThumbnail,
  dataURLtoBlob,
} from '../mxcadThumbnail';
import {
  mxCadControllerUploadThumbnail,
  mxCadControllerCheckThumbnail,
} from '@/api-sdk';
import { handleError } from '@/utils/errorHandler';

describe('mxcadThumbnail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkThumbnail', () => {
    it('returns true when thumbnail exists', async () => {
      const mockCheck = mxCadControllerCheckThumbnail as ReturnType<typeof vi.fn>;
      mockCheck.mockResolvedValue({ data: { exists: true } });

      const result = await checkThumbnail('node-1');
      expect(result).toBe(true);
      expect(mockCheck).toHaveBeenCalledWith({ path: { nodeId: 'node-1' } });
    });

    it('returns false when thumbnail does not exist', async () => {
      const mockCheck = mxCadControllerCheckThumbnail as ReturnType<typeof vi.fn>;
      mockCheck.mockResolvedValue({ data: { exists: false } });

      const result = await checkThumbnail('node-2');
      expect(result).toBe(false);
    });

    it('returns false on API error (safe default)', async () => {
      const mockCheck = mxCadControllerCheckThumbnail as ReturnType<typeof vi.fn>;
      mockCheck.mockRejectedValue(new Error('Server unavailable'));

      const result = await checkThumbnail('node-3');
      expect(result).toBe(false);
      expect(handleError).toHaveBeenCalled();
    });

    it('returns false when response data is null', async () => {
      const mockCheck = mxCadControllerCheckThumbnail as ReturnType<typeof vi.fn>;
      mockCheck.mockResolvedValue({ data: null });

      const result = await checkThumbnail('node-4');
      expect(result).toBe(false);
    });
  });

  describe('uploadThumbnail', () => {
    it('uploads thumbnail blob successfully', async () => {
      const mockUpload = mxCadControllerUploadThumbnail as ReturnType<typeof vi.fn>;
      mockUpload.mockResolvedValue({ data: { success: true } });

      // Create a valid base64 data URL for a tiny PNG
      // Smallest valid PNG (1x1 pixel, red)
      const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      const imageData = `data:image/png;base64,${tinyPngBase64}`;

      const result = await uploadThumbnail('node-upload-1', imageData);
      expect(result).toBe(true);
      expect(mockUpload).toHaveBeenCalledTimes(1);
      const callArgs = mockUpload.mock.calls[0][0];
      expect(callArgs.path.nodeId).toBe('node-upload-1');
      expect(callArgs.body).toBeInstanceOf(FormData);
    });

    it('returns false when blob conversion fails', async () => {
      const result = await uploadThumbnail('node-fail', 'invalid-data-url');
      expect(result).toBe(false);
    });

    it('returns false on upload API error', async () => {
      const mockUpload = mxCadControllerUploadThumbnail as ReturnType<typeof vi.fn>;
      mockUpload.mockRejectedValue(new Error('Upload failed'));

      const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      const imageData = `data:image/png;base64,${tinyPngBase64}`;

      const result = await uploadThumbnail('node-err', imageData);
      expect(result).toBe(false);
      expect(handleError).toHaveBeenCalled();
    });
  });

  describe('dataURLtoBlob', () => {
    it('converts a valid PNG data URL to a Blob', () => {
      const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      const dataURL = `data:image/png;base64,${tinyPngBase64}`;

      const blob = dataURLtoBlob(dataURL);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob?.type).toBe('image/png');
    });

    it('returns undefined for malformed data URL (no comma)', () => {
      const blob = dataURLtoBlob('data:image/png;base64');
      expect(blob).toBeUndefined();
    });

    it('returns undefined for empty base64 part after comma', () => {
      const blob = dataURLtoBlob('data:image/png;base64,');
      expect(blob).toBeUndefined();
    });

    it('defaults to image/png MIME type when not specified', () => {
      const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      const dataURL = `data:,${tinyPngBase64}`;

      const blob = dataURLtoBlob(dataURL);
      expect(blob?.type).toBe('image/png');
    });

    it('extracts MIME type from data URL', () => {
      const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      const dataURL = `data:image/jpeg;base64,${tinyPngBase64}`;

      const blob = dataURLtoBlob(dataURL);
      expect(blob?.type).toBe('image/jpeg');
    });
  });

  describe('generateThumbnail', () => {
    it('exports a function that generates thumbnail (tested via integration)', () => {
      // generateThumbnail requires the full MxCAD SDK which is not
      // available in unit tests. This smoke test verifies it is a function.
      expect(typeof generateThumbnail).toBe('function');
    });
  });
});
