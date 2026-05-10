///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useExternalReferenceUpload } from '../hooks/useExternalReferenceUpload';
import type { PreloadingData } from '../types/api';

// Mock authCheck to return true
vi.mock('../utils/authCheck', () => ({
  isAuthenticated: () => true,
}));

// Mock uploadBlobWithTus
vi.mock('../utils/uppyUploadUtils', () => ({
  uploadBlobWithTus: vi.fn(),
}));

// Mock SDK (still needed for preloading data + existence checks)
vi.mock('@/api-sdk', () => ({
  mxCadControllerGetPreloadingData: vi.fn(),
  mxCadControllerCheckExternalReference: vi.fn(),
  mxCadControllerUploadExtReferenceDwg: vi.fn(),
  mxCadControllerUploadExtReferenceImage: vi.fn(),
  publicFileControllerGetPreloadingData: vi.fn(),
  publicFileControllerCheckExtReference: vi.fn(),
  publicFileControllerUploadExtReference: vi.fn(),
}));

describe('useExternalReferenceUpload Integration Tests', () => {
  const testNodeId = 'test_integration_node_1234567890';
  const testFileHash = 'test_file_hash_1234567890';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('initial state', () => {
    it('should initialize all states to defaults', () => {
      const { result } = renderHook(() =>
        useExternalReferenceUpload({ nodeId: testNodeId })
      );
      expect(result.current.isOpen).toBe(false);
      expect(result.current.files).toEqual([]);
      expect(result.current.loading).toBe(false);
    });

    it('should return control methods', () => {
      const { result } = renderHook(() =>
        useExternalReferenceUpload({ nodeId: testNodeId })
      );
      expect(result.current.checkMissingReferences).toBeDefined();
      expect(result.current.selectFiles).toBeDefined();
      expect(result.current.uploadFiles).toBeDefined();
      expect(result.current.close).toBeDefined();
      expect(result.current.complete).toBeDefined();
      expect(result.current.skip).toBeDefined();
      expect(result.current.openModalForUpload).toBeDefined();
    });
  });

  describe('checkMissingReferences - detection', () => {
    it('should detect missing references and open modal', async () => {
      const sdk = await import('@/api-sdk');
      const mockPreloadingData: PreloadingData = {
        tz: false, src_file_md5: testFileHash,
        images: ['image1.png', 'image2.jpg'],
        externalReference: ['ref1.dwg', 'ref2.dwg'],
      };
      vi.mocked(sdk.mxCadControllerGetPreloadingData).mockResolvedValue(
        { data: mockPreloadingData } as any
      );
      vi.mocked(sdk.mxCadControllerCheckExternalReference).mockResolvedValue(
        { data: { exists: false } } as any
      );

      const { result } = renderHook(() =>
        useExternalReferenceUpload({ nodeId: testNodeId })
      );

      let hasMissing = false;
      await act(async () => {
        hasMissing = await result.current.checkMissingReferences();
      });

      expect(hasMissing).toBe(true);
      expect(result.current.isOpen).toBe(true);
      expect(result.current.files.length).toBe(4);
    });

    it('should not open modal when no references', async () => {
      const sdk = await import('@/api-sdk');
      vi.mocked(sdk.mxCadControllerGetPreloadingData).mockResolvedValue({
        data: { tz: false, src_file_md5: testFileHash, images: [], externalReference: [] },
      } as any);

      const { result } = renderHook(() =>
        useExternalReferenceUpload({ nodeId: testNodeId })
      );

      let hasMissing = false;
      await act(async () => {
        hasMissing = await result.current.checkMissingReferences();
      });

      expect(hasMissing).toBe(false);
      expect(result.current.isOpen).toBe(false);
    });

    it('should return false on preloading data failure', async () => {
      const sdk = await import('@/api-sdk');
      vi.mocked(sdk.mxCadControllerGetPreloadingData).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useExternalReferenceUpload({ nodeId: testNodeId })
      );

      let hasMissing = false;
      await act(async () => {
        hasMissing = await result.current.checkMissingReferences();
      });

      expect(hasMissing).toBe(false);
      expect(result.current.isOpen).toBe(false);
    });

    it('should filter out already-existing references', async () => {
      const sdk = await import('@/api-sdk');
      vi.mocked(sdk.mxCadControllerGetPreloadingData).mockResolvedValue({
        data: { tz: false, src_file_md5: testFileHash, images: ['image1.png', 'image2.png'], externalReference: ['ref1.dwg', 'ref2.dwg'] },
      } as any);
      vi.mocked(sdk.mxCadControllerCheckExternalReference)
        .mockResolvedValueOnce({ data: { exists: true } } as any)
        .mockResolvedValueOnce({ data: { exists: false } } as any)
        .mockResolvedValueOnce({ data: { exists: true } } as any)
        .mockResolvedValueOnce({ data: { exists: false } } as any);

      const { result } = renderHook(() =>
        useExternalReferenceUpload({ nodeId: testNodeId })
      );

      let hasMissing = false;
      await act(async () => {
        hasMissing = await result.current.checkMissingReferences();
      });

      expect(hasMissing).toBe(true);
      expect(result.current.files.length).toBe(2);
      expect(result.current.files.map((f) => f.name)).toEqual(['ref2.dwg', 'image2.png']);
    });
  });

  describe('file upload via Tus', () => {
    it('should handle upload with no files', async () => {
      const { result } = renderHook(() =>
        useExternalReferenceUpload({ nodeId: testNodeId })
      );
      await act(async () => { await result.current.uploadFiles(); });
      expect(result.current.loading).toBe(false);
    });

    it('should call uploadBlobWithTus for external ref upload', async () => {
      const sdk = await import('@/api-sdk');
      const { uploadBlobWithTus } = await import('../utils/uppyUploadUtils');

      vi.mocked(sdk.mxCadControllerGetPreloadingData).mockResolvedValue({
        data: { tz: false, src_file_md5: testFileHash, images: [], externalReference: ['ref1.dwg'] },
      } as any);
      vi.mocked(sdk.mxCadControllerCheckExternalReference).mockResolvedValue(
        { data: { exists: false } } as any
      );
      vi.mocked(uploadBlobWithTus).mockResolvedValue({});

      const { result } = renderHook(() =>
        useExternalReferenceUpload({ nodeId: testNodeId })
      );

      await act(async () => { await result.current.checkMissingReferences(); });
      await act(async () => { await result.current.uploadFiles(); });
    });
  });

  describe('modal controls', () => {
    it('should close modal and reset state', async () => {
      const sdk = await import('@/api-sdk');
      vi.mocked(sdk.mxCadControllerGetPreloadingData).mockResolvedValue({
        data: { tz: false, src_file_md5: testFileHash, images: ['image1.png'], externalReference: ['ref1.dwg'] },
      } as any);
      vi.mocked(sdk.mxCadControllerCheckExternalReference).mockResolvedValue(
        { data: { exists: false } } as any
      );

      const { result } = renderHook(() =>
        useExternalReferenceUpload({ nodeId: testNodeId })
      );

      await act(async () => { await result.current.checkMissingReferences(); });
      expect(result.current.isOpen).toBe(true);

      act(() => { result.current.close(); });
      expect(result.current.isOpen).toBe(false);
      expect(result.current.files).toEqual([]);
    });

    it('should skip upload properly', () => {
      const onSkip = vi.fn();
      const { result } = renderHook(() =>
        useExternalReferenceUpload({ nodeId: testNodeId, onSkip })
      );
      act(() => { result.current.skip(); });
      expect(onSkip).toHaveBeenCalled();
      expect(result.current.isOpen).toBe(false);
    });
  });

  describe('openModalForUpload', () => {
    it('should open modal directly', () => {
      const { result } = renderHook(() =>
        useExternalReferenceUpload({ nodeId: testNodeId })
      );
      expect(result.current.isOpen).toBe(false);
      act(() => { result.current.openModalForUpload(); });
      expect(result.current.isOpen).toBe(true);
      expect(result.current.files).toEqual([]);
    });
  });

  describe('complete upload flow', () => {
    it('should complete full upload flow', async () => {
      const sdk = await import('@/api-sdk');
      const onSuccess = vi.fn();
      const onSkip = vi.fn();

      vi.mocked(sdk.mxCadControllerGetPreloadingData).mockResolvedValue({
        data: { tz: false, src_file_md5: testFileHash, images: ['image1.png'], externalReference: ['ref1.dwg'] },
      } as any);
      vi.mocked(sdk.mxCadControllerCheckExternalReference).mockResolvedValue(
        { data: { exists: false } } as any
      );

      const { result } = renderHook(() =>
        useExternalReferenceUpload({ nodeId: testNodeId, onSuccess, onSkip })
      );

      let hasMissing = false;
      await act(async () => {
        hasMissing = await result.current.checkMissingReferences();
      });
      expect(hasMissing).toBe(true);

      act(() => { result.current.skip(); });
      expect(onSkip).toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });
});