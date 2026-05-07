///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import { useCallback } from 'react';
import { MxFun } from 'mxdraw';
import { libraryControllerGetBlockNode } from '@/api-sdk';
import type { FileSystemNode } from '@/types/filesystem';
import { FileItem } from '@/components/FileItem';
import { getFileItemPermissionProps } from '@/hooks/useFileItemProps';
import { SystemPermission } from '@/constants/permissions';
import type { LibraryType } from '@/components/ProjectDrawingsPanel/types';
import type { ViewMode, ResourceItem } from '@/components/common';
import { handleError } from '@/utils/errorHandler';

interface UseFileItemRendererOptions {
  nodes: FileSystemNode[];
  isLibraryMode: boolean;
  libraryType?: LibraryType;
  canManageLibrary: boolean;
  doubleClickToOpen: boolean;
  projectPermissions: ReturnType<typeof import('@/hooks/useProjectPermissions').useProjectPermissions>['permissions'];
  onDrawingOpen: (node: FileSystemNode, libraryType?: LibraryType) => void;
  handleEnterFolder: (folder: FileSystemNode) => void;
  handleDownload: (node: FileSystemNode) => void;
  handleDelete: (node: FileSystemNode) => void;
  handleOpenRename: (node: FileSystemNode) => void;
  handleLibraryOpenRename: (node: FileSystemNode) => void;
  handleShowVersionHistory: (node: FileSystemNode) => Promise<void>;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  user: { id: string } | null;
  hasPermission: (permission: SystemPermission) => boolean;
  setDownloadingNode: (node: FileSystemNode | null) => void;
  setShowDownloadFormatModal: (show: boolean) => void;
  libraryOperations: {
    handleDelete: (node: FileSystemNode) => void;
  };
}

export function useFileItemRenderer(options: UseFileItemRendererOptions) {
  const {
    nodes, isLibraryMode, libraryType, canManageLibrary, doubleClickToOpen,
    projectPermissions, onDrawingOpen, handleEnterFolder, handleDownload,
    handleDelete, handleOpenRename, handleLibraryOpenRename,
    handleShowVersionHistory, showToast, user, hasPermission,
    setDownloadingNode, setShowDownloadFormatModal, libraryOperations,
  } = options;

  const renderFileItem = useCallback(
    (item: ResourceItem, viewMode: ViewMode) => {
      const node = nodes.find((n) => n.id === item.id);
      if (!node) return null;

      const handleLibraryDownload = () => {
        if (node.isFolder) return;
        setDownloadingNode(node);
        setShowDownloadFormatModal(true);
      };

      const handleLibraryDelete = () => {
        libraryOperations.handleDelete(node);
      };

      const handleBlockInsert = async (blockNode: FileSystemNode) => {
        if (blockNode.isFolder) {
          handleEnterFolder(blockNode);
          return;
        }
        try {
          const { MxCpp } = await import('mxcad');
          const mxcad = MxCpp.getCurrentMxCAD();
          if (!mxcad) {
            showToast('请先打开一张图纸，然后再插入图块', 'warning');
            return;
          }
          let latestUpdatedAt = blockNode.updatedAt;
          try {
            const response = await libraryControllerGetBlockNode({ path: { nodeId: blockNode.id } });
            if ((response as any).data?.updatedAt) {
              latestUpdatedAt = (response as any).data.updatedAt;
            }
          } catch { /* ignore */ }
          const filesPath = `/api/v1/library/block/filesData/${blockNode.path}`;
          const timestamp = latestUpdatedAt ? new Date(latestUpdatedAt).getTime() : Date.now();
          const cmdParam = {
            filePath: `${filesPath}?t=${timestamp}`,
            name: blockNode.name,
            isBlockLibrary: true,
          };
          MxFun.sendStringToExecute('Mx_Insert', cmdParam);
          showToast(`正在插入图块：${blockNode.name}`, 'success');
        } catch (error: unknown) {
          handleError(error, 'useFileItemRenderer: 插入图块失败');
          showToast('插入图块失败，请确保已在 CAD 编辑器中打开图纸', 'error');
        }
      };

      const handleEnter = (n: FileSystemNode) => {
        if (n.isFolder) {
          handleEnterFolder(n);
        } else if (isLibraryMode && libraryType === 'block') {
          handleBlockInsert(n);
        } else if (isLibraryMode && libraryType === 'drawing') {
          const isLoggedIn = user !== null;
          const hasSystemPermission = isLoggedIn && hasPermission(SystemPermission.LIBRARY_DRAWING_MANAGE);
          if (hasSystemPermission) {
            onDrawingOpen(n, libraryType);
          } else {
            import('@/services/mxcadManager').then(({ openLibraryDrawing }) => {
              openLibraryDrawing(n.id, n.name, n.path || '', n.updatedAt).catch((error: unknown) => {
                handleError(error, 'useFileItemRenderer: 打开图纸库文件失败');
              });
            });
          }
        } else {
          onDrawingOpen(n);
        }
      };

      return (
        <FileItem
          node={node}
          isSelected={false}
          viewMode={viewMode}
          galleryMode={isLibraryMode}
          isMultiSelectMode={false}
          isTrash={false}
          doubleClickToOpen={doubleClickToOpen}
          {...(isLibraryMode
            ? { canDownload: canManageLibrary, canEdit: canManageLibrary, canDelete: canManageLibrary, canUpload: canManageLibrary, canViewVersionHistory: false }
            : getFileItemPermissionProps(node, { projectPermissions }))}
          onSelect={() => {}}
          onEnter={handleEnter}
          onDownload={isLibraryMode ? handleLibraryDownload : handleDownload}
          onDelete={isLibraryMode ? handleLibraryDelete : handleDelete}
          onRename={isLibraryMode ? handleLibraryOpenRename : handleOpenRename}
          onShowVersionHistory={isLibraryMode ? undefined : handleShowVersionHistory}
        />
      );
    },
    [nodes, isLibraryMode, libraryType, canManageLibrary, doubleClickToOpen,
     projectPermissions, onDrawingOpen, handleEnterFolder, handleDownload,
     handleDelete, handleOpenRename, handleLibraryOpenRename,
     handleShowVersionHistory, showToast, user, hasPermission,
     setDownloadingNode, setShowDownloadFormatModal, libraryOperations]
  );

  return { renderFileItem };
}
