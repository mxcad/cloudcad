import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useExternalReferenceUpload } from '../hooks/useExternalReferenceUpload';
import { ExternalReferenceModal } from './modals/ExternalReferenceModal';

import { FileNameText } from './ui/TruncateText';

import { handleError } from '../utils/errorHandler';
import { infoOnce } from '../utils/message';
import { formatRelativeTime, formatFileSize } from '../utils/fileUtils';
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
  getActionGroups,
  ACTION_VARIANT_MAP,
  type ActionType,
} from './file-item/fileActionConfig';
import { FileSystemNode } from '../types/filesystem';
import { Card } from './ui/Card';
import { Tooltip } from './ui/Tooltip';
import { Menu } from './ui/Menu';
import { Z_LAYERS } from '@/constants/layers';

import { FolderOpen } from 'lucide-react';
import { FileText } from 'lucide-react';

interface FileItemProps {
  node: FileSystemNode;
  /** @deprecated Use isSelected instead */
  selected?: boolean;
  isSelected?: boolean;
  isTrashView?: boolean;
  isDragging?: boolean;
  viewMode?: 'grid' | 'list';
  /** 紧凑模式：用于 Dashboard 等简化场景，隐藏菜单和选择框 */
  compact?: boolean;
  /** 图库模式：网格模式图片完全占据容器，文件名在底部，不显示大小；列表模式图片放大，去除后缀标签 */
  galleryMode?: boolean;
  isTrash?: boolean;
  canUpload?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canDownload?: boolean;
  canViewVersionHistory?: boolean;
  canManageTrash?: boolean;
  canManageExternalReference?: boolean;
  /** 文件名字体大小，默认不设置（继承父元素字体大小） */
  fontSize?: number | string;
  /** 隐藏文件类型标签（文件夹/DWG/DXF 等徽章） */
  hideTypeTag?: boolean;
  /** 强制紧凑操作模式：始终使用"更多"菜单替代独立操作按钮 */
  forceCompactActions?: boolean;
  /** 隐藏选中圆圈（用于项目列表等纯导航场景） */
  hideSelectionCircle?: boolean;
  /** 双击打开（用于侧边栏图库等场景），true=单击打开，false=双击打开，配合 hideSelectionCircle 提示 */
  doubleClickToOpen?: boolean;
  /** 是否正在框选（禁用拖拽避免冲突） */
  isRubberBanding?: boolean;
  /** 当前已选中的条目总数（用于多选场景右键菜单） */
  selectedCount?: number;
  /** 搜索结果模式 */
  isSearchResult?: boolean;
  onOpen?: (node: FileSystemNode) => void;
  onOpenInNewTab?: (node: FileSystemNode) => void;
  onOpenFileLocation?: (node: FileSystemNode) => void;
  onNewFolder?: (node: FileSystemNode) => void;
  onCopyClipboard?: (node: FileSystemNode) => void;
  onCut?: (node: FileSystemNode) => void;
  onDownloadFolder?: (node: FileSystemNode) => void;
  onShowProperties?: (node: FileSystemNode) => void;
  /** 批量删除选中项 */
  onBatchDelete?: () => void;
  /** 批量移动选中项 */
  onBatchMove?: () => void;
  /** 批量复制选中项 */
  onBatchCopy?: () => void;
  /** 批量恢复选中项 */
  onBatchRestore?: () => void;
  onSelect?: (
    nodeId: string,
    isMultiSelect?: boolean,
    isRangeSelect?: boolean
  ) => void;
  onEnter: (node: FileSystemNode) => void;
  onDownload?: (node: FileSystemNode) => void;
  onDelete?: (node: FileSystemNode) => void;
  onPermanentlyDelete?: (node: FileSystemNode) => void;
  onRename?: (node: FileSystemNode) => void;
  onRefresh?: () => void;
  onEdit?: (e: React.MouseEvent) => void;
  onDeleteNode?: (e: React.MouseEvent) => void;
  onShowMembers?: (e: React.MouseEvent) => void;
  onShowRoles?: (e: React.MouseEvent) => void;
  onRestore?: (node: FileSystemNode) => void;
  onMove?: (node: FileSystemNode) => void;
  onCopy?: (node: FileSystemNode) => void;
  onShowVersionHistory?: (node: FileSystemNode) => void;
  onShare?: (node: FileSystemNode) => void;
  onDragStart?: (e: React.DragEvent, node: FileSystemNode) => void;
  onDragOver?: (e: React.DragEvent, node: FileSystemNode) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent, node: FileSystemNode) => void;
  isDropTarget?: boolean;
}

