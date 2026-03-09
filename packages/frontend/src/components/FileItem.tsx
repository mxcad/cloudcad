import React, { useState, useCallback, useRef } from 'react';
import { useExternalReferenceUpload } from '../hooks/useExternalReferenceUpload';
import { ExternalReferenceModal } from './modals/ExternalReferenceModal';
import { ImagePreviewModal } from './modals/ImagePreviewModal';

import { handleError } from '../utils/errorHandler';
import { getOriginalFileUrl } from '../utils/fileUtils';
import {
  Thumbnail,
  FileItemSelection,
  FileItemExternalReferenceWarning,
  FileItemInfo,
  FileItemTypeTag,
  FileItemMenu,
} from './file-item';
import {
  getAvailableActions,
  type ActionType,
} from './file-item/fileActionConfig';
import { FileSystemNode } from '../types/filesystem';

interface FileItemProps {
  node: FileSystemNode;
  isSelected: boolean;
  viewMode: 'grid' | 'list';
  isMultiSelectMode?: boolean;
  isTrash?: boolean;
  canUpload?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canDownload?: boolean;
  canAddToGallery?: boolean;
  canViewVersionHistory?: boolean;
  canManageTrash?: boolean;
  onSelect: (
    nodeId: string,
    isMultiSelect?: boolean,
    isRangeSelect?: boolean
  ) => void;
  onEnter: (node: FileSystemNode) => void;
  onDownload: (node: FileSystemNode) => void;
  onDelete: (node: FileSystemNode) => void;
  onPermanentlyDelete?: (node: FileSystemNode) => void;
  onRename: (node: FileSystemNode) => void;
  onRefresh?: () => void;
  onEdit?: (e: React.MouseEvent) => void;
  onDeleteNode?: (e: React.MouseEvent) => void;
  onShowMembers?: (e: React.MouseEvent) => void;
  onShowRoles?: (e: React.MouseEvent) => void;
  onRestore?: (node: FileSystemNode) => void;
  onMove?: (node: FileSystemNode) => void;
  onCopy?: (node: FileSystemNode) => void;
  onAddToGallery?: (node: FileSystemNode) => void;
  onShowVersionHistory?: (node: FileSystemNode) => void;
  onDragStart?: (e: React.DragEvent, node: FileSystemNode) => void;
  onDragOver?: (e: React.DragEvent, node: FileSystemNode) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent, node: FileSystemNode) => void;
  isDropTarget?: boolean;
}

