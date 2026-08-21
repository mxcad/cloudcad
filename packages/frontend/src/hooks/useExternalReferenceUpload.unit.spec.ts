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

// Mock SDK (still needed for preloading data + existence checks)
vi.mock('@/api-sdk', () => ({
  mxcadExternalRefControllerGetPreloadingData: vi.fn(),
  mxcadExternalRefControllerCheckExternalReference: vi.fn(),
  mxcadExternalRefControllerUploadExtReferenceDwg: vi.fn(),
  mxcadExternalRefControllerUploadExtReferenceImage: vi.fn(),
  publicFileControllerGetPreloadingData: vi.fn(),
  publicFileControllerCheckExtReference: vi.fn(),
  publicFileControllerUploadExtReference: vi.fn(),
}));

// Mock requestAnimationFrame: complete/skip 通过 rAF 延迟回调，happy-dom 下需同步触发
const mockRaf = vi.fn<(cb: FrameRequestCallback) => number>(
  (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  }
);

/**
 * 与 selectFiles / selectAndUploadFiles 内部行为等价：它们通过 `{ ...f, source: matchedFile }`
 * 把用户选中的 File 挂到文件项上；测试直接对状态对象赋值 source 等价于该路径。
 * 使用 Object.assign 写入，避免裸 as any 断言。
 */
const addSource = (file: { source?: File }, src: File) =>
  Object.assign(file, { source: src });

