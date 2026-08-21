import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBatchDownloadStore } from '@/stores/useBatchDownloadStore';
import {
  libraryControllerResolveDrawingPath,
  libraryControllerResolveBlockPath,
} from '@/api-sdk';
import { getErrorMessage } from '../../../utils/errorHandler';
import { t } from '@/languages';
import type { FileSystemNode } from '../../../types/filesystem';
import type { UseLibraryOperationsReturn } from '../../../hooks/library/useLibraryOperations';

type LibraryType = 'drawing' | 'block';
type ShowToast = (
  message: string,
  type: 'success' | 'error' | 'warning' | 'info'
) => void;

interface Modals {
  openCreateFolderModal: () => void;
  closeCreateFolderModal: () => void;
  renamingNode: { id: string; name: string } | null;
  openRenameModal: (node: {
    id: string;
    name: string;
    isFolder?: boolean;
  }) => void;
  closeRenameModal: () => void;
  moveSourceNode: { id: string; name: string } | null;
  copySourceNode: { id: string; name: string } | null;
  openMoveModal: (node: { id: string; name: string }) => void;
  openCopyModal: (node: { id: string; name: string }) => void;
  closeSelectFolderModal: () => void;
  downloadingNodeId: string | null;
  openDownloadFormatModal: (nodeId: string, fileName: string) => void;
  closeDownloadFormatModal: () => void;
}

export interface UseLibraryActionsOptions {
  libraryType: LibraryType;
  libraryId: string | null;
  nodes: FileSystemNode[];
  currentNode: FileSystemNode | null;
  breadcrumbs: Array<{ id: string; name: string }>;
  selectedNodes: Set<string>;
  canManage: boolean;
  clearSelection: () => void;
  setCurrentPage: (page: number) => void;
  setSearchTerm: (term: string) => void;
  setLibraryType: (type: LibraryType) => void;
  showToast: ShowToast;
  libraryOperations: UseLibraryOperationsReturn;
  modals: Modals;
}

export interface UseLibraryActionsReturn {
  handleOpenInEditor: (node: {
    id: string;
    name: string;
    isFolder?: boolean;
    path?: string;
  }) => void;
  handleDownloadWithFormat: (
    format: 'dwg' | 'dxf' | 'mxweb' | 'pdf',
    pdfOptions?: {
      width?: string;
      height?: string;
      colorPolicy?: 'mono' | 'color';
    },
    dwgOptions?: { dwgVersion: number }
  ) => Promise<void>;
  handleCreateFolder: (name: string) => Promise<void>;
  handleDeleteConfirm: (nodeId: string, nodeName: string) => void;
  handleDownload: (nodeId: string) => Promise<void>;
  handleFolderDownload: (node: FileSystemNode) => void;
  handleRename: (node: {
    id: string;
    name: string;
    isFolder?: boolean;
  }) => void;
  handleRenameSelected: () => void;
  handleRenameSubmit: (newName: string) => Promise<void>;
  handleMove: (node: { id: string; name: string }) => void;
  handleCopy: (node: { id: string; name: string }) => void;
  handleSelectFolderConfirm: (targetParentId: string) => Promise<void>;
  handleSearchSubmit: () => void;
  handleSwitchLibrary: (type: LibraryType) => void;
  handleBreadcrumbNav: (crumb: {
    id: string;
    name: string;
    isRoot?: boolean;
  }) => void;
  handleBreadcrumbPathSubmit: (path: string) => Promise<void>;
  handleGoBack: () => void;
}

