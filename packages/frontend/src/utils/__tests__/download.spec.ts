///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/api-sdk', () => ({
  mxcadFileAccessControllerViewExternalRef: vi.fn(),
  mxcadFileAccessControllerGetFileDownloadExternalRef: vi.fn(),
  downloadControllerDownloadNodeWithFormat: vi.fn(),
  batchDownloadControllerDownloadZip: vi.fn(),
}));

vi.mock('@/languages', () => ({
  t: (key: string) => key,
}));

vi.mock('@/utils/errorHandler', () => ({
  getErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
}));

import { fetchXrefViewBlobUrl } from '../download';
import { mxcadFileAccessControllerViewExternalRef } from '@/api-sdk';

describe('fetchXrefViewBlobUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('外部参照查看请求必须禁用 HTTP 缓存，否则替换后仍显示旧图', async () => {
    const mockView =
      mxcadFileAccessControllerViewExternalRef as ReturnType<typeof vi.fn>;
    mockView.mockResolvedValue({
      data: new Blob(['ref-img'], { type: 'image/png' }),
      error: undefined,
    });

    const url = await fetchXrefViewBlobUrl('node-1', 'xref.png');

    expect(mockView).toHaveBeenCalledWith({
      path: { nodeId: 'node-1', fileName: 'xref.png' },
      cache: 'no-store',
    });
    expect(url.startsWith('blob:')).toBe(true);
    URL.revokeObjectURL(url);
  });

  it('后端报错时抛出带后端消息的 Error', async () => {
    const mockView =
      mxcadFileAccessControllerViewExternalRef as ReturnType<typeof vi.fn>;
    mockView.mockResolvedValue({
      data: undefined,
      error: new Error('文件不存在'),
    });

    await expect(fetchXrefViewBlobUrl('node-1', 'xref.png')).rejects.toThrow(
      '文件不存在'
    );
  });
});
