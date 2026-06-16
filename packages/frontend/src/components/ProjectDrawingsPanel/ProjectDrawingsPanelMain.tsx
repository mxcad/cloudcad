///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

/**
 * ProjectDrawingsPanel - 统一的文件面板组件
 *
 * 支持四种模式：
 * - 项目模式 (默认): 显示项目列表和项目图纸
 * - 私人空间模式 (isPersonalSpace): 显示私人图纸
 * - 图纸库模式 (libraryType='drawing'): 显示公共图纸库
 * - 图块库模式 (libraryType='block'): 显示公共图块库
 */

import React, {
  useState, useMemo, useEffect, useCallback, useRef,
} from 'react';
import { RefreshCw } from 'lucide-react';
import { MxFun } from 'mxdraw';
import {
  fileSystemControllerGetProjects,
  fileSystemControllerGetNode,
  fileSystemControllerUpdateNode,
  fileSystemControllerMoveNode,
  fileSystemControllerCopyNode,
  fileSystemControllerDeleteNode,
} from '@/api-sdk';
import { ResourceList, ResourceItem, ViewMode } from '@/components/common';
import { FileSystemNode, toFileSystemNode } from '@/types/filesystem';
import { useProjectPermissions } from '@/hooks/useProjectPermissions';
import { useAuth } from '@/contexts/AuthContext';
import { SystemPermission } from '@/constants/permissions';
import { usePermission } from '@/hooks/usePermission';
import { useFileSystemUI } from '@/hooks/file-system/useFileSystemUI';
import { useFileSystemCRUD } from '@/hooks/file-system/useFileSystemCRUD';
import { useFileSystemNavigation } from '@/hooks/file-system/useFileSystemNavigation';
import { useLibraryOperations } from '@/hooks/library/useLibraryOperations';
import { useConfirmDialog } from '@/contexts/NotificationContext';
import { ToastContainer } from '@/components/ui/Toast';
import { Tooltip } from '@/components/ui/Tooltip';
import { Button } from '@/components/ui/Button';
import { DownloadFormatModal } from '@/components/modals/DownloadFormatModal';
import { RenameModal } from '@/components/modals/RenameModal';
import { MembersModal } from '@/components/modals/MembersModal';
import { ProjectRolesModal } from '@/components/modals/ProjectRolesModal';
import { ProjectModal } from '@/components/modals/ProjectModal';
import { SelectFolderModal } from '@/components/modals/SelectFolderModal';
import { useProjectManagement } from '@/hooks/useProjectManagement';
import { handleError, getErrorMessage } from '@/utils/errorHandler';
import { CategoryTabs } from '@/components/CategoryTabs';
import { ProjectPermission } from '@/constants/permissions';
import styles from '@/components/sidebar/sidebar.module.css';
import type { ProjectFilterType } from '@/api-sdk';

import type { LibraryType, BreadcrumbItem, ProjectDrawingsPanelProps } from './types';
import { isDrawingFile, API_BASE } from './constants';
import { useLoadNodes } from './hooks/useLoadNodes';
import { useLibraryCategories } from './hooks/useLibraryCategories';
import { useVersionHistory } from './hooks/useVersionHistory';
import { useFileItemRenderer } from './hooks/useFileItemRenderer';
import { ProjectListView } from './components/ProjectListView';
import { BreadcrumbNavigation } from '@/components/BreadcrumbNavigation';
import { VersionHistoryModal } from '@/components/modals/VersionHistoryModal';
import { createPortal } from 'react-dom';
import { useFileSystemClipboardStore } from '@/stores/fileSystemClipboardStore';
import { useFileSystemUndoRedoStore } from '@/stores/fileSystemUndoRedoStore';
import { useFileSystemShortcuts } from '@/hooks/file-system/useFileSystemShortcuts';

export type { LibraryType } from './types';

