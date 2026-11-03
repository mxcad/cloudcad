import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

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

const mockShowToast = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/NotificationContext', () => ({
  useNotification: () => ({ showToast: mockShowToast, showConfirm: vi.fn() }),
}));

// 预览弹框渲染为标记元素，便于断言开关
vi.mock('@/components/modals/ImagePreviewModal', () => ({
  ImagePreviewModal: (props: { isOpen: boolean; src: string }) =>
    props.isOpen ? (
      <div data-testid="preview-open" data-src={props.src} />
    ) : null,
}));

// Tooltip 透传（避免定位逻辑干扰）
vi.mock('@/components/ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/languages', () => ({ t: (k: string) => k }));

import { FeedbackAttachmentList } from './FeedbackAttachmentList';
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

const freshImageUrl = '/api/v1/feedback/attachments/att-1/download?token=1.abc';

describe('FeedbackAttachmentList 动作按钮矩阵', () => {
  afterEach(() => {
    cleanup();
    mockAdminDownload.mockReset();
    mockTriggerBlobDownload.mockReset();
    mockTriggerUrlDownload.mockReset();
    mockShowToast.mockReset();
  });

  it('IMAGE 有 viewUrl → 查看+下载按钮', () => {
    render(<FeedbackAttachmentList attachments={[baseAtt({ viewUrl: freshImageUrl })]} />);
    expect(screen.getByLabelText('查看')).toBeTruthy();
    expect(screen.getByLabelText('下载')).toBeTruthy();
  });

  it('DRAWING REFERENCE 有 viewUrl → 仅查看（无下载）', () => {
    render(
      <FeedbackAttachmentList
        attachments={[baseAtt({ type: 'DRAWING', kind: 'REFERENCE', fileName: 'c.dwg', viewUrl: freshImageUrl })]}
      />
    );
    expect(screen.getByLabelText('查看')).toBeTruthy();
    expect(screen.queryByLabelText('下载')).toBeNull();
  });

  it('DRAWING FILE 有 viewUrl → 仅下载（无查看）', () => {
    render(
      <FeedbackAttachmentList
        attachments={[baseAtt({ type: 'DRAWING', fileName: 'd.dwg', viewUrl: freshImageUrl })]}
      />
    );
    expect(screen.queryByLabelText('查看')).toBeNull();
    expect(screen.getByLabelText('下载')).toBeTruthy();
  });

  it('无任何 URL → 无动作按钮、无链接（纯徽标）', () => {
    const { container } = render(
      <FeedbackAttachmentList
        attachments={[baseAtt({ type: 'DRAWING', kind: 'REFERENCE', fileName: 'e.dwg' })]}
      />
    );
    expect(screen.queryByLabelText('查看')).toBeNull();
    expect(screen.queryByLabelText('下载')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
  });

  it('compact 模式 → 纯展示无动作按钮', () => {
    render(
      <FeedbackAttachmentList attachments={[baseAtt({ viewUrl: freshImageUrl })]} compact />
    );
    expect(screen.queryByLabelText('查看')).toBeNull();
    expect(screen.queryByLabelText('下载')).toBeNull();
  });

  it('空列表 → 无附件占位', () => {
    render(<FeedbackAttachmentList attachments={[]} />);
    expect(screen.getByText('无附件')).toBeTruthy();
  });
});

describe('FeedbackAttachmentList 动作行为', () => {
  beforeEach(() => {
    mockAdminDownload.mockReset();
    mockTriggerBlobDownload.mockReset();
    mockTriggerUrlDownload.mockReset();
    mockShowToast.mockReset();
  });

  afterEach(cleanup);

  it('点查看（图片）→ 打开预览弹框（viewUrl 绝对化）', async () => {
    render(<FeedbackAttachmentList attachments={[baseAtt({ viewUrl: freshImageUrl })]} />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText('查看'));
    });
    await waitFor(() => expect(screen.getByTestId('preview-open')).toBeTruthy());
    const preview = screen.getByTestId('preview-open');
    expect(preview.getAttribute('data-src')).toBe(
      `${window.location.origin}${freshImageUrl}`
    );
  });

  it('点下载（有 downloadUrl）→ SDK 取 Blob 触发下载', async () => {
    const blob = new Blob(['x'], { type: 'application/octet-stream' });
    mockAdminDownload.mockResolvedValue({ data: blob, error: undefined });
    render(
      <FeedbackAttachmentList
        attachments={[baseAtt({ viewUrl: freshImageUrl, downloadUrl: '/api/v1/admin/...' })]}
      />
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText('下载'));
    });
    await waitFor(() => expect(mockAdminDownload).toHaveBeenCalled());
    expect(mockTriggerBlobDownload).toHaveBeenCalledWith(blob, 'a.png');
  });

  it('点下载（仅 viewUrl）→ 锚点直下', async () => {
    render(<FeedbackAttachmentList attachments={[baseAtt({ viewUrl: freshImageUrl })]} />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText('下载'));
    });
    await waitFor(() => expect(mockTriggerUrlDownload).toHaveBeenCalled());
    expect(mockTriggerUrlDownload).toHaveBeenCalledWith(
      `${window.location.origin}${freshImageUrl}`,
      'a.png'
    );
    expect(mockAdminDownload).not.toHaveBeenCalled();
  });

  it('下载失败 → toast 后端文案', async () => {
    mockAdminDownload.mockRejectedValue(new Error('文件不存在'));
    render(
      <FeedbackAttachmentList
        attachments={[baseAtt({ viewUrl: freshImageUrl, downloadUrl: '/api/v1/admin/...' })]}
      />
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText('下载'));
    });
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('文件不存在', 'error')
    );
  });

  it('token 临近过期 → 经 onStaleView 重取新 DTO 再预览', async () => {
    const staleExp = Math.floor(Date.now() / 1000) + 30;
    const staleAtt = baseAtt({ viewUrl: `/api/v1/feedback/attachments/att-1/download?token=${staleExp}.abc` });
    const freshAtt = baseAtt({ viewUrl: freshImageUrl });
    const onStaleView = vi.fn().mockResolvedValue(freshAtt);
    render(<FeedbackAttachmentList attachments={[staleAtt]} onStaleView={onStaleView} />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText('查看'));
    });
    await waitFor(() => expect(onStaleView).toHaveBeenCalledWith('att-1'));
    await waitFor(() => expect(screen.getByTestId('preview-open')).toBeTruthy());
    expect(screen.getByTestId('preview-open').getAttribute('data-src')).toBe(
      `${window.location.origin}${freshImageUrl}`
    );
  });

  it('onStaleView 重取失败 → toast 提示并继续用旧链接', async () => {
    const staleExp = Math.floor(Date.now() / 1000) + 30;
    const staleUrl = `/api/v1/feedback/attachments/att-1/download?token=${staleExp}.abc`;
    const onStaleView = vi.fn().mockRejectedValue(new Error('network'));
    render(<FeedbackAttachmentList attachments={[baseAtt({ viewUrl: staleUrl })]} onStaleView={onStaleView} />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText('查看'));
    });
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('预览链接可能已过期，请刷新列表后重试', 'error')
    );
    await waitFor(() => expect(screen.getByTestId('preview-open')).toBeTruthy());
    expect(screen.getByTestId('preview-open').getAttribute('data-src')).toBe(
      `${window.location.origin}${staleUrl}`
    );
  });
});
