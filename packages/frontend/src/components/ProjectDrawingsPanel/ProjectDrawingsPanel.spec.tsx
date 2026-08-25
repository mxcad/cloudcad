///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

// ── 稳定 mock：工厂内引用 hoisted 常量，避免每次 render 产生新引用
//    导致 useEffect 依赖变化 → 无限重渲染（真实 useCallback 是稳定的） ──

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authMock,
}));
vi.mock('@/contexts/RuntimeConfigContext', () => ({
  useRuntimeConfig: () => runtimeConfigMock,
}));
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => permissionMock,
}));
vi.mock('@/hooks/useProjectPermissions', () => ({
  useProjectPermissions: () => projectPermissionsMock,
}));
vi.mock('@/contexts/NotificationContext', () => ({
  useConfirmDialog: () => confirmDialogMock,
  useNotification: () => notificationMock,
}));
vi.mock('@/languages', () => ({ t: (m: string) => m }));
vi.mock('@/api-sdk', () => ({
  projectControllerGetProjects: projectControllerGetProjectsMock,
  nodeControllerGetNode: nodeControllerGetNodeMock,
  nodeControllerUpdateNode: nodeControllerUpdateNodeMock,
  nodeControllerMoveNode: nodeControllerMoveNodeMock,
  nodeControllerCopyNode: nodeControllerCopyNodeMock,
  nodeControllerDeleteNode: nodeControllerDeleteNodeMock,
}));
vi.mock('@/hooks/file-system', () => ({
  useFileSystemUI: () => fileSystemUIMock,
  useFileSystemCRUD: () => crudMock,
  useFileSystemNavigation: () => navigationMock,
  useSelectionShortcuts: () => {},
  useMoveCopyOrchestrator: () => moveCopyOrchestratorMock,
  buildMoveAction: buildMoveActionMock,
  buildCopyAction: buildCopyActionMock,
  getCreatedNodeId: getCreatedNodeIdMock,
}));
vi.mock('@/hooks/library/useLibraryOperations', () => ({
  useLibraryOperations: () => libraryOperationsMock,
}));
vi.mock('@/hooks/useProjectManagement', () => ({
  useProjectManagement: () => projectManagementMock,
}));
vi.mock('@/hooks/useVersionHistory', () => ({
  useVersionHistory: () => versionHistoryMock,
}));
vi.mock('@/hooks/common/useSelectionShortcuts', () => ({
  useSelectionShortcuts: () => {},
}));
vi.mock('@/stores/useBatchDownloadStore', () => ({
  useBatchDownloadStore: batchDownloadStoreMock,
}));
vi.mock('@/hooks/file-browser', () => ({
  useLibraryLoader: () => libraryLoaderMock,
  useFileBrowserSelection: () => selectionCoreMock,
  useFileBrowserActions: () => fileBrowserActionsMock,
  useFileBrowserModals: () => modalsCoreMock,
}));
vi.mock('./hooks/useLibraryCategories', () => ({
  useLibraryCategories: () => libraryCategoriesMock,
}));
vi.mock('./components/ProjectListView', () => ({
  ProjectListView: () => <div data-testid="mock-project-list" />,
}));
vi.mock('./components/ProjectPanelView', () => ({
  ProjectPanelView: () => <div data-testid="mock-panel-view" />,
}));
vi.mock('./components/BatchActionBar', () => ({
  BatchActionBar: () => <div data-testid="mock-batch-bar" />,
}));
vi.mock('./components/ProjectPanelModals', () => ({
  ProjectPanelModals: () => <div data-testid="mock-modals" />,
}));

