import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  DownloadIcon,
  DeleteIcon,
  EditIcon,
  MoreIcon,
  UsersIcon,
  RestoreIcon,
  GalleryIcon,
} from '../FileIcons';
import { Upload } from 'lucide-react';
import { FileSystemNode } from '../../types/filesystem';

interface FileItemMenuProps {
  node: FileSystemNode;
  isTrash: boolean;
  showMenu: boolean;
  menuPosition: { top: number; left: number } | null;
  menuButtonRef: React.RefObject<HTMLButtonElement>;
  menuContainerRef: React.RefObject<HTMLDivElement>;
  onToggleMenu: (e: React.MouseEvent) => void;
  onCloseMenu: () => void;
  onDownload?: (node: FileSystemNode) => void;
  onDelete: (node: FileSystemNode) => void;
  onPermanentlyDelete?: (node: FileSystemNode) => void;
  onRename: (node: FileSystemNode) => void;
  onEdit?: (e: React.MouseEvent) => void;
  onShowMembers?: (e: React.MouseEvent) => void;
  onRestore?: (node: FileSystemNode) => void;
  onMove?: (node: FileSystemNode) => void;
  onCopy?: (node: FileSystemNode) => void;
  onAddToGallery?: (node: FileSystemNode) => void;
  onUploadExternalReference?: (e: React.MouseEvent) => void;
  isCadFile: () => boolean;
}

export const FileItemMenu: React.FC<FileItemMenuProps> = ({
  node,
  isTrash,
  showMenu,
  menuPosition,
  menuButtonRef,
  menuContainerRef,
  onToggleMenu,
  onCloseMenu,
  onDownload,
  onDelete,
  onPermanentlyDelete,
  onRename,
  onEdit,
  onShowMembers,
  onRestore,
  onMove,
  onCopy,
  onAddToGallery,
  onUploadExternalReference,
  isCadFile,
}) => {
  const isRoot = node.isRoot;

  const handleMenuAction = (action: () => void) => {
    action();
    onCloseMenu();
  };

  // 点击外部关闭菜单
  useEffect(() => {
    if (!showMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      const isClickInMenuButton = menuButtonRef.current?.contains(
        e.target as Node
      );
      const isClickInMenuContainer = menuContainerRef.current?.contains(
        e.target as Node
      );

      if (!isClickInMenuButton && !isClickInMenuContainer) {
        onCloseMenu();
      }
    };

    const handleScroll = () => {
      if (showMenu && menuButtonRef.current) {
        const rect = menuButtonRef.current.getBoundingClientRect();
        onToggleMenu({
          currentTarget: menuButtonRef.current,
          stopPropagation: () => {},
        } as React.MouseEvent);
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, true);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [showMenu, menuButtonRef, menuContainerRef, onCloseMenu, onToggleMenu]);

  const renderMenu = () => {
    if (isTrash) {
      return (
        <>
          {onRestore && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleMenuAction(() => onRestore(node));
              }}
              className="w-full px-4 py-2 text-left text-sm text-green-600 hover:bg-green-50 flex items-center gap-2 transition-colors"
            >
              <RestoreIcon size={16} />
              恢复
            </button>
          )}
          <hr className="my-1 border-slate-100" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleMenuAction(() => onPermanentlyDelete ? onPermanentlyDelete(node) : onDelete(node));
            }}
            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
          >
            <DeleteIcon size={16} />
            彻底删除
          </button>
        </>
      );
    }

    return (
      <>
        {isCadFile() &&
          node.hasMissingExternalReferences &&
          onUploadExternalReference && (
            <button
              onClick={onUploadExternalReference}
              className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors text-amber-600 hover:bg-amber-50"
            >
              <Upload size={16} />
              上传外部参照
            </button>
          )}

        {isRoot ? (
          <>
            {onEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMenuAction(() => onEdit(e));
                }}
                className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
              >
                <EditIcon size={16} />
                编辑
              </button>
            )}
            {onShowMembers && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMenuAction(() => onShowMembers(e));
                }}
                className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
              >
                <UsersIcon size={16} />
                成员
              </button>
            )}
            <hr className="my-1 border-slate-100" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleMenuAction(() => onDelete(node));
              }}
              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
            >
              <DeleteIcon size={16} />
              删除
            </button>
          </>
        ) : (
          <>
            {!node.isFolder && (
              <>
                {onDownload && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMenuAction(() => onDownload(node));
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                  >
                    <DownloadIcon size={16} />
                    下载
                  </button>
                )}
                {onAddToGallery && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMenuAction(() => onAddToGallery(node));
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-indigo-600 hover:bg-indigo-50 flex items-center gap-2 transition-colors"
                  >
                    <GalleryIcon size={16} />
                    添加到图库
                  </button>
                )}
              </>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleMenuAction(() => onRename(node));
              }}
              className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
            >
              <EditIcon size={16} />
              重命名
            </button>
            {onMove && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMenuAction(() => onMove(node));
                }}
                className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M5 9l7-7 7 7M5 15l7 7 7-7" />
                </svg>
                移动到...
              </button>
            )}
            {onCopy && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMenuAction(() => onCopy(node));
                }}
                className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
                复制到...
              </button>
            )}
            {onRestore && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMenuAction(() => onRestore(node));
                }}
                className="w-full px-4 py-2 text-left text-sm text-green-600 hover:bg-green-50 flex items-center gap-2 transition-colors"
              >
                <RestoreIcon size={16} />
                恢复
              </button>
            )}
            <hr className="my-1 border-slate-100" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleMenuAction(() => onDelete(node));
              }}
              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
            >
              <DeleteIcon size={16} />
              删除
            </button>
            {onPermanentlyDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMenuAction(() => onPermanentlyDelete(node));
                }}
                className="w-full px-4 py-2 text-left text-sm text-red-700 hover:bg-red-100 flex items-center gap-2 transition-colors"
              >
                <DeleteIcon size={16} />
                彻底删除
              </button>
            )}
          </>
        )}
      </>
    );
  };

  return (
    <>
      <button
        ref={menuButtonRef}
        onClick={onToggleMenu}
        className="w-8 h-8 rounded-full bg-white/90 hover:bg-white shadow-sm border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors"
      >
        <MoreIcon size={16} />
      </button>

      {showMenu &&
        menuPosition &&
        createPortal(
          <div
            ref={menuContainerRef}
            className="fixed bg-white rounded-lg shadow-xl border border-slate-200 py-1 min-w-[120px] z-[99999] animate-scale-in origin-top-right pointer-events-auto"
            style={{
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`,
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            {renderMenu()}
          </div>,
          document.body
        )}
    </>
  );
};