export const FileItem: React.FC<FileItemProps> = ({
  node,
  isSelected,
  viewMode,
  isMultiSelectMode = false,
  isTrash = false,
  canUpload = false,
  canEdit = false,
  canDelete = false,
  canDownload = false,
  canAddToGallery = false,
  canViewVersionHistory = false,
  canManageTrash = false,
  onSelect,
  onEnter,
  onDownload,
  onDelete,
  onPermanentlyDelete,
  onRename,
  onRefresh,
  onEdit,
  onDeleteNode,
  onShowMembers,
  onShowRoles,
  onRestore,
  onMove,
  onCopy,
  onAddToGallery,
  onShowVersionHistory,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  isDropTarget = false,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewImageSrc, setPreviewImageSrc] = useState('');
  const isRoot = node.isRoot;
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const blockItemClickRef = useRef(false);

  const externalReferenceUpload = useExternalReferenceUpload({
    nodeId: node.id,
    onSuccess: () => {
      console.info('外部参照上传成功，开始刷新文件列表', 'FileItem');
      // 后端在上传成功后已经调用了 updateExternalReferenceAfterUpload 更新数据库
      // 前端只需要刷新文件列表即可
      onRefresh?.();
    },
    onError: (error) => {
      const appError = handleError(error, 'FileItem');
      console.error(appError.message, 'FileItem', appError.details);
    },
    onSkip: () => {
      console.info('用户跳过外部参照上传', 'FileItem');
    },
  });

  const handleUploadExternalReference = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setShowMenu(false);
      blockItemClickRef.current = true;
      await new Promise((resolve) => setTimeout(resolve, 50));

      try {
        // 总是调用 checkMissingReferences 打开上传框
        // 用户可以选择覆盖已存在的文件
        await externalReferenceUpload.checkMissingReferences();
      } catch (error) {
        handleError(error, '检查外部参照失败');
      } finally {
        setTimeout(() => {
          blockItemClickRef.current = false;
        }, 1000);
      }
    },
    [node.id, externalReferenceUpload]
  );

  const isCadFile = useCallback(() => {
    if (node.isFolder || node.isRoot) return false;
    const ext = node.extension?.toLowerCase();
    return ext === '.dwg' || ext === '.dxf';
  }, [node.extension, node.isFolder, node.isRoot]);

  const isImageFile = useCallback(() => {
    if (node.isFolder || node.isRoot) return false;
    const ext = node.extension?.toLowerCase();
    const imageExtensions = [
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.webp',
      '.bmp',
      '.svg',
    ];
    return imageExtensions.includes(ext || '');
  }, [node.extension, node.isFolder, node.isRoot]);

  const handleImagePreview = useCallback(() => {
    const imageUrl = getOriginalFileUrl(node);
    setPreviewImageSrc(imageUrl);
    setIsPreviewOpen(true);
  }, [node]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (blockItemClickRef.current) {
        blockItemClickRef.current = false;
        return;
      }

      if (isMultiSelectMode) {
        const isCtrl = e.ctrlKey || e.metaKey;
        const isShift = e.shiftKey;
        onSelect(node.id, isCtrl || isShift);
      } else {
        if (isImageFile()) {
          handleImagePreview();
        } else {
          onEnter(node);
        }
      }
    },
    [
      node,
      isMultiSelectMode,
      onSelect,
      onEnter,
      isImageFile,
      handleImagePreview,
    ]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isPreviewOpen) return;
      onEnter(node);
    },
    [node, onEnter, isPreviewOpen]
  );

  const handleToggleMenu = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const newShowMenu = !showMenu;
      if (!showMenu && menuButtonRef.current) {
        const rect = menuButtonRef.current.getBoundingClientRect();
        setMenuPosition({
          top: rect.bottom + 4,
          left: rect.right - 120,
        });
      } else {
        setMenuPosition(null);
      }
      setShowMenu(newShowMenu);
    },
    [showMenu]
  );

  const handleCloseMenu = useCallback(() => {
    setShowMenu(false);
    setMenuPosition(null);
  }, []);

  // 操作处理函数映射
  const actionHandlers: Record<ActionType, (e: React.MouseEvent) => void> = {
    upload_external_reference: handleUploadExternalReference,
    download: (e) => {
      e.stopPropagation();
      onDownload(node);
    },
    view_version_history: (e) => {
      e.stopPropagation();
      onShowVersionHistory?.(node);
    },
    add_to_gallery: (e) => {
      e.stopPropagation();
      onAddToGallery?.(node);
    },
    rename: (e) => {
      e.stopPropagation();
      onRename(node);
    },
    move: (e) => {
      e.stopPropagation();
      onMove?.(node);
    },
    copy: (e) => {
      e.stopPropagation();
      onCopy?.(node);
    },
    restore: (e) => {
      e.stopPropagation();
      onRestore?.(node);
    },
    delete: (e) => {
      e.stopPropagation();
      onDelete(node);
    },
    permanently_delete: (e) => {
      e.stopPropagation();
      onPermanentlyDelete?.(node);
    },
    edit: (e) => {
      e.stopPropagation();
      onEdit?.(e);
    },
    show_members: (e) => {
      e.stopPropagation();
      onShowMembers?.(e);
    },
    show_roles: (e) => {
      e.stopPropagation();
      onShowRoles?.(e);
    },
  };

  // 获取可用操作列表
  const actionProps = {
    node,
    isTrash,
    isRoot,
    isCadFile: isCadFile(),
    isFolder: node.isFolder,
    hasMissingExternalReferences: node.hasMissingExternalReferences || false,
    canDownload,
    canEdit,
    canDelete,
    canAddToGallery,
    canViewVersionHistory,
    canManageTrash: !!onRestore || !!onPermanentlyDelete,
    onDownload: !!onDownload,
    onAddToGallery: !!onAddToGallery,
    onShowVersionHistory: !!onShowVersionHistory,
    onEdit: !!onEdit,
    onShowMembers: !!onShowMembers,
    onShowRoles: !!onShowRoles,
    onMove: !!onMove,
    onCopy: !!onCopy,
    onRestore: !!onRestore,
    onPermanentlyDelete: !!onPermanentlyDelete,
    // 对于项目根节点，使用 onDeleteNode；对于普通节点，使用 onDelete
    onDeleteNode: !!onDeleteNode || !!onDelete,
  };

  // 调试信息：检查项目节点的操作参数
  if (isRoot) {
    console.log(
      '[FileItem] 项目节点操作参数:',
      node.id,
      node.name,
      actionProps
    );
  }

  const availableActions = getAvailableActions(actionProps);

  // 调试信息：检查可用操作
  if (isRoot) {
    console.log(
      '[FileItem] 项目节点可用操作:',
      node.id,
      node.name,
      availableActions.map((a) => a.type)
    );
  }

  if (viewMode === 'grid') {
    const showSelection = isMultiSelectMode && isSelected;

    return (
      <div
        className={`group relative rounded-xl transition-all duration-200 cursor-pointer pointer-events-auto
          ${isPreviewOpen ? 'pointer-events-none' : ''}
          ${
            showSelection
              ? 'bg-indigo-50 border-2 border-indigo-500 shadow-md'
              : isDropTarget
                ? 'bg-green-50 border-2 border-green-500 shadow-md'
                : 'bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-lg hover:-translate-y-0.5'
          }
        `}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setShowMenu(false);
          onDragLeave?.();
        }}
        draggable={!!onDragStart && !node.isRoot}
        onDragStart={(e) => onDragStart?.(e, node)}
        onDragOver={(e) => onDragOver?.(e, node)}
        onDrop={(e) => onDrop?.(e, node)}
      >
        <FileItemSelection
          isSelected={isSelected}
          isMultiSelectMode={isMultiSelectMode}
          onSelect={(isMulti) => onSelect(node.id, isMulti)}
          isGrid
        />

        <div className="p-6 pb-4">
          <div
            className={`w-16 h-16 mx-auto mb-4 transition-transform duration-200 
              ${isHovered && !showSelection ? 'scale-110' : ''}
              ${showSelection ? 'scale-105' : ''}
            `}
          >
            <Thumbnail
              node={node}
              size={64}
              onPreview={(src) => {
                setPreviewImageSrc(src);
                setIsPreviewOpen(true);
              }}
            />
          </div>

          <div className="flex flex-col items-center">
            <FileItemInfo node={node} isGrid />
            <FileItemExternalReferenceWarning node={node} isGrid />
          </div>
        </div>

        <div
          className={`absolute top-3 right-3 transition-opacity duration-200 z-20 pointer-events-auto ${
            isHovered || showMenu ? 'opacity-100' : 'opacity-100'
          }`}
        >
          <FileItemMenu
            node={node}
            isTrash={isTrash}
            showMenu={showMenu}
            menuPosition={menuPosition}
            menuButtonRef={menuButtonRef}
            menuContainerRef={menuContainerRef}
            onToggleMenu={handleToggleMenu}
            onCloseMenu={handleCloseMenu}
            onDownload={onDownload}
            onDelete={onDelete}
            onPermanentlyDelete={onPermanentlyDelete}
            onRename={onRename}
            onEdit={onEdit}
            onShowMembers={onShowMembers}
            onShowRoles={onShowRoles}
            onRestore={onRestore}
            onMove={onMove}
            onCopy={onCopy}
            onAddToGallery={onAddToGallery}
            onShowVersionHistory={onShowVersionHistory}
            onUploadExternalReference={handleUploadExternalReference}
            isCadFile={isCadFile}
            canDownload={canDownload}
            canEdit={canEdit}
            canDelete={canDelete}
            canAddToGallery={canAddToGallery}
            canViewVersionHistory={canViewVersionHistory}
            canManageTrash={canManageTrash}
          />
        </div>

        <ExternalReferenceModal
          isOpen={externalReferenceUpload.isOpen}
          files={externalReferenceUpload.files}
          loading={externalReferenceUpload.loading}
          onSelectAndUpload={externalReferenceUpload.selectAndUploadFiles}
          onComplete={externalReferenceUpload.complete}
          onSkip={externalReferenceUpload.skip}
          onClose={externalReferenceUpload.close}
        />

        <ImagePreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          src={previewImageSrc}
          alt={node.name}
        />
      </div>
    );
  }

  const showListSelection = isMultiSelectMode && isSelected;

  return (
    <div
      className={`group flex items-center gap-4 p-3 rounded-lg transition-all duration-200 cursor-pointer
        ${
          showListSelection
            ? 'bg-indigo-50 border border-indigo-200'
            : 'hover:bg-slate-50 border border-transparent hover:border-slate-200'
        }
      `}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowMenu(false);
        onDragLeave?.();
      }}
      draggable={!!onDragStart && !node.isRoot}
      onDragStart={(e) => onDragStart?.(e, node)}
      onDragOver={(e) => onDragOver?.(e, node)}
      onDrop={(e) => onDrop?.(e, node)}
    >
      <FileItemSelection
        isSelected={isSelected}
        isMultiSelectMode={isMultiSelectMode}
        onSelect={(isMulti) => onSelect(node.id, isMulti)}
      />

      <div className="w-10 h-10 flex-shrink-0">
        <Thumbnail
          node={node}
          size={40}
          onPreview={(src) => {
            setPreviewImageSrc(src);
            setIsPreviewOpen(true);
          }}
        />
      </div>

      <FileItemInfo node={node} />

      <FileItemTypeTag node={node} />

      <div className="flex items-center gap-1 opacity-100 transition-opacity duration-200">
        {availableActions.map((action) => (
          <button
            key={action.type}
            onClick={(e) => {
              e.stopPropagation();
              actionHandlers[action.type]?.(e);
            }}
            className={`p-2 rounded-lg transition-colors ${
              action.colorClass || 'text-slate-500'
            } ${action.hoverClass || 'hover:bg-slate-100'}`}
            title={action.tooltip}
          >
            {/* 将图标的尺寸放大到 18px 以匹配列表视图 */}
            <span className="inline-block scale-110 origin-center">
              {React.cloneElement(
                action.icon as React.ReactElement<{
                  width?: number;
                  height?: number;
                }>,
                {
                  width: 18,
                  height: 18,
                }
              )}
            </span>
          </button>
        ))}
      </div>

      <ImagePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        src={previewImageSrc}
        alt={node.name}
      />
    </div>
  );
};

// 包装组件，保持向后兼容
export const FileIconComponent: React.FC<{
  node: FileSystemNode;
  size?: number;
}> = ({ node, size = 48 }) => {
  return null; // 实际实现在 FileIcons.tsx 中
};
