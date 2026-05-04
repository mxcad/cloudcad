///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useParams, useSearchParams } from 'react-router-dom';
import { FileSystemManager } from './FileSystemManager';
import { projectApi } from '@/services/projectApi';
import { nodeApi } from '@/services/nodeApi';
import { versionControlApi } from '@/services/versionControlApi';
import { useFileSystem } from '@/hooks/file-system';
import { useProjectManagement } from '@/hooks/useProjectManagement';
import { useAuth } from '@/contexts/AuthContext';
import { useFileSystemStore } from '@/stores/fileSystemStore';

// Mock dependencies
vi.mock('@/services/projectApi');
vi.mock('@/services/nodeApi');
vi.mock('@/services/versionControlApi');
vi.mock('@/hooks/file-system');
vi.mock('@/hooks/useProjectManagement');
vi.mock('@/contexts/AuthContext');
vi.mock('@/stores/fileSystemStore');
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: vi.fn(),
    useLocation: vi.fn(() => ({ pathname: '/projects' })),
    useSearchParams: vi.fn(() => [new URLSearchParams(), vi.fn()]),
    useNavigate: vi.fn(() => vi.fn()),
  };
});

// Mock components
vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock('@/components/ui/Modal', () => ({
  Modal: ({ children, isOpen, ...props }: any) =>
    isOpen ? <div {...props}>{children}</div> : null,
}));
vi.mock('@/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: ({ children, isOpen, ...props }: any) =>
    isOpen ? <div {...props}>{children}</div> : null,
}));
vi.mock('@/components/MxCadUploader', () => ({
  default: ({ ...props }: any) => <div {...props} />,
}));
vi.mock('@/components/BreadcrumbNavigation', () => ({
  BreadcrumbNavigation: () => <div>Breadcrumb</div>,
}));
vi.mock('@/components/FileItem', () => ({
  FileItem: () => <div>FileItem</div>,
}));
vi.mock('@/pages/components', () => ({
  FileSystemToolbar: () => <div>Toolbar</div>,
  BatchActionsBar: () => <div>BatchActions</div>,
  ProjectFilterTabs: () => <div>FilterTabs</div>,
}));
vi.mock('@/components/modals/CreateFolderModal', () => ({
  CreateFolderModal: () => <div>CreateFolderModal</div>,
}));
vi.mock('@/components/modals/RenameModal', () => ({
  RenameModal: () => <div>RenameModal</div>,
}));
vi.mock('@/components/modals/ProjectModal', () => ({
  ProjectModal: () => <div>ProjectModal</div>,
}));
vi.mock('@/components/modals/MembersModal', () => ({
  MembersModal: () => <div>MembersModal</div>,
}));
vi.mock('@/components/modals/ProjectRolesModal', () => ({
  ProjectRolesModal: () => <div>ProjectRolesModal</div>,
}));
vi.mock('@/components/modals/SelectFolderModal', () => ({
  SelectFolderModal: () => <div>SelectFolderModal</div>,
}));
vi.mock('@/components/KeyboardShortcuts', () => ({
  KeyboardShortcuts: () => <div>KeyboardShortcuts</div>,
}));
vi.mock('@/components/modals/DownloadFormatModal', () => ({
  DownloadFormatModal: () => <div>DownloadFormatModal</div>,
}));
vi.mock('@/components/modals/VersionHistoryModal', () => ({
  VersionHistoryModal: () => <div>VersionHistoryModal</div>,
}));

