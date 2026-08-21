import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from '@testing-library/react';
import { createRef } from 'react';

const { showToastMock, showConfirmMock } = vi.hoisted(() => ({
  showToastMock: vi.fn(),
  showConfirmMock: vi.fn(),
}));

// 会员门控预检相关 mock：默认 VIP 且开关开放（现有导出测试走真实调用链）
const {
  useMembershipMock,
  useRuntimeConfigMock,
  handleVipFeatureRequiredErrorMock,
} = vi.hoisted(() => ({
  useMembershipMock: vi.fn(() => ({ isVip: true, tierLevel: 1 })),
  useRuntimeConfigMock: vi.fn(() => ({
    config: { freeExportDownloadEnabled: true },
    loading: false,
  })),
  handleVipFeatureRequiredErrorMock: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/hooks/useMembership', () => ({
  useMembership: () => useMembershipMock(),
}));

vi.mock('@/contexts/RuntimeConfigContext', () => ({
  useRuntimeConfig: () => useRuntimeConfigMock(),
}));

vi.mock('@/utils/vipFeatureGuide', () => ({
  canExportDownload: vi.fn(
    (isVip: boolean, freeEnabled: boolean) => isVip || freeEnabled
  ),
  handleVipFeatureRequiredError: handleVipFeatureRequiredErrorMock,
}));

vi.mock('@/api-sdk', () => ({
  downloadControllerDownloadNodeWithFormat: vi.fn(),
  mxcadFileAccessControllerGetFileDownloadExternalRef: vi.fn(),
  publicFileControllerConvertAndDownload: vi.fn(),
}));

vi.mock('@/utils/hashUtils', () => ({
  calculateFileHash: vi.fn().mockResolvedValue('mock-hash'),
}));

vi.mock('@/utils/mxcadUploadUtils', () => ({
  uploadFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/utils/download', () => ({
  triggerBlobDownload: vi.fn(),
}));

vi.mock('@/utils/errorHandler', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

vi.mock('@/contexts/NotificationContext', () => ({
  useNotification: () => ({
    showToast: showToastMock,
    showConfirm: showConfirmMock,
  }),
}));

vi.mock('mxcad', () => ({
  saveAsFileDialog: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/services/mxcadManager', () => ({
  generateThumbnail: vi.fn(),
  uploadThumbnail: vi.fn(),
}));

vi.mock('@/components/ui/Modal', () => ({
  Modal: ({
    isOpen,
    onClose,
    children,
    title,
    footer,
  }: {
    isOpen?: boolean;
    onClose?: () => void;
    children?: React.ReactNode;
    title?: React.ReactNode;
    footer?: React.ReactNode;
  }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="modal" onClick={onClose}>
        <div data-testid="modal-title">{title}</div>
        <div data-testid="modal-content">{children}</div>
        <div data-testid="modal-footer">{footer}</div>
      </div>
    );
  },
}));

vi.mock('@/components/modals/SaveAsModal', () => ({
  SaveAsModal: ({
    isOpen,
    currentFileName,
    mxwebBlob,
    personalSpaceId,
    sourceNodeId,
    sourceFileHash,
    onClose,
    onSuccess,
  }: {
    isOpen?: boolean;
    currentFileName?: string;
    mxwebBlob?: Blob;
    personalSpaceId?: string | null;
    sourceNodeId?: string | null;
    sourceFileHash?: string | null;
    onClose?: () => void;
    onSuccess?: (result: {
      nodeId: string;
      fileName: string;
      path: string;
      parentId: string;
    }) => void;
  }) => {
    if (!isOpen) return null;
    return (
      <div
        data-testid="save-as-modal"
        data-file-name={currentFileName}
        data-personal-space={personalSpaceId ?? ''}
        data-source-node={sourceNodeId ?? ''}
        data-source-hash={sourceFileHash ?? ''}
      >
        <button data-testid="save-as-close" onClick={() => onClose?.()}>
          close
        </button>
        <button
          data-testid="save-as-success"
          onClick={() =>
            onSuccess?.({
              nodeId: 'new-1',
              fileName: 'saved.dwg',
              path: '/p',
              parentId: 'parent-1',
            })
          }
        >
          success
        </button>
      </div>
    );
  },
}));

