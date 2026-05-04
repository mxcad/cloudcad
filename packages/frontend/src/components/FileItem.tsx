import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useExternalReferenceUpload } from '../hooks/useExternalReferenceUpload';
import { ExternalReferenceModal } from './modals/ExternalReferenceModal';
import { ImagePreviewModal } from './modals/ImagePreviewModal';
import { FileNameText } from './ui/TruncateText';

import { handleError } from '../utils/errorHandler';
import {
  getOriginalFileUrl,
  formatRelativeTime,
  formatFileSize,
} from '../utils/fileUtils';
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
import { Tooltip } from './ui/Tooltip';

// Lucide 图标（用于 compact 模式）
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
  isMultiSelectMode?: boolean;
  isTrash?: boolean;
  canUpload?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canDownload?: boolean;
  canViewVersionHistory?: boolean;
  canManageTrash?: boolean;
  canManageExternalReference?: boolean;
  /** 是否需要双击打开（默认 false，单击打开） */
  doubleClickToOpen?: boolean;
  /** 文件名字体大小，默认不设置（继承父元素字体大小） */
  fontSize?: number | string;
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
  isMultiSelectMode = false,
  isTrash = false,
  canUpload = false,
  canEdit = false,
  canDelete = false,
  canDownload = false,
  canViewVersionHistory = false,
  canManageExternalReference = false,
  canManageTrash = false,
  doubleClickToOpen = false,
  fontSize,
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
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  isDropTarget = false,
}) => {
  // 空值保护：node 为空时返回 null
  if (!node) {
    console.warn('[FileItem] node is undefined or null');
    return null;
  }

  const [showMenu, setShowMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewImageSrc, setPreviewImageSrc] = useState('');
  const [useCompactActions, setUseCompactActions] = useState(false);
  const [showDoubleClickTip, setShowDoubleClickTip] = useState(false);
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
        // 调用 checkMissingReferences 打开外部参照管理弹框
        // forceOpen = true，手动点击时即使没有外部参照也弹框显示提示
        const hasExternalReference = await externalReferenceUpload.checkMissingReferences(undefined, false, true);
        
        // 如果没有外部参照，提示用户
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
    return ext === '.dwg' || ext === '.dxf' || ext === '.mxweb' || ext === '.mxwbe';
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
        // 在多选模式下：
        // - 直接点击：切换选中状态（isMulti=true, isShift=false）
        // - Ctrl+点击：切换选中状态（isMulti=true, isShift=false）
        // - Shift+点击：范围选择（isMulti=true, isShift=true）
        onSelect?.(node.id, true, isShift);
      } else if (doubleClickToOpen) {
        // 双击模式：等待用户完成双击，只有确定是单击才显示提示
        clickCountRef.current++;
        if (clickCountRef.current === 1) {
          // 第一次点击，启动定时器
          clickTimerRef.current = setTimeout(() => {
            // 超过时间没有第二次点击，确定是单击
            if (!showDoubleClickTip) {
              setShowDoubleClickTip(true);
              setTimeout(() => {
                setShowDoubleClickTip(false);
              }, 2000);
            }
            clickCountRef.current = 0;
            clickTimerRef.current = null;
          }, 300);
        }
        return;
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
      doubleClickToOpen,
    ]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      // 清除单击定时器（如果存在）
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      clickCountRef.current = 0;
      setShowDoubleClickTip(false);

      if (isPreviewOpen) return;
      if (isImageFile()) {
        handleImagePreview();
      } else {
        onEnter(node);
      }
    },
    [node, onEnter, isPreviewOpen, isImageFile, handleImagePreview]
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
    canViewVersionHistory,
    canManageExternalReference,
    canManageTrash: !!onRestore || !!onPermanentlyDelete,
    onDownload: !!onDownload,
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

  // 响应式操作按钮：监听列表项宽度，空间不足时切换为菜单按钮模式
  useEffect(() => {
    if (viewMode !== 'list') return;

    const element = listItemRef.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        // 宽度小于 550px 时使用紧凑模式（菜单按钮）
        // 操作按钮区域大约需要：每个按钮 40px × N个按钮
        setUseCompactActions(width < 550);
      }
    });

    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, [viewMode]);

  if (viewMode === 'grid') {
    const showSelection = isMultiSelectMode && isSelected;
    const thumbnailSize = galleryMode ? 120 : 64;

    return (
      <div
        data-tour="file-item"
        className={`group relative rounded-xl transition-all duration-200 cursor-pointer pointer-events-auto
          ${isPreviewOpen ? 'pointer-events-none' : ''}
          ${showSelection ? 'shadow-md' : ''}
          ${isDropTarget ? 'shadow-md' : ''}
          ${!showSelection && !isDropTarget ? 'hover:shadow-lg hover:-translate-y-0.5' : ''}
        `}
        style={{
          background: showSelection
            ? 'var(--primary-50)'
            : isDropTarget
              ? 'var(--success-light)'
              : 'var(--bg-secondary)',
          border: showSelection
            ? '2px solid var(--primary-500)'
            : isDropTarget
              ? '2px solid var(--success)'
              : '1px solid var(--border-default)',
        }}
        onMouseEnter={(e) => {
          setIsHovered(true);
          if (!showSelection && !isDropTarget) {
            e.currentTarget.style.borderColor = 'var(--primary-400)';
          }
        }}
        onMouseLeave={(e) => {
          setIsHovered(false);
          setShowMenu(false);
          onDragLeave?.();
          if (!showSelection && !isDropTarget) {
            e.currentTarget.style.borderColor = 'var(--border-default)';
          }
        }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        draggable={!!onDragStart && !node.isRoot}
        onDragStart={(e) => onDragStart?.(e, node)}
        onDragOver={(e) => onDragOver?.(e, node)}
        onDrop={(e) => onDrop?.(e, node)}
      >
        <FileItemSelection
          isSelected={isSelected}
          isMultiSelectMode={isMultiSelectMode}
          onSelect={(isShift) => onSelect?.(node.id, true, isShift)}
          isGrid
        />

        {galleryMode ? (
          <div className="flex flex-col h-full p-2">
            <div
              className="flex-1 flex items-center justify-center overflow-hidden rounded-lg mb-2"
            >
              <Thumbnail
                node={node}
                size={thumbnailSize}
                galleryMode={galleryMode}
                onPreview={(src) => {
                  setPreviewImageSrc(src);
                  setIsPreviewOpen(true);
                }}
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
                ${isHovered && !showSelection ? 'scale-110' : ''}
                ${showSelection ? 'scale-105' : ''}
              "
              style={{ width: thumbnailSize, height: thumbnailSize }}
            >
              <Thumbnail
                node={node}
                size={thumbnailSize}
                galleryMode={galleryMode}
                onPreview={(src) => {
                  setPreviewImageSrc(src);
                  setIsPreviewOpen(true);
                }}
              />
            </div>

            <div className="flex flex-col items-center">
              <FileItemInfo node={node} isGrid galleryMode={galleryMode} fontSize={fontSize} />
              <FileItemExternalReferenceWarning node={node} isGrid />
            </div>
          </div>
        )}

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
            onShowVersionHistory={onShowVersionHistory}
            onUploadExternalReference={handleUploadExternalReference}
            isCadFile={isCadFile}
            canDownload={canDownload}
            canEdit={canEdit}
            canDelete={canDelete}
            canViewVersionHistory={canViewVersionHistory}
            canManageExternalReference={canManageExternalReference}
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

        {/* 双击提示 */}
        {showDoubleClickTip && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl z-10">
            <div className="px-4 py-2 bg-gray-900/90 text-white text-sm rounded-lg shadow-lg backdrop-blur-sm" style={{ animation: 'fade-in 0.3s ease' }}>
              请双击打开图纸
            </div>
          </div>
        )}
      </div>
    );
  }

  const showListSelection = isMultiSelectMode && isSelected;

  // compact 模式：简化渲染
  if (compact) {
    return (
      <div
        onClick={() => onEnter(node)}
        className="group flex items-center gap-3 p-3 rounded-xl transition-all duration-200 cursor-pointer hover:bg-[var(--bg-tertiary)]"
      >
        {/* 图标 */}
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

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          <h4
            className="font-medium text-sm"
            style={{ color: 'var(--text-primary)' }}
          >
            <FileNameText maxWidth="100%" showTooltip={true}>
              {node.name}
            </FileNameText>
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
    <div
      ref={listItemRef}
      data-tour="file-item"
      className={`group relative flex items-center rounded-lg transition-all duration-200 cursor-pointer
        ${galleryMode ? 'gap-2' : 'gap-4'}
        ${showListSelection ? '' : 'hover:border-[var(--border-default)]'}
      `}
      style={{
        background: showListSelection ? 'var(--primary-50)' : 'transparent',
        border: showListSelection
          ? '1px solid var(--primary-200)'
          : '1px solid transparent',
      }}
      onMouseEnter={(e) => {
        setIsHovered(true);
        if (!showListSelection) {
          e.currentTarget.style.background = 'var(--bg-tertiary)';
        }
      }}
      onMouseLeave={(e) => {
        setIsHovered(false);
        setShowMenu(false);
        onDragLeave?.();
        if (!showListSelection) {
          e.currentTarget.style.background = 'transparent';
        }
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      draggable={!!onDragStart && !node.isRoot}
      onDragStart={(e) => onDragStart?.(e, node)}
      onDragOver={(e) => onDragOver?.(e, node)}
      onDrop={(e) => onDrop?.(e, node)}
    >
      <div className="p-2">
        <FileItemSelection
          isSelected={isSelected}
          isMultiSelectMode={isMultiSelectMode}
          onSelect={(isShift) => onSelect?.(node.id, true, isShift)}
        />
      </div>

      <div className={`flex-shrink-0 flex items-center justify-center ${galleryMode ? 'w-14 h-14' : 'w-10 h-10'}`}>
        <Thumbnail
          node={node}
          size={galleryMode ? 56 : 40}
          galleryMode={false}
          onPreview={(src) => {
            setPreviewImageSrc(src);
            setIsPreviewOpen(true);
          }}
        />
      </div>

      <div className={`flex-1 min-w-0 ${galleryMode ? 'p-2' : 'p-3'}`}>
        <FileItemInfo node={node} galleryMode={galleryMode} fontSize={fontSize} />
      </div>

      {/* 图库模式下不显示文件后缀标签 */}
      {!galleryMode && (
        <div className="p-3">
          <FileItemTypeTag node={node} />
        </div>
      )}

      <div
        data-tour="file-item-actions"
        className={`flex items-center gap-1 opacity-100 transition-opacity duration-200 flex-shrink-0 ${galleryMode ? 'p-2' : 'p-3'}`}
      >
        {useCompactActions ? (
          // 紧凑模式：显示菜单按钮
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
            onShowVersionHistory={onShowVersionHistory}
            onUploadExternalReference={handleUploadExternalReference}
            isCadFile={isCadFile}
            canDownload={canDownload}
            canEdit={canEdit}
            canDelete={canDelete}
            canViewVersionHistory={canViewVersionHistory}
            canManageExternalReference={canManageExternalReference}
            canManageTrash={canManageTrash}
          />
        ) : (
          // 正常模式：显示独立操作按钮
          availableActions.map((action) => (
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
            </Tooltip>
          ))
        )}
      </div>

      <ImagePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        src={previewImageSrc}
        alt={node.name}
      />

      <ExternalReferenceModal
        isOpen={externalReferenceUpload.isOpen}
        files={externalReferenceUpload.files}
        loading={externalReferenceUpload.loading}
        onSelectAndUpload={externalReferenceUpload.selectAndUploadFiles}
        onComplete={externalReferenceUpload.complete}
        onSkip={externalReferenceUpload.skip}
        onClose={externalReferenceUpload.close}
      />

      {/* 双击提示 */}
      {showDoubleClickTip && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg z-10">
          <div className="px-4 py-2 bg-gray-900/90 text-white text-sm rounded-lg shadow-lg backdrop-blur-sm" style={{ animation: 'fade-in 0.3s ease' }}>
            请双击打开图纸
          </div>
        </div>
      )}
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
