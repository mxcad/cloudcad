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

// 单格式非阻塞转换下载入口：CAD 编辑器导出（内存 blob 上传后按 hash 建任务）走 createFileHashTask；
// createSingleFormatTask（nodeId 制）保留供渲染树其他消费方
const {
  createSingleFormatTaskMock,
  createFileHashTaskMock,
} = vi.hoisted(() => ({
  createSingleFormatTaskMock: vi.fn().mockResolvedValue('task-1'),
  createFileHashTaskMock: vi.fn().mockResolvedValue('task-1'),
}));
vi.mock('@/hooks/file-system', () => ({
  useBatchDownload: () => ({
    createSingleFormatTask: createSingleFormatTaskMock,
    createFileHashTask: createFileHashTaskMock,
  }),
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
  // 缺这个键会让 useExportModals 拿到 undefined，另存为成功路径一调用就抛错
  signalShareChainCloudNodeCreated: vi.fn().mockReturnValue(false),
  // 另存为成功后刷新编辑器标题（分享图纸接管会话路径会调用）
  refreshFileName: vi.fn(),
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
      targetType?: 'personal' | 'project' | 'library';
      libraryType?: 'drawing' | 'block';
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
        <button
          data-testid="save-as-success-library"
          onClick={() =>
            onSuccess?.({
              nodeId: 'lib-1',
              fileName: 'saved.dwg',
              path: '/p',
              parentId: 'lib-parent',
              targetType: 'library',
              libraryType: 'drawing',
            })
          }
        >
          success-library
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
import { uploadFile } from '@/utils/mxcadUploadUtils';
import { saveAsFileDialog } from 'mxcad';
import { emit, clearDrawingSessionListeners } from '@/services/drawingSession';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
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
        throwOnError: true,
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

  it('EXPORT_PDF 打开 PDF 导出弹窗，导出上传 blob 后建非阻塞转换任务', async () => {
    renderExportModals();

    act(() => {
      emit(CAD_EVENTS.EXPORT_PDF, {
        fileName: 'drawing.dwg',
        blob: new Blob(['pdf']),
      });
    });
    expect(screen.getByText('导出 PDF')).toBeInTheDocument();

    fireEvent.click(screen.getByText('导出'));
    // 上传（skipDb，不落 DB 节点）
    await waitFor(() => {
      expect(uploadFile).toHaveBeenCalledWith(
        expect.objectContaining({ skipDb: true, forceUpload: true })
      );
    });
    // 按 hash 建非阻塞转换任务（SSE 终态自动下载）
    await waitFor(() => {
      expect(createFileHashTaskMock).toHaveBeenCalledWith(
        'mock-hash',
        'drawing.dwg',
        'pdf',
        { width: '2000', height: '2000', colorPolicy: 'mono' }
      );
    });
    // 非阻塞：不触发原生保存对话框
    expect(saveAsFileDialog).not.toHaveBeenCalled();
    // 点导出立即关闭弹框
    await waitFor(() => {
      expect(screen.queryByText('导出 PDF')).toBeNull();
    });
  });

  it('EXPORT_DWG 打开 DWG 导出弹窗，导出上传 blob 后建非阻塞转换任务', async () => {
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
      expect(createFileHashTaskMock).toHaveBeenCalledWith(
        'mock-hash',
        'drawing.dwg',
        'dwg',
        { dwgVersion: 23 }
      );
    });
    // 非阻塞：不触发原生保存对话框
    expect(saveAsFileDialog).not.toHaveBeenCalled();
    // 点导出立即关闭弹框
    await waitFor(() => {
      expect(screen.queryByText('导出 DWG')).toBeNull();
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

  describe('另存为成功：会话接管与「打开新图纸」URL', () => {
    beforeEach(() => {
      // 分享图纸会话：store 顶层 fromShare 是接管判据（不是 currentFileInfo.fromShare）
      useCADEditorStore.setState({
        fromShare: true,
        currentFileId: 'share-node',
        currentFileName: 'plan.dwg.mxweb',
        currentFileInfo: {
          fileId: 'share-node',
          parentId: null,
          projectId: null,
          name: 'plan.dwg.mxweb',
          fromShare: true,
        },
      });
      showConfirmMock.mockResolvedValue(false); // 默认用户点「关闭」，只看会话副作用
    });

    const openSaveAsModal = () => {
      act(() => {
        emit(CAD_EVENTS.SAVE_AS, {
          currentFileName: 'plan.dwg.mxweb',
          mxwebBlob: new Blob(['m']),
          personalSpaceId: 'ps-1',
        });
      });
      return screen.getByTestId('save-as-modal');
    };

    it('分享图纸另存为成功 → 会话切到新节点并退出分享模式（回归：每点一次保存就多一份副本）', async () => {
      renderExportModals({ isAuthenticated: true });
      openSaveAsModal();

      await act(async () => {
        fireEvent.click(screen.getByTestId('save-as-success'));
      });

      const state = useCADEditorStore.getState();
      // fromShare 是 store 顶层字段（patchSession 把它从 infoPatch 里摘出来单独写），
      // 协同面板的 fetchWorks/名称解析都以它为准
      expect(state.fromShare).toBe(false);
      expect(state.currentFileId).toBe('new-1');
      expect(state.currentFileName).toBe('saved.dwg');
      expect(state.currentFileInfo?.fileId).toBe('new-1');
      // 地址栏同步切到新节点，且不再带 shareToken（否则刷新跳回分享者图纸）
      expect(window.location.pathname).toBe('/cad-editor/new-1');
      expect(window.location.search).toBe('?nodeId=parent-1');
    });

    it('非分享图纸另存为成功 → 会话保持原图（另存为只是存副本）', async () => {
      useCADEditorStore.setState({ fromShare: false });
      renderExportModals({ isAuthenticated: true });
      openSaveAsModal();

      await act(async () => {
        fireEvent.click(screen.getByTestId('save-as-success'));
      });

      const state = useCADEditorStore.getState();
      expect(state.currentFileId).toBe('share-node');
      expect(state.currentFileName).toBe('plan.dwg.mxweb');
    });

    it('「打开新图纸」URL 走唯一出口：普通落点带 nodeId', async () => {
      // 非分享图纸才走「提示 → 新标签页」这条线（分享图纸会接管会话并跳过提示）
      useCADEditorStore.setState({ fromShare: false });
      showConfirmMock.mockResolvedValue(true);
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      renderExportModals({ isAuthenticated: true });
      openSaveAsModal();

      await act(async () => {
        fireEvent.click(screen.getByTestId('save-as-success'));
      });

      expect(openSpy).toHaveBeenCalledWith(
        '/cad-editor/new-1?nodeId=parent-1',
        '_blank'
      );
      openSpy.mockRestore();
    });

    it('「打开新图纸」URL 带 library（回归：库节点被当普通节点查询而打开失败）', async () => {
      useCADEditorStore.setState({ fromShare: false });
      showConfirmMock.mockResolvedValue(true);
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      renderExportModals({ isAuthenticated: true });
      openSaveAsModal();

      await act(async () => {
        fireEvent.click(screen.getByTestId('save-as-success-library'));
      });

      expect(openSpy).toHaveBeenCalledWith(
        '/cad-editor/lib-1?library=drawing',
        '_blank'
      );
      openSpy.mockRestore();
    });

    it('分享图纸另存为成功后不再弹「打开新图纸」（回归：保存完像被重开一次）', async () => {
      renderExportModals({ isAuthenticated: true });
      openSaveAsModal();

      await act(async () => {
        fireEvent.click(screen.getByTestId('save-as-success'));
      });

      expect(showConfirmMock).not.toHaveBeenCalled();
    });
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
        throwOnError: true,
        path: { nodeId: 'file-1', fileName: 'ref.dwg' },
        query: { format: 'mxweb' },
      });
    });
  });
});
