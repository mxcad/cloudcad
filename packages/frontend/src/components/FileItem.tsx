import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from 'react';
import { useExternalReferenceUpload } from '../hooks/useExternalReferenceUpload';
import { useIsMobile } from '@/lib/useIsMobile';
import { ExternalReferencePanel } from './modals/ExternalReferencePanel';
import { ImagePreviewModal } from './modals/ImagePreviewModal';
import { DownloadFormatModal } from './modals/DownloadFormatModal';
import type { ExternalReferenceFile } from '../types/filesystem';
import type {
  DownloadFormat,
  PdfOptions,
  DwgOptions,
} from '../types/download-format';

import { handleError } from '../utils/errorHandler';
import { infoOnce } from '../utils/message';
import { isTourModeActive } from '../utils/tourMode';
import {
  formatRelativeTime,
  formatFileSize,
  CAD_EXTENSIONS,
} from '../utils/fileUtils';
import {
  downloadExternalRefFile,
  fetchXrefViewBlobUrl,
  revokeXrefViewBlobUrl,
  type DownloadNodeQuery,
} from '../utils/download';
import {
  Thumbnail,
  FileItemSelection,
  FileItemInfo,
  FileItemMenu,
} from './file-item';
import {
  getAvailableActions,
  getActionGroups,
  getAction,
  toBooleanMap,
  type ActionType,
  type ActionCallbacks,
} from './file-item/fileActionConfig';
import { FileSystemNode } from '../types/filesystem';
import { Card } from './ui/Card';
import { Tooltip } from './ui/Tooltip';

import { FolderOpen } from 'lucide-react';
import { FileText } from 'lucide-react';
import { t } from '@/languages';

function abbreviateSearchPath(path: string): string {
  const parts = path.split(' > ');
  if (parts.length <= 2) return path;
  return `${parts[0]} > ... > ${parts[parts.length - 1]}`;
}

