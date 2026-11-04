///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 单节点多格式下载命令（评审候选 3）单测：
 * 门控一次测、分发按库类型/格式测、成功/失败 toast 测。
 *
 * 断言点：门控预检（assertExportDownloadAllowed）只有一处实现且行为正确；
 * 同步直连下载（downloadNodeWithFormat）的 mxweb 公开端点 / download-with-format
 * 分发与文件名、toast 语义符合既有调用点（useLibraryOperations / useDownloadFormatModal）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/languages', () => ({
  t: (msg: string, vars?: Record<string, string>) => {
    if (!vars) return msg;
    return msg.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
  },
}));

vi.mock('@/utils/errorHandler', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

vi.mock('@/utils/download', () => ({
  triggerBlobDownload: vi.fn(),
}));

vi.mock('@/utils/vipFeatureGuide', () => ({
  canExportDownload: vi.fn(
    (isVip: boolean, freeEnabled: boolean) => isVip || freeEnabled
  ),
  handleVipFeatureRequiredError: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/api-sdk', () => ({
  downloadControllerDownloadNodeWithFormat: vi.fn(),
  libraryControllerDownloadDrawingNode: vi.fn(),
  libraryControllerDownloadBlockNode: vi.fn(),
}));

import {
  downloadControllerDownloadNodeWithFormat,
  libraryControllerDownloadDrawingNode,
  libraryControllerDownloadBlockNode,
} from '@/api-sdk';
import { triggerBlobDownload } from '@/utils/download';
import { handleVipFeatureRequiredError } from '@/utils/vipFeatureGuide';
import {
  assertExportDownloadAllowed,
  downloadNodeWithFormat,
} from './downloadNodeWithFormat';

const downloadWithFormatMock =
  downloadControllerDownloadNodeWithFormat as unknown as ReturnType<typeof vi.fn>;
const downloadDrawingMock =
  libraryControllerDownloadDrawingNode as unknown as ReturnType<typeof vi.fn>;
const downloadBlockMock =
  libraryControllerDownloadBlockNode as unknown as ReturnType<typeof vi.fn>;
const triggerDownloadMock =
  triggerBlobDownload as unknown as ReturnType<typeof vi.fn>;
const vipPromptMock =
  handleVipFeatureRequiredError as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  downloadWithFormatMock.mockResolvedValue({ data: new Blob(['pdf']) });
  downloadDrawingMock.mockResolvedValue({ data: new Blob(['mxweb']) });
  downloadBlockMock.mockResolvedValue({ data: new Blob(['mxweb']) });
});

describe('assertExportDownloadAllowed — 门控唯一出口', () => {
  it('requiresExport=false（mxweb 原格式）恒放行，不弹引导', async () => {
    const ok = await assertExportDownloadAllowed(false, false, false);
    expect(ok).toBe(true);
    expect(vipPromptMock).not.toHaveBeenCalled();
  });

  it('非 mxweb + VIP 放行', async () => {
    expect(await assertExportDownloadAllowed(true, true, false)).toBe(true);
    expect(vipPromptMock).not.toHaveBeenCalled();
  });

  it('非 mxweb + 运行时开关开放放行', async () => {
    expect(await assertExportDownloadAllowed(true, false, true)).toBe(true);
    expect(vipPromptMock).not.toHaveBeenCalled();
  });

  it('非 mxweb + 非 VIP + 开关未开放：弹购买引导并返回 false', async () => {
    const ok = await assertExportDownloadAllowed(true, false, false);
    expect(ok).toBe(false);
    expect(vipPromptMock).toHaveBeenCalledTimes(1);
  });
});

