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
    footer,
  }: {
    isOpen?: boolean;
    children?: React.ReactNode;
    title?: React.ReactNode;
    footer?: React.ReactNode;
  }) => (isOpen ? <div>{title}{children}{footer}</div> : null),
}));

vi.mock('../ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    tooltip,
    title,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    tooltip?: string;
    title?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} title={tooltip || title}>
      {children}
    </button>
  ),
}));

vi.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => ({ showToast: vi.fn() }),
}));

// currentFileId 可配置：单文件编辑器上下文（isEditorContext=true）测试「指定区域」用
const hoisted = vi.hoisted(() => ({
  currentFileId: null as string | null,
  pickThumbnailRegion: vi.fn(),
  generateThumbnail: vi.fn(),
  generatePosterImage: vi.fn(),
  detectRegionBorder: vi.fn(),
  checkThumbnail: vi.fn(),
  uploadThumbnail: vi.fn(),
  composeSharePosterDataUrl: vi.fn(),
}));

vi.mock('../../stores/useCADEditorStore', () => ({
  useCADEditorStore: () => ({ currentFileId: hoisted.currentFileId }),
}));

vi.mock('../../services/mxcadManager/mxcadThumbnail', () => ({
  pickThumbnailRegion: hoisted.pickThumbnailRegion,
  generateThumbnail: hoisted.generateThumbnail,
  generatePosterImage: hoisted.generatePosterImage,
  detectRegionBorder: hoisted.detectRegionBorder,
  checkThumbnail: hoisted.checkThumbnail,
  uploadThumbnail: hoisted.uploadThumbnail,
}));

vi.mock('@/lib/sharePoster', () => ({
  composeSharePosterDataUrl: hoisted.composeSharePosterDataUrl,
  downloadSharePoster: vi.fn(),
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

import { shareControllerCreateShare, shareControllerListShares } from '@/api-sdk';

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

  it('「立即过期」提交 expiresIn=1 秒（回归：曾按无有效期创建）', async () => {
    vi.mocked(shareControllerCreateShare).mockResolvedValue({
      data: {
        token: 'tok-1',
        url: '/cad-editor/f1?shareToken=tok-1',
        expiresAt: null,
      },
    } as never);

    render(<ShareDialog isOpen onClose={vi.fn()} files={files} />);
    fireEvent.click(screen.getByText('立即过期'));
    fireEvent.click(screen.getByText('批量生成分享链接'));

    await waitFor(() => expect(shareControllerCreateShare).toHaveBeenCalled(), {
      timeout: 3000,
    });
    // 修复前 expiresIn 为 undefined（不传字段=永不过期），与「立即过期」按钮语义相反
    expect(shareControllerCreateShare).toHaveBeenCalledWith({
      body: { fileId: 'f1', expiresIn: 1 },
    });
  });

  it('自定义天数超上限按 365 天提交（回归：曾不钳制直乘 86400）', async () => {
    vi.mocked(shareControllerCreateShare).mockResolvedValue({
      data: {
        token: 'tok-1',
        url: '/cad-editor/f1?shareToken=tok-1',
        expiresAt: null,
      },
    } as never);

    render(<ShareDialog isOpen onClose={vi.fn()} files={files} />);
    fireEvent.click(screen.getByText('自定义'));
    fireEvent.change(screen.getByDisplayValue('1'), {
      target: { value: '500' },
    });
    fireEvent.click(screen.getByText('批量生成分享链接'));

    await waitFor(() => expect(shareControllerCreateShare).toHaveBeenCalled(), {
      timeout: 3000,
    });
    expect(shareControllerCreateShare).toHaveBeenCalledWith({
      body: { fileId: 'f1', expiresIn: 365 * 86400 },
    });
  });
});

describe('ShareDialog 单文件列表视图 + 指定区域（回归：预览/主弹窗让出画布）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.currentFileId = 'f1';
    hoisted.composeSharePosterDataUrl.mockResolvedValue('data:image/png;base64,xx');
    vi.mocked(shareControllerListShares).mockResolvedValue({
      data: {
        items: [
          {
            token: 'tok-1',
            url: '/cad-editor/f1?shareToken=tok-1',
            expiresAt: null,
            createdAt: '2026-01-01',
          },
        ],
      },
    } as never);
  });

  it('列表行有「预览分享图片」按钮，点击打开预览弹窗', async () => {
    render(
      <ShareDialog isOpen onClose={vi.fn()} fileId="f1" fileName="平面图.dwg" />
    );

    // 列表加载后每行操作列有预览按钮（tooltip=预览分享图片）
    const previewBtn = await screen.findByTitle('预览分享图片');
    expect(previewBtn).toBeInTheDocument();

    fireEvent.click(previewBtn);
    // 预览弹窗打开（Modal mock 渲染 title）
    await waitFor(() =>
      expect(screen.getByText('预览分享图片')).toBeInTheDocument()
    );
  });

  it('点「指定区域」：主分享弹窗与预览弹窗都让出画布，框选完成后恢复', async () => {
    hoisted.pickThumbnailRegion.mockResolvedValue({
      minPt: { x: 0, y: 0 },
      maxPt: { x: 100, y: 100 },
    });
    // 边框检测在「框选结束瞬间」执行并缓存（viewCoordLong2Cad 实时，出图 zoomW 后会失真）
    hoisted.detectRegionBorder.mockResolvedValue(false);
    // 海报图走 generatePosterImage（高清 BMP，返回 {dataUrl, hasBorder}），缩略图上传走 generateThumbnail（200px）
    hoisted.generatePosterImage.mockResolvedValue({
      dataUrl: 'data:image/bmp;base64,zz',
      hasBorder: false,
    });
    hoisted.generateThumbnail.mockResolvedValue('data:image/png;base64,yy');

    render(
      <ShareDialog isOpen onClose={vi.fn()} fileId="f1" fileName="平面图.dwg" />
    );

    // 打开预览弹窗
    fireEvent.click(await screen.findByTitle('预览分享图片'));
    await waitFor(() =>
      expect(screen.getByText('预览分享图片')).toBeInTheDocument()
    );

    // 编辑器上下文（currentFileId=f1）→「指定区域」按钮可见
    const pickBtn = screen.getByText('指定区域');
    expect(pickBtn).toBeInTheDocument();

    fireEvent.click(pickBtn);

    // 回归：主分享弹窗（分享图纸）与预览弹窗都让出画布 → 画布可交互
    await waitFor(() => {
      expect(screen.queryByText('分享图纸')).not.toBeInTheDocument();
      expect(screen.queryByText('预览分享图片')).not.toBeInTheDocument();
    });

    // 框选完成后恢复：主弹窗 + 预览弹窗 + 「重新指定区域」
    await waitFor(
      () => {
        expect(screen.getByText('分享图纸')).toBeInTheDocument();
        expect(screen.getByText('重新指定区域')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // 边框检测在框选结束瞬间执行一次，并把结果传给出图（generatePosterImage 不再内部重算）
    expect(hoisted.detectRegionBorder).toHaveBeenCalledTimes(1);
    expect(hoisted.generatePosterImage).toHaveBeenCalledWith(
      { minPt: { x: 0, y: 0 }, maxPt: { x: 100, y: 100 } },
      false
    );
  });
});