describe('FileSystemManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock useParams
    (useParams as any).mockReturnValue({ projectId: undefined });

    // Mock useAuth
    (useAuth as any).mockReturnValue({
      user: { id: '1', email: 'test@test.com' },
    });

    // Mock useFileSystemStore
    (useFileSystemStore as any).mockReturnValue({
      personalSpaceId: null,
      personalSpaceIdLoading: false,
      setPersonalSpaceId: vi.fn(),
      setPersonalSpaceIdLoading: vi.fn(),
    });

    // Mock useFileSystem
    (useFileSystem as any).mockReturnValue({
      nodes: [],
      currentNode: null,
      breadcrumbs: [],
      loading: false,
      error: null,
      searchTerm: '',
      setSearchTerm: vi.fn(),
      handleSearchSubmit: vi.fn(),
      viewMode: 'grid',
      setViewMode: vi.fn(),
      selectedNodes: new Set(),
      isMultiSelectMode: false,
      setIsMultiSelectMode: vi.fn(),
      toasts: [],
      confirmDialog: { isOpen: false },
      showToast: vi.fn(),
      isProjectRootMode: true,
      isFolderMode: false,
      isPersonalSpaceMode: false,
      urlProjectId: undefined,
      urlNodeId: undefined,
      showCreateFolderModal: false,
      showRenameModal: false,
      showDownloadFormatModal: false,
      folderName: '',
      setFolderName: vi.fn(),
      editingNode: null,
      downloadingNode: null,
      setShowCreateFolderModal: vi.fn(),
      setShowRenameModal: vi.fn(),
      setShowDownloadFormatModal: vi.fn(),
      setEditingNode: vi.fn(),
      setDownloadingNode: vi.fn(),
      removeToast: vi.fn(),
      closeConfirm: vi.fn(),
      handleRefresh: vi.fn(),
      handleGoBack: vi.fn(),
      handleNodeSelect: vi.fn(),
      handleSelectAll: vi.fn(),
      handleCreateFolder: vi.fn(),
      handleRename: vi.fn(),
      handleDelete: vi.fn(),
      handlePermanentlyDelete: vi.fn(),
      handleBatchDelete: vi.fn(),
      handleFileOpen: vi.fn(),
      handleDownload: vi.fn(),
      handleDownloadWithFormat: vi.fn(),
      handleOpenRename: vi.fn(),
      draggedNodes: [],
      setDraggedNodes: vi.fn(),
      dropTargetId: null,
      setDropTargetId: vi.fn(),
      paginationMeta: { total: 0, page: 1, limit: 20, totalPages: 1 },
      handlePageChange: vi.fn(),
      handlePageSizeChange: vi.fn(),
      handleDeleteProject: vi.fn(),
      handlePermanentlyDeleteProject: vi.fn(),
      isTrashView: false,
      setIsTrashView: vi.fn(),
      handleToggleTrashView: vi.fn(),
      handleRestoreNode: vi.fn(),
      handleClearProjectTrash: vi.fn(),
      handleBatchRestore: vi.fn(),
      isProjectTrashView: false,
      handleToggleProjectTrashView: vi.fn(),
      handleClearTrash: vi.fn(),
    });

    // Mock useProjectManagement
    (useProjectManagement as any).mockReturnValue({
      isModalOpen: false,
      editingProject: null,
      setEditingProject: vi.fn(),
      formData: { name: '', description: '' },
      loading: false,
      openCreateModal: vi.fn(),
      openEditModal: vi.fn(),
      closeModal: vi.fn(),
      setFormData: vi.fn(),
      handleCreate: vi.fn(),
      handleUpdate: vi.fn(),
      deleteConfirmOpen: false,
      projectToDelete: null,
      confirmDelete: vi.fn(),
      cancelDelete: vi.fn(),
    });
  });

  it('should render without crashing in project mode', () => {
    render(
      <MemoryRouter>
        <FileSystemManager mode="project" />
      </MemoryRouter>
    );

    expect(screen.getByText('Breadcrumb')).toBeInTheDocument();
    expect(screen.getByText('Toolbar')).toBeInTheDocument();
    expect(screen.getByText('FilterTabs')).toBeInTheDocument();
  });

  it('should render without crashing in personal-space mode', () => {
    render(
      <MemoryRouter>
        <FileSystemManager mode="personal-space" />
      </MemoryRouter>
    );

    expect(screen.getByText('Breadcrumb')).toBeInTheDocument();
    expect(screen.getByText('Toolbar')).toBeInTheDocument();
  });
});