const authMock = vi.hoisted(() => ({ user: null }));
const runtimeConfigMock = vi.hoisted(() => ({
  config: { batchDownloadEnabled: false },
}));
const permissionMock = vi.hoisted(() => ({ hasPermission: () => false }));
const projectPermissionsMock = vi.hoisted(() => ({ permissions: {} }));
const confirmDialogMock = vi.hoisted(() => ({
  showConfirm: vi.fn().mockResolvedValue(false),
}));
const notificationMock = vi.hoisted(() => ({
  showToast: vi.fn(),
}));
const projectControllerGetProjectsMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ data: { nodes: [] } }))
);
const nodeControllerGetNodeMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ data: null }))
);
const nodeControllerUpdateNodeMock = vi.hoisted(() => vi.fn());
const nodeControllerMoveNodeMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve(undefined))
);
const nodeControllerCopyNodeMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ data: { id: 'x' } }))
);
const nodeControllerDeleteNodeMock = vi.hoisted(() => vi.fn());
const fileSystemUIMock = vi.hoisted(() => ({
  showToast: vi.fn(),
}));
const crudMock = vi.hoisted(() => ({
  showRenameModal: false,
  setShowRenameModal: vi.fn(),
  editingNode: null,
  setEditingNode: vi.fn(),
  folderName: '',
  setFolderName: vi.fn(),
  handleRename: vi.fn(),
  handleDelete: vi.fn(),
  handleOpenRename: vi.fn(),
}));
const navigationMock = vi.hoisted(() => ({
  handleDownload: vi.fn(),
  handleDownloadWithFormat: vi.fn(),
  showDownloadFormatModal: false,
  setShowDownloadFormatModal: vi.fn(),
  downloadingNode: null,
  setDownloadingNode: vi.fn(),
}));
const buildMoveActionMock = vi.hoisted(() => vi.fn());
const buildCopyActionMock = vi.hoisted(() => vi.fn());
const getCreatedNodeIdMock = vi.hoisted(() => () => '');
const moveCopyOrchestratorMock = vi.hoisted(() => ({
  move: vi.fn(),
  copy: vi.fn(),
  handleDragStart: vi.fn(),
  handleDragOver: vi.fn(),
  handleDragLeave: vi.fn(),
  handleDrop: vi.fn(),
}));
const libraryOperationsMock = vi.hoisted(() => ({
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
}));
const projectManagementMock = vi.hoisted(() => ({
  isModalOpen: false,
  editingProject: null,
  formData: { name: '', description: '' },
  loading: false,
  openCreateModal: vi.fn(),
  openEditModal: vi.fn(),
  closeModal: vi.fn(),
  setFormData: vi.fn(),
  handleUpdate: vi.fn(),
}));
const versionHistoryMock = vi.hoisted(() => ({
  showVersionHistoryModal: false,
  setShowVersionHistoryModal: vi.fn(),
  versionHistoryNode: null,
  versionHistoryEntries: [],
  versionHistoryTotal: 0,
  versionHistoryLoading: false,
  versionHistoryError: null,
  handleShowVersionHistory: vi.fn(),
  handleOpenHistoricalVersion: vi.fn(),
  closeVersionHistory: vi.fn(),
}));
const batchDownloadStoreMock = vi.hoisted(() => ({
  getState: () => ({ openDialog: vi.fn() }),
}));
const libraryLoaderMock = vi.hoisted(() => ({
  nodes: [],
  loading: false,
  isFetching: false,
  error: null,
  libraryRootId: null,
  currentPage: 1,
  setCurrentPage: vi.fn(),
  total: 0,
  totalPages: 1,
  hasMore: false,
  load: vi.fn(),
  loadNodesRef: { current: vi.fn() },
  buildBreadcrumbPathRef: { current: vi.fn() },
  reset: vi.fn(),
  removeLocalNode: vi.fn(),
  updateLocalNode: vi.fn(),
  checkSkipVisibilityReload: () => false,
}));
const selectionCoreMock = vi.hoisted(() => ({
  selectedNodes: new Set(),
  handleNodeSelect: vi.fn(),
  handleSelectAll: vi.fn(),
  clearSelection: vi.fn(),
  selectMany: vi.fn(),
  isBatchMode: false,
  setBatchMode: vi.fn(),
  canBatch: false,
  selectionVisible: false,
  selectedNodesArray: [],
}));
const fileBrowserActionsMock = vi.hoisted(() => ({
  clipboard: {
    items: [],
    mode: null,
    canPaste: false,
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
  },
  dragDrop: {
    handleDragStart: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragLeave: vi.fn(),
    handleDrop: vi.fn(),
  },
  dropTargetId: null,
  move: vi.fn(),
  copy: vi.fn(),
  showRenameModal: false,
  setShowRenameModal: vi.fn(),
  editingNode: null,
  setEditingNode: vi.fn(),
  folderName: '',
  setFolderName: vi.fn(),
  handleRename: vi.fn(),
  handleDelete: vi.fn(),
  handleOpenRename: vi.fn(),
  restore: undefined,
  batchRestore: undefined,
  clearTrash: undefined,
  handleOpen: vi.fn(),
}));
const modalsCoreMock = vi.hoisted(() => ({
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
  state: { activeId: null, payload: null, forms: {} },
  open: vi.fn(),
  close: vi.fn(),
  closeAll: vi.fn(),
  setForm: vi.fn(),
  isOpen: vi.fn(() => false),
}));
const libraryCategoriesMock = vi.hoisted(() => ({
  libraryRootId: 'root-1',
  categories: [
    { level: 0, items: [{ id: 'all', name: '全部' }] },
    { level: 1, items: [{ id: 'all', name: '全部' }] },
    { level: 2, items: [{ id: 'all', name: '全部' }] },
  ],
  categoriesLoaded: true,
  selectedCategoryPath: ['all'],
  setSelectedCategoryPath: vi.fn(),
  handleCategorySelect: vi.fn(),
  refreshCategories: vi.fn(),
  listInitializedRef: { current: true },
}));

import { ProjectDrawingsPanel } from './index';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('ProjectDrawingsPanel — 4 种模式渲染 smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const onDrawingOpen = vi.fn();
  const wrapper = createWrapper();

  it('项目模式（默认 props）渲染不抛错', async () => {
    render(
      <ProjectDrawingsPanel
        projectId="proj-1"
        onDrawingOpen={onDrawingOpen}
        visible={true}
      />,
      { wrapper }
    );
    // 项目模式（未选中项目）渲染项目列表视图
    expect(screen.getByTestId('mock-project-list')).toBeTruthy();
    // flush 异步 effect（项目列表/权限加载等）的状态更新
    await act(async () => {});
  });

  it('私人空间模式（isPersonalSpace）渲染不抛错', async () => {
    render(
      <ProjectDrawingsPanel
        projectId="ps-1"
        isPersonalSpace={true}
        onDrawingOpen={onDrawingOpen}
        visible={true}
      />,
      { wrapper }
    );
    expect(screen.getByTestId('mock-panel-view')).toBeTruthy();
    await act(async () => {});
  });

  it('图纸库模式（libraryType=drawing）渲染不抛错', async () => {
    render(
      <ProjectDrawingsPanel
        libraryType="drawing"
        onDrawingOpen={onDrawingOpen}
        visible={true}
      />,
      { wrapper }
    );
    expect(screen.getByTestId('mock-panel-view')).toBeTruthy();
    await act(async () => {});
  });

  it('图块库模式（libraryType=block）渲染不抛错', async () => {
    render(
      <ProjectDrawingsPanel
        libraryType="block"
        onDrawingOpen={onDrawingOpen}
        visible={true}
      />,
      { wrapper }
    );
    expect(screen.getByTestId('mock-panel-view')).toBeTruthy();
    await act(async () => {});
  });
});
