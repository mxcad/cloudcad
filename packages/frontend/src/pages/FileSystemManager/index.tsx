import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ToastContainer } from '@/components/ui/Toast';
import MxCadUploader, { MxCadUploaderRef } from '@/components/MxCadUploader';
import { useFileSystem } from '@/hooks/file-system';
import { useProjectManagement } from '@/hooks/useProjectManagement';
import { usePermission } from '@/hooks/usePermission';
import { useProjectPermissions } from '@/hooks/useProjectPermissions';
import { useAuth } from '@/contexts/AuthContext';
import { useFileSystemStore } from '@/stores/fileSystemStore';
import {
  fileSystemControllerUpdateNode,
  fileSystemControllerCreateProject,
  fileSystemControllerMoveNode,
  fileSystemControllerCopyNode,
  fileSystemControllerDeleteNode,
} from '@/api-sdk';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { FileSystemNode } from '@/types/filesystem';
import { CreateFolderModal } from '@/components/modals/CreateFolderModal';
import { NewDrawingModal } from '@/components/modals/NewDrawingModal';
import { RenameModal } from '@/components/modals/RenameModal';
import { ProjectModal } from '@/components/modals/ProjectModal';
import { MembersModal } from '@/components/modals/MembersModal';
import { ProjectRolesModal } from '@/components/modals/ProjectRolesModal';
import { SelectFolderModal } from '@/components/modals/SelectFolderModal';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { DownloadFormatModal } from '@/components/modals/DownloadFormatModal';
import { VersionHistoryModal } from '@/components/modals/VersionHistoryModal';
import { ShareDialog } from '@/components/modals/ShareDialog';
import { isAbortError, handleError } from '@/utils/errorHandler';
import { client } from '@/api-sdk/client.gen';
import type { ProjectFilterType } from '@/api-sdk';
import { useFileSystemClipboardStore, type ClipboardMode } from '@/stores/fileSystemClipboardStore';
import { useFileSystemUndoRedoStore } from '@/stores/fileSystemUndoRedoStore';
import { useFileSystemShortcuts } from '@/hooks/file-system/useFileSystemShortcuts';

import { FileSystemHeader } from './FileSystemHeader';
import { FileSystemContent } from './FileSystemContent';
import { FileSystemStates } from './FileSystemStates';
import { useVersionHistory } from './hooks/useVersionHistory';
import { useMoveCopy } from './hooks/useMoveCopy';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import { useFileDropUpload } from '@/hooks/useFileDropUpload';
import { usePersonalSpaceQuery } from '@/hooks/usePersonalSpaceQuery';

interface FileSystemManagerProps {
  mode?: 'project' | 'personal-space';
}

