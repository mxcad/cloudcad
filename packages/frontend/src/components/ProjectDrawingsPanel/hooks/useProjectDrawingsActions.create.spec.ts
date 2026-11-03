///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useProjectDrawingsActions } from './useProjectDrawingsActions';
import type { FileSystemNode } from '@/types/filesystem';

// ── 可控 mock：useProjectManagement 的 handleCreate/handleUpdate/editingProject ──
const projectManagementMock = vi.hoisted(() => ({
  editingProject: null as FileSystemNode | null,
  handleCreate: vi.fn(),
  handleUpdate: vi.fn(),
  isModalOpen: false,
  formData: { name: '', description: '' },
  loading: false,
  openCreateModal: vi.fn(),
  openEditModal: vi.fn(),
  closeModal: vi.fn(),
  setFormData: vi.fn(),
}));

const projectControllerCreateProjectMock = vi.hoisted(() => vi.fn());
const nodeControllerUpdateNodeMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useProjectManagement', () => ({
  useProjectManagement: () => projectManagementMock,
}));
vi.mock('@/api-sdk', () => ({
  projectControllerCreateProject: projectControllerCreateProjectMock,
  nodeControllerUpdateNode: nodeControllerUpdateNodeMock,
}));
vi.mock('@/hooks/useConfirmAction', () => ({
  useConfirmAction: () => vi.fn(),
}));
vi.mock('@/hooks/file-system', () => ({
  useFileSystemNavigation: () => ({
    handleDownload: vi.fn(),
    handleDownloadWithFormat: vi.fn(),
    showDownloadFormatModal: false,
    setShowDownloadFormatModal: vi.fn(),
    downloadingNode: null,
    setDownloadingNode: vi.fn(),
  }),
}));
vi.mock('@/hooks/library/useLibraryOperations', () => ({
  useLibraryOperations: () => ({
    handleCreateFolder: vi.fn(),
    handleDownload: vi.fn(),
    handleDownloadWithFormat: vi.fn(),
    handleDelete: vi.fn(),
    handleRename: vi.fn(),
    handleMove: vi.fn(),
    handleCopy: vi.fn(),
    handleBatchDelete: vi.fn(),
    handleBatchMove: vi.fn(),
    handleBatchCopy: vi.fn(),
  }),
}));
vi.mock('./useProjectDrawingsBatch', () => ({
  useProjectDrawingsBatch: () => ({
    selectedCount: 0,
    canBatch: false,
    batchVisible: false,
    handleBatchDelete: vi.fn(),
    handleBatchMove: vi.fn(),
    handleBatchCopy: vi.fn(),
    handleBatchDownload: vi.fn(),
    cancelBatchBar: vi.fn(),
    handleSelectMany: vi.fn(),
  }),
}));
vi.mock('@/languages', () => ({ t: (m: string) => m }));

const dataMock = {
  selectedProjectId: null,
  refreshNodes: vi.fn(),
  currentNode: null,
  removeLocalNode: vi.fn(),
  updateLocalNode: vi.fn(),
  isPersonalSpace: false,
  isLibraryMode: false,
  libraryType: undefined,
  undoProjectId: null,
  pushAction: vi.fn(),
  showToast: vi.fn(),
} as never;

const fileBrowserMock = {
  showRenameModal: false,
  setShowRenameModal: vi.fn(),
  editingNode: null,
  setEditingNode: vi.fn(),
  folderName: '',
  setFolderName: vi.fn(),
  handleRename: vi.fn(),
  handleDelete: vi.fn(),
  handleOpenRename: vi.fn(),
} as never;

const modalsMock = {
  showSelectFolderModal: false,
  moveSourceNode: null,
  copySourceNode: null,
  setShowSelectFolderModal: vi.fn(),
  setMoveSourceNode: vi.fn(),
  setCopySourceNode: vi.fn(),
  handleMove: vi.fn(),
  handleCopy: vi.fn(),
  handleConfirmMoveOrCopy: vi.fn(),
  closeSelectFolder: vi.fn(),
  selectFolderNodeId: '',
  selectFolderConfirmText: '',
  showBatchSelectFolderModal: false,
  handleBatchMove: vi.fn(),
  handleBatchCopy: vi.fn(),
  handleConfirmBatchMoveOrCopy: vi.fn(),
  handleCloseBatchSelectFolder: vi.fn(),
} as never;

function renderActions() {
  return renderHook(() =>
    useProjectDrawingsActions({
      data: dataMock,
      fileBrowser: fileBrowserMock,
      modals: modalsMock,
    })
  );
}

const preventDefault = vi.fn();

describe('useProjectDrawingsActions — 项目提交（BUG-PROJ-01 创建分支）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectManagementMock.editingProject = null;
    // 真实 useProjectManagement.handleCreate 会调用传入的 createFn；
    // 这里模拟同样的语义，让 createFn 真正执行并触发 SDK 调用
    projectManagementMock.handleCreate.mockImplementation(
      (createFn: (...args: never[]) => void) => {
        createFn('测试项目', '', {});
      }
    );
    projectManagementMock.handleUpdate.mockImplementation(
      (updateFn: (...args: never[]) => void) => {
        updateFn('proj-1', { name: '新名字', description: '描述' });
      }
    );
  });

  it('新建模式（editingProject 为 null）调用创建接口，不调用更新接口', () => {
    const { result } = renderActions();
    result.current.handleSubmitProject({ preventDefault } as never);
    expect(preventDefault).toHaveBeenCalled();
    expect(projectManagementMock.handleCreate).toHaveBeenCalledTimes(1);
    expect(projectManagementMock.handleUpdate).not.toHaveBeenCalled();
    expect(projectControllerCreateProjectMock).toHaveBeenCalledTimes(1);
    expect(projectControllerCreateProjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ name: '测试项目' }),
        throwOnError: true,
      })
    );
  });

  it('编辑模式（editingProject 非空）调用更新接口，不调用创建接口', () => {
    projectManagementMock.editingProject = { id: 'proj-1' } as FileSystemNode;
    const { result } = renderActions();
    result.current.handleSubmitProject({ preventDefault } as never);
    expect(projectManagementMock.handleCreate).not.toHaveBeenCalled();
    expect(projectManagementMock.handleUpdate).toHaveBeenCalledTimes(1);
    expect(nodeControllerUpdateNodeMock).toHaveBeenCalledTimes(1);
  });
});