export function useLibraryActions({
  libraryType,
  libraryId,
  nodes,
  currentNode,
  breadcrumbs,
  selectedNodes,
  canManage,
  clearSelection,
  setCurrentPage,
  setSearchTerm,
  setLibraryType,
  showToast,
  libraryOperations,
  modals,
}: UseLibraryActionsOptions): UseLibraryActionsReturn {
  const navigate = useNavigate();

  const {
    openCreateFolderModal,
    closeCreateFolderModal,
    renamingNode,
    openRenameModal,
    closeRenameModal,
    moveSourceNode,
    copySourceNode,
    openMoveModal,
    openCopyModal,
    closeSelectFolderModal,
    downloadingNodeId,
    openDownloadFormatModal,
    closeDownloadFormatModal,
  } = modals;

  const handleOpenInEditor = useCallback(
    async (node: {
      id: string;
      name: string;
      isFolder?: boolean;
      path?: string;
    }) => {
      if (node.isFolder) {
        return;
      }

      try {
        const editorUrl = `/cad-editor/${node.id}?library=${libraryType}&back=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        window.open(editorUrl, '_blank');
        showToast(t('正在打开：{name}', { name: node.name }), 'success');
      } catch (err) {
        console.error('打开文件失败:', err);
        showToast(getErrorMessage(err), 'error');
      }
    },
    [libraryType, showToast]
  );

  const handleDownloadWithFormat = useCallback(
    async (
      format: 'dwg' | 'dxf' | 'mxweb' | 'pdf',
      pdfOptions?: {
        width?: string;
        height?: string;
        colorPolicy?: 'mono' | 'color';
      },
      dwgOptions?: { dwgVersion: number }
    ) => {
      if (!downloadingNodeId) return;

      const node = nodes.find((n) => n.id === downloadingNodeId);
      if (!node) return;

      await libraryOperations.handleDownloadWithFormat(
        downloadingNodeId,
        node.name,
        format,
        pdfOptions,
        dwgOptions
      );
      closeDownloadFormatModal();
    },
    [downloadingNodeId, nodes, libraryOperations, closeDownloadFormatModal]
  );

  const handleCreateFolder = useCallback(
    async (name: string) => {
      try {
        const parentId = currentNode?.id || libraryId || undefined;
        await libraryOperations.handleCreateFolder(name, parentId);
        closeCreateFolderModal();
        showToast(t('文件夹创建成功'), 'success');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t('创建失败');
        showToast(message, 'error');
      }
    },
    [
      libraryOperations,
      currentNode,
      libraryId,
      showToast,
      closeCreateFolderModal,
    ]
  );

  const handleDeleteConfirm = useCallback(
    (nodeId: string, nodeName: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      libraryOperations.handleDelete({
        id: node.id,
        name: node.name,
        isFolder: node.isFolder || false,
        path: node.path,
      });
    },
    [nodes, libraryOperations]
  );

  const handleDownload = useCallback(
    async (nodeId: string) => {
      await libraryOperations.handleDownload(nodeId);
    },
    [libraryOperations]
  );

  const handleFolderDownload = useCallback((node: FileSystemNode) => {
    useBatchDownloadStore.getState().openFolderDialog(node.id, node.name);
  }, []);

  const handleRename = useCallback(
    (node: { id: string; name: string; isFolder?: boolean }) => {
      openRenameModal(node);
    },
    [openRenameModal]
  );

  const handleRenameSelected = useCallback(() => {
    if (!canManage) return;
    if (selectedNodes.size !== 1) return;
    const nodeId = selectedNodes.values().next().value;
    if (!nodeId) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      handleRename({ id: node.id, name: node.name });
    }
  }, [canManage, selectedNodes, nodes, handleRename]);

  const handleRenameSubmit = useCallback(
    async (newName: string) => {
      if (!renamingNode || !newName.trim()) return;
      try {
        await libraryOperations.handleRename(
          renamingNode.id,
          newName.trim(),
          () => closeRenameModal()
        );
      } catch {
        // 错误已在 libraryOperations 中处理
      }
    },
    [renamingNode, libraryOperations, closeRenameModal]
  );

  const handleMove = useCallback(
    (node: { id: string; name: string }) => {
      openMoveModal(node);
    },
    [openMoveModal]
  );

  const handleCopy = useCallback(
    (node: { id: string; name: string }) => {
      openCopyModal(node);
    },
    [openCopyModal]
  );

  const handleSelectFolderConfirm = useCallback(
    async (targetParentId: string) => {
      try {
        if (moveSourceNode?.id === 'batch' || copySourceNode?.id === 'batch') {
          const nodeIds = Array.from(selectedNodes);

          if (moveSourceNode?.id === 'batch') {
            await libraryOperations.handleBatchMove(nodeIds, targetParentId);
          } else {
            await libraryOperations.handleBatchCopy(nodeIds, targetParentId);
          }

          clearSelection();
        } else if (moveSourceNode) {
          await libraryOperations.handleMove(moveSourceNode.id, targetParentId);
        } else if (copySourceNode) {
          await libraryOperations.handleCopy(copySourceNode.id, targetParentId);
        }

        closeSelectFolderModal();
      } catch {
        // 错误已在 libraryOperations 中处理
      }
    },
    [
      moveSourceNode,
      copySourceNode,
      selectedNodes,
      clearSelection,
      libraryOperations,
      closeSelectFolderModal,
    ]
  );

  const handleSearchSubmit = useCallback(() => {
    setCurrentPage(1);
  }, [setCurrentPage]);

  const handleSwitchLibrary = useCallback(
    (type: LibraryType) => {
      setSearchTerm('');
      setLibraryType(type);
    },
    [setLibraryType, setSearchTerm]
  );

  const handleBreadcrumbNav = useCallback(
    (crumb: { id: string; name: string; isRoot?: boolean }) => {
      setCurrentPage(1);
      setSearchTerm('');
      if (crumb.id === libraryId) {
        navigate(`/library/${libraryType}`);
      } else {
        navigate(`/library/${libraryType}/${crumb.id}`);
      }
    },
    [libraryType, libraryId, navigate, setSearchTerm, setCurrentPage]
  );

  const handleBreadcrumbPathSubmit = useCallback(
    async (path: string) => {
      try {
        const normalizedPath = path
          .replace(/^\//, '')
          .replace(/^(drawing|block)\s*\/?\s*/i, '')
          .replace(/\s*\/\s*/g, ' > ')
          .trim();
        if (!normalizedPath) {
          navigate(`/library/${libraryType}`);
          return;
        }
        const resolvePath =
          libraryType === 'drawing'
            ? libraryControllerResolveDrawingPath
            : libraryControllerResolveBlockPath;
        const result = await resolvePath({
          query: { path: normalizedPath },
        });
        if (result.error) throw result.error;
        const node = result.data as FileSystemNode;
        if (node?.id) {
          navigate(`/library/${libraryType}/${node.id}`);
        }
      } catch {
        showToast(t('路径不存在或无法访问'), 'error');
      }
    },
    [libraryType, navigate, showToast]
  );

  const handleGoBack = useCallback(() => {
    setCurrentPage(1);
    setSearchTerm('');
    if (breadcrumbs.length > 1) {
      const parent = breadcrumbs[breadcrumbs.length - 2];
      if (parent) {
        if (parent.id === libraryId) {
          navigate(`/library/${libraryType}`);
        } else {
          navigate(`/library/${libraryType}/${parent.id}`);
        }
      }
    }
  }, [
    breadcrumbs,
    libraryType,
    libraryId,
    navigate,
    setSearchTerm,
    setCurrentPage,
  ]);

  return {
    handleOpenInEditor,
    handleDownloadWithFormat,
    handleCreateFolder,
    handleDeleteConfirm,
    handleDownload,
    handleFolderDownload,
    handleRename,
    handleRenameSelected,
    handleRenameSubmit,
    handleMove,
    handleCopy,
    handleSelectFolderConfirm,
    handleSearchSubmit,
    handleSwitchLibrary,
    handleBreadcrumbNav,
    handleBreadcrumbPathSubmit,
    handleGoBack,
  };
}
