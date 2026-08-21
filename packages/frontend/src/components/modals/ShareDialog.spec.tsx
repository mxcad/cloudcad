import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ShareDialog } from './ShareDialog';

// ---- mock 依赖 ----
vi.mock('@/api-sdk', () => ({
  shareControllerCreateShare: vi.fn(),
  shareControllerRevokeShare: vi.fn(),
  shareControllerListShares: vi.fn(),
  shareControllerGetFileShares: vi.fn(),
}));

vi.mock('qrcode.react', () => ({
  QRCodeSVG: () => <div data-testid="qr" />,
}));

vi.mock('../ui/Modal', () => ({
  Modal: ({
    isOpen,
    children,
    title,
  }: {
    isOpen?: boolean;
    children?: React.ReactNode;
    title?: React.ReactNode;
  }) => (isOpen ? <div>{title}{children}</div> : null),
}));

vi.mock('../ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../stores/useCADEditorStore', () => ({
  useCADEditorStore: () => ({ currentFileId: null }),
}));

vi.mock('./ConfirmRevokeModal', () => ({
  ConfirmRevokeModal: () => null,
}));

vi.mock('@/languages', () => ({
  t: (key: string, params?: Record<string, string>) =>
    params
      ? key.replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? '')
      : key,
}));

import { shareControllerCreateShare } from '@/api-sdk';

const files = [
  { fileId: 'f1', fileName: '平面图.dwg' },
  { fileId: 'f2', fileName: '立面图.dwg' },
];

describe('ShareDialog 批量分享', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('批量模式打开直接进入批量生成视图（不白屏）', () => {
    render(<ShareDialog isOpen onClose={vi.fn()} files={files} />);

    expect(screen.getByText('批量分享图纸')).toBeInTheDocument();
    expect(screen.getByText('批量生成分享链接')).toBeInTheDocument();
    expect(screen.getByText(/已选择 2 个图纸文件/)).toBeInTheDocument();
    expect(screen.getByText('1. 平面图.dwg')).toBeInTheDocument();
    expect(screen.getByText('2. 立面图.dwg')).toBeInTheDocument();
  });

  it('批量生成全部成功：自动关闭弹框', async () => {
    vi.mocked(shareControllerCreateShare).mockResolvedValue({
      data: {
        token: 'tok-1',
        url: '/cad-editor/f1?shareToken=tok-1',
        expiresAt: null,
      },
    } as never);
    const onClose = vi.fn();

    render(<ShareDialog isOpen onClose={onClose} files={files} />);
    fireEvent.click(screen.getByText('批量生成分享链接'));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    expect(shareControllerCreateShare).toHaveBeenCalledTimes(2);
  });
  it('批量生成部分失败：停留结果视图展示错误信息', async () => {
    vi.mocked(shareControllerCreateShare)
      .mockResolvedValueOnce({
        data: {
          token: 'tok-1',
          url: '/cad-editor/f1?shareToken=tok-1',
          expiresAt: null,
        },
      } as never)
      .mockResolvedValueOnce({
        error: { message: '没有文件分享权限' },
      } as never);
    const onClose = vi.fn();

    render(<ShareDialog isOpen onClose={onClose} files={files} />);
    fireEvent.click(screen.getByText('批量生成分享链接'));

    // 组合断言最终稳定状态（避免匹配到多帧渲染的中间帧）
    await waitFor(
      () => {
        expect(screen.getByText('已生成 1 个分享链接')).toBeInTheDocument();
        expect(screen.getByText(/没有文件分享权限/)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
    expect(shareControllerCreateShare).toHaveBeenCalledTimes(2);
    // 部分失败时不自动关闭
    expect(onClose).not.toHaveBeenCalled();
  });
});