describe('useExternalReferenceUpload Unit Tests', () => {
  const testNodeId = 'test_integration_node_1234567890';
  const testFileHash = 'test_file_hash_1234567890';

  beforeEach(() => {
    vi.clearAllMocks();
    global.requestAnimationFrame = mockRaf;
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
        tz: false,
        src_file_md5: testFileHash,
        images: [
          { name: 'image1.png', size: 1024, type: 'image' },
          { name: 'image2.jpg', size: 2048, type: 'image' },
        ],
        externalReference: [
          { name: 'ref1.dwg', size: 4096, type: 'dwg' },
          { name: 'ref2.dwg', size: 8192, type: 'dwg' },
        ],
      };
      vi.mocked(
        sdk.mxcadExternalRefControllerGetPreloadingData
      ).mockResolvedValue({ data: mockPreloadingData } as any);
      vi.mocked(
        sdk.mxcadExternalRefControllerCheckExternalReference
      ).mockResolvedValue({ data: { exists: false } } as any);

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
      vi.mocked(
        sdk.mxcadExternalRefControllerGetPreloadingData
      ).mockResolvedValue({
        data: {
          tz: false,
          src_file_md5: testFileHash,
          images: [],
          externalReference: [],
        },
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
      vi.mocked(
        sdk.mxcadExternalRefControllerGetPreloadingData
      ).mockRejectedValue(new Error('Network error'));

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

    it('should mark already-existing references as success', async () => {
      const sdk = await import('@/api-sdk');
      vi.mocked(
        sdk.mxcadExternalRefControllerGetPreloadingData
      ).mockResolvedValue({
        data: {
          tz: false,
          src_file_md5: testFileHash,
          images: [
            { name: 'image1.png', size: 1024, type: 'image' },
            { name: 'image2.png', size: 2048, type: 'image' },
          ],
          externalReference: [
            { name: 'ref1.dwg', size: 4096, type: 'dwg' },
            { name: 'ref2.dwg', size: 8192, type: 'dwg' },
          ],
        },
      } as any);
      // ref1.dwg / image1.png 已存在，ref2.dwg / image2.png 缺失
      vi.mocked(sdk.mxcadExternalRefControllerCheckExternalReference)
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
      expect(result.current.files.length).toBe(4);
      expect(result.current.files.map((f) => f.name)).toEqual([
        'ref1.dwg',
        'ref2.dwg',
        'image1.png',
        'image2.png',
      ]);
      expect(
        result.current.files.find((f) => f.name === 'ref1.dwg')?.uploadState
      ).toBe('success');
      expect(
        result.current.files.find((f) => f.name === 'ref2.dwg')?.uploadState
      ).toBe('notSelected');
    });
  });

  describe('file upload via SDK endpoints', () => {
    it('should handle upload with no files', async () => {
      const { result } = renderHook(() =>
        useExternalReferenceUpload({ nodeId: testNodeId })
      );
      await act(async () => {
        await result.current.uploadFiles();
      });
      expect(result.current.loading).toBe(false);
    });

    it('should upload external ref via SDK dwg endpoint', async () => {
      const sdk = await import('@/api-sdk');

      vi.mocked(
        sdk.mxcadExternalRefControllerGetPreloadingData
      ).mockResolvedValue({
        data: {
          tz: false,
          src_file_md5: testFileHash,
          images: [],
          externalReference: [{ name: 'ref1.dwg', size: 4096, type: 'dwg' }],
        },
      } as any);
      vi.mocked(
        sdk.mxcadExternalRefControllerCheckExternalReference
      ).mockResolvedValue({ data: { exists: false } } as any);

      const { result } = renderHook(() =>
        useExternalReferenceUpload({ nodeId: testNodeId })
      );

      await act(async () => {
        await result.current.checkMissingReferences();
      });

      const mockFile = new File(['content'], 'ref1.dwg', {
        type: 'application/octet-stream',
      });
      result.current.files.forEach((file) => {
        if (file.name === 'ref1.dwg') addSource(file, mockFile);
      });

      await act(async () => {
        await result.current.uploadFiles();
      });

      expect(
        sdk.mxcadExternalRefControllerUploadExtReferenceDwg
      ).toHaveBeenCalledTimes(1);
      const callArgs = vi.mocked(
        sdk.mxcadExternalRefControllerUploadExtReferenceDwg
      ).mock.calls[0][0];
      expect(callArgs.path.nodeId).toBe(testNodeId);
      expect(callArgs.body.ext_ref_file).toBe('ref1.dwg');
    });
  });

  describe('modal controls', () => {
    it('should close modal and reset state', async () => {
      const sdk = await import('@/api-sdk');
      vi.mocked(
        sdk.mxcadExternalRefControllerGetPreloadingData
      ).mockResolvedValue({
        data: {
          tz: false,
          src_file_md5: testFileHash,
          images: [{ name: 'image1.png', size: 1024, type: 'image' }],
          externalReference: [{ name: 'ref1.dwg', size: 4096, type: 'dwg' }],
        },
      } as any);
      vi.mocked(
        sdk.mxcadExternalRefControllerCheckExternalReference
      ).mockResolvedValue({ data: { exists: false } } as any);

      const { result } = renderHook(() =>
        useExternalReferenceUpload({ nodeId: testNodeId })
      );

      await act(async () => {
        await result.current.checkMissingReferences();
      });
      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.close();
      });
      expect(result.current.isOpen).toBe(false);
      expect(result.current.files).toEqual([]);
    });

    it('should skip upload properly', () => {
      const onSkip = vi.fn();
      const { result } = renderHook(() =>
        useExternalReferenceUpload({ nodeId: testNodeId, onSkip })
      );
      act(() => {
        result.current.skip();
      });
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
      act(() => {
        result.current.openModalForUpload();
      });
      expect(result.current.isOpen).toBe(true);
      expect(result.current.files).toEqual([]);
    });
  });

  describe('complete upload flow', () => {
    it('should complete full upload flow', async () => {
      const sdk = await import('@/api-sdk');
      const onSuccess = vi.fn();
      const onSkip = vi.fn();

      vi.mocked(
        sdk.mxcadExternalRefControllerGetPreloadingData
      ).mockResolvedValue({
        data: {
          tz: false,
          src_file_md5: testFileHash,
          images: [{ name: 'image1.png', size: 1024, type: 'image' }],
          externalReference: [{ name: 'ref1.dwg', size: 4096, type: 'dwg' }],
        },
      } as any);
      vi.mocked(
        sdk.mxcadExternalRefControllerCheckExternalReference
      ).mockResolvedValue({ data: { exists: false } } as any);

      const { result } = renderHook(() =>
        useExternalReferenceUpload({ nodeId: testNodeId, onSuccess, onSkip })
      );

      let hasMissing = false;
      await act(async () => {
        hasMissing = await result.current.checkMissingReferences();
      });
      expect(hasMissing).toBe(true);

      act(() => {
        result.current.skip();
      });
      expect(onSkip).toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });
});