import {
  downloadControllerDownloadNodeWithFormat,
  mxcadFileAccessControllerGetFileDownloadExternalRef,
  publicFileControllerConvertAndDownload,
} from '@/api-sdk';
import { triggerBlobDownload } from '@/utils/download';
import { saveAsFileDialog } from 'mxcad';
import { emit, clearDrawingSessionListeners } from '@/services/drawingSession';
import { CAD_EVENTS } from '@/constants/events';
import { ExportModals } from './index';
import type { ExportModalsHandle } from './index';
import type { ExternalReferenceFile } from '@/types/filesystem';

describe('ExportModals', () => {
  beforeEach(() => {
    clearDrawingSessionListeners();
    vi.clearAllMocks();
    (
      downloadControllerDownloadNodeWithFormat as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ data: new Blob(['x']) });
    (
      mxcadFileAccessControllerGetFileDownloadExternalRef as ReturnType<
        typeof vi.fn
      >
    ).mockResolvedValue({ data: new Blob(['x']) });
    (
      publicFileControllerConvertAndDownload as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ data: new Blob(['x']) });
  });

  const renderExportModals = (
    props: Partial<Parameters<typeof ExportModals>[0]> = {}
  ) => render(<ExportModals fileId="file-1" {...props} />);

  it('默认所有弹窗关闭', () => {
    renderExportModals();
    expect(screen.queryByText('选择下载格式')).toBeNull();
    expect(screen.queryByText('导出 PDF')).toBeNull();
    expect(screen.queryByText('导出 DWG')).toBeNull();
    expect(screen.queryByTestId('save-as-modal')).toBeNull();
  });

  it('EXPORT_FILE 打开下载格式弹窗，确认后下载并关闭', async () => {
    renderExportModals({ canExport: true });

    act(() => {
      emit(CAD_EVENTS.EXPORT_FILE, {
        fileId: 'node-1',
        fileName: 'drawing.dwg',
      });
    });
    expect(screen.getByText('选择下载格式')).toBeInTheDocument();

    fireEvent.click(screen.getByText('下载'));
    await waitFor(() => {
      expect(downloadControllerDownloadNodeWithFormat).toHaveBeenCalledWith({
        path: { nodeId: 'node-1' },
        query: { format: 'mxweb' },
      });
    });
    await waitFor(() => {
      expect(triggerBlobDownload).toHaveBeenCalledWith(
        expect.any(Blob),
        'drawing.mxweb'
      );
    });
    await waitFor(() => {
      expect(screen.queryByText('选择下载格式')).toBeNull();
    });
  });

  it('canExport=false 时 EXPORT_FILE 提示无权限且不打开弹窗', () => {
    renderExportModals({ canExport: false });

    act(() => {
      emit(CAD_EVENTS.EXPORT_FILE, {
        fileId: 'node-1',
        fileName: 'drawing.dwg',
      });
    });

    expect(showToastMock).toHaveBeenCalledWith(
      '您没有导出图纸的权限',
      'warning'
    );
    expect(screen.queryByText('选择下载格式')).toBeNull();
  });

  it('EXPORT_PDF 打开 PDF 导出弹窗，导出走转换+本地保存', async () => {
    renderExportModals();

    act(() => {
      emit(CAD_EVENTS.EXPORT_PDF, {
        fileName: 'drawing.dwg',
        blob: new Blob(['pdf']),
      });
    });
    expect(screen.getByText('导出 PDF')).toBeInTheDocument();

    fireEvent.click(screen.getByText('导出'));
    await waitFor(() => {
      expect(publicFileControllerConvertAndDownload).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(saveAsFileDialog).toHaveBeenCalledWith(
        expect.objectContaining({ filename: 'drawing.pdf' })
      );
    });
    await waitFor(() => {
      expect(screen.queryByText('导出 PDF')).toBeNull();
    });
  });

  it('EXPORT_DWG 打开 DWG 导出弹窗，导出走 saveAsFileDialog', async () => {
    renderExportModals();

    act(() => {
      emit(CAD_EVENTS.EXPORT_DWG, {
        fileName: 'drawing.dwg',
        blob: new Blob(['dwg']),
        format: 'dwg',
      });
    });
    expect(screen.getByText('导出 DWG')).toBeInTheDocument();

    fireEvent.click(screen.getByText('导出'));
    await waitFor(() => {
      expect(saveAsFileDialog).toHaveBeenCalledWith(
        expect.objectContaining({ filename: 'drawing.dwg' })
      );
    });
  });

  it('EXPORT_DXF 打开 DXF 导出弹窗', () => {
    renderExportModals();

    act(() => {
      emit(CAD_EVENTS.EXPORT_DXF, {
        fileName: 'drawing.dwg',
        blob: new Blob(['dxf']),
        format: 'dxf',
      });
    });

    expect(screen.getByText('导出 DXF')).toBeInTheDocument();
  });

  it('SAVE_AS（已登录）打开另存为弹窗并透传来源信息', () => {
    renderExportModals({
      isAuthenticated: true,
      currentFileHash: 'hash-1',
    });

    act(() => {
      emit(CAD_EVENTS.SAVE_AS, {
        currentFileName: 'drawing.dwg',
        mxwebBlob: new Blob(['m']),
        personalSpaceId: 'ps-1',
      });
    });

    const modal = screen.getByTestId('save-as-modal');
    expect(modal).toBeInTheDocument();
    expect(modal.getAttribute('data-file-name')).toBe('drawing.dwg');
    expect(modal.getAttribute('data-personal-space')).toBe('ps-1');
    expect(modal.getAttribute('data-source-node')).toBe('file-1');
    expect(modal.getAttribute('data-source-hash')).toBe('hash-1');
  });

  it('SAVE_AS（未登录）走下载格式弹窗本地下载分支', async () => {
    renderExportModals({ isAuthenticated: false });

    act(() => {
      emit(CAD_EVENTS.SAVE_AS, {
        currentFileName: 'drawing.dwg',
        mxwebBlob: new Blob(['m']),
        personalSpaceId: null,
      });
    });
    expect(screen.getByText('选择下载格式')).toBeInTheDocument();

    fireEvent.click(screen.getByText('下载'));
    await waitFor(() => {
      expect(publicFileControllerConvertAndDownload).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { fileHash: 'mock-hash', format: 'mxweb', params: {} },
        })
      );
    });
    await waitFor(() => {
      expect(triggerBlobDownload).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith('文件已保存到本地', 'success');
    });
  });

  it('ref 命令 openExtRefDownload 打开外部参照格式弹窗并下载', async () => {
    const ref = createRef<ExportModalsHandle>();
    render(<ExportModals ref={ref} fileId="file-1" />);

    const extRefFile: ExternalReferenceFile = {
      name: 'ref.dwg',
      type: 'ref',
      uploadState: 'notSelected',
      progress: 0,
    };
    act(() => {
      ref.current?.openExtRefDownload(extRefFile);
    });
    expect(screen.getByText('选择下载格式')).toBeInTheDocument();

    fireEvent.click(screen.getByText('下载'));
    await waitFor(() => {
      expect(
        mxcadFileAccessControllerGetFileDownloadExternalRef
      ).toHaveBeenCalledWith({
        path: { nodeId: 'file-1', fileName: 'ref.dwg' },
        query: { format: 'mxweb' },
      });
    });
  });
});
