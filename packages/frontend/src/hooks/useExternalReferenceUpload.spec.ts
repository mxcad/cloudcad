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
import { useExternalReferenceUpload } from './useExternalReferenceUpload';

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

import {
  mxcadExternalRefControllerGetPreloadingData,
  mxcadExternalRefControllerCheckExternalReference,
  mxcadExternalRefControllerUploadExtReferenceDwg,
  mxcadExternalRefControllerUploadExtReferenceImage,
  publicFileControllerUploadExtReference,
} from '@/api-sdk';

describe('useExternalReferenceUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.requestAnimationFrame = mockRaf;
    // SDK 成功响应默认形状（{ data, error: undefined }）：
    // 修复后 uploadFiles 会检查 result.error，mock 返回 undefined 会抛 TypeError
    vi.mocked(mxcadExternalRefControllerUploadExtReferenceImage).mockResolvedValue(
      {} as any
    );
    vi.mocked(mxcadExternalRefControllerUploadExtReferenceDwg).mockResolvedValue(
      {} as any
    );
    vi.mocked(publicFileControllerUploadExtReference).mockResolvedValue(
      {} as any
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should initialize with correct state', () => {
    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        nodeId: 'testnode123',
      })
    );

    expect(result.current.isOpen).toBe(false);
    expect(result.current.files).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('should detect missing external references', async () => {
    const mockPreloadingData = {
      tz: false,
      src_file_md5: 'testhash123',
      images: [{ name: 'image1.png', size: 1024, type: 'image' }],
      externalReference: [{ name: 'ref1.dwg', size: 4096, type: 'dwg' }],
    };

    vi.mocked(mxcadExternalRefControllerGetPreloadingData).mockResolvedValue({
      data: mockPreloadingData,
    } as any);

    vi.mocked(
      mxcadExternalRefControllerCheckExternalReference
    ).mockResolvedValue({
      data: { exists: false },
    } as any);

    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        nodeId: 'testnode123',
      })
    );

    let hasMissing = false;
    await act(async () => {
      hasMissing = await result.current.checkMissingReferences();
    });

    expect(hasMissing).toBe(true);
    expect(result.current.isOpen).toBe(true);
    expect(result.current.files.length).toBe(2);
  });

  it('should not open modal when no missing references', async () => {
    const mockPreloadingData = {
      tz: false,
      src_file_md5: 'testhash123',
      images: [],
      externalReference: [],
    };

    vi.mocked(mxcadExternalRefControllerGetPreloadingData).mockResolvedValue({
      data: mockPreloadingData,
    } as any);

    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        nodeId: 'testnode123',
      })
    );

    let hasMissing = false;
    await act(async () => {
      hasMissing = await result.current.checkMissingReferences();
    });

    expect(hasMissing).toBe(false);
    expect(result.current.isOpen).toBe(false);
  });

  it('should return false on preloading data failure', async () => {
    vi.mocked(mxcadExternalRefControllerGetPreloadingData).mockRejectedValue(
      new Error('Network error')
    );

    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        nodeId: 'testnode123',
      })
    );

    let hasMissing = false;
    await act(async () => {
      hasMissing = await result.current.checkMissingReferences();
    });

    expect(hasMissing).toBe(false);
    expect(result.current.isOpen).toBe(false);
  });

  it('should skip upload correctly', () => {
    const onSkip = vi.fn();

    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        nodeId: 'testnode123',
        onSkip,
      })
    );

    act(() => {
      result.current.skip();
    });

    expect(onSkip).toHaveBeenCalled();
    expect(result.current.isOpen).toBe(false);
  });

  it('should close modal correctly', () => {
    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        nodeId: 'testnode123',
      })
    );

    act(() => {
      result.current.close();
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.files).toEqual([]);
  });

  it('should call onSuccess when all files uploaded successfully', async () => {
    const onSuccess = vi.fn();

    const mockPreloadingData = {
      tz: false,
      src_file_md5: 'testhash123',
      images: [{ name: 'image1.png', size: 1024, type: 'image' }],
      externalReference: [{ name: 'ref1.dwg', size: 4096, type: 'dwg' }],
    };

    vi.mocked(mxcadExternalRefControllerGetPreloadingData).mockResolvedValue({
      data: mockPreloadingData,
    } as any);

    vi.mocked(
      mxcadExternalRefControllerCheckExternalReference
    ).mockResolvedValue({
      data: { exists: false },
    } as any);

    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        nodeId: 'testnode123',
        onSuccess,
      })
    );

    await act(async () => {
      await result.current.checkMissingReferences();
    });

    // Set file sources
    const mockFile = new File(['content'], 'ref1.dwg', {
      type: 'application/octet-stream',
    });
    const mockImageFile = new File(['image'], 'image1.png', {
      type: 'image/png',
    });

    result.current.files.forEach((file) => {
      if (file.name === 'ref1.dwg') addSource(file, mockFile);
      if (file.name === 'image1.png') addSource(file, mockImageFile);
    });

    await act(async () => {
      await result.current.uploadFiles();
    });

    act(() => {
      result.current.complete();
    });

    expect(onSuccess).toHaveBeenCalled();
  });

  it('should call onSkip when some files are not uploaded (continue opening)', async () => {
    const onSuccess = vi.fn();
    const onSkip = vi.fn();

    const mockPreloadingData = {
      tz: false,
      src_file_md5: 'testhash123',
      images: [{ name: 'image1.png', size: 1024, type: 'image' }],
      externalReference: [{ name: 'ref1.dwg', size: 4096, type: 'dwg' }],
    };

    vi.mocked(mxcadExternalRefControllerGetPreloadingData).mockResolvedValue({
      data: mockPreloadingData,
    } as any);

    vi.mocked(
      mxcadExternalRefControllerCheckExternalReference
    ).mockResolvedValue({
      data: { exists: false },
    } as any);

    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        nodeId: 'testnode123',
        onSuccess,
        onSkip,
      })
    );

    await act(async () => {
      await result.current.checkMissingReferences();
    });

    // 不选择任何文件，直接点击「继续打开」
    act(() => {
      result.current.complete();
    });

    expect(onSkip).toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.isOpen).toBe(false);
  });

  it('should mark already-existing external references as success', async () => {
    const mockPreloadingData = {
      tz: false,
      src_file_md5: 'testhash123',
      images: [
        { name: 'image1.png', size: 1024, type: 'image' },
        { name: 'image2.png', size: 2048, type: 'image' },
      ],
      externalReference: [
        { name: 'ref1.dwg', size: 4096, type: 'dwg' },
        { name: 'ref2.dwg', size: 8192, type: 'dwg' },
      ],
    };

    vi.mocked(mxcadExternalRefControllerGetPreloadingData).mockResolvedValue({
      data: mockPreloadingData,
    } as any);

    // ref1.dwg / image1.png 已存在，ref2.dwg / image2.png 缺失
    vi.mocked(mxcadExternalRefControllerCheckExternalReference)
      .mockResolvedValueOnce({ data: { exists: true } } as any)
      .mockResolvedValueOnce({ data: { exists: false } } as any)
      .mockResolvedValueOnce({ data: { exists: true } } as any)
      .mockResolvedValueOnce({ data: { exists: false } } as any);

    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        nodeId: 'testnode123',
      })
    );

    let hasMissing = false;
    await act(async () => {
      hasMissing = await result.current.checkMissingReferences();
    });

    expect(hasMissing).toBe(true);
    expect(result.current.files).toHaveLength(4);
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
    expect(
      result.current.files.find((f) => f.name === 'image1.png')?.uploadState
    ).toBe('success');
    expect(
      result.current.files.find((f) => f.name === 'image2.png')?.uploadState
    ).toBe('notSelected');
  });

  it('should filter out HTTP/HTTPS prefixed URLs', async () => {
    const mockPreloadingData = {
      tz: false,
      src_file_md5: 'testhash123',
      images: [
        { name: 'http://example.com/image1.png', size: 0, type: 'image' },
        { name: 'local_image.png', size: 1024, type: 'image' },
      ],
      externalReference: [{ name: 'local_ref.dwg', size: 4096, type: 'dwg' }],
    };

    vi.mocked(mxcadExternalRefControllerGetPreloadingData).mockResolvedValue({
      data: mockPreloadingData,
    } as any);

    vi.mocked(
      mxcadExternalRefControllerCheckExternalReference
    ).mockResolvedValue({
      data: { exists: false },
    } as any);

    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        nodeId: 'testnode123',
      })
    );

    let hasMissing = false;
    await act(async () => {
      hasMissing = await result.current.checkMissingReferences();
    });

    expect(hasMissing).toBe(true);
    expect(result.current.files.length).toBe(2);
    expect(result.current.files.map((f) => f.name)).toContain(
      'local_image.png'
    );
    expect(result.current.files.map((f) => f.name)).not.toContain(
      'http://example.com/image1.png'
    );
  });
});
