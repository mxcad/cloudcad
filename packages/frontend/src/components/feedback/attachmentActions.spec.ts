import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

const mockAdminDownload = vi.hoisted(() => vi.fn());
vi.mock('@/api-sdk', () => ({
  feedbackAttachmentAdminControllerDownload: (...args: unknown[]) =>
    mockAdminDownload(...args),
}));

const mockTriggerBlobDownload = vi.hoisted(() => vi.fn());
const mockTriggerUrlDownload = vi.hoisted(() => vi.fn());
vi.mock('@/utils/download', () => ({
  triggerBlobDownload: (...args: unknown[]) => mockTriggerBlobDownload(...args),
  triggerUrlDownload: (...args: unknown[]) => mockTriggerUrlDownload(...args),
}));

const mockGetErrorMessage = vi.hoisted(() => vi.fn((e: unknown) => (e instanceof Error ? e.message : '')));
vi.mock('@/utils/errorHandler', () => ({
  getErrorMessage: (...args: unknown[]) => mockGetErrorMessage(...args),
}));

vi.mock('@/components/modals/ImagePreviewModal', () => ({
  ImagePreviewModal: (props: { isOpen: boolean }) =>
    props.isOpen ? 'PREVIEW_OPEN' : null,
}));

vi.mock('@/languages', () => ({ t: (k: string) => k }));

import {
  canDownloadAttachment,
  canViewAttachment,
  downloadAttachment,
  findDuplicateByContentHash,
  getDownloadErrorMessage,
  isViewUrlStale,
  openReferenceDrawing,
  parseViewTokenExpMs,
  toAbsoluteUrl,
  useAttachmentPreview,
} from './attachmentActions';
import type { FeedbackAttachmentDto } from '@/api-sdk';

function baseAtt(over: Partial<FeedbackAttachmentDto> = {}): FeedbackAttachmentDto {
  return {
    id: 'att-1',
    feedbackId: 'fb-1',
    type: 'IMAGE',
    kind: 'FILE',
    fileName: 'a.png',
    mimeType: 'image/png',
    size: 1024,
    nodeId: null,
    fileHash: null,
    region: null,
    thumbnailUrl: null,
    viewUrl: null,
    downloadUrl: null,
    uploadedByName: null,
    createdAt: '2026-11-02T00:00:00Z',
    ...over,
  };
}

describe('canViewAttachment（查看动作矩阵）', () => {
  it('IMAGE 有 viewUrl → 可预览', () => {
    expect(canViewAttachment(baseAtt({ viewUrl: '/api/v1/feedback/attachments/att-1/download?token=1.abc' }))).toBe(true);
  });

  it('IMAGE 无 URL → 不可查看', () => {
    expect(canViewAttachment(baseAtt())).toBe(false);
  });

  it('DOCUMENT 有 viewUrl → 不可查看（无文档预览组件）', () => {
    expect(canViewAttachment(baseAtt({ type: 'DOCUMENT', viewUrl: '/x' }))).toBe(false);
  });

  it('DRAWING FILE（上传图纸）→ 不可查看', () => {
    expect(canViewAttachment(baseAtt({ type: 'DRAWING', viewUrl: '/x' }))).toBe(false);
  });

  it('DRAWING REFERENCE（引用图纸）有 viewUrl → 可查看', () => {
    expect(
      canViewAttachment(baseAtt({ type: 'DRAWING', kind: 'REFERENCE', viewUrl: '/x' }))
    ).toBe(true);
  });

  it('DRAWING REFERENCE 无 URL → 不可查看', () => {
    expect(canViewAttachment(baseAtt({ type: 'DRAWING', kind: 'REFERENCE' }))).toBe(false);
  });
});

describe('canDownloadAttachment（下载动作矩阵）', () => {
  it('REFERENCE 恒不可下载（只查看）', () => {
    expect(
      canDownloadAttachment(baseAtt({ type: 'DRAWING', kind: 'REFERENCE', viewUrl: '/x', downloadUrl: '/y' }))
    ).toBe(false);
  });

  it('IMAGE 仅 viewUrl → 可下载（token 直链）', () => {
    expect(canDownloadAttachment(baseAtt({ viewUrl: '/x' }))).toBe(true);
  });

  it('DOCUMENT 有 downloadUrl → 可下载', () => {
    expect(canDownloadAttachment(baseAtt({ type: 'DOCUMENT', downloadUrl: '/y' }))).toBe(true);
  });

  it('DRAWING FILE 有 viewUrl → 可下载', () => {
    expect(canDownloadAttachment(baseAtt({ type: 'DRAWING', viewUrl: '/x' }))).toBe(true);
  });

  it('无任何 URL → 不可下载', () => {
    expect(canDownloadAttachment(baseAtt())).toBe(false);
  });
});

describe('parseViewTokenExpMs / isViewUrlStale（token 过期守卫）', () => {
  it('解析 token 的 exp（秒 → 毫秒）', () => {
    expect(parseViewTokenExpMs('/x?token=1700000000.abc')).toBe(1700000000000);
  });

  it('无 token 参数 → null', () => {
    expect(parseViewTokenExpMs('/x?code=abc')).toBeNull();
  });

  it('token 非法 → null', () => {
    expect(parseViewTokenExpMs('/x?token=abc')).toBeNull();
  });

  it('剩余 >60s → 新鲜', () => {
    const exp = Math.floor(Date.now() / 1000) + 300;
    expect(isViewUrlStale(baseAtt({ viewUrl: `/x?token=${exp}.abc` }))).toBe(false);
  });

  it('剩余 <60s → 过期', () => {
    const exp = Math.floor(Date.now() / 1000) + 30;
    expect(isViewUrlStale(baseAtt({ viewUrl: `/x?token=${exp}.abc` }))).toBe(true);
  });

  it('无 token → 视为新鲜（以后端校验为准）', () => {
    expect(isViewUrlStale(baseAtt({ viewUrl: '/x' }))).toBe(false);
  });
});