interface FileItemProps {
  node: FileSystemNode;
  /** @deprecated Use isSelected instead */
  selected?: boolean;
  isSelected?: boolean;
  isActive?: boolean;
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
  canShare?: boolean;
  canDownload?: boolean;
  canViewVersionHistory?: boolean;
  /** 复制权限（复制到剪贴板 / 复制到...），缺省视为无权限（悲观门控） */
  canCopy?: boolean;
  /** 移动权限（剪切 / 移动到...），缺省视为无权限（悲观门控） */
  canMove?: boolean;
  canManageTrash?: boolean;
  canManageExternalReference?: boolean;
  canCreate?: boolean;
  /** 文件名字体大小，默认不设置（继承父元素字体大小） */
  fontSize?: number | string;
  /** 外部指定的缩略图 URL（如公共资源库的公开缩略图接口），优先于内部推导 */
  thumbnailUrl?: string;
  /** 强制紧凑操作模式：始终使用"更多"菜单替代独立操作按钮 */
  forceCompactActions?: boolean;
  /** 隐藏选中圆圈（用于项目列表等纯导航场景） */
  hideSelectionCircle?: boolean;
  /** 双击打开（用于侧边栏图库等场景），true=单击打开，false=双击打开，配合 hideSelectionCircle 提示 */
  doubleClickToOpen?: boolean;
  /** 双击提示文字（当 doubleClickToOpen=true 时单击显示的提示） */
  doubleClickHint?: string;
  /** 是否正在框选（禁用拖拽避免冲突） */
  isRubberBanding?: boolean;
  /** 框选刚结束 ref（阻止残留 click 导致文件打开） */
  rubberBandJustEndedRef?: React.MutableRefObject<boolean>;
  /** 当前已选中的条目总数（用于多选场景右键菜单） */
  selectedCount?: number;
  /** 搜索结果模式 */
  isSearchResult?: boolean;
  /** 项目列表级别（搜索结果需显示项目名称） */
  isProjectRootLevel?: boolean;
  onOpen?: (node: FileSystemNode) => void;
  onOpenInNewTab?: (node: FileSystemNode) => void;
  onOpenFileLocation?: (node: FileSystemNode) => void;
  onCopyClipboard?: (node: FileSystemNode) => void;
  onCut?: (node: FileSystemNode) => void;
  onFolderDownload?: (node: FileSystemNode) => void;
  onCopyPath?: (node: FileSystemNode) => void;
  /** 当前目录的祖先路径（用于搜索结果中隐藏同目录文件的路径） */
  currentAncestorPath?: string;
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
  onShowOperationHistory?: (e: React.MouseEvent) => void;
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
  isActive = false,
  viewMode = 'list',
  compact = false,
  galleryMode = false,
  isTrash = false,
  canUpload = false,
  canEdit = false,
  canDelete = false,
  canShare = false,
  canDownload = false,
  canViewVersionHistory = false,
  canCopy = false,
  canMove = false,
  canManageExternalReference = false,
  canManageTrash = false,
  canCreate = false,
  fontSize,
  thumbnailUrl,
  forceCompactActions = false,
  hideSelectionCircle = true,
  doubleClickToOpen = false,
  doubleClickHint = t('请单击打开'),
  isRubberBanding = false,
  rubberBandJustEndedRef,
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
  onShowOperationHistory,
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
  isProjectRootLevel = false,
  onOpen,
  onOpenInNewTab,
  onOpenFileLocation,
  onCopyClipboard,
  onCut,
  onFolderDownload,
  onCopyPath,
  currentAncestorPath,
}) => {
  const isMobile = useIsMobile();
  const [showMenu, setShowMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(isMobile);

  const [useCompactActions, setUseCompactActions] = useState(false);
  const isRoot = node?.isRoot ?? false;
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const blockItemClickRef = useRef(false);
  const listItemRef = useRef<HTMLDivElement | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickCountRef = useRef(0);

  const externalReferenceUpload = useExternalReferenceUpload({
    nodeId: node?.id,
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

  // 外部参照查看预览
  const [previewXref, setPreviewXref] = useState<{
    file: ExternalReferenceFile;
    url: string;
  } | null>(null);

  const handleViewXref = useCallback(
    async (file: ExternalReferenceFile) => {
      if (!node.id) return;

      if (file.type === 'img') {
        try {
          // external-ref-view 需要 Bearer token，<img> 无法携带，走 SDK 取 blob
          const url = await fetchXrefViewBlobUrl(node.id, file.name);
          setPreviewXref((prev) => {
            if (prev && prev.url !== url) revokeXrefViewBlobUrl(prev.url);
            return { file, url };
          });
        } catch (error) {
          handleError(error, t('打开外部参照失败'));
        }
      } else {
        const fileUrl = `/api/v1/mxcad/external-ref-view/${encodeURIComponent(node.id)}/${encodeURIComponent(file.name)}`;
        window.open(
          `/cad-editor?fileUrl=${encodeURIComponent(fileUrl)}`,
          '_blank'
        );
      }
    },
    [node?.id]
  );

  // 外部参照下载（图片直接下载，图纸走格式转换）
  const handleDownloadXref = useCallback(
    async (file: ExternalReferenceFile) => {
      if (!node.id || !file.name) return;

      if (file.type === 'img') {
        try {
          // 走 SDK（自动带 token），避免 <a> 下载 401
          await downloadExternalRefFile(node.id, file.name, {}, file.name);
        } catch (error) {
          handleError(error, t('外部参照下载失败'));
        }
      } else {
        setDownloadingExtRefFile(file);
        setShowExtRefFormatModal(true);
      }
    },
    [node?.id]
  );

  // 外部参照格式下载
  const [showExtRefFormatModal, setShowExtRefFormatModal] = useState(false);
  const [downloadingExtRefFile, setDownloadingExtRefFile] =
    useState<ExternalReferenceFile | null>(null);
  const [extRefDownloading, setExtRefDownloading] = useState(false);

  const handleExtRefFormatDownload = async (
    format: DownloadFormat,
    pdfOptions?: PdfOptions,
    dwgOptions?: DwgOptions
  ) => {
    const file = downloadingExtRefFile;
    if (!file || !node.id) return;
    setExtRefDownloading(true);
    try {
      const query: DownloadNodeQuery = { format };
      if (format === 'pdf' && pdfOptions) {
        if (pdfOptions.width) query.width = pdfOptions.width;
        if (pdfOptions.height) query.height = pdfOptions.height;
        if (pdfOptions.colorPolicy) query.colorPolicy = pdfOptions.colorPolicy;
      }
      if ((format === 'dwg' || format === 'dxf') && dwgOptions) {
        query.dwgVersion = String(dwgOptions.dwgVersion);
      }
      const nameWithoutExt = file.name.replace(/\.[^.]+$/, '');
      await downloadExternalRefFile(
        node.id,
        file.name,
        query,
        `${nameWithoutExt}.${format}`
      );
    } catch (error) {
      handleError(error, t('外部参照下载失败'));
    } finally {
      setExtRefDownloading(false);
      setShowExtRefFormatModal(false);
      setDownloadingExtRefFile(null);
    }
  };

  const handleUploadExternalReference = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setShowMenu(false);
      blockItemClickRef.current = true;
      await new Promise((resolve) => setTimeout(resolve, 50));

      try {
        const hasExternalReference =
          await externalReferenceUpload.checkMissingReferences(
            undefined,
            false,
            true
          );

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
    [node?.id, node?.name, externalReferenceUpload]
  );

  const isCadFile = useCallback(() => {
    if (node?.isFolder || node?.isRoot) return false;
    const ext = node?.extension?.toLowerCase();
    return CAD_EXTENSIONS.includes(ext || '');
  }, [node?.extension, node?.isFolder, node?.isRoot]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (blockItemClickRef.current) {
        blockItemClickRef.current = false;
        return;
      }

      if (isRubberBanding || rubberBandJustEndedRef?.current) {
        if (rubberBandJustEndedRef) rubberBandJustEndedRef.current = false;
        return;
      }

      if (
        (e.target as HTMLElement).closest('[role="menu"], [data-menu-content]')
      ) {
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
            infoOnce(doubleClickHint);
            clickCountRef.current = 0;
            clickTimerRef.current = null;
          }, 300);
        }
        return;
      } else {
        onEnter(node);
      }
    },
    [
      node,
      onSelect,
      onEnter,
      hideSelectionCircle,
      doubleClickToOpen,
      isRubberBanding,
      isSelected,
    ]
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

  // 统一回调集：动作注册表（fileActionConfig）的执行依赖，
  // 与 action.run 搭配——新增动作无需再改本组件分发逻辑
  const callbacks: ActionCallbacks = {
    onOpen,
    onOpenInNewTab,
    onOpenFileLocation,
    onDownload,
    onRename,
    onMove,
    onCopy,
    onCopyClipboard,
    onCut,
    onRestore,
    onDelete,
    onPermanentlyDelete,
    onShare,
    onShowVersionHistory,
    onFolderDownload,
    onCopyPath,
    onEdit,
    onShowMembers,
    onShowRoles,
    onShowOperationHistory,
    onDeleteNode,
    onUploadExternalReference: handleUploadExternalReference,
  };

  const actionProps: Parameters<typeof getAvailableActions>[0] = {
    node,
    isTrash,
    isRoot,
    isCadFile: isCadFile(),
    isFolder: node?.isFolder ?? false,
    canDownload,
    canEdit,
    canDelete,
    canShare,
    canViewVersionHistory,
    canCopy,
    canMove,
    canManageExternalReference,
    canManageTrash: !!onRestore || !!onPermanentlyDelete,
    canCreate,
    // 回调存在性 → 可见性布尔位（自动推导）；onDeleteNode 为事件型信号位，显式覆盖
    ...toBooleanMap(callbacks, {
      onDeleteNode: !!onDeleteNode || !!onDelete,
    }),
    isSearchResult,
  };

  const availableActions = getAvailableActions(actionProps);

  const handleAction = useCallback(
    (type: ActionType) => {
      getAction(type)?.run({
        node,
        e: new MouseEvent('click') as unknown as React.MouseEvent,
        callbacks,
      });
    },
    [node, callbacks]
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
    if (!isMobile) {
      setIsHovered(false);
    }
    setShowMenu(false);
  }, [viewMode, isMobile]);

  const displayAncestorPath = useMemo(() => {
    if (!node?.ancestorPath) return null;
    if (isProjectRootLevel) {
      return node.ancestorPath;
    }
    const parts = node.ancestorPath.split(' > ');
    const relativePath = parts.slice(1).join(' > ');
    if (!relativePath) return null;

    if (currentAncestorPath) {
      if (relativePath === currentAncestorPath) return null;
      if (relativePath.startsWith(currentAncestorPath + ' > ')) {
        return relativePath.slice(currentAncestorPath.length + 3);
      }
    }
    return relativePath;
  }, [node?.ancestorPath, currentAncestorPath, isProjectRootLevel]);

  const searchPathBadge = useMemo(() => {
    if (!(isSearchResult || isTrash) || !displayAncestorPath) return null;
    if (viewMode === 'grid') {
      return (
        <Tooltip content={node?.ancestorPath || ''} position="bottom">
          <span
            className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium leading-none max-w-full truncate"
            style={{
              background: 'var(--primary-100)',
              color: 'var(--primary-600)',
            }}
          >
            {abbreviateSearchPath(displayAncestorPath)}
          </span>
        </Tooltip>
      );
    }
    return (
      <Tooltip content={node?.ancestorPath || ''} position="bottom">
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium leading-none max-w-full truncate"
          style={{
            background: 'var(--primary-100)',
            color: 'var(--primary-600)',
          }}
        >
          {displayAncestorPath}
        </span>
      </Tooltip>
    );
  }, [
    isSearchResult,
    isTrash,
    displayAncestorPath,
    viewMode,
    node?.ancestorPath,
  ]);

  if (!node) {
    console.warn('[FileItem] node is undefined or null');
    return null;
  }

  if (viewMode === 'grid') {
    const showSelectedStyle = isSelected;
    const showActiveStyle = isActive && !isSelected;
    const isDefaultAppearance =
      !showSelectedStyle && !showActiveStyle && !isDropTarget;
    const thumbnailSize = 100;

    return (
      <>
        <Card
          variant="outlined"
          padding="none"
          radius={galleryMode ? 'sm' : undefined}
          data-tour="file-item"
          data-node-id={node.id}
          title={doubleClickToOpen ? t('单击打开') : undefined}
          className={`group relative transition-all duration-200 cursor-pointer pointer-events-auto select-none
          ${galleryMode ? 'w-[120px] min-h-[150px]' : ''}
          ${showSelectedStyle ? 'shadow-md' : ''}
          ${showActiveStyle ? 'shadow-md' : ''}
          ${isDropTarget ? 'shadow-md' : ''}
          ${isDefaultAppearance && !galleryMode && !isMobile ? 'hover:shadow-lg hover:-translate-y-0.5' : ''}
          ${isDefaultAppearance && galleryMode ? 'hover:shadow-lg' : ''}
        `}
          style={{
            background:
              showSelectedStyle || showActiveStyle || isDropTarget
                ? 'var(--primary-50)'
                : 'var(--bg-drawing-card)',
            border:
              showSelectedStyle || isDropTarget
                ? '2px solid var(--primary-500)'
                : showActiveStyle
                  ? '2px solid var(--primary-400)'
                  : undefined,
          }}
          onMouseEnter={(e) => {
            if (isMobile) return;
            setIsHovered(true);
            if (isDefaultAppearance) {
              if (galleryMode) {
                e.currentTarget.style.background = 'var(--bg-tertiary)';
              } else {
                e.currentTarget.style.borderColor = 'var(--primary-400)';
              }
            }
          }}
          onMouseLeave={(e) => {
            if (isMobile) return;
            setIsHovered(false);
            setShowMenu(false);
            onDragLeave?.();
            if (isDefaultAppearance) {
              if (galleryMode) {
                e.currentTarget.style.background = 'var(--bg-drawing-card)';
              } else {
                e.currentTarget.style.borderColor = 'var(--border-default)';
              }
            }
          }}
          onMouseDown={(e) => {
            if (hideSelectionCircle && !isRubberBanding) e.stopPropagation();
          }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          draggable={
            hideSelectionCircle &&
            !!onDragStart &&
            !node.isRoot &&
            !isRubberBanding
          }
          onDragStart={(e) => {
            onDragStart?.(e, node);
          }}
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
              <div className="flex-1 flex items-center justify-center overflow-hidden mb-2">
                <Thumbnail
                  node={node}
                  size={thumbnailSize}
                  galleryMode={galleryMode}
                  thumbnailUrl={thumbnailUrl}
                />
              </div>
              <div className="flex flex-col items-center pb-2">
                <FileItemInfo
                  node={node}
                  isGrid
                  galleryMode={galleryMode}
                  fontSize={fontSize}
                  searchPathBadge={searchPathBadge}
                />
              </div>
            </div>
          ) : (
            <div className="p-6 pb-4">
              <div
                className="mx-auto mb-4 flex items-center justify-center transition-transform duration-200
                ${isHovered && !showSelectedStyle && !isMobile ? 'scale-110' : ''}
                ${showSelectedStyle ? 'scale-105' : ''}
              "
                style={{ width: thumbnailSize, height: thumbnailSize }}
              >
                <Thumbnail
                  node={node}
                  size={thumbnailSize}
                  galleryMode={galleryMode}
                  thumbnailUrl={thumbnailUrl}
                />
              </div>

              <div className="flex flex-col items-center">
                <FileItemInfo
                  node={node}
                  isGrid
                  galleryMode={galleryMode}
                  fontSize={fontSize}
                  searchPathBadge={searchPathBadge}
                />
              </div>
            </div>
          )}

          <div
            className={`absolute top-1 right-1 transition-opacity duration-200 z-20 pointer-events-auto ${
              isHovered || showMenu || isMobile || isTourModeActive()
                ? 'opacity-100'
                : 'opacity-0'
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

          <ExternalReferencePanel
            isOpen={externalReferenceUpload.isOpen}
            files={externalReferenceUpload.files}
            loading={externalReferenceUpload.loading}
            mode="active"
            onSelectAndUpload={externalReferenceUpload.selectAndUploadFiles}
            onReplace={externalReferenceUpload.replaceFile}
            onDownload={handleDownloadXref}
            onView={handleViewXref}
            onRefresh={externalReferenceUpload.refresh}
            onComplete={externalReferenceUpload.complete}
            onClose={externalReferenceUpload.close}
          />
          <ImagePreviewModal
            isOpen={!!previewXref}
            src={previewXref?.url || ''}
            alt={previewXref?.file.name || ''}
            onClose={() => {
              revokeXrefViewBlobUrl(previewXref?.url || '');
              setPreviewXref(null);
            }}
          />
          <DownloadFormatModal
            isOpen={showExtRefFormatModal}
            fileName={downloadingExtRefFile?.name || ''}
            onClose={() => {
              setShowExtRefFormatModal(false);
              setDownloadingExtRefFile(null);
            }}
            onDownload={handleExtRefFormatDownload}
            loading={extRefDownloading}
          />
        </Card>
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
              node.isFolder ? node.name : node.name.replace(/\.[^/.]+$/, '')
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

  // 列表模式固定列布局：复选框/缩略图/信息（弹性）/操作按钮。
  // 类型标签列已整体移除（2026-08-14）：类型由图标（项目/文件夹/DWG/DXF/PDF 专属图标）
  // 与文件名后缀标识，标签信息重复且随权限变化的按钮数量会导致列漂移不齐。
  // 按钮列恒居最右，起点只由容器宽决定，任何按钮数量下各行天然对齐。
  const listColumns = [
    !hideSelectionCircle ? 'auto' : '',
    'auto',
    'minmax(0, 1fr)',
    'auto',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <div
        ref={listItemRef}
        data-tour="file-item"
        data-node-id={node.id}
        title={doubleClickToOpen ? t('单击打开') : undefined}
        className={`group relative grid items-center rounded-lg transition-all duration-200 cursor-pointer select-none
          ${galleryMode ? 'gap-2' : 'gap-4'}
          ${isSelected || isActive ? '' : 'hover:border-[var(--border-default)]'}
      `}
        style={{
          gridTemplateColumns: listColumns,
          background:
            isSelected || isActive ? 'var(--primary-50)' : 'transparent',
          border:
            isSelected || isActive
              ? '1px solid var(--primary-200)'
              : '1px solid transparent',
          boxShadow:
            isActive && !isSelected
              ? 'inset 3px 0 0 var(--primary-500)'
              : undefined,
        }}
        onMouseEnter={(e) => {
          if (isMobile) return;
          setIsHovered(true);
          if (!isSelected && !isActive) {
            e.currentTarget.style.background = 'var(--bg-tertiary)';
          }
        }}
        onMouseLeave={(e) => {
          if (isMobile) return;
          setIsHovered(false);
          setShowMenu(false);
          onDragLeave?.();
          if (!isSelected && !isActive) {
            e.currentTarget.style.background = 'transparent';
          }
        }}
        onMouseDown={(e) => {
          if (hideSelectionCircle && !isRubberBanding) e.stopPropagation();
        }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        draggable={
          hideSelectionCircle &&
          !!onDragStart &&
          !node.isRoot &&
          !isRubberBanding
        }
        onDragStart={(e) => {
          onDragStart?.(e, node);
        }}
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

        <div
          className={`flex-shrink-0 flex items-center justify-center ${galleryMode ? 'w-14 h-14' : 'w-10 h-10'}`}
        >
          <Thumbnail
            node={node}
            size={galleryMode ? 56 : 40}
            galleryMode={galleryMode}
            thumbnailUrl={thumbnailUrl}
          />
        </div>

        <div className={`flex-1 min-w-0 ${galleryMode ? 'p-2' : 'p-3'}`}>
          <FileItemInfo
            node={node}
            galleryMode={galleryMode}
            fontSize={fontSize}
            searchPathBadge={searchPathBadge}
          />
        </div>

        <div
          data-tour="file-item-actions"
          className={`flex items-center gap-1 opacity-100 transition-opacity duration-200 flex-shrink-0 ${galleryMode ? 'p-2' : 'p-3'}`}
        >
          {forceCompactActions || useCompactActions ? (
            <div
              className={`transition-opacity duration-200 ${
                isHovered || showMenu || isMobile || isTourModeActive()
                  ? 'opacity-100'
                  : 'opacity-0'
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
          ) : (
            <>
              {(() => {
                const {
                  main: btnMainActions,
                  destructive: btnDestructiveActions,
                } = getActionGroups(availableActions);
                return (
                  <>
                    {btnMainActions.map((action) => (
                      <Tooltip
                        key={action.type}
                        content={action.tooltip}
                        position="top"
                      >
                        <button
                          {...action.props}
                          onClick={(e) => {
                            e.stopPropagation();
                            action.run({ node, e, callbacks });
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
                    {btnDestructiveActions.map((action) => (
                      <Tooltip
                        key={action.type}
                        content={action.tooltip}
                        position="top"
                      >
                        <button
                          {...action.props}
                          onClick={(e) => {
                            e.stopPropagation();
                            action.run({ node, e, callbacks });
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
                  </>
                );
              })()}
            </>
          )}
        </div>

        <ExternalReferencePanel
          isOpen={externalReferenceUpload.isOpen}
          files={externalReferenceUpload.files}
          loading={externalReferenceUpload.loading}
          mode="active"
          onSelectAndUpload={externalReferenceUpload.selectAndUploadFiles}
          onReplace={externalReferenceUpload.replaceFile}
          onDownload={handleDownloadXref}
          onView={handleViewXref}
          onRefresh={externalReferenceUpload.refresh}
          onComplete={externalReferenceUpload.complete}
          onClose={externalReferenceUpload.close}
        />
        <ImagePreviewModal
          isOpen={!!previewXref}
          src={previewXref?.url || ''}
          alt={previewXref?.file.name || ''}
          onClose={() => {
            revokeXrefViewBlobUrl(previewXref?.url || '');
            setPreviewXref(null);
          }}
        />
        <DownloadFormatModal
          isOpen={showExtRefFormatModal}
          fileName={downloadingExtRefFile?.name || ''}
          onClose={() => {
            setShowExtRefFormatModal(false);
            setDownloadingExtRefFile(null);
          }}
          onDownload={handleExtRefFormatDownload}
          loading={extRefDownloading}
        />
      </div>
    </>
  );
};

export const FileIconComponent: React.FC<{
  node: FileSystemNode;
  size?: number;
}> = ({ node, size = 48 }) => {
  return null;
};