export const ProjectDrawingsPanel: React.FC<ProjectDrawingsPanelProps> = ({
  projectId,
  onDrawingOpen,
  isPersonalSpace = false,
  currentOpenFileId,
  isModified = false,
  parentId: initialParentId,
  personalSpaceId,
  libraryType,
  doubleClickToOpen = false,
  visible = true,
}) => {
  const { user } = useAuth();
  const { hasPermission } = usePermission();

  const [pageSize, setPageSize] = useState(30);

  const panelRef = useRef<HTMLDivElement>(null);

  const isLibraryMode = libraryType === 'drawing' || libraryType === 'block';
  const canManageLibrary = isLibraryMode && user !== null && (
    libraryType === 'drawing'
      ? hasPermission(SystemPermission.LIBRARY_DRAWING_MANAGE)
      : hasPermission(SystemPermission.LIBRARY_BLOCK_MANAGE)
  );

  // 解析分类路径，从右往左找第一个非'all'的节点ID。
  // 全'all' → libraryRootId（加载根目录所有图纸）
  // ['all', 'catA', 'all'] → catA（加载catA下所有子分类图纸）
  // ['all', 'catA', 'catA1'] → catA1（加载catA1下图纸）
  const getCategoryNodeId = (path: string[], rootId: string | null): string | undefined => {
    for (let i = path.length - 1; i >= 0; i--) {
      if (path[i] !== 'all') return path[i];
    }
    return rootId ?? undefined;
  };

  // Node loader hook
  const {
    nodes, loading, total, totalPages, hasMore,
    currentPage, setCurrentPage,
    loadNodes, buildBreadcrumbPath,
    loadNodesRef, buildBreadcrumbPathRef,
    reset: resetNodes,
    error: loadNodesError,
    libraryRootId: loadRootId,
    removeLocalNode,
    updateLocalNode,
  } = useLoadNodes(isLibraryMode, libraryType, projectId, pageSize);

  // Library categories
  const {
    libraryRootId, categories, categoriesLoaded,
    selectedCategoryPath, setSelectedCategoryPath,
    handleCategorySelect, refreshCategories, listInitializedRef,
  } = useLibraryCategories(isLibraryMode, libraryType, visible);

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [isRenameLoading, setIsRenameLoading] = useState(false);
  const [projects, setProjects] = useState<FileSystemNode[]>([]);
  const [projectRefreshKey, setProjectRefreshKey] = useState(0);
  const [nodePermissions, setNodePermissions] = useState<Map<string, { canEdit: boolean; canDelete: boolean; canManageMembers: boolean; canManageRoles: boolean }>>(new Map());
  const [projectFilter, setProjectFilter] = useState<ProjectFilterType>('all');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(isPersonalSpace ? (projectId || null) : null);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([]);
  const [nextLoadDirection, setNextLoadDirection] = useState<'up' | 'down' | 'jump' | null>(null);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isProjectRolesModalOpen, setIsProjectRolesModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<FileSystemNode | null>(null);

  // Move/Copy state
  const [showSelectFolderModal, setShowSelectFolderModal] = useState(false);
  const [moveSourceNode, setMoveSourceNode] = useState<FileSystemNode | null>(null);
  const [copySourceNode, setCopySourceNode] = useState<FileSystemNode | null>(null);

  // Drag-and-drop state
  const [draggedNodes, setDraggedNodes] = useState<FileSystemNode[]>([]);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // UI hook
  const { toasts, showToast, removeToast } = useFileSystemUI();
  const { showConfirm: showConfirmPromise } = useConfirmDialog();
  
  // Adapt Promise-based showConfirm to callback-style
  const showConfirm = useCallback(
    (
      title: string,
      message: string,
      onConfirm: () => void | Promise<void>,
      type?: 'danger' | 'warning' | 'info',
      confirmText?: string
    ) => {
      showConfirmPromise({ title, message, type, confirmText }).then(
        (confirmed) => {
          if (confirmed) {
            onConfirm();
          }
        }
      );
    },
    [showConfirmPromise]
  );

  const clipboardItems = useFileSystemClipboardStore((s) => s.items);
  const clipboardMode = useFileSystemClipboardStore((s) => s.mode);
  const setClipboard = useFileSystemClipboardStore((s) => s.setClipboard);
  const clearClipboard = useFileSystemClipboardStore((s) => s.clearClipboard);
  const pushAction = useFileSystemUndoRedoStore((s) => s.pushAction);
  const undoStoreUndo = useFileSystemUndoRedoStore((s) => s.undo);
  const undoStoreRedo = useFileSystemUndoRedoStore((s) => s.redo);
  const undoStack = useFileSystemUndoRedoStore((s) => s.undoStack);
  const redoStack = useFileSystemUndoRedoStore((s) => s.redoStack);

  // Load projects
  useEffect(() => {
    if (!visible || isPersonalSpace || isLibraryMode) return;
    const loadProjects = async () => {
      try {
        const result = await fileSystemControllerGetProjects({ query: { filter: projectFilter } });
        const projectList = result.data?.nodes || [];
        setProjects(projectList.map((p): FileSystemNode => ({
          id: String(p.id ?? ''), name: String(p.name ?? ''), isFolder: true, isRoot: true,
          updatedAt: String(p.updatedAt || ''), parentId: undefined,
          createdAt: String(p.createdAt || ''), path: String(p.path || ''), ownerId: String(p.ownerId || ''),
        })));
      } catch (error: unknown) {
        handleError(error, 'ProjectDrawingsPanel: 加载项目列表失败');
      }
    };
    loadProjects();
  }, [visible, isPersonalSpace, projectFilter, projectRefreshKey]);

  // Load project permissions
  useEffect(() => {
    if (!visible || isPersonalSpace || isLibraryMode || projects.length === 0) return;
    const loadProjectPermissions = async () => {
      const { canEditNode, canDeleteNode, canManageNodeMembers, canManageNodeRoles } = await import('@/utils/permissionUtils');
      const permissionsResults = await Promise.all(projects.map(async (project) => {
        const [canEdit, canDelete, canManageMembers, canManageRoles] = await Promise.all([
          canEditNode(user, project.id), canDeleteNode(user, project.id),
          canManageNodeMembers(user, project.id), canManageNodeRoles(user, project.id),
        ]);
        return { projectId: project.id, canEdit, canDelete, canManageMembers, canManageRoles };
      }));
      setNodePermissions((prev) => {
        const newMap = new Map(prev);
        permissionsResults.forEach((r) => newMap.set(r.projectId, { canEdit: r.canEdit, canDelete: r.canDelete, canManageMembers: r.canManageMembers, canManageRoles: r.canManageRoles }));
        return newMap;
      });
    };
    loadProjectPermissions();
  }, [visible, isPersonalSpace, projects, user]);

  // Build refreshNodes
  const refreshNodes = useCallback(() => {
    setProjectRefreshKey((k) => k + 1);
    if (isLibraryMode) {
      refreshCategories();
      const nodeId = getCategoryNodeId(selectedCategoryPath, libraryRootId);
      if (nodeId) loadNodes(nodeId, currentPage, searchQuery, false);
    } else {
      const lastBreadcrumb = breadcrumb[breadcrumb.length - 1];
      if (lastBreadcrumb) loadNodes(lastBreadcrumb.id);
    }
  }, [isLibraryMode, selectedCategoryPath, libraryRootId, searchQuery, currentPage, breadcrumb, loadNodes, refreshCategories]);

  const currentProjectId = selectedProjectId || personalSpaceId || '';

  const sidebarHandleCopy = useCallback(() => {
    if (nodes.length === 0) return;
    setClipboard(nodes.map((n) => n.id), 'copy', currentProjectId);
    showToast(`已复制 ${nodes.length} 个项目`, 'info');
  }, [nodes, currentProjectId, setClipboard, showToast]);

  const sidebarHandleCut = useCallback(() => {
    if (nodes.length === 0) return;
    const nodeIds = nodes.map((n) => n.id);
    const sourceParentIds: Record<string, string> = {};
    for (const n of nodes) {
      if (n.parentId) sourceParentIds[n.id] = n.parentId;
    }
    setClipboard(nodeIds, 'cut', currentProjectId, sourceParentIds);
    showToast(`已剪切 ${nodes.length} 个项目`, 'info');
  }, [nodes, currentProjectId, setClipboard, showToast]);

  const sidebarHandlePaste = useCallback(async () => {
    if (clipboardItems.length === 0 || !clipboardMode) return;

    // 去重：如果剪贴板中同时包含父目录和子节点，只保留父目录
    const parentMap = new Map<string, string | null>();
    for (const n of nodes) {
      parentMap.set(n.id, n.parentId ?? null);
    }
    const items = clipboardItems.filter((id) => {
      const parentId = parentMap.get(id);
      return !(parentId && clipboardItems.includes(parentId));
    });

    if (items.length === 0) {
      showToast('没有可粘贴的项目', 'info');
      return;
    }

    const targetId = breadcrumb[breadcrumb.length - 1]?.id || selectedProjectId;
    if (!targetId) return;
    const srcProjectId = useFileSystemClipboardStore.getState().sourceProjectId;
    if (srcProjectId && srcProjectId !== currentProjectId) {
      showToast('不能跨项目粘贴', 'error');
      return;
    }
    try {
      if (clipboardMode === 'cut') {
        const origParentIds = useFileSystemClipboardStore.getState().sourceParentIds;
        for (const nodeId of items) {
          await fileSystemControllerMoveNode({ path: { nodeId }, body: { targetParentId: targetId }, throwOnError: true });
        }
        clearClipboard();
        pushAction({
          type: 'move',
          description: `移动 ${items.length} 个项目`,
          projectId: currentProjectId,
          execute: async () => {
            for (const nodeId of items) {
              await fileSystemControllerMoveNode({ path: { nodeId }, body: { targetParentId: targetId }, throwOnError: true });
            }
          },
          rollback: async () => {
            for (const [nodeId, srcParentId] of Object.entries(origParentIds)) {
              if (!srcParentId) continue;
              await fileSystemControllerMoveNode({ path: { nodeId }, body: { targetParentId: srcParentId }, throwOnError: true });
            }
          },
        });
      } else {
        const newIds: string[] = [];
        for (const nodeId of items) {
          try {
            const result = await fileSystemControllerCopyNode({ path: { nodeId }, body: { targetParentId: targetId }, throwOnError: true });
            const data = (result as unknown as { data?: { id?: string } })?.data || result;
            const newId = (data as unknown as { id?: string })?.id || '';
            if (newId) newIds.push(newId);
          } catch (e) {
          }
        }
        if (newIds.length > 0) {
          pushAction({
            type: 'delete',
            description: `复制 ${items.length} 个项目`,
            projectId: currentProjectId,
            execute: async () => {
              for (const nodeId of items) {
                await fileSystemControllerCopyNode({ path: { nodeId }, body: { targetParentId: targetId }, throwOnError: true });
              }
            },
            rollback: async () => {
              for (const id of newIds) {
                await fileSystemControllerDeleteNode({ path: { nodeId: id }, query: { permanently: true }, throwOnError: true });
              }
            },
          });
        }
      }
      showToast('粘贴成功', 'success');
      refreshNodes();
    } catch (error) {
      const appError = error instanceof Error ? error.message : '粘贴失败';
      showToast(appError, 'error');
    }
  }, [clipboardItems, clipboardMode, nodes, breadcrumb, selectedProjectId, currentProjectId, clearClipboard, refreshNodes, showToast, pushAction]);

  const sidebarHandleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;
    try {
      const action = undoStack[undoStack.length - 1];
      if (!action) return;
      await undoStoreUndo(currentProjectId);
      showToast(`已撤销: ${action.description}`, 'info');
      refreshNodes();
    } catch (error) {
      const msg = error instanceof Error ? error.message : '撤销失败';
      showToast(msg, 'error');
    }
  }, [undoStack, undoStoreUndo, currentProjectId, refreshNodes, showToast]);

  const sidebarHandleRedo = useCallback(async () => {
    if (redoStack.length === 0) return;
    try {
      const action = redoStack[redoStack.length - 1];
      if (!action) return;
      await undoStoreRedo(currentProjectId);
      showToast(`已重做: ${action.description}`, 'info');
      refreshNodes();
    } catch (error) {
      const msg = error instanceof Error ? error.message : '重做失败';
      showToast(msg, 'error');
    }
  }, [redoStack, undoStoreRedo, currentProjectId, refreshNodes, showToast]);

  // Library operations
  const libraryOperations = useLibraryOperations({ libraryType: libraryType || 'drawing', showToast, refreshNodes, showConfirm, removeLocalNode, updateLocalNode });

  // CRUD hook
  const currentNode = useMemo(() => {
    if (breadcrumb.length === 0) return null;
    const last = breadcrumb[breadcrumb.length - 1];
    return nodes.find((n) => n.id === last?.id) || { id: last?.id || '', name: last?.name || '', isFolder: true, parentId: breadcrumb.length > 1 ? breadcrumb[breadcrumb.length - 2]?.id : undefined } as FileSystemNode;
  }, [breadcrumb, nodes]);

  const {
    showRenameModal, setShowRenameModal, editingNode, setEditingNode,
    folderName, setFolderName, handleRename, handleDelete, handleOpenRename,
  } = useFileSystemCRUD({
    urlProjectId: selectedProjectId || undefined, currentNode, loadData: refreshNodes,
    showToast, showConfirm, selectedNodes: new Set(), nodes,
    clearSelection: () => { },
    mode: isPersonalSpace ? 'personal-space' : 'project',
    removeLocalNode,
    updateLocalNode,
  });

  const {
    handleDownload, handleDownloadWithFormat,
    showDownloadFormatModal, setShowDownloadFormatModal,
    downloadingNode, setDownloadingNode,
  } = useFileSystemNavigation({
    urlProjectId: selectedProjectId || undefined, currentNode, showToast,
    mode: isPersonalSpace ? 'personal-space' : 'project',
  });

  // Library rename
  const [libraryRenameModalOpen, setLibraryRenameModalOpen] = useState(false);
  const [libraryRenamingNode, setLibraryRenamingNode] = useState<FileSystemNode | null>(null);
  const [libraryRenameName, setLibraryRenameName] = useState('');

  const handleLibraryOpenRename = useCallback((node: FileSystemNode) => {
    setLibraryRenamingNode(node);
    if (!node.isFolder && node.name) {
      const lastDot = node.name.lastIndexOf('.');
      setLibraryRenameName(lastDot !== -1 ? node.name.substring(0, lastDot) : node.name);
    } else setLibraryRenameName(node.name);
    setLibraryRenameModalOpen(true);
  }, []);

  const handleLibraryRenameSubmit = useCallback(async () => {
    if (!libraryRenamingNode || !libraryRenameName.trim()) return;
    try {
      await libraryOperations.handleRename(libraryRenamingNode.id, libraryRenameName.trim(), () => {
        setLibraryRenameModalOpen(false); setLibraryRenamingNode(null); setLibraryRenameName('');
      });
    } catch { /* handled in libraryOperations */ }
  }, [libraryRenamingNode, libraryRenameName, libraryOperations]);

  const handleLibraryDownloadWithFormat = useCallback(async (format: 'dwg' | 'dxf' | 'mxweb' | 'pdf', pdfOptions?: { width?: string; height?: string; colorPolicy?: 'mono' | 'color' }) => {
    if (!downloadingNode || downloadingNode.isFolder) return;
    await libraryOperations.handleDownloadWithFormat(downloadingNode.id, downloadingNode.name, format, pdfOptions);
    setShowDownloadFormatModal(false); setDownloadingNode(null);
  }, [downloadingNode, libraryOperations]);

  // Project management
  const {
    isModalOpen: isProjectModalOpen, editingProject: projectBeingEdited,
    formData: projectFormData, loading: projectLoading,
    openCreateModal: openCreateProjectModal,
    openEditModal: openEditProjectModal, closeModal: closeProjectModal,
    setFormData: setProjectFormData, handleUpdate: handleUpdateProjectSubmit,
  } = useProjectManagement({ onProjectUpdated: refreshNodes, onProjectDeleted: refreshNodes, showToast });

  // Initialize: load project root
  useEffect(() => {
    if (!visible) return;
    if (!selectedProjectId) {
      // 库模式由专门的 useLoadNodes 初始化 effect 管理，此处不干预
      if (!isLibraryMode) {
        resetNodes();
        setBreadcrumb([]);
      }
      return;
    }

    const initProject = async () => {
      try {
        const { data: projectNode } = await fileSystemControllerGetNode({ path: { nodeId: selectedProjectId } });
        if (projectNode) setBreadcrumb([{ id: projectNode.id, name: projectNode.name }]);
      } catch (error: unknown) {
        handleError(error, 'ProjectDrawingsPanel: 加载项目信息失败');
      }
    };

    // 先等待项目根节点就绪（可能触发服务端懒创建），再加载子节点
    initProject().then(() => {
      loadNodes(selectedProjectId);
    });
  }, [visible, selectedProjectId, loadNodes]);

  // Sync projectId in personal space
  useEffect(() => {
    if (isPersonalSpace && projectId && projectId !== selectedProjectId) setSelectedProjectId(projectId);
  }, [isPersonalSpace, projectId, selectedProjectId]);

  // Library mode: load on categories loaded
  // libraryRootId 可能因 API 降级或时序竞争为 null，此时用 useLoadNodes 的
  // libraryRootId（来自 React Query 缓存）作为兜底，确保 loadNodes 总能被调用
  useEffect(() => {
    if (!visible || !isLibraryMode || listInitializedRef.current) return;
    const rootId = libraryRootId || loadRootId;
    if (!rootId) return;
    listInitializedRef.current = true;
    const nodeId = getCategoryNodeId(selectedCategoryPath, rootId);
    if (nodeId) loadNodes(nodeId, 1, '', false);
  }, [visible, isLibraryMode, categoriesLoaded, libraryRootId, libraryType, loadRootId]);

  // 分类选择：当用户点击分类时重新加载节点列表
  // 注意：不依赖 visible，只依赖 selectedCategoryPath，以免切标签页时重置搜索/页码
  useEffect(() => {
    if (!isLibraryMode || !listInitializedRef.current) return;
    const rootId = libraryRootId || loadRootId;
    if (!rootId) return;
    setSearchQuery('');
    setCurrentPage(1);
    const nodeId = getCategoryNodeId(selectedCategoryPath, rootId);
    if (nodeId) loadNodes(nodeId, 1, '', false);
  }, [selectedCategoryPath, isLibraryMode, libraryRootId, loadRootId]);

  // 可见性恢复时重新加载当前页（不重置搜索/页码）
  useEffect(() => {
    if (!visible || !isLibraryMode || !listInitializedRef.current || !nodes.length) return;
    const rootId = libraryRootId || loadRootId;
    if (!rootId) return;
    const nodeId = getCategoryNodeId(selectedCategoryPath, rootId);
    if (nodeId) loadNodes(nodeId, currentPage, searchQuery, false);
  }, [visible, libraryRootId, loadRootId, nodes, selectedCategoryPath]);

  // Reset on libraryType change (skip on mount to avoid race with init effect)
  const prevLibraryTypeRef = useRef(libraryType);
  useEffect(() => {
    if (prevLibraryTypeRef.current === libraryType) return;
    prevLibraryTypeRef.current = libraryType;
    listInitializedRef.current = false;
    resetNodes(); setBreadcrumb([]);
    setSearchQuery('');
  }, [libraryType]);

  // parentId navigation
  useEffect(() => {
    const navigate = async () => {
      if (!initialParentId || initialParentId.trim() === '' || isPersonalSpace) return;
      if (personalSpaceId) {
        const path = await buildBreadcrumbPathRef.current(initialParentId);
        if (path[0]?.id === personalSpaceId) { setSelectedProjectId(null); setBreadcrumb([]); resetNodes(); return; }
      }
      try {
        const path = await buildBreadcrumbPathRef.current(initialParentId);
        if (path.length > 0) { setBreadcrumb(path); setSelectedProjectId(path[0]?.id || initialParentId); await loadNodesRef.current(initialParentId); }
      } catch (error: unknown) { handleError(error, 'ProjectDrawingsPanel: 导航到 parentId 失败'); }
    };
    navigate();
  }, [initialParentId, isPersonalSpace, personalSpaceId]);

  // Handlers
  const handleEnterFolder = useCallback((folder: FileSystemNode) => {
    setBreadcrumb((prev) => [...prev, { id: folder.id, name: folder.name }]);
    loadNodes(folder.id); setSearchQuery(''); setCurrentPage(1);
  }, [loadNodes]);

  const handleBreadcrumbClick = useCallback((index: number) => {
    const newBreadcrumb = breadcrumb.slice(0, index + 1);
    setBreadcrumb(newBreadcrumb);
    const lastItem = newBreadcrumb[newBreadcrumb.length - 1];
    if (lastItem) loadNodes(lastItem.id);
    setSearchQuery(''); setCurrentPage(1);
  }, [breadcrumb, loadNodes]);

  const handleGoBack = useCallback(() => {
    if (breadcrumb.length > 1) {
      const newBreadcrumb = breadcrumb.slice(0, -1);
      setBreadcrumb(newBreadcrumb);
      const lastItem = newBreadcrumb[newBreadcrumb.length - 1];
      if (lastItem) loadNodes(lastItem.id);
    } else if (breadcrumb.length === 1 && !isPersonalSpace) {
      setSelectedProjectId(null); setBreadcrumb([]); resetNodes();
    }
    setSearchQuery(''); setCurrentPage(1);
  }, [breadcrumb, isPersonalSpace, loadNodes]);

  const handleEnterProject = useCallback((project: FileSystemNode) => {
    setSelectedProjectId(project.id);
    setBreadcrumb([{ id: project.id, name: project.name }]);
    setSearchQuery(''); setCurrentPage(1);
  }, []);

  const handleBackToProjects = useCallback(() => {
    setSelectedProjectId(null); setBreadcrumb([]); resetNodes();
    setSearchQuery(''); setCurrentPage(1);
  }, []);

  const keyPrefix = useMemo(() => {
    if (isLibraryMode) return libraryType === 'drawing' ? 'drawing-library' : 'block-library';
    if (isPersonalSpace) return 'personal-space';
    return 'project-space';
  }, [isLibraryMode, libraryType, isPersonalSpace]);

  // Resource items
  const resourceItems: ResourceItem[] = useMemo(() => {
    if (isLibraryMode) {
      const files = nodes.filter((n) => !n.isFolder);
      const getThumb = (nodeId: string) => {
        const base = `${window.location.origin}/api/v1/library/${libraryType === 'drawing' ? 'drawing' : 'block'}`;
        return `${base}/nodes/${nodeId}/thumbnail`;
      };
      const items = files.map((node) => ({
        id: node.id, name: node.name, type: 'file' as const,
        thumbnailUrl: getThumb(node.id), updatedAt: node.updatedAt, size: node.size,
        isActive: node.id === currentOpenFileId,
        badge: node.id === currentOpenFileId && isModified ? (<span className={styles.modifiedIndicator} title="已修改">●</span>) : undefined,
        filePath: undefined, parentId: node.parentId, projectId: libraryRootId ?? undefined, isCadFile: true, keyPrefix,
      }));
      const query = searchQuery.toLowerCase();
      return searchQuery ? items.filter((i) => i.name.toLowerCase().includes(query)) : items;
    }
    const folders = nodes.filter((n) => n.isFolder);
    const files = nodes.filter((n) => !n.isFolder && isDrawingFile(n.name));
    const rootId = selectedProjectId ?? breadcrumb[0]?.id ?? undefined;
    const getThumb = (nodeId: string) => `${API_BASE}/v1/file-system/nodes/${nodeId}/thumbnail`;
    const folderItems: ResourceItem[] = folders.map((n) => ({ id: n.id, name: n.name, type: 'folder', updatedAt: n.updatedAt, keyPrefix }));
    const fileItems: ResourceItem[] = files.map((n) => ({
      id: n.id, name: n.name, type: 'file', thumbnailUrl: getThumb(n.id),
      updatedAt: n.updatedAt, size: n.size, isActive: n.id === currentOpenFileId,
      badge: n.id === currentOpenFileId && isModified ? (<span className={styles.modifiedIndicator} title="已修改">●</span>) : undefined,
      filePath: n.path, parentId: n.parentId, projectId: rootId, isCadFile: true, keyPrefix,
    }));
    const query = searchQuery.toLowerCase();
    return [...(searchQuery ? folderItems.filter((i) => i.name.toLowerCase().includes(query)) : folderItems), ...(searchQuery ? fileItems.filter((i) => i.name.toLowerCase().includes(query)) : fileItems)];
  }, [nodes, currentOpenFileId, isModified, searchQuery, selectedProjectId, breadcrumb, isLibraryMode, libraryType, libraryRootId, keyPrefix]);

  // Item click
  const handleItemClick = useCallback((item: ResourceItem) => {
    const now = Date.now();
    if (now - lastClickTimeRef.current < CLICK_THROTTLE_MS) return;
    lastClickTimeRef.current = now;

    const node = nodes.find((n) => n.id === item.id);
    if (!node) return;
    if (node.isFolder) { handleEnterFolder(node); return; }
    if (isLibraryMode) {
      const isLoggedIn = user !== null;
      const hasSysPerm = isLoggedIn && (libraryType === 'drawing' ? hasPermission(SystemPermission.LIBRARY_DRAWING_MANAGE) : hasPermission(SystemPermission.LIBRARY_BLOCK_MANAGE));
      if (hasSysPerm) { onDrawingOpen(node, libraryType); return; }
      if (libraryType === 'drawing') {
        import('@/services/mxcadManager').then(({ openLibraryDrawing }) => {
          openLibraryDrawing(node.id, node.name, node.path || '', node.updatedAt).catch((error: unknown) => { handleError(error, 'ProjectDrawingsPanel: 打开图纸库文件失败'); });
        });
      } else {
        const mxwebUrl = `/api/v1/library/block/filesData/${node.path}`;
        MxFun.sendStringToExecute('Mx_Insert', { filePath: mxwebUrl, name: node.name, isBlockLibrary: true });
      }
      return;
    }
    onDrawingOpen(node);
  }, [nodes, handleEnterFolder, onDrawingOpen, isLibraryMode, libraryType, hasPermission, user]);

  // Load more
  const handleLoadMore = useCallback(() => {
    if (!hasMore || loading) return;
    let nodeId: string | undefined;
    if (isLibraryMode) {
      nodeId = getCategoryNodeId(selectedCategoryPath, libraryRootId);
    } else nodeId = breadcrumb[breadcrumb.length - 1]?.id;
    if (nodeId) { const np = currentPage + 1; setNextLoadDirection('down'); setCurrentPage(np); loadNodes(nodeId, np, searchQuery, true); }
  }, [isLibraryMode, selectedCategoryPath, libraryRootId, breadcrumb, currentPage, hasMore, loading, loadNodes, searchQuery]);

  const handlePageChange = useCallback((page: number, direction: 'prev' | 'next' | 'jump') => {
    let nodeId: string | undefined;
    if (isLibraryMode) {
      nodeId = getCategoryNodeId(selectedCategoryPath, libraryRootId);
    } else nodeId = breadcrumb[breadcrumb.length - 1]?.id;
    if (!nodeId) return;
    const loadDir = direction === 'prev' ? 'up' : direction === 'jump' ? 'jump' : 'down';
    setNextLoadDirection(loadDir as 'up' | 'down' | 'jump');
    setCurrentPage(page);
    // 对齐 main 分支行为：
    // - jump: replace 模式（跳转页面，替换列表）
    // - next: append 模式（追加到列表尾部）
    // - prev: prepend 模式（插入到列表头部）
    if (direction === 'jump') { loadNodes(nodeId, page, searchQuery, false); }
    else if (direction === 'next') loadNodes(nodeId, page, searchQuery, true);
    else loadNodes(nodeId, page, searchQuery, 'prepend');
  }, [isLibraryMode, selectedCategoryPath, libraryRootId, breadcrumb, searchQuery, loadNodes]);

  const handlePageSizeChange = useCallback((newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1);
    let nodeId: string | undefined;
    if (isLibraryMode) {
      nodeId = getCategoryNodeId(selectedCategoryPath, libraryRootId);
    } else nodeId = breadcrumb[breadcrumb.length - 1]?.id;
    if (nodeId) loadNodes(nodeId, 1, searchQuery, false);
  }, [isLibraryMode, selectedCategoryPath, libraryRootId, breadcrumb, searchQuery, loadNodes]);

  // Click throttle
  const lastClickTimeRef = useRef(0);
  const CLICK_THROTTLE_MS = 500;

  // API 错误时显示 toast
  useEffect(() => {
    if (loadNodesError) {
      showToast(`加载失败: ${loadNodesError}`, 'error');
    }
  }, [loadNodesError]);

  // Permissions
  const { permissions: projectPermissions } = useProjectPermissions(selectedProjectId);

  // Move/Copy handlers
  const handleMove = useCallback((node: FileSystemNode) => {
    setMoveSourceNode(node);
    setCopySourceNode(null);
    setShowSelectFolderModal(true);
  }, []);

  const handleCopy = useCallback((node: FileSystemNode) => {
    setCopySourceNode(node);
    setMoveSourceNode(null);
    setShowSelectFolderModal(true);
  }, []);

  const handleConfirmMoveOrCopy = useCallback(async (targetParentId: string) => {
    const { fileSystemControllerMoveNode, fileSystemControllerCopyNode } = await import('@/api-sdk');
    try {
      if (moveSourceNode) {
        await fileSystemControllerMoveNode({ path: { nodeId: moveSourceNode.id }, body: { targetParentId } });
      } else if (copySourceNode) {
        await fileSystemControllerCopyNode({ path: { nodeId: copySourceNode.id }, body: { targetParentId } });
      }
      refreshNodes();
      setShowSelectFolderModal(false);
      setMoveSourceNode(null);
      setCopySourceNode(null);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '操作失败，请重试';
      showToast(errorMessage, 'error');
    }
  }, [moveSourceNode, copySourceNode, refreshNodes, showToast]);

  useFileSystemShortcuts({
    containerRef: panelRef,
    enabled: false,
    onUndo: sidebarHandleUndo,
    onRedo: sidebarHandleRedo,
    onCopy: sidebarHandleCopy,
    onCut: sidebarHandleCut,
    onPaste: sidebarHandlePaste,
    onDeleteSelected: () => {},
    onRenameSelected: () => {},
    onClearSelection: () => {},
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  });

  // Drag-and-drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, node: FileSystemNode) => {
    if (node.isRoot) { e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', node.id);
    e.dataTransfer.effectAllowed = 'copyMove';
    setDraggedNodes([node]);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, node: FileSystemNode) => {
    e.preventDefault();
    if (node.isFolder && node.id !== draggedNodes[0]?.id) {
      e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey ? 'copy' : 'move';
      setDropTargetId(node.id);
    }
  }, [draggedNodes]);

  const handleDragLeave = useCallback(() => { setDropTargetId(null); }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetNode: FileSystemNode) => {
    e.preventDefault();
    setDropTargetId(null);
    if (!targetNode.isFolder || draggedNodes.length === 0) return;
    const draggedNode = draggedNodes[0];
    if (!draggedNode || draggedNode.id === targetNode.id) return;
    const isCopy = e.ctrlKey || e.metaKey;
    const { fileSystemControllerMoveNode, fileSystemControllerCopyNode } = await import('@/api-sdk');
    try {
      if (isCopy) {
        await fileSystemControllerCopyNode({ path: { nodeId: draggedNode.id }, body: { targetParentId: targetNode.id } });
      } else {
        await fileSystemControllerMoveNode({ path: { nodeId: draggedNode.id }, body: { targetParentId: targetNode.id } });
      }
      refreshNodes();
    } catch (error: unknown) {
      handleError(error, '拖拽操作失败');
      showToast(getErrorMessage(error), 'error');
    } finally { setDraggedNodes([]); }
  }, [draggedNodes, refreshNodes, showToast]);

  // Version history (now using selectedProjectId)
  const vh = useVersionHistory(selectedProjectId);

  // File item renderer
  const { renderFileItem } = useFileItemRenderer({
    nodes, isLibraryMode, libraryType, canManageLibrary, doubleClickToOpen,
    hideTypeTag: !isLibraryMode,
    forceCompactActions: !isLibraryMode,
    projectPermissions, onDrawingOpen, handleEnterFolder,
    handleDownload, handleDelete, handleOpenRename, handleLibraryOpenRename,
    handleShowVersionHistory: vh.handleShowVersionHistory,
    handleMove, handleCopy,
    handleDragStart, handleDragOver, handleDragLeave, handleDrop, dropTargetId,
    showToast, user, hasPermission: hasPermission as (perm: SystemPermission) => boolean,
    setDownloadingNode, setShowDownloadFormatModal, libraryOperations,
  });

  // Handlers for project view
  const handleShowMembers = useCallback((node: FileSystemNode) => { setEditingProject(node); setIsMembersModalOpen(true); }, []);
  const handleShowRoles = useCallback((node: FileSystemNode) => { setEditingProject(node); setIsProjectRolesModalOpen(true); }, []);
  const handleEditProject = useCallback((node: FileSystemNode) => { openEditProjectModal(node); }, [openEditProjectModal]);
  const handleSubmitProject = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    handleUpdateProjectSubmit(async (id, data) => {
      await fileSystemControllerUpdateNode({ path: { nodeId: id }, body: { name: data.name ?? undefined, description: data.description } });
    });
  }, [handleUpdateProjectSubmit]);

  // Rename submit
  const handleRenameSubmit = useCallback(async () => {
    if (!editingNode || !folderName.trim()) return;
    setIsRenameLoading(true);
    try {
      if (isLibraryMode) {
        await libraryOperations.handleRename(editingNode.id, folderName.trim(), () => { setShowRenameModal(false); setEditingNode(null); setFolderName(''); });
      } else await handleRename();
    } catch (error: unknown) { handleError(error, 'ProjectDrawingsPanel: 重命名失败'); showToast(getErrorMessage(error), 'error'); } finally { setIsRenameLoading(false); }
  }, [editingNode, folderName, isLibraryMode, libraryOperations, handleRename, showToast]);

  // 判断是否显示项目列表视图（我的项目 tab，未选中项目时）
  const showProjectList = !isPersonalSpace && !isLibraryMode && !selectedProjectId;

  return (
    <div ref={panelRef} className={styles.projectDrawingsPanel}>
      {createPortal(
        <ToastContainer toasts={toasts} onRemove={removeToast} />,
        document.body
      )}

      {/* 项目列表视图 — 我的项目 tab 初始状态 */}
      <div className={`${styles.subTabPanel} ${showProjectList ? styles.active : ''}`}>
        <ProjectListView
          projects={projects} searchQuery={searchQuery} projectFilter={projectFilter}
          onProjectFilterChange={setProjectFilter} nodePermissions={nodePermissions}
          onEnterProject={handleEnterProject} onEditProject={handleEditProject}
          onShowMembers={handleShowMembers} onShowRoles={handleShowRoles}
          onDeleteProject={async (project) => {
            const perms = nodePermissions.get(project.id);
            if (!perms?.canDelete) return;
            const confirmed = await showConfirmPromise({
              title: '删除项目',
              message: `确定要删除项目"${project.name}"吗？删除后将移至回收站。`,
              type: 'danger',
              confirmText: '删除',
            });
            if (!confirmed) return;
            await handleDelete(project, false);
            refreshNodes();
          }}
          onRefresh={refreshNodes}
        />
      </div>

      {/* 主视图 — 项目详情/图纸浏览/库浏览 */}
      <div className={`${styles.subTabPanel} ${!showProjectList ? styles.active : ''}`}>
        {/* 分类标签占位容器 */}
        {isLibraryMode && (
        <div className={styles.categoryPlaceholder}>
          <CategoryTabs categories={categories} selectedPath={selectedCategoryPath} onSelect={handleCategorySelect} />
        </div>
        )}
        <ResourceList
          galleryMode={isLibraryMode}
          items={resourceItems} loading={loading} searchQuery={searchQuery}
          onSearchChange={(query) => {
            setSearchQuery(query); setCurrentPage(1);
            if (isLibraryMode) { const nid = getCategoryNodeId(selectedCategoryPath, libraryRootId); if (nid) loadNodes(nid, 1, query); }
            else { const lb = breadcrumb[breadcrumb.length - 1]; if (lb) loadNodes(lb.id, 1, query); }
          }}
          onItemClick={handleItemClick} doubleClickToOpen={doubleClickToOpen}
          emptyText={searchQuery ? '未找到匹配的内容' : `当前没有${libraryType === 'drawing' ? '图纸' : libraryType === 'block' ? '图块' : '内容'}`}
          defaultViewMode="grid" total={total} totalPages={totalPages} currentPage={currentPage}
          onPageChange={handlePageChange} paginationEnabled={true}
          pageSize={pageSize} onPageSizeChange={handlePageSizeChange}
          breadcrumb={
            !isLibraryMode ? (
            <div className={styles.breadcrumbPlaceholder}>
              {(breadcrumb.length > 0 || !isPersonalSpace) && (
                <BreadcrumbNavigation
                  variant="panel"
                  breadcrumbs={breadcrumb.map((b) => ({ ...b, isRoot: false, isFolder: true }))}
                  onNavigate={(crumb) => {
                    const idx = breadcrumb.findIndex((b) => b.id === crumb.id);
                    if (idx >= 0) handleBreadcrumbClick(idx);
                  }}
                  onBack={handleGoBack}
                  onBackToProjects={handleBackToProjects}
                />
              )}
            </div>
          ) : undefined
          }
          renderItem={renderFileItem}
          toolbarExtra={isLibraryMode ? undefined : (
            <div className="flex items-center gap-1">
              {clipboardItems.length > 0 && (
                <Button variant="secondary" size="sm" onClick={sidebarHandlePaste} tooltip="粘贴" className="text-primary border border-primary-dim mr-1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                    <path d="M12 11v6M9 14h6" />
                  </svg>
                </Button>
              )}
              <Button variant="secondary" icon={RefreshCw} onClick={refreshNodes} loading={loading} tooltip="刷新" />
            </div>
          )}
          loadDirection={nextLoadDirection} onLoadComplete={() => setNextLoadDirection(null)}
        />
        <RenameModal isOpen={showRenameModal} editingNode={editingNode} newName={folderName} loading={isRenameLoading} onClose={() => { setShowRenameModal(false); setEditingNode(null); setFolderName(''); }} onNameChange={setFolderName} onRename={handleRenameSubmit} />
        <RenameModal isOpen={libraryRenameModalOpen} editingNode={libraryRenamingNode} newName={libraryRenameName} loading={false} onClose={() => { setLibraryRenameModalOpen(false); setLibraryRenamingNode(null); setLibraryRenameName(''); }} onNameChange={setLibraryRenameName} onRename={handleLibraryRenameSubmit} />
        <VersionHistoryModal isOpen={vh.showVersionHistoryModal} node={vh.versionHistoryNode} entries={vh.versionHistoryEntries} loading={vh.versionHistoryLoading} error={vh.versionHistoryError} onClose={() => vh.setShowVersionHistoryModal(false)} onOpenVersion={vh.handleOpenHistoricalVersion} />
        <DownloadFormatModal isOpen={showDownloadFormatModal} fileName={downloadingNode?.name || ''} onClose={() => { setShowDownloadFormatModal(false); setDownloadingNode(null); }} onDownload={isLibraryMode ? handleLibraryDownloadWithFormat : handleDownloadWithFormat} />
        <MembersModal isOpen={isMembersModalOpen} projectId={editingProject?.id || ''} onClose={() => { setIsMembersModalOpen(false); setEditingProject(null); }} />
        <ProjectRolesModal isOpen={isProjectRolesModalOpen} projectId={editingProject?.id || ''} onClose={() => { setIsProjectRolesModalOpen(false); setEditingProject(null); }} />
        <ProjectModal isOpen={isProjectModalOpen} onClose={closeProjectModal} editingProject={editingProject} formData={projectFormData} onFormDataChange={setProjectFormData} onSubmit={handleSubmitProject} loading={projectLoading} />
        <SelectFolderModal
          isOpen={showSelectFolderModal}
          currentNodeId={moveSourceNode?.id || copySourceNode?.id || ''}
          projectId={selectedProjectId || undefined}
          onClose={() => { setShowSelectFolderModal(false); setMoveSourceNode(null); setCopySourceNode(null); }}
          onConfirm={handleConfirmMoveOrCopy}
          confirmButtonText={moveSourceNode ? '移动到此' : '复制到此'}
        />
      </div>
    </div>
  );
};

export default ProjectDrawingsPanel;