describe('downloadNodeWithFormat — 同步直连下载', () => {
  it('转换格式被门控拦截：denied、不发请求、弹引导', async () => {
    const result = await downloadNodeWithFormat({
      nodeId: 'n1',
      nodeName: 'a.dwg',
      format: 'pdf',
      isVip: false,
      freeExportDownloadEnabled: false,
      showToast: vi.fn(),
    });
    expect(result).toEqual({ status: 'denied' });
    expect(vipPromptMock).toHaveBeenCalledTimes(1);
    expect(downloadWithFormatMock).not.toHaveBeenCalled();
  });

  it('mxweb（图纸库）走公开端点 libraryControllerDownloadDrawingNode，toast 已下载', async () => {
    const showToast = vi.fn();
    const result = await downloadNodeWithFormat({
      nodeId: 'n1',
      nodeName: 'drawing.dwg',
      format: 'mxweb',
      isVip: false,
      freeExportDownloadEnabled: false,
      libraryType: 'drawing',
      showToast,
    });
    expect(result.status).toBe('downloaded');
    expect(downloadDrawingMock).toHaveBeenCalledWith({
      path: { nodeId: 'n1' },
      parseAs: 'blob',
    });
    expect(downloadBlockMock).not.toHaveBeenCalled();
    expect(downloadWithFormatMock).not.toHaveBeenCalled();
    expect(triggerDownloadMock).toHaveBeenCalledWith(
      expect.any(Blob),
      'drawing.mxweb'
    );
    expect(showToast).toHaveBeenCalledWith('已下载：drawing.mxweb', 'success');
  });

  it('mxweb（图块库）走公开端点 libraryControllerDownloadBlockNode', async () => {
    const result = await downloadNodeWithFormat({
      nodeId: 'n1',
      nodeName: 'block.dwg',
      format: 'mxweb',
      isVip: false,
      freeExportDownloadEnabled: false,
      libraryType: 'block',
      showToast: vi.fn(),
    });
    expect(result.status).toBe('downloaded');
    expect(downloadBlockMock).toHaveBeenCalledWith({
      path: { nodeId: 'n1' },
      parseAs: 'blob',
    });
    expect(downloadDrawingMock).not.toHaveBeenCalled();
  });

  it('转换格式走 download-with-format，query 带格式与转换选项，toast 已下载', async () => {
    const showToast = vi.fn();
    await downloadNodeWithFormat({
      nodeId: 'n1',
      nodeName: 'drawing.dwg',
      format: 'pdf',
      isVip: true,
      freeExportDownloadEnabled: false,
      pdfOptions: { width: '3000', height: '2000', colorPolicy: 'color' },
      showToast,
    });
    expect(downloadWithFormatMock).toHaveBeenCalledWith({
      path: { nodeId: 'n1' },
      query: { format: 'pdf', width: '3000', height: '2000', colorPolicy: 'color' },
      parseAs: 'blob',
    });
    expect(triggerDownloadMock).toHaveBeenCalledWith(
      expect.any(Blob),
      'drawing.pdf'
    );
    expect(showToast).toHaveBeenCalledWith('已下载：drawing.pdf', 'success');
  });

  it('不传 showToast：成功静默下载（编辑器侧下载弹窗语义，无「已下载」toast）', async () => {
    const result = await downloadNodeWithFormat({
      nodeId: 'n1',
      nodeName: 'drawing.dwg',
      format: 'mxweb',
      isVip: false,
      freeExportDownloadEnabled: false,
      libraryType: 'drawing',
    });
    expect(result.status).toBe('downloaded');
    expect(triggerDownloadMock).toHaveBeenCalledTimes(1);
  });

  it('接口失败：failed + 错误 toast，不抛出', async () => {
    downloadWithFormatMock.mockRejectedValue(new Error('boom'));
    const showToast = vi.fn();
    const result = await downloadNodeWithFormat({
      nodeId: 'n1',
      nodeName: 'drawing.dwg',
      format: 'pdf',
      isVip: true,
      freeExportDownloadEnabled: false,
      showToast,
    });
    expect(result.status).toBe('failed');
    expect(showToast).toHaveBeenCalledWith('boom', 'error');
  });
});
