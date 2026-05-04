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

// Mock authCheck to return true (avoids empty identifier in test environment)
vi.mock('../utils/authCheck', () => ({
  isAuthenticated: () => true,
}));

// Mock API 服务
vi.mock('../services/mxcadApi', () => ({
  mxcadApi: {
    getPreloadingData: vi.fn(),
    checkExternalReferenceExists: vi.fn(),
    uploadExtReferenceDwg: vi.fn(),
    uploadExtReferenceImage: vi.fn(),
  },
}));

vi.mock('../services/publicFileApi', () => ({
  publicFileApi: {
    getPreloadingData: vi.fn(),
    checkExtReference: vi.fn(),
    uploadExtReference: vi.fn(),
  },
}));

describe('useExternalReferenceUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('应该初始化正确的状态', () => {
    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        nodeId: 'testnode123',
      })
    );

    expect(result.current.isOpen).toBe(false);
    expect(result.current.files).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('应该检测到缺失的外部参照', async () => {
    const { mxcadApi } = await import('../services/mxcadApi');
    const mockPreloadingData = {
      tz: false,
      src_file_md5: 'testhash123',
      images: ['image1.png'],
      externalReference: ['ref1.dwg'],
    };

    vi.mocked(mxcadApi.getPreloadingData).mockResolvedValue(
      mockPreloadingData as any
    );

    vi.mocked(mxcadApi.checkExternalReferenceExists).mockResolvedValue({
      exists: false,
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

  it('应该在没有缺失外部参照时不打开模态框', async () => {
    const { mxcadApi } = await import('../services/mxcadApi');
    const mockPreloadingData = {
      tz: false,
      src_file_md5: 'testhash123',
      images: [],
      externalReference: [],
    };

    vi.mocked(mxcadApi.getPreloadingData).mockResolvedValue(
      mockPreloadingData as any
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

  it('应该在预加载数据获取失败时返回false', async () => {
    const { mxcadApi } = await import('../services/mxcadApi');

    vi.mocked(mxcadApi.getPreloadingData).mockRejectedValue(
      new Error('网络错误')
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

  it('应该正确跳过上传', () => {
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

  it('应该正确关闭模态框', () => {
    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        nodeId: 'testnode123',
      })
    );

    // 模拟打开模态框
    act(() => {
      result.current.close();
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.files).toEqual([]);
  });

  it('应该在所有文件上传成功时调用onSuccess', async () => {
    const { mxcadApi } = await import('../services/mxcadApi');
    const onSuccess = vi.fn();
    const mockPreloadingData = {
      tz: false,
      src_file_md5: 'testhash123',
      images: ['image1.png'],
      externalReference: ['ref1.dwg'],
    };

    vi.mocked(mxcadApi.getPreloadingData).mockResolvedValue(
      mockPreloadingData as any
    );

    vi.mocked(mxcadApi.checkExternalReferenceExists).mockResolvedValue({
      exists: false,
    } as any);

    vi.mocked(mxcadApi.uploadExtReferenceDwg).mockResolvedValue({} as any);
    vi.mocked(mxcadApi.uploadExtReferenceImage).mockResolvedValue({} as any);

    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        nodeId: 'testnode123',
        onSuccess,
      })
    );

    // 检查缺失的外部参照
    await act(async () => {
      await result.current.checkMissingReferences();
    });

    // 直接设置文件源
    const mockFile = new File(['content'], 'ref1.dwg', {
      type: 'application/octet-stream',
    });
    const mockImageFile = new File(['image'], 'image1.png', {
      type: 'image/png',
    });

    // 通过直接更新状态来设置文件源
    result.current.files.forEach((file) => {
      if (file.name === 'ref1.dwg') {
        (file as any).source = mockFile;
      }
      if (file.name === 'image1.png') {
        (file as any).source = mockImageFile;
      }
    });

    // 上传文件
    await act(async () => {
      await result.current.uploadFiles();
    });

    // 完成
    act(() => {
      result.current.complete();
    });

    expect(onSuccess).toHaveBeenCalled();
  });

  it('应该过滤掉已存在的外部参照', async () => {
    const { mxcadApi } = await import('../services/mxcadApi');
    const mockPreloadingData = {
      tz: false,
      src_file_md5: 'testhash123',
      images: ['image1.png', 'image2.png'],
      externalReference: ['ref1.dwg', 'ref2.dwg'],
    };

    vi.mocked(mxcadApi.getPreloadingData).mockResolvedValue(
      mockPreloadingData as any
    );

    // 模拟部分文件已存在
    vi.mocked(mxcadApi.checkExternalReferenceExists)
      .mockResolvedValueOnce({ exists: true } as any) // ref1.dwg 已存在
      .mockResolvedValueOnce({ exists: false } as any) // ref2.dwg 不存在
      .mockResolvedValueOnce({ exists: true } as any) // image1.png 已存在
      .mockResolvedValueOnce({ exists: false } as any); // image2.png 不存在

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
    expect(result.current.files.map((f) => f.name)).toEqual([
      'ref2.dwg',
      'image2.png',
    ]);
  });

  it('应该过滤掉HTTP/HTTPS开头的URL（已有外部参照）', async () => {
    const { mxcadApi } = await import('../services/mxcadApi');
    const mockPreloadingData = {
      tz: false,
      src_file_md5: 'testhash123',
      images: ['http://example.com/image1.png', 'local_image.png'],
      externalReference: ['local_ref.dwg'],
    };

    vi.mocked(mxcadApi.getPreloadingData).mockResolvedValue(
      mockPreloadingData as any
    );

    vi.mocked(mxcadApi.checkExternalReferenceExists).mockResolvedValue({
      exists: false,
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

// 辅助函数：设置文件源
function setFiles(
  _updater: (
    prev: import('../types/filesystem').ExternalReferenceFile[]
  ) => import('../types/filesystem').ExternalReferenceFile[]
) {
  // 此函数用于测试中的状态更新，实际状态更新在Hook内部处理
}
