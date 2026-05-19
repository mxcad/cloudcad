///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useParams, useSearchParams } from 'react-router-dom';
import { FileSystemManager } from './FileSystemManager';
import { useFileSystem } from '@/hooks/file-system';
import { useProjectManagement } from '@/hooks/useProjectManagement';
import { useAuth } from '@/contexts/AuthContext';
import { useFileSystemStore } from '@/stores/fileSystemStore';

// Mock dependencies
vi.mock('@/hooks/file-system');
vi.mock('@/hooks/useProjectManagement');
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/stores/fileSystemStore');
vi.mock('@/components/MxCadUploader', () => ({
  default: vi.fn(() => null),
  MxCadUploaderRef: {},
}));
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
  Button: ({
    children,
    ...props
  }: { children?: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock('@/components/ui/Modal', () => ({
  Modal: ({
    children,
    isOpen,
    ...props
  }: { children?: React.ReactNode; isOpen?: boolean } & React.HTMLAttributes<HTMLDivElement>) =>
    isOpen ? <div {...props}>{children}</div> : null,
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
    vi.mocked(useParams).mockReturnValue({ projectId: undefined });

    // Mock useAuth
    vi.mocked(useAuth).mockReturnValue({
      user: { id: '1', email: null, username: 'testuser', role: { name: 'USER' as const }, status: 'ACTIVE' as const },
      token: 'mock-token',
      login: vi.fn(),
      loginByPhone: vi.fn(),
      loginWithWechat: vi.fn(),
      register: vi.fn(),
      verifyEmailAndLogin: vi.fn(),
      verifyPhoneAndLogin: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      loading: false,
      isAuthenticated: true,
      error: null,
      setError: vi.fn(),
    });

    // Mock useFileSystemStore
    vi.mocked(useFileSystemStore).mockReturnValue({
      personalSpaceId: null,
      personalSpaceIdLoading: false,
      setPersonalSpaceId: vi.fn(),
      setPersonalSpaceIdLoading: vi.fn(),
    });

    // Mock useFileSystem
    vi.mocked(useFileSystem).mockReturnValue({
      nodes: [],
      currentNode: null,
      breadcrumbs: [],
      loading: false,
      error: null,
      searchTerm: '',
      setSearchTerm: vi.fn(),
      handleSearchSubmit: vi.fn(),
      pagination: { page: 1, limit: 20 },
      setPagination: vi.fn(),
      viewMode: 'grid',
      setViewMode: vi.fn(),
      selectedNodes: new Set(),
      isMultiSelectMode: false,
      setIsMultiSelectMode: vi.fn(),
      toasts: [],
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
      loadCurrentNode: vi.fn(),
      loadChildren: vi.fn(),
      buildBreadcrumbs: vi.fn(),
      handleRefresh: vi.fn(),
      handleGoBack: vi.fn(),
      handleNodeSelect: vi.fn(),
      handleSelectAll: vi.fn(),
      handleCreateFolder: vi.fn(),
      handleRename: vi.fn(),
      handleDelete: vi.fn(),
      handlePermanentlyDelete: vi.fn(),
      handleBatchDelete: vi.fn(),
      handleBatchRestore: vi.fn(),
      handleEnterFolder: vi.fn(),
      handleFileOpen: vi.fn(),
      handleDownload: vi.fn(),
      handleDownloadWithFormat: vi.fn(),
      handleOpenRename: vi.fn(),
      handleCreateProject: vi.fn(),
      handleUpdateProject: vi.fn(),
      draggedNodes: [],
      setDraggedNodes: vi.fn(),
      dropTargetId: null,
      setDropTargetId: vi.fn(),
      paginationMeta: { total: 0, page: 1, limit: 20, totalPages: 1 },
      handlePageChange: vi.fn(),
      handlePageSizeChange: vi.fn(),
      handleDeleteProject: vi.fn(),
      handlePermanentlyDeleteProject: vi.fn(),
      handleEnterProject: vi.fn(),
      handleShowMembers: vi.fn(),
      isTrashView: false,
      setIsTrashView: vi.fn(),
      handleToggleTrashView: vi.fn(),
      handleRestoreNode: vi.fn(),
      handleClearProjectTrash: vi.fn(),
      handleClearTrash: vi.fn(),
      isProjectTrashView: false,
      setIsProjectTrashView: vi.fn(),
      handleToggleProjectTrashView: vi.fn(),
    });

    // Mock useProjectManagement
    vi.mocked(useProjectManagement).mockReturnValue({
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
      handleDelete: vi.fn(),
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