export const FileSystemManager: React.FC<FileSystemManagerProps> = ({
  mode = 'project',
}) => {
  useDocumentTitle(mode === 'personal-space' ? '我的图纸' : '项目管理');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const [projectFilter, setProjectFilter] = useState<ProjectFilterType>('all');

  const {
    personalSpaceId,
    personalSpaceIdLoading,
    setPersonalSpaceId,
    setPersonalSpaceIdLoading,
  } = useFileSystemStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const uploaderRef = useRef<MxCadUploaderRef>(null);

  const {
    nodes,
    currentNode,
    breadcrumbs,
    loading,
    isFetching,
    error,
    searchTerm,
    setSearchTerm,
    handleSearchSubmit,
    viewMode,
    setViewMode,
    toasts,
    showToast,
    isProjectRootMode,
    isPersonalSpaceMode,
    urlProjectId,
    urlNodeId,
    showCreateFolderModal,
    showRenameModal,
    showDownloadFormatModal,
    folderName,
    setFolderName,
    editingNode,
    downloadingNode,
    setShowCreateFolderModal,
    setShowRenameModal,
    setShowDownloadFormatModal,
    setEditingNode,
    setDownloadingNode,
    removeToast,
    handleRefresh,
    handleGoBack,
    handleEnterFolder,
    handleCreateFolder,
    handleCreateDrawing,
    showCreateDrawingModal,
    setShowCreateDrawingModal,
    drawingName,
    setDrawingName,
    handleRename,
    handleDelete,
    handlePermanentlyDelete,
    handleBatchDelete,
    handleFileOpen: handleFileOpenRaw,
    handleDownload,
    handleDownloadWithFormat,
    handleOpenRename,
    draggedNodes,
    setDraggedNodes,
    dropTargetId,
    setDropTargetId,
    paginationMeta,
    handlePageChange,
    handlePageSizeChange,
    pagination,
    handleDeleteProject,
    handlePermanentlyDeleteProject,
    isTrashView,
    handleToggleTrashView,
    handleRestoreNode,
    handleBatchRestore,
    handleClearTrash,
    selectedNodes,
    handleNodeSelect,
    handleSelectAll,
    clearSelection,
    selectNodes,
    searchFilters,
    handleFiltersChange,
  } = useFileSystem({
    mode,
    personalSpaceId,
    projectFilter,
  });

  const clipboardItems = useFileSystemClipboardStore((s) => s.items);
  const clipboardMode = useFileSystemClipboardStore((s) => s.mode);
  const setClipboard = useFileSystemClipboardStore((s) => s.setClipboard);
  const clearClipboard = useFileSystemClipboardStore((s) => s.clearClipboard);
  const pushAction = useFileSystemUndoRedoStore((s) => s.pushAction);
  const undoStoreUndo = useFileSystemUndoRedoStore((s) => s.undo);
  const undoStoreRedo = useFileSystemUndoRedoStore((s) => s.redo);
  const undoStack = useFileSystemUndoRedoStore((s) => s.undoStack);
  const redoStack = useFileSystemUndoRedoStore((s) => s.redoStack);
  const clearUndoStack = useFileSystemUndoRedoStore((s) => s.clearStack);

  const projectId = urlProjectId || '';

  useEffect(() => {
    clearUndoStack();
  }, [urlProjectId, clearUndoStack]);

  const isAtRoot = mode === 'personal-space' ? false : !urlProjectId;
  const displayNodes = Array.isArray(nodes) ? nodes : [];
  const [accumulatedNodes, setAccumulatedNodes] = useState<FileSystemNode[]>(displayNodes);
  const loadDirectionRef = useRef<'next' | 'prev' | null>(null);

  const handleScrollPageChange = useCallback((page: number, direction: 'prev' | 'next') => {
    loadDirectionRef.current = direction;
    handlePageChange(page);
  }, [handlePageChange]);

  useEffect(() => {
    const dir = loadDirectionRef.current;
    loadDirectionRef.current = null;

    if (dir === 'next') {
      setAccumulatedNodes((prev) => {
        const map = new Map<string, FileSystemNode>();
        prev.forEach((n) => map.set(n.id, n));
        displayNodes.forEach((n) => { if (!map.has(n.id)) map.set(n.id, n); });
        return Array.from(map.values());
      });
    } else if (dir === 'prev') {
      setAccumulatedNodes((prev) => {
        const map = new Map<string, FileSystemNode>();
        displayNodes.forEach((n) => map.set(n.id, n));
        prev.forEach((n) => { if (!map.has(n.id)) map.set(n.id, n); });
        return Array.from(map.values());
      });
    } else {
      setAccumulatedNodes(displayNodes);
    }
  }, [displayNodes]);

  const viewNodes = isAtRoot ? displayNodes : accumulatedNodes;

  const currentAncestorPath = useMemo(() => {
    if (isAtRoot || isTrashView || breadcrumbs.length <= 1) return '';
    return breadcrumbs.slice(1).map((c) => c.name).join(' > ');
  }, [isAtRoot, isTrashView, breadcrumbs]);

  const handleFileOpen = useCallback((node: FileSystemNode) => {
    clearSelection();
    handleFileOpenRaw(node);
  }, [clearSelection, handleFileOpenRaw]);

  const clipboardHandleCopy = useCallback(() => {
    if (selectedNodes.size === 0) {
      showToast('请先选择要复制的文件', 'info');
      return;
    }
    setClipboard(Array.from(selectedNodes), 'copy', projectId);
    showToast(`已复制 ${selectedNodes.size} 个项目`, 'info');
  }, [selectedNodes, setClipboard, projectId, showToast]);

  const clipboardHandleCut = useCallback(() => {
    if (selectedNodes.size === 0) {
      showToast('请先选择要剪切的文件', 'info');
      return;
    }
    const nodeIds = Array.from(selectedNodes);
    const sourceParentIds: Record<string, string> = {};
    for (const id of nodeIds) {
      const node = nodes.find((n) => n.id === id);
      if (node?.parentId) sourceParentIds[id] = node.parentId;
    }
    setClipboard(nodeIds, 'cut', projectId, sourceParentIds);
    showToast(`已剪切 ${selectedNodes.size} 个项目`, 'info');
  }, [selectedNodes, nodes, setClipboard, projectId, showToast]);

  const clipboardHandlePaste = useCallback(async () => {
    if (clipboardItems.length === 0 || !clipboardMode) {
      return;
    }

    // 去重：如果剪贴板中同时包含父目录和子节点，只保留父目录（子节点会被递归复制）
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

    if (projectId) {
      const sourceProjectId = useFileSystemClipboardStore.getState().sourceProjectId;
      if (sourceProjectId && sourceProjectId !== projectId) {
        showToast('不能跨项目粘贴', 'error');
        return;
      }
    }

    const targetParentId = currentNode?.id || projectId;
    if (!targetParentId) {
      showToast('无法确定粘贴位置', 'error');
      return;
    }

    try {
      if (clipboardMode === 'cut') {
        const origParentIds = useFileSystemClipboardStore.getState().sourceParentIds;
        for (const nodeId of items) {
          const result = await fileSystemControllerMoveNode({ path: { nodeId }, body: { targetParentId }, throwOnError: true });
        }
        clearClipboard();
        showToast('粘贴成功', 'success');
        const action = {
          type: 'move' as const,
          description: `移动 ${items.length} 个项目`,
          projectId: urlProjectId || undefined,
          execute: async () => {
            for (const nodeId of items) {
              await fileSystemControllerMoveNode({ path: { nodeId }, body: { targetParentId }, throwOnError: true });
            }
          },
          rollback: async () => {
            for (const [nodeId, srcParentId] of Object.entries(origParentIds)) {
              if (!srcParentId) continue;
              await fileSystemControllerMoveNode({ path: { nodeId }, body: { targetParentId: srcParentId }, throwOnError: true });
            }
          },
        };
        pushAction(action);
      } else {
        const createdIdsRef: { current: string[] } = { current: [] };
        for (const nodeId of items) {
          try {
            const result = await fileSystemControllerCopyNode({ path: { nodeId }, body: { targetParentId }, throwOnError: true });
            const data = (result as unknown as { data?: { id?: string } })?.data || result;
            const newId = (data as unknown as { id?: string })?.id || '';
            if (newId) createdIdsRef.current.push(newId);
          } catch (e) {
          }
        }
        showToast('粘贴成功', 'success');
        if (createdIdsRef.current.length > 0) {
          pushAction({
            type: 'paste-copy',
            description: `复制 ${items.length} 个项目`,
            projectId: urlProjectId || undefined,
            execute: async () => {
              const newIds: string[] = [];
              for (const nodeId of items) {
                const result = await fileSystemControllerCopyNode({ path: { nodeId }, body: { targetParentId }, throwOnError: true });
                const data = (result as unknown as { data?: { id?: string } })?.data || result;
                const newId = (data as unknown as { id?: string })?.id || '';
                if (newId) newIds.push(newId);
              }
              createdIdsRef.current = newIds;
            },
            rollback: async () => {
              for (const id of createdIdsRef.current) {
                try {
                  await fileSystemControllerDeleteNode({ path: { nodeId: id }, query: { permanently: true }, throwOnError: true });
                } catch (e) {
                  if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'NOT_FOUND') continue;
                  throw e;
                }
              }
            },
          });
        }
      }
      handleRefresh();
    } catch (error) {
      const appError = handleError(error, '粘贴', 'medium');
      showToast(appError.message, 'error');
    }
  }, [clipboardItems, clipboardMode, projectId, currentNode, nodes, clearClipboard, handleRefresh, showToast, pushAction]);

  const handleRubberBandSelect = useCallback((nodeIds: string[]) => {
    selectNodes(nodeIds);
  }, [selectNodes]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedNodes.size === 0) return;
    handleBatchDelete(false);
  }, [selectedNodes, handleBatchDelete]);

  const handleRenameSelected = useCallback(() => {
    if (selectedNodes.size !== 1) return;
    const nodeId = selectedNodes.values().next().value;
    if (!nodeId) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      handleOpenRename(node);
    }
  }, [selectedNodes, nodes, handleOpenRename]);

  const clipboardHandleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;
    try {
      const action = undoStack[undoStack.length - 1];
      if (!action) return;
      await undoStoreUndo(projectId);
      showToast(`已撤销: ${action.description}`, 'info');
      handleRefresh();
    } catch (error) {
      const appError = handleError(error, '撤销', 'medium');
      showToast(appError.message, 'error');
    }
  }, [undoStack, undoStoreUndo, projectId, handleRefresh, showToast]);

  const clipboardHandleRedo = useCallback(async () => {
    if (redoStack.length === 0) return;
    try {
      const action = redoStack[redoStack.length - 1];
      if (!action) return;
      await undoStoreRedo(projectId);
      showToast(`已重做: ${action.description}`, 'info');
      handleRefresh();
    } catch (error) {
      const appError = handleError(error, '重做', 'medium');
      showToast(appError.message, 'error');
    }
  }, [redoStack, undoStoreRedo, projectId, handleRefresh, showToast]);

  useFileSystemShortcuts({
    containerRef,
    enabled: true,
    onUndo: () => clipboardHandleUndo(),
    onRedo: () => clipboardHandleRedo(),
    onCopy: () => clipboardHandleCopy(),
    onCut: () => clipboardHandleCut(),
    onPaste: () => clipboardHandlePaste(),
    onDeleteSelected: handleDeleteSelected,
    onRenameSelected: handleRenameSelected,
    onClearSelection: clearSelection,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  });

  const {
    isModalOpen: isProjectModalOpen,
    editingProject,
    setEditingProject,
    formData: projectFormData,
    loading: projectLoading,
    openCreateModal: openCreateProject,
    openEditModal: openEditProject,
    closeModal: closeProjectModal,
    setFormData: setProjectFormData,
    handleCreate: handleCreateProjectSubmit,
    handleUpdate: handleUpdateProjectSubmit,
    deleteConfirmOpen,
    projectToDelete,
    confirmDelete,
    cancelDelete,
  } = useProjectManagement({
    onProjectCreated: handleRefresh,
    onProjectUpdated: handleRefresh,
    onProjectDeleted: handleRefresh,
    showToast,
  });

  const personalSpaceQuery = usePersonalSpaceQuery({
    enabled: mode === 'personal-space',
  });

  useEffect(() => {
    if (personalSpaceQuery.data?.id) {
      setPersonalSpaceId(personalSpaceQuery.data.id);
      setPersonalSpaceIdLoading(false);
    } else if (personalSpaceQuery.isError) {
      setPersonalSpaceIdLoading(false);
    }
  }, [personalSpaceQuery.data, personalSpaceQuery.isError, setPersonalSpaceId, setPersonalSpaceIdLoading]);

  const { hasPermission } = usePermission();
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isProjectRolesModalOpen, setIsProjectRolesModalOpen] = useState(false);

  const canCreateProject = true;

  const [nodePermissions, setNodePermissions] = useState<
    Map<
      string,
      {
        canEdit: boolean;
        canDelete: boolean;
        canManageMembers: boolean;
        canManageRoles: boolean;
      }
    >
  >(new Map());

  const [permissionsLoading, setPermissionsLoading] = useState(false);

  const { permissions: projectPermissions } =
    useProjectPermissions(urlProjectId);

  const projectPermissionsRecord: Record<string, boolean> =
    projectPermissions as unknown as Record<string, boolean>;

  const {
    showVersionHistoryModal,
    versionHistoryNode,
    versionHistoryEntries,
    versionHistoryLoading,
    versionHistoryError,
    handleShowVersionHistory,
    handleOpenHistoricalVersion,
    closeVersionHistory,
  } = useVersionHistory({
    urlProjectId,
    projectPermissions: projectPermissionsRecord,
    showToast,
  });

  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareFileId, setShareFileId] = useState<string | null>(null);

  const handleShare = useCallback((node: FileSystemNode) => {
    setShareFileId(node.id);
    setShareDialogOpen(true);
  }, []);

  const {
    showSelectFolderModal,
    moveSourceNode,
    copySourceNode,
    handleMove,
    handleCopy,
    handleConfirmMoveOrCopy,
    setMoveSourceNode,
    setCopySourceNode,
    setShowSelectFolderModal,
  } = useMoveCopy({
    urlProjectId: urlProjectId || '',
    selectedNodes,
    nodes: displayNodes,
    handleRefresh,
    showToast,
  });

  const currentNodeIdRef = useRef<string | null>(null);
  const getCurrentParentId = useCallback(() => {
    if (currentNodeIdRef.current) return currentNodeIdRef.current;
    if (urlNodeId) return urlNodeId;
    if (urlProjectId) return urlProjectId;
    return '';
  }, [urlNodeId, urlProjectId, nodes]);

  useEffect(() => {
    if (currentNode?.id) {
      currentNodeIdRef.current = currentNode.id;
    }
  }, [currentNode]);

  const { isDragOver: isFileDragOver, dropHandlers: fileDropHandlers } = useFileDropUpload({
    nodeId: getCurrentParentId,
    openAfterUpload: false,
    onSuccess: () => {
      handleRefresh();
    },
  });

  useEffect(() => {
    if (!user) return;

    let nodesToLoad: string[] = [];

    if (isAtRoot) {
      nodesToLoad = displayNodes
        .filter((node) => node.isRoot)
        .map((node) => node.id);
    } else if (urlProjectId) {
      nodesToLoad = [urlProjectId];
    }

    if (nodesToLoad.length === 0) return;

    const loadPermissions = async () => {
      setPermissionsLoading(true);

      try {
        const {
          canEditNode,
          canDeleteNode,
          canManageNodeMembers,
          canManageNodeRoles,
        } = await import('@/utils/permissionUtils');

        const permissionsPromises = nodesToLoad.map(async (nodeId) => {
          const [canEdit, canDelete, canManageMembers, canManageRoles] =
            await Promise.all([
              canEditNode(user, nodeId),
              canDeleteNode(user, nodeId),
              canManageNodeMembers(user, nodeId),
              canManageNodeRoles(user, nodeId),
            ]);

          return { nodeId, canEdit, canDelete, canManageMembers, canManageRoles };
        });

        const permissionsResults = await Promise.all(permissionsPromises);

        setNodePermissions((prev) => {
          const newMap = new Map(prev);
          permissionsResults.forEach((result) => {
            newMap.set(result.nodeId, {
              canEdit: result.canEdit,
              canDelete: result.canDelete,
              canManageMembers: result.canManageMembers,
              canManageRoles: result.canManageRoles,
            });
          });
          return newMap;
        });
      } catch (error) {
        handleError(error, '加载权限信息失败');
      } finally {
        setPermissionsLoading(false);
      }
    };

    loadPermissions();
  }, [user, isAtRoot, urlProjectId, nodes.length]);

  useEffect(() => {
    const action = searchParams.get('action');
    if (isAtRoot || loading) return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    if (action === 'upload') {
      timer = setTimeout(() => {
        if (uploaderRef.current) {
          uploaderRef.current.triggerUpload();
          const newSearchParams = new URLSearchParams(searchParams);
          newSearchParams.delete('action');
          navigate({ search: newSearchParams.toString() }, { replace: true });
        }
      }, 300);
    }

    if (action === 'new-drawing') {
      timer = setTimeout(() => {
        setShowCreateDrawingModal(true);
        const newSearchParams = new URLSearchParams(searchParams);
        newSearchParams.delete('action');
        navigate({ search: newSearchParams.toString() }, { replace: true });
      }, 300);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [searchParams, isAtRoot, loading, navigate, setShowCreateDrawingModal]);

  const handleShowMembers = useCallback((project: FileSystemNode) => {
    setEditingProject(project);
    setIsMembersModalOpen(true);
  }, []);

  const handleShowRoles = useCallback((project: FileSystemNode) => {
    setEditingProject(project);
    setIsProjectRolesModalOpen(true);
  }, []);

  const highlightNodeId = searchParams.get('highlight');
  const pageFromUrl = searchParams.get('page');
  const searchQueryFromUrl = searchParams.get('search');

  useEffect(() => {
    if (searchQueryFromUrl && searchQueryFromUrl !== searchTerm) {
      setSearchTerm(searchQueryFromUrl);
    }
  }, [searchQueryFromUrl, searchTerm, setSearchTerm]);

  const prevPageFromUrlRef = useRef(pageFromUrl);
  useEffect(() => {
    if (!pageFromUrl || isAtRoot) return;
    const pageNum = parseInt(pageFromUrl, 10);
    if (isNaN(pageNum) || pageNum < 1) return;

    if (prevPageFromUrlRef.current !== pageFromUrl || pagination.page !== pageNum) {
      prevPageFromUrlRef.current = pageFromUrl;
      handlePageChange(pageNum);
    }

    const timer = setTimeout(() => {
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete('page');
      navigate({ search: newSearchParams.toString() }, { replace: true });
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageFromUrl, isAtRoot, searchParams, navigate]);

  useEffect(() => {
    if (!highlightNodeId) return;
    const timer = setTimeout(() => {
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete('highlight');
      navigate({ search: newSearchParams.toString() }, { replace: true });
    }, 4500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildNodeUrl = useCallback((node: FileSystemNode): string => {
    if (mode === 'personal-space') {
      return `/personal-space/${node.id}`;
    }
    const pid = urlProjectId || node.projectId;
    if (pid) {
      return `/projects/${pid}/files/${node.id}`;
    }
    return '#';
  }, [mode, urlProjectId]);

  const handleOpen = useCallback((node: FileSystemNode) => {
    handleEnterFolder(node);
  }, [handleEnterFolder]);

  const handleOpenInNewTab = useCallback((node: FileSystemNode) => {
    const url = buildNodeUrl(node);
    if (url !== '#') window.open(window.location.origin + url, '_blank');
  }, [buildNodeUrl]);

  const handleBreadcrumbPathSubmit = useCallback(async (path: string) => {
    // 编辑框使用 " / " 分隔，后端要求 " > " 分隔
    const normalizedPath = path.replace(/\s*\/\s*/g, ' > ');
    const query: Record<string, string> = { path: normalizedPath };
    if (mode === 'project' && urlProjectId) {
      query.projectId = urlProjectId;
    }
    if (!query.projectId && mode !== 'personal-space') return;
    try {
      const { data } = await client.get({
        url: `/api/v1/file-system/resolve-path`,
        query,
        throwOnError: true,
      });
      const node = data as unknown as FileSystemNode;
      if (node?.id) {
        const url = buildNodeUrl(node);
        navigate(url);
      }
    } catch {
      showToast('路径不存在或无法访问', 'error');
    }
  }, [mode, urlProjectId, navigate, buildNodeUrl, showToast]);

  const handleOpenFileLocation = useCallback(async (node: FileSystemNode) => {
    if (!node.parentId) return;
    try {
      const pageSize = pagination?.limit || 30;
      type ContextResponse = { 200: { parentId: string; pageNumber: number } };
      const { data } = await client.get<ContextResponse, unknown, true>({
        url: `/api/v1/file-system/nodes/${node.id}/parent-context`,
        query: { pageSize },
        throwOnError: true,
      });
      const ctx = data as unknown as { parentId: string; pageNumber: number };
      const baseUrl = buildNodeUrl({ ...node, id: node.parentId } as FileSystemNode);
      const url = `${window.location.origin}${baseUrl}?highlight=${node.id}&page=${ctx.pageNumber}`;
      window.open(url, '_blank');
    } catch {
      const baseUrl = buildNodeUrl({ ...node, id: node.parentId } as FileSystemNode);
      window.open(window.location.origin + baseUrl, '_blank');
    }
  }, [buildNodeUrl, pagination]);

  const handleNewFolder = useCallback((node: FileSystemNode) => {
    const store = useFileSystemStore.getState();
    store.setCurrentParentId(node.id);
    setShowCreateFolderModal(true);
  }, [setShowCreateFolderModal]);

  const handleCopyClipboard = useCallback((node: FileSystemNode) => {
    useFileSystemClipboardStore.getState().setClipboard(
      [node.id],
      'copy',
      urlProjectId || '',
      { [node.id]: node.parentId || '' },
    );
    showToast('已复制', 'info');
  }, [urlProjectId, showToast]);

  const handleCut = useCallback((node: FileSystemNode) => {
    useFileSystemClipboardStore.getState().setClipboard(
      [node.id],
      'cut',
      urlProjectId || '',
      { [node.id]: node.parentId || '' },
    );
    showToast('已剪切', 'info');
  }, [urlProjectId, showToast]);

  const handleDownloadFolder = useCallback((node: FileSystemNode) => {
    handleDownload(node);
  }, [handleDownload]);

  const handleCopyPath = useCallback(async (node: FileSystemNode) => {
    const path = node.ancestorPath
      ? `${node.ancestorPath} > ${node.name}`
      : node.name;
    try {
      await navigator.clipboard.writeText(path);
      showToast('路径已复制到剪贴板', 'success');
    } catch {
      showToast('复制失败', 'error');
    }
  }, [showToast]);

  const handleSubmitProject = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (editingProject) {
        handleUpdateProjectSubmit(async (id, data) => {
          await fileSystemControllerUpdateNode({
            path: { nodeId: id },
            body: { name: data.name ?? undefined, description: data.description },
            throwOnError: true,
          } as Parameters<typeof fileSystemControllerUpdateNode>[0]);
        });
      } else {
        handleCreateProjectSubmit(async (name, description) => {
          await fileSystemControllerCreateProject({ body: { name, description }, throwOnError: true } as Parameters<typeof fileSystemControllerCreateProject>[0]);
        });
      }
    },
    [editingProject, handleCreateProjectSubmit, handleUpdateProjectSubmit]
  );

  const handleUploadExternalReference = useCallback((_node: FileSystemNode) => {
  }, []);

  const { handleDragStart, handleDragOver, handleDragLeave, handleDrop } =
    useDragAndDrop({
      draggedNodes,
      setDraggedNodes,
      dropTargetId,
      setDropTargetId,
      handleRefresh,
      showToast,
    });

  const showSelectionBar = selectedNodes.size > 0;
  const showClipboardBar = !isAtRoot && selectedNodes.size === 0 && clipboardItems.length > 0;

  const handleCancelBar = useCallback(() => {
    clearSelection();
    clearClipboard();
  }, [clearSelection, clearClipboard]);

  const bottomBar = (showSelectionBar || showClipboardBar) ? (
    <div className="flex items-center gap-4">
      {showSelectionBar && (
        <>
          <span className="text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>已选中 {selectedNodes.size} 项</span>
          <div className="w-px h-4" style={{ background: 'var(--border-default)' }} />

          {isTrashView && (
            <Button variant="secondary" onClick={handleBatchRestore} className="text-emerald-400 hover:text-white">恢复</Button>
          )}

          {!isTrashView && !isAtRoot && (
            <>
               <Button variant="secondary" onClick={clipboardHandleCut} style={{ color: 'var(--text-secondary)' }}>剪切</Button>
              <Button variant="secondary" onClick={clipboardHandleCopy} style={{ color: 'var(--text-secondary)' }}>复制</Button>
            </>
          )}

          {isTrashView && (
            <Button variant="secondary" onClick={() => handleBatchDelete(true)} style={{ color: 'var(--error)' }}>彻底删除</Button>
          )}

          {!isTrashView && (
            <Button variant="secondary" onClick={() => handleBatchDelete(false)} style={{ color: 'var(--error)' }}>删除</Button>
          )}
        </>
      )}

      {(!showSelectionBar || (!isAtRoot && !isTrashView)) && (
        <div className="flex items-center gap-0 rounded-lg" style={{ border: '1px solid var(--border-default)', overflow: 'hidden' }}>
          <Button
            variant="secondary"
            onClick={clipboardHandlePaste}
            disabled={clipboardItems.length === 0}
            style={{ color: 'var(--text-secondary)', border: 'none', borderRadius: 0 }}
            className="relative px-3"
          >
            粘贴
            {clipboardItems.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold leading-none" style={{ background: 'var(--primary-500)', color: '#fff' }}>
                {clipboardItems.length}
              </span>
            )}
          </Button>
          {clipboardItems.length > 0 && (
            <Button
              variant="secondary"
              onClick={clearClipboard}
              style={{ color: 'var(--text-muted)', border: 'none', borderRadius: 0, padding: '0 8px' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </Button>
          )}
        </div>
      )}

      <Button variant="secondary" onClick={handleCancelBar} style={{ color: 'var(--text-muted)' }}>
        取消
      </Button>
    </div>
  ) : undefined;

  const showEmpty = displayNodes.length === 0 && !loading && !error;

  return (
    <>
      {createPortal(
        <ToastContainer toasts={toasts} onRemove={removeToast} />,
        document.body
      )}

      <div ref={containerRef} className="h-full flex flex-col overflow-hidden">
        <div className="flex-shrink-0 max-w-7xl mx-auto w-full space-y-6 relative">
          <FileSystemHeader
            mode={mode}
            isAtRoot={isAtRoot}
            isTrashView={isTrashView}
            isPersonalSpaceMode={isPersonalSpaceMode}
            isProjectRootMode={isProjectRootMode}
            loading={loading}
            isFetching={isFetching}
            searchTerm={searchTerm}
            viewMode={viewMode}
            selectedNodes={selectedNodes}
            nodesCount={displayNodes.length}
            projectFilter={projectFilter}
            breadcrumbs={breadcrumbs}
            canCreateProject={canCreateProject}
            uploaderRef={uploaderRef as React.RefObject<MxCadUploaderRef>}
            getCurrentParentId={() => currentNode?.id || urlNodeId || urlProjectId || ''}
            onSetSearchTerm={setSearchTerm}
            onSetViewMode={setViewMode}
            onSearchSubmit={handleSearchSubmit}
            onSelectAll={handleSelectAll}
            onToggleTrashView={handleToggleTrashView}
            onClearTrash={() => handleClearTrash(isTrashView && !isAtRoot ? urlProjectId : undefined)}
            onProjectFilterChange={setProjectFilter}
            onRefresh={handleRefresh}
            onCreateFolder={() => setShowCreateFolderModal(true)}
            onCreateDrawing={() => setShowCreateDrawingModal(true)}
            onCreateProject={openCreateProject}
            onGoBack={handleGoBack}
            onBreadcrumbNavigate={(crumb) => {
              if (isTrashView && crumb.id !== 'trash') {
                handleToggleTrashView();
              }
              if (isPersonalSpaceMode) {
                if (crumb.isRoot) {
                  navigate('/personal-space');
                } else {
                  navigate(`/personal-space/${crumb.id}`);
                }
              } else {
                if (crumb.isRoot) {
                  navigate(`/projects/${crumb.id}/files`);
                } else {
                  navigate(`/projects/${urlProjectId}/files/${crumb.id}`);
                }
              }
            }}
            onBreadcrumbPathSubmit={handleBreadcrumbPathSubmit}
            showToast={showToast}
            clipboardCount={clipboardItems.length}
            clipboardMode={clipboardMode}
            onCopy={clipboardHandleCopy}
            onCut={clipboardHandleCut}
            onPaste={clipboardHandlePaste}
            searchFilters={searchFilters}
            onSearchFiltersChange={handleFiltersChange}
          />
        </div>

        <div className="flex-1 min-h-0 max-w-7xl mx-auto w-full mt-6 flex flex-col gap-3">
          <div
            className="flex-1 min-h-0 rounded-2xl shadow-sm overflow-hidden"
            style={{
              background: 'transparent',
              border: '1px solid var(--border-default)',
            }}
          >
            <div
              className="h-full rounded-2xl flex flex-col overflow-hidden"
              {...(!isAtRoot ? fileDropHandlers : {})}
            >
              {isFileDragOver && (
                <div
                  className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl pointer-events-none m-0"
                  style={{
                    background: 'color-mix(in srgb, var(--primary-500) 8%, transparent)',
                    border: '2px dashed var(--primary-400)',
                  }}
                >
                  <div
                    className="flex items-center gap-3 px-6 py-3 rounded-xl"
                    style={{
                      background: 'var(--bg-elevated)',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                    }}
                  >
                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--primary-500)' }} />
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>释放文件以上传到当前目录</span>
                  </div>
                </div>
              )}

              {loading || error || showEmpty ? (
                <div className="flex-1 flex items-center justify-center">
                  <FileSystemStates
                    loading={loading}
                    error={error}
                    isEmpty={showEmpty}
                    isAtRoot={isAtRoot}
                    isTrashView={isTrashView}
                    searchTerm={searchTerm}
                    canCreateProject={canCreateProject}
                    projectFilter={projectFilter}
                    onRefresh={handleRefresh}
                    onCreateProject={openCreateProject}
                  />
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col">
                  <FileSystemContent
                    onClearTrash={() => handleClearTrash(isTrashView && !isAtRoot ? urlProjectId : undefined)}
                    nodes={viewNodes}
                    viewMode={viewMode}
                    isTrashView={isTrashView}
                    isAtRoot={isAtRoot}
                    selectedNodes={selectedNodes}
                    dropTargetId={dropTargetId}
                    nodePermissions={nodePermissions}
                    projectPermissions={projectPermissionsRecord}
                    paginationMeta={paginationMeta}
                    onNodeSelect={handleNodeSelect}
                    onFileOpen={handleFileOpen}
                    onDownload={handleDownload}
                    onDelete={handleDelete}
                    onPermanentlyDelete={handlePermanentlyDelete}
                    onRename={handleOpenRename}
                    onRefresh={handleRefresh}
                    onRestore={isTrashView ? handleRestoreNode : undefined}
                    onEdit={isAtRoot ? (node: FileSystemNode) => openEditProject(node) : undefined}
                    onDeleteNode={isAtRoot ? (node: FileSystemNode) => {
                      if (isTrashView) {
                        handlePermanentlyDeleteProject(node.id, node.name);
                      } else {
                        handleDeleteProject(node.id, node.name);
                      }
                    } : undefined}
                    onShowMembers={isAtRoot ? (node: FileSystemNode) => handleShowMembers(node) : undefined}
                    onShowRoles={isAtRoot ? (node: FileSystemNode) => handleShowRoles(node) : undefined}
                    onMove={handleMove}
                    onCopy={handleCopy}
                    onShowVersionHistory={handleShowVersionHistory}
                    onShare={handleShare}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    fileDropHandlers={fileDropHandlers}
                    isFileDragOver={isFileDragOver}
                    onPageChange={handlePageChange}
                    onPageSizeChange={handlePageSizeChange}
                    onDeleteProject={handleDeleteProject}
                    onPermanentlyDeleteProject={handlePermanentlyDeleteProject}
                    onRubberBandSelect={handleRubberBandSelect}
                    onBatchDelete={() => handleBatchDelete(isTrashView)}
                    onBatchMove={clipboardHandleCut}
                    onBatchCopy={clipboardHandleCopy}
                    onBatchRestore={isTrashView ? handleBatchRestore : undefined}
                    loading={loading || isFetching}
                    currentPage={paginationMeta?.page}
                    totalPages={paginationMeta?.totalPages}
                    onScrollPageChange={handleScrollPageChange}
                    highlightNodeId={highlightNodeId || undefined}
                    isSearchResult={!!searchTerm}
                    currentAncestorPath={currentAncestorPath}
                    onOpen={handleOpen}
                    onOpenInNewTab={handleOpenInNewTab}
                    onOpenFileLocation={handleOpenFileLocation}
                    onNewFolder={handleNewFolder}
                    onCopyClipboard={handleCopyClipboard}
                    onCut={handleCut}
                    onDownloadFolder={handleDownloadFolder}
                    onCopyPath={handleCopyPath}
                    onCreateFolderInCurrentDir={() => setShowCreateFolderModal(true)}
                    onCreateDrawingInCurrentDir={() => setShowCreateDrawingModal(true)}
                    onUpload={() => uploaderRef.current?.triggerUpload()}
                    onPasteInCurrentDir={clipboardHandlePaste}
                    clipboardHasItems={clipboardItems.length > 0}
                    onCreateProject={openCreateProject}
                  />
                </div>
              )}
            </div>
          </div>
          {bottomBar && (
            <div className="flex-shrink-0 flex justify-center">
              <div className="inline-flex items-center gap-4 px-6 py-3 rounded-full shadow-2xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
                {bottomBar}
              </div>
            </div>
          )}
        </div>
      </div>

      <CreateFolderModal
        isOpen={showCreateFolderModal}
        folderName={folderName}
        loading={loading}
        onClose={() => setShowCreateFolderModal(false)}
        onFolderNameChange={setFolderName}
        onCreate={handleCreateFolder}
      />

      <NewDrawingModal
        isOpen={showCreateDrawingModal}
        drawingName={drawingName}
        loading={loading}
        onClose={() => {
          setShowCreateDrawingModal(false);
          setDrawingName('');
        }}
        onDrawingNameChange={setDrawingName}
        onCreate={handleCreateDrawing}
      />

      <RenameModal
        isOpen={showRenameModal}
        editingNode={editingNode}
        newName={folderName}
        loading={loading}
        onClose={() => {
          setShowRenameModal(false);
          setEditingNode(null);
          setFolderName('');
        }}
        onNameChange={setFolderName}
        onRename={handleRename}
      />

      <ProjectModal
        isOpen={isProjectModalOpen}
        editingProject={editingProject}
        formData={projectFormData}
        loading={projectLoading}
        onClose={closeProjectModal}
        onFormDataChange={setProjectFormData}
        onSubmit={handleSubmitProject}
      />

      <Modal
        isOpen={deleteConfirmOpen}
        onClose={cancelDelete}
        title="确认删除项目"
        footer={
          <>
            <Button variant="secondary" onClick={cancelDelete} disabled={projectLoading}>
              取消
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={projectLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {projectLoading ? '删除中...' : '确认删除'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div
            className="flex items-start gap-3 p-4 rounded-lg"
            style={{ background: 'var(--warning-dim)', border: '1px solid var(--warning)' }}
          >
            <AlertCircle size={20} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              <p className="font-semibold mb-1">重要提示</p>
              <p style={{ color: 'var(--text-tertiary)' }}>
                删除项目后，项目中的所有文件和数据可能无法恢复。
              </p>
            </div>
          </div>
          {projectToDelete && (
            <div className="space-y-2">
              <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                删除项目：
              </p>
              <div className="p-3 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {projectToDelete.name}
                </p>
                {projectToDelete.description && (
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {projectToDelete.description}
                  </p>
                )}
              </div>
            </div>
          )}
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            确定要删除该项目吗？此操作不可恢复。
          </p>
        </div>
      </Modal>

      <MembersModal
        isOpen={isMembersModalOpen}
        projectId={editingProject?.id || urlProjectId || ''}
        onClose={() => {
          setIsMembersModalOpen(false);
          setEditingProject(null);
        }}
      />

      <ProjectRolesModal
        isOpen={isProjectRolesModalOpen}
        projectId={editingProject?.id || urlProjectId || ''}
        onClose={() => {
          setIsProjectRolesModalOpen(false);
          setEditingProject(null);
        }}
      />

      <SelectFolderModal
        isOpen={showSelectFolderModal}
        currentNodeId={
          moveSourceNode?.id === 'batch' || copySourceNode?.id === 'batch'
            ? ''
            : moveSourceNode?.id || copySourceNode?.id || ''
        }
        projectId={urlProjectId}
        onClose={() => {
          setShowSelectFolderModal(false);
          setMoveSourceNode(null);
          setCopySourceNode(null);
        }}
        onConfirm={handleConfirmMoveOrCopy}
      />

      <KeyboardShortcuts
        onUploadExternalReference={handleUploadExternalReference}
        selectedNode={currentNode}
      />

      <DownloadFormatModal
        isOpen={showDownloadFormatModal}
        fileName={downloadingNode?.name ?? ''}
        onClose={() => {
          setShowDownloadFormatModal(false);
          setDownloadingNode(null);
        }}
        onDownload={handleDownloadWithFormat}
      />

      <VersionHistoryModal
        isOpen={showVersionHistoryModal}
        node={versionHistoryNode}
        entries={versionHistoryEntries}
        loading={versionHistoryLoading}
        error={versionHistoryError}
        onClose={closeVersionHistory}
        onOpenVersion={handleOpenHistoricalVersion}
      />

      <ShareDialog
        isOpen={shareDialogOpen}
        onClose={() => {
          setShareDialogOpen(false);
          setShareFileId(null);
        }}
        fileId={shareFileId ?? undefined}
      />

    </>
  );
};

export default FileSystemManager;
