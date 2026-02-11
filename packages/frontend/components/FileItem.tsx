import React, { useState, useCallback, useRef } from 'react';
import { Upload } from 'lucide-react';
import { useExternalReferenceUpload } from '../hooks/useExternalReferenceUpload';
import { ExternalReferenceModal } from './modals/ExternalReferenceModal';
import { ImagePreviewModal } from './modals/ImagePreviewModal';
import { logger } from '../utils/logger';
import { handleError } from '../utils/errorHandler';
import { mxcadApi } from '../services/mxcadApi';
import { getOriginalFileUrl } from '../utils/fileUtils';
import {
  Thumbnail,
  FileItemSelection,
  FileItemExternalReferenceWarning,
  FileItemInfo,
  FileItemTypeTag,
  FileItemMenu,
} from './file-item';
import { FileSystemNode } from '../../types/filesystem';

interface FileItemProps {
  node: FileSystemNode;
  isSelected: boolean;
  viewMode: 'grid' | 'list';
  isMultiSelectMode?: boolean;
  isTrash?: boolean;
  onSelect: (nodeId: string, isMultiSelect?: boolean) => void;
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
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const blockItemClickRef = useRef(false);

  const externalReferenceUpload = useExternalReferenceUpload({
    nodeId: node.id,
    onSuccess: () => {
      logger.info('外部参照上传成功，开始刷新文件列表', 'FileItem');
      // 后端在上传成功后已经调用了 updateExternalReferenceAfterUpload 更新数据库
      // 前端只需要刷新文件列表即可
      onRefresh?.();
    },
    onError: (error) => {
      const appError = handleError(error, 'FileItem');
      logger.error(appError.message, 'FileItem', appError.details);
    },
    onSkip: () => {
      logger.info('用户跳过外部参照上传', 'FileItem');
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
        onSelect(node.id, isCtrl || true, isShift);
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
          onSelect={(isShift) => onSelect(node.id, true, isShift)}
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
        onSelect={(isShift) => onSelect(node.id, true, isShift)}
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
        {isTrash ? (
          <>
            {onRestore && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRestore(node);
                }}
                className="p-2 rounded-lg text-slate-500 hover:text-green-600 hover:bg-green-50"
                title="恢复"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M3 10h10a8 8 0 0 1 8 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPermanentlyDelete(node);
              }}
              className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50"
              title="彻底删除"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </>
        ) : (
          <>
            {isCadFile() && node.hasMissingExternalReferences && (
              <button
                onClick={handleUploadExternalReference}
                className="p-2 rounded-lg transition-colors text-amber-600 hover:bg-amber-50"
                title="上传外部参照"
              >
                <Upload size={18} />
              </button>
            )}

            {isRoot ? (
              <>
                {onEdit && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(e);
                    }}
                    className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                    title="编辑"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                )}
                {onShowMembers && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowMembers(e);
                    }}
                    className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                    title="成员"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </button>
                )}
                {onShowRoles && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowRoles(e);
                    }}
                    className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                    title="角色管理"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
                      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
                    </svg>
                  </button>
                )}
                {onDeleteNode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteNode(e);
                    }}
                    className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50"
                    title="删除"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                )}
              </>
            ) : (
              <>
                {!node.isFolder && (
                  <>
                    {onDownload && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDownload(node);
                        }}
                        className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                        title="下载"
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </button>
                    )}
                    {onAddToGallery && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToGallery(node);
                        }}
                        className="p-2 rounded-lg text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50"
                        title="添加到图库"
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <rect
                            x="3"
                            y="3"
                            width="18"
                            height="18"
                            rx="2"
                            ry="2"
                          />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                      </button>
                    )}
                  </>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRename(node);
                  }}
                  className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                  title="重命名"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                {onMove && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMove(node);
                    }}
                    className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                    title="移动到"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M5 9l7-7 7 7M5 15l7 7 7-7" />
                    </svg>
                  </button>
                )}
                {onCopy && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCopy(node);
                    }}
                    className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                    title="复制到"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                  </button>
                )}
                {onRestore && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRestore(node);
                    }}
                    className="p-2 rounded-lg text-slate-500 hover:text-green-600 hover:bg-green-50"
                    title="恢复"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M3 10h10a8 8 0 0 1 8 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRestore ? onPermanentlyDelete(node) : onDelete(node);
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    onRestore
                      ? 'text-red-600 hover:bg-red-50'
                      : 'text-slate-500 hover:text-red-600 hover:bg-red-50'
                  }`}
                  title={onRestore ? '彻底删除' : '删除'}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </>
            )}
          </>
        )}
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