describe('toAbsoluteUrl', () => {
  it('相对路径补 origin', () => {
    expect(toAbsoluteUrl('/api/v1/x')).toBe(`${window.location.origin}/api/v1/x`);
  });

  it('http/blob 原样返回', () => {
    expect(toAbsoluteUrl('https://a.b/c.png')).toBe('https://a.b/c.png');
    expect(toAbsoluteUrl('blob:http://x/1')).toBe('blob:http://x/1');
  });

  it('空 → null', () => {
    expect(toAbsoluteUrl(null)).toBeNull();
  });
});

describe('openReferenceDrawing（引用图纸查看 → CAD 编辑器）', () => {
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  it('REFERENCE + nodeId → 编辑器原生管线（nodeId + region）', () => {
    openReferenceDrawing(
      baseAtt({ type: 'DRAWING', kind: 'REFERENCE', nodeId: 'node-1', region: '1,2,3,4', viewUrl: '/x' })
    );
    expect(openSpy).toHaveBeenCalledWith('/cad-editor?nodeId=node-1&region=1%2C2%2C3%2C4', '_blank', 'noopener');
  });

  it('REFERENCE 无 nodeId/hash → 回落 viewUrl 直链', () => {
    openReferenceDrawing(
      baseAtt({ type: 'DRAWING', kind: 'REFERENCE', viewUrl: '/api/v1/feedback/attachments/att-1/download?token=1.abc' })
    );
    expect(openSpy).toHaveBeenCalledWith(
      `${window.location.origin}/api/v1/feedback/attachments/att-1/download?token=1.abc`,
      '_blank',
      'noopener'
    );
  });

  it('无任何 URL → 不打开', () => {
    openReferenceDrawing(baseAtt({ type: 'DRAWING', kind: 'REFERENCE' }));
    expect(openSpy).not.toHaveBeenCalled();
  });
});

describe('downloadAttachment（下载双机制）', () => {
  beforeEach(() => {
    mockAdminDownload.mockReset();
    mockTriggerBlobDownload.mockReset();
    mockTriggerUrlDownload.mockReset();
  });

  it('有 downloadUrl → SDK 取 Blob 后触发下载（带文件名）', async () => {
    const blob = new Blob(['x'], { type: 'application/octet-stream' });
    mockAdminDownload.mockResolvedValue({ data: blob, error: undefined });
    await downloadAttachment(baseAtt({ downloadUrl: '/api/v1/admin/...', viewUrl: '/x' }));
    expect(mockAdminDownload).toHaveBeenCalledWith({ throwOnError: true, path: { id: 'att-1' } });
    expect(mockTriggerBlobDownload).toHaveBeenCalledWith(blob, 'a.png');
    expect(mockTriggerUrlDownload).not.toHaveBeenCalled();
  });

  it('SDK 返回非 Blob → 抛错', async () => {
    mockAdminDownload.mockResolvedValue({ data: 'oops', error: undefined });
    await expect(downloadAttachment(baseAtt({ downloadUrl: '/y' }))).rejects.toThrow('下载失败');
  });

  it('仅 viewUrl → 锚点直下（绝对 URL + 文件名）', async () => {
    await downloadAttachment(baseAtt({ viewUrl: '/api/v1/feedback/attachments/att-1/download?token=1.abc' }));
    expect(mockAdminDownload).not.toHaveBeenCalled();
    expect(mockTriggerUrlDownload).toHaveBeenCalledWith(
      `${window.location.origin}/api/v1/feedback/attachments/att-1/download?token=1.abc`,
      'a.png'
    );
  });

  it('无任何 URL → 抛错', async () => {
    await expect(downloadAttachment(baseAtt())).rejects.toThrow('下载失败');
  });
});

describe('getDownloadErrorMessage', () => {
  it('透传后端文案', () => {
    expect(getDownloadErrorMessage(new Error('文件不存在'))).toBe('文件不存在');
  });

  it('无文案 → 兜底', () => {
    expect(getDownloadErrorMessage(new Error(''))).toBe('下载失败');
  });
});

describe('findDuplicateByContentHash（前端去重判定）', () => {
  it('contentHash 命中 → 返回已有附件', () => {
    const list = [baseAtt({ id: 'a', contentHash: 'h1' }), baseAtt({ id: 'b', contentHash: 'h2' })];
    expect(findDuplicateByContentHash(list, 'h2')?.id).toBe('b');
  });

  it('未命中 → 返回 null', () => {
    const list = [baseAtt({ id: 'a', contentHash: 'h1' })];
    expect(findDuplicateByContentHash(list, 'nope')).toBeNull();
  });

  it('空列表 / contentHash 为 null 的附件 → null', () => {
    expect(findDuplicateByContentHash([], 'h1')).toBeNull();
    const list = [baseAtt({ id: 'a', contentHash: null })];
    expect(findDuplicateByContentHash(list, 'h1')).toBeNull();
  });
});

describe('useAttachmentPreview（图片预览态）', () => {
  afterEach(cleanup);

  it('openPreview 打开 / closePreview 关闭（断言预览弹框元素 props）', () => {
    const { result } = renderHook(() => useAttachmentPreview());
    expect(result.current.previewModal.props.isOpen).toBe(false);
    act(() => result.current.openPreview('http://x/a.png', '截图'));
    expect(result.current.previewModal.props.isOpen).toBe(true);
    expect(result.current.previewModal.props.src).toBe('http://x/a.png');
    act(() => result.current.closePreview());
    expect(result.current.previewModal.props.isOpen).toBe(false);
  });
});
