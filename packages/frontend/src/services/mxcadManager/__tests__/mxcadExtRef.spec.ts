///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the SDK upload function
vi.mock('@/api-sdk', () => ({
  mxcadExternalRefControllerUploadExtReferenceImage: vi.fn(),
}));

// Mock utils
vi.mock('@/utils/errorHandler', () => ({
  handleError: vi.fn(),
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

vi.mock('@/services/loadingService', () => ({
  showGlobalLoading: vi.fn(),
  hideGlobalLoading: vi.fn(),
  setLoadingMessage: vi.fn(),
}));

vi.mock('@/utils/notificationEvents', () => ({
  globalShowToast: vi.fn(),
}));

import {
  uploadExtReferenceImage,
  checkExtReferenceImages,
  resolveExtReferenceUrl,
} from '../mxcadExtRef';
import { mxcadExternalRefControllerUploadExtReferenceImage } from '@/api-sdk';
import { handleError } from '@/utils/errorHandler';
import { globalShowToast } from '@/utils/notificationEvents';

describe('mxcadExtRef', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadExtReferenceImage', () => {
    it('uploads a single external reference image via SDK', async () => {
      const mockUpload =
        mxcadExternalRefControllerUploadExtReferenceImage as ReturnType<
          typeof vi.fn
        >;
      mockUpload.mockResolvedValue({ data: {}, error: undefined });

      const mockFile = new File(['ref-data'], 'xref.dwg', {
        type: 'application/octet-stream',
      });

      const result = await uploadExtReferenceImage({
        file: mockFile,
        nodeId: 'parent-node-1',
        fileName: 'xref.dwg',
      });

      expect(result.success).toBe(true);
      expect(mockUpload).toHaveBeenCalledTimes(1);
      const callArgs = mockUpload.mock.calls[0][0];
      expect(callArgs.path.nodeId).toBe('parent-node-1');
      expect(callArgs.body.file).toBe(mockFile);
      expect(callArgs.body.ext_ref_file).toBe('xref.dwg');
      expect(callArgs.body.updatePreloading).toBe(true);
    });

    it('handles upload failure gracefully', async () => {
      const mockUpload =
        mxcadExternalRefControllerUploadExtReferenceImage as ReturnType<
          typeof vi.fn
        >;
      mockUpload.mockRejectedValue(new Error('File too large'));

      const mockFile = new File(['large-data'], 'big.xref', {
        type: 'application/octet-stream',
      });

      const result = await uploadExtReferenceImage({
        file: mockFile,
        nodeId: 'parent-node-2',
        fileName: 'big.xref',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(handleError).toHaveBeenCalled();
    });

    it('passes metadata correctly to SDK upload', async () => {
      const mockUpload =
        mxcadExternalRefControllerUploadExtReferenceImage as ReturnType<
          typeof vi.fn
        >;
      mockUpload.mockResolvedValue({ data: {}, error: undefined });

      const mockFile = new File(['data'], 'test.xref', {
        type: 'application/octet-stream',
      });

      await uploadExtReferenceImage({
        file: mockFile,
        nodeId: 'parent-node-3',
        fileName: 'test.xref',
      });

      const callArgs = mockUpload.mock.calls[0][0];
      expect(callArgs.path.nodeId).toBe('parent-node-3');
      expect(callArgs.body.file).toBe(mockFile);
      expect(callArgs.body.ext_ref_file).toBe('test.xref');
    });

    it('shows toast on failure', async () => {
      const mockUpload =
        mxcadExternalRefControllerUploadExtReferenceImage as ReturnType<
          typeof vi.fn
        >;
      mockUpload.mockRejectedValue(new Error('Network offline'));

      const mockFile = new File(['data'], 'offline.xref');

      await uploadExtReferenceImage({
        file: mockFile,
        nodeId: 'node-offline',
        fileName: 'offline.xref',
      });

      expect(globalShowToast).toHaveBeenCalled();
    });
  });

  describe('checkExtReferenceImages', () => {
    it('returns empty array when no missing references', () => {
      const missingRefs: string[] = [];
      const result = checkExtReferenceImages(missingRefs);
      expect(result).toEqual([]);
    });

    it('extracts file names from missing reference paths', () => {
      const missingRefs = [
        'C:\\projects\\refs\\xref1.dwg',
        '/home/user/drawings/xref2.dxf',
        'relative/path/xref3.dwg',
      ];

      const result = checkExtReferenceImages(missingRefs);

      expect(result).toHaveLength(3);
      expect(result[0]).toBe('xref1.dwg');
      expect(result[1]).toBe('xref2.dxf');
      expect(result[2]).toBe('xref3.dwg');
    });

    it('handles mixed valid and invalid paths', () => {
      const missingRefs = ['valid.dwg', '', '  ', '/path/to/xref.dxf'];

      const result = checkExtReferenceImages(missingRefs);

      expect(result).toHaveLength(2);
      expect(result).toContain('valid.dwg');
      expect(result).toContain('xref.dxf');
    });

    it('filters out duplicate file names', () => {
      const missingRefs = ['path1/xref.dwg', 'path2/xref.dwg', 'unique.dxf'];

      const result = checkExtReferenceImages(missingRefs);

      expect(result).toHaveLength(2);
      expect(result).toContain('xref.dwg');
      expect(result).toContain('unique.dxf');
    });
  });

  describe('resolveExtReferenceUrl', () => {
    it('builds URL from file hash path', () => {
      const url = resolveExtReferenceUrl(
        'http://example.com/api/public-file/access/abc123hash/file.dwg'
      );

      expect(url).toContain('/public-file/access/');
      expect(url).toContain('abc123hash');
    });

    it('returns original name when URL does not match public-file pattern', () => {
      const url = resolveExtReferenceUrl('http://other.com/files/drawing.dwg');

      expect(typeof url).toBe('string');
    });
  });
});