export const FileItem: React.FC<FileItemProps> = ({
  node,
  isSelected = false,
  viewMode = 'list',
  compact = false,
  galleryMode = false,
  isTrash = false,
  canUpload = false,
  canEdit = false,
  canDelete = false,
  canDownload = false,
  canViewVersionHistory = false,
  canManageExternalReference = false,
  canManageTrash = false,
  fontSize,
  hideTypeTag = false,
  forceCompactActions = false,
  hideSelectionCircle = true,
  doubleClickToOpen = false,
  isRubberBanding = false,
  selectedCount = 0,
  onBatchDelete,
  onBatchMove,
  onBatchCopy,
  onBatchRestore,
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
  onShowVersionHistory,
  onShare,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  isDropTarget = false,
  isSearchResult = false,
  onOpen,
  onOpenInNewTab,
  onOpenFileLocation,
  onCopyClipboard,
  onNewFolder,
  onCut,
  onDownloadFolder,
  onShowProperties,
}) => {
  if (!node) {
    console.warn('[FileItem] node is undefined or null');
    return null;
  }

  const [showMenu, setShowMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);

  const [useCompactActions, setUseCompactActions] = useState(false);
  const isRoot = node.isRoot;
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const blockItemClickRef = useRef(false);
  const listItemRef = useRef<HTMLDivElement | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickCountRef = useRef(0);

  const externalReferenceUpload = useExternalReferenceUpload({
    nodeId: node.id,
    onSuccess: () => {
      console.info('外部参照上传成功，开始刷新文件列表', 'FileItem');
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
        const hasExternalReference = await externalReferenceUpload.checkMissingReferences(undefined, false, true);

        if (!hasExternalReference) {
          console.info(`[FileItem] 文件 "${node.name}" 没有外部参照`);
        }
      } catch (error) {
        handleError(error, '检查外部参照失败');
      } finally {
        setTimeout(() => {
          blockItemClickRef.current = false;
        }, 1000);
      }
    },
    [node.id, node.name, externalReferenceUpload]
  );

  const isCadFile = useCallback(() => {
    if (node.isFolder || node.isRoot) return false;
    const ext = node.extension?.toLowerCase();
    return ext === '.dwg' || ext === '.dxf' || ext === '.mxweb';
  }, [node.extension, node.isFolder, node.isRoot]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (blockItemClickRef.current) {
        blockItemClickRef.current = false;
        return;
      }

      if (isRubberBanding) return;

      if ((e.target as HTMLElement).closest('[role="menu"], [data-menu-content]')) {
        return;
      }

      const isCtrl = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;

      if (!hideSelectionCircle) {
        if (isCtrl || isShift) {
          onSelect?.(node.id, isCtrl || isShift, isShift);
        } else {
          onEnter(node);
        }
      } else if (doubleClickToOpen) {
        clickCountRef.current++;
        if (clickCountRef.current === 1) {
          clickTimerRef.current = setTimeout(() => {
            infoOnce('请双击打开');
            clickCountRef.current = 0;
            clickTimerRef.current = null;
          }, 300);
        }
        return;
      } else {
        onEnter(node);
      }
    },
    [node, onSelect, onEnter, hideSelectionCircle, doubleClickToOpen, isRubberBanding]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      clickCountRef.current = 0;
      onEnter(node);
    },
    [node, onEnter]
  );

  const handleToggleMenu = useCallback(() => {
    setShowMenu((prev) => !prev);
  }, []);

  const handleCloseMenu = useCallback(() => {
    setShowMenu(false);
  }, []);

  const actionHandlers: Record<ActionType, (e: React.MouseEvent) => void> = {
    upload_external_reference: handleUploadExternalReference,
    download: (e) => {
      e.stopPropagation();
      onDownload?.(node);
    },
    view_version_history: (e) => {
      e.stopPropagation();
      onShowVersionHistory?.(node);
    },
    rename: (e) => {
      e.stopPropagation();
      onRename?.(node);
    },
    move: (e) => {
      e.stopPropagation();
      onMove?.(node);
    },
    copy: (e) => {
      e.stopPropagation();
      onCopy?.(node);
    },
    copy_clipboard: (e) => {
      e.stopPropagation();
      onCopyClipboard?.(node);
    },
    restore: (e) => {
      e.stopPropagation();
      onRestore?.(node);
    },
    delete: (e) => {
      e.stopPropagation();
      onDelete?.(node);
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
    share: (e) => {
      e.stopPropagation();
      onShare?.(node);
    },
    open: (e) => {
      e.stopPropagation();
      onOpen?.(node);
    },
    open_in_new_tab: (e) => {
      e.stopPropagation();
      onOpenInNewTab?.(node);
    },
    open_file_location: (e) => {
      e.stopPropagation();
      onOpenFileLocation?.(node);
    },
    new_folder: (e) => {
      e.stopPropagation();
      onNewFolder?.(node);
    },
    cut: (e) => {
      e.stopPropagation();
      onCut?.(node);
    },
    download_folder: (e) => {
      e.stopPropagation();
      onDownloadFolder?.(node);
    },
    properties: (e) => {
      e.stopPropagation();
      onShowProperties?.(node);
    },
  };

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
    canViewVersionHistory,
    canManageExternalReference,
    canManageTrash: !!onRestore || !!onPermanentlyDelete,
    onDownload: !!onDownload,
    onShowVersionHistory: !!onShowVersionHistory,
    onEdit: !!onEdit,
    onShowMembers: !!onShowMembers,
    onShowRoles: !!onShowRoles,
    onShare: !!onShare,
    onMove: !!onMove,
    onCopy: !!onCopy,
    onRestore: !!onRestore,
    onPermanentlyDelete: !!onPermanentlyDelete,
    onDeleteNode: isRoot ? !!onDeleteNode : (!!onDeleteNode || !!onDelete),
    isSearchResult,
    onOpen: !!onOpen,
    onOpenInNewTab: !!onOpenInNewTab,
    onOpenFileLocation: !!onOpenFileLocation,
    onNewFolder: !!onNewFolder,
    onCopyClipboard: !!onCopyClipboard,
    onCut: !!onCut,
    onDownloadFolder: !!onDownloadFolder,
    onShowProperties: !!onShowProperties,
  };

  const availableActions = getAvailableActions(actionProps);
  const { main: contextMainActions, secondary: contextSecondaryActions, destructive: contextDestructiveActions } = getActionGroups(availableActions);

  const isMultiSelected = selectedCount > 1 && isSelected;

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isMultiSelected) {
        if (!(onBatchDelete || onBatchMove || onBatchCopy || onBatchRestore)) return;
      } else {
        if (contextMainActions.length === 0 && contextDestructiveActions.length === 0 && contextSecondaryActions.length === 0) return;
      }
      if (!hideSelectionCircle && !isMultiSelected && !isSelected && onSelect) {
        onSelect(node.id, false, false);
      }
      setContextMenuPos({ x: e.clientX, y: e.clientY });
    },
    [node, onSelect, isSelected, isMultiSelected, hideSelectionCircle,
     onBatchDelete, onBatchMove, onBatchCopy, onBatchRestore, availableActions]
  );

  const closeContextMenu = useCallback(() => {
    setContextMenuPos(null);
  }, []);

  const handleAction = useCallback((type: ActionType) => {
    actionHandlers[type]?.(new MouseEvent('click') as unknown as React.MouseEvent);
    closeContextMenu();
  }, [actionHandlers, closeContextMenu]);

  const contextMenuElement = contextMenuPos && (isMultiSelected
    ? !!(onBatchDelete || onBatchMove || onBatchCopy || onBatchRestore)
    : availableActions.length > 0
  ) && (
    <div style={{ position: 'fixed', left: contextMenuPos.x, top: contextMenuPos.y, width: 0, height: 0, overflow: 'visible', zIndex: Z_LAYERS.POPUP }}>
      <Menu open onOpenChange={(open) => { if (!open) closeContextMenu(); }} modal={false}>
        <Menu.Trigger asChild>
          <div style={{ width: 0, height: 0 }} />
        </Menu.Trigger>
        <Menu.Content align="start" side="bottom" sideOffset={0}>
          {isMultiSelected ? (
            <>
              {onBatchDelete && (
                <Menu.Item variant="danger" onClick={() => { onBatchDelete(); closeContextMenu(); }}>
                  删除 {selectedCount} 个选中项
                </Menu.Item>
              )}
              {onBatchMove && (
                <Menu.Item onClick={() => { onBatchMove(); closeContextMenu(); }}>
                  移动 {selectedCount} 个选中项
                </Menu.Item>
              )}
              {onBatchCopy && (
                <Menu.Item onClick={() => { onBatchCopy(); closeContextMenu(); }}>
                  复制 {selectedCount} 个选中项
                </Menu.Item>
              )}
              {onBatchRestore && (
                <Menu.Item variant="success" onClick={() => { onBatchRestore(); closeContextMenu(); }}>
                  恢复 {selectedCount} 个选中项
                </Menu.Item>
              )}
            </>
          ) : (
            <>
              {contextMainActions.map((action) => (
                <Menu.Item
                  key={action.type}
                  variant={ACTION_VARIANT_MAP[action.type] || 'default'}
                  icon={action.icon}
                  onClick={() => handleAction(action.type)}
                >
                  {action.label}
                </Menu.Item>
              ))}

              {contextSecondaryActions.length > 0 && (
                <Menu.Submenu label="其他操作" icon={contextSecondaryActions[0]?.icon}>
                  {contextSecondaryActions.map((action) => (
                    <Menu.Item
                      key={action.type}
                      variant={ACTION_VARIANT_MAP[action.type] || 'default'}
                      icon={action.icon}
                      onClick={() => handleAction(action.type)}
                    >
                      {action.label}
                    </Menu.Item>
                  ))}
                </Menu.Submenu>
              )}

              {(contextDestructiveActions.length > 0) && (contextMainActions.length > 0 || contextSecondaryActions.length > 0) && <Menu.Separator />}

              {contextDestructiveActions.map((action) => (
                <Menu.Item
                  key={action.type}
                  variant="danger"
                  icon={action.icon}
                  onClick={() => handleAction(action.type)}
                >
                  {action.label}
                </Menu.Item>
              ))}
            </>
          )}
        </Menu.Content>
      </Menu>
      <div style={{ position: 'fixed', inset: 0, zIndex: -1 }} onClick={closeContextMenu} />
    </div>
  );

  useEffect(() => {
    if (viewMode !== 'list') return;

    const element = listItemRef.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        setUseCompactActions(width < 550);
      }
    });

    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, [viewMode]);

  useEffect(() => {
    setIsHovered(false);
    setShowMenu(false);
  }, [viewMode]);

  if (viewMode === 'grid') {
    const showSelectedStyle = isSelected;
    const thumbnailSize = 100;

    return (
      <>
      <Card
        variant="outlined"
        padding="none"
        radius={galleryMode ? 'sm' : undefined}
        data-tour="file-item"
        data-node-id={node.id}
        title={doubleClickToOpen ? '双击打开' : undefined}
        className={`group relative transition-all duration-200 cursor-pointer pointer-events-auto select-none
          ${galleryMode ? 'w-[120px] min-h-[150px]' : ''}
          ${showSelectedStyle ? 'shadow-md' : ''}
          ${isDropTarget ? 'shadow-md' : ''}
          ${!showSelectedStyle && !isDropTarget && !galleryMode ? 'hover:shadow-lg hover:-translate-y-0.5' : ''}
          ${!showSelectedStyle && !isDropTarget && galleryMode ? 'hover:shadow-lg' : ''}
        `}
        style={{
          background: showSelectedStyle || isDropTarget
            ? 'var(--primary-50)'
            : 'var(--bg-drawing-card)',
          border: showSelectedStyle || isDropTarget
            ? '2px solid var(--primary-500)'
            : undefined,
        }}
        onMouseEnter={(e) => {
          setIsHovered(true);
          if (!showSelectedStyle && !isDropTarget) {
            if (galleryMode) {
              e.currentTarget.style.background = 'var(--bg-tertiary)';
            } else {
              e.currentTarget.style.borderColor = 'var(--primary-400)';
            }
          }
        }}
        onMouseLeave={(e) => {
          setIsHovered(false);
          setShowMenu(false);
          onDragLeave?.();
          if (!showSelectedStyle && !isDropTarget) {
            if (galleryMode) {
              e.currentTarget.style.background = 'var(--bg-drawing-card)';
            } else {
              e.currentTarget.style.borderColor = 'var(--border-default)';
            }
          }
        }}
        onMouseDown={(e) => { if (hideSelectionCircle && !isRubberBanding) e.stopPropagation(); }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        draggable={hideSelectionCircle && !!onDragStart && !node.isRoot && !isRubberBanding}
        onDragStart={(e) => { onDragStart?.(e, node); }}
        onDragOver={(e) => onDragOver?.(e, node)}
        onDrop={(e) => onDrop?.(e, node)}
      >
        {!hideSelectionCircle && (
          <FileItemSelection
            isSelected={isSelected}
            onSelect={(isShift) => onSelect?.(node.id, true, isShift)}
            isGrid
            isDraggable={!!onDragStart && !node.isRoot && !isRubberBanding}
          />
        )}

        {galleryMode ? (
          <div className="flex flex-col h-full p-2">
            <div
              className="flex-1 flex items-center justify-center overflow-hidden mb-2"
            >
              <Thumbnail
                node={node}
                size={thumbnailSize}
                galleryMode={galleryMode}
              />
            </div>
            <div className="flex flex-col items-center pb-2">
              <FileItemInfo node={node} isGrid galleryMode={galleryMode} fontSize={fontSize} />
              <FileItemExternalReferenceWarning node={node} isGrid />
            </div>
          </div>
        ) : (
          <div className="p-6 pb-4">
            <div
              className="mx-auto mb-4 flex items-center justify-center transition-transform duration-200
                ${isHovered && !showSelectedStyle ? 'scale-110' : ''}
                ${showSelectedStyle ? 'scale-105' : ''}
              "
              style={{ width: thumbnailSize, height: thumbnailSize }}
            >
              <Thumbnail
                node={node}
                size={thumbnailSize}
                galleryMode={galleryMode}
              />
            </div>

            <div className="flex flex-col items-center">
              <FileItemInfo node={node} isGrid galleryMode={galleryMode} fontSize={fontSize} />
              <FileItemExternalReferenceWarning node={node} isGrid />
            </div>
          </div>
        )}

        <div
          className={`absolute top-1 right-1 transition-opacity duration-200 z-20 pointer-events-auto ${
            isHovered || showMenu ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <FileItemMenu
            actions={availableActions}
            onAction={handleAction}
            showMenu={showMenu}
            menuButtonRef={menuButtonRef}
            onOpenMenu={handleToggleMenu}
            onCloseMenu={handleCloseMenu}
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
      </Card>
      {contextMenuElement}
    </>
    );
  }

  if (compact) {
    return (
      <div
        onClick={() => onEnter(node)}
        className="group flex items-center gap-3 p-3 rounded-xl transition-all duration-200 cursor-pointer hover:bg-[var(--bg-tertiary)]"
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: node.isFolder
              ? 'var(--primary-100)'
              : 'var(--accent-100)',
          }}
        >
          {node.isFolder ? (
            <FolderOpen size={18} color="var(--primary-600)" />
          ) : (
            <FileText size={18} color="var(--accent-600)" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h4
            className="font-medium text-sm"
            style={{ color: 'var(--text-primary)' }}
            title={
              node.isFolder
                ? node.name
                : node.name.replace(/\.[^/.]+$/, '')
            }
          >
            <span
              style={{
                display: 'block',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
              }}
            >
              {node.name}
            </span>
          </h4>
          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            <span>{formatRelativeTime(node.updatedAt)}</span>
            {node.size && (
              <>
                <span>·</span>
                <span>{formatFileSize(node.size)}</span>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div
      ref={listItemRef}
      data-tour="file-item"
      data-node-id={node.id}
      title={doubleClickToOpen ? '双击打开' : undefined}
      className={`group relative flex items-center rounded-lg transition-all duration-200 cursor-pointer select-none
        ${galleryMode ? 'gap-2' : 'gap-4'}
        ${isSelected ? '' : 'hover:border-[var(--border-default)]'}
      `}
      style={{
        background: isSelected ? 'var(--primary-50)' : 'transparent',
        border: isSelected
          ? '1px solid var(--primary-200)'
          : '1px solid transparent',
      }}
      onMouseEnter={(e) => {
        setIsHovered(true);
        if (!isSelected) {
          e.currentTarget.style.background = 'var(--bg-tertiary)';
        }
      }}
      onMouseLeave={(e) => {
        setIsHovered(false);
        setShowMenu(false);
        onDragLeave?.();
        if (!isSelected) {
          e.currentTarget.style.background = 'transparent';
        }
      }}
      onMouseDown={(e) => { if (hideSelectionCircle && !isRubberBanding) e.stopPropagation(); }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      draggable={hideSelectionCircle && !!onDragStart && !node.isRoot && !isRubberBanding}
      onDragStart={(e) => { onDragStart?.(e, node); }}
      onDragOver={(e) => onDragOver?.(e, node)}
      onDrop={(e) => onDrop?.(e, node)}
    >
      {!hideSelectionCircle && (
        <div className="p-1">
          <FileItemSelection
            isSelected={isSelected}
            onSelect={(isShift) => onSelect?.(node.id, true, isShift)}
            isDraggable={!!onDragStart && !node.isRoot && !isRubberBanding}
          />
        </div>
      )}

      <div className={`flex-shrink-0 flex items-center justify-center ${galleryMode ? 'w-14 h-14' : 'w-10 h-10'}`}>
              <Thumbnail
                node={node}
                size={galleryMode ? 56 : 40}
                galleryMode={galleryMode}
              />
      </div>

      <div className={`flex-1 min-w-0 ${galleryMode ? 'p-2' : 'p-3'}`}>
        <FileItemInfo node={node} galleryMode={galleryMode} fontSize={fontSize} />
      </div>

      {!galleryMode && !hideTypeTag && (
        <div className="p-3">
          <FileItemTypeTag node={node} />
        </div>
      )}

      <div
        data-tour="file-item-actions"
        className={`flex items-center gap-1 opacity-100 transition-opacity duration-200 flex-shrink-0 ${galleryMode ? 'p-2' : 'p-3'}`}
      >
        {(forceCompactActions || useCompactActions) ? (
          <div className={`transition-opacity duration-200 ${isHovered || showMenu ? 'opacity-100' : 'opacity-0'}`}>
          <FileItemMenu
            actions={availableActions}
            onAction={handleAction}
            showMenu={showMenu}
            menuButtonRef={menuButtonRef}
            onOpenMenu={handleToggleMenu}
            onCloseMenu={handleCloseMenu}
          />
          </div>
        ) : (
          <>
            {(() => {
              const { main: btnMainActions, secondary: btnSecondaryActions } = getActionGroups(availableActions);
              return (
                <>
                  {btnMainActions.map((action) => (
                    <Tooltip key={action.type} content={action.tooltip} position="top">
                      <button
                        {...action.props}
                        onClick={(e) => {
                          e.stopPropagation();
                          actionHandlers[action.type]?.(e);
                        }}
                        className={`p-2 rounded-lg transition-colors ${
                          action.colorClass || 'text-slate-500'
                        } ${action.hoverClass || 'hover:bg-slate-100'}`}
                      >
                        <span className="inline-block scale-110 origin-center">
                          {React.cloneElement(
                            action.icon as React.ReactElement<{
                              width?: number;
                              height?: number;
                            }>,
                            { width: 18, height: 18 }
                          )}
                        </span>
                      </button>
                    </Tooltip>
                  ))}
                  {btnSecondaryActions.length > 0 && (
                    <Menu modal={false}>
                      <Tooltip content="其他操作" position="top">
                        <Menu.Trigger>
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-2 rounded-lg transition-colors text-slate-500 hover:bg-slate-100"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="5" r="1" />
                              <circle cx="12" cy="12" r="1" />
                              <circle cx="12" cy="19" r="1" />
                            </svg>
                          </button>
                        </Menu.Trigger>
                      </Tooltip>
                      <Menu.Content align="end" side="bottom" sideOffset={4}>
                        {btnSecondaryActions.map((action) => (
                          <Menu.Item
                            key={action.type}
                            variant="default"
                            icon={action.icon}
                            onClick={() => {
                              handleAction(action.type);
                            }}
                          >
                            {action.label}
                          </Menu.Item>
                        ))}
                      </Menu.Content>
                    </Menu>
                  )}
                </>
              );
            })()}
          </>
        )}
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
    </div>
      {contextMenuElement}
    </>
  );
};

export const FileIconComponent: React.FC<{
  node: FileSystemNode;
  size?: number;
}> = ({ node, size = 48 }) => {
  return null;
};
