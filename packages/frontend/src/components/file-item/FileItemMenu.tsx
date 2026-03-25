import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreIcon } from '../FileIcons';
import { FileSystemNode } from '../../types/filesystem';
import { getAvailableActions, type ActionType } from './fileActionConfig';

interface FileItemMenuProps {
  node: FileSystemNode;
  isTrash: boolean;
  showMenu: boolean;
  menuPosition: { top: number; left: number } | null;
  menuButtonRef: React.RefObject<HTMLButtonElement | null>;
  menuContainerRef: React.RefObject<HTMLDivElement | null>;
  onToggleMenu: (e: React.MouseEvent) => void;
  onCloseMenu: () => void;
  onDownload?: (node: FileSystemNode) => void;
  onDelete: (node: FileSystemNode) => void;
  onPermanentlyDelete?: (node: FileSystemNode) => void;
  onRename: (node: FileSystemNode) => void;
  onEdit?: (e: React.MouseEvent) => void;
  onShowMembers?: (e: React.MouseEvent) => void;
  onShowRoles?: (e: React.MouseEvent) => void;
  onRestore?: (node: FileSystemNode) => void;
  onMove?: (node: FileSystemNode) => void;
  onCopy?: (node: FileSystemNode) => void;
  onAddToGallery?: (node: FileSystemNode) => void;
  onUploadExternalReference?: (e: React.MouseEvent) => void;
  onShowVersionHistory?: (node: FileSystemNode) => void;
  isCadFile: () => boolean;
  // 权限检查
  canDownload?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canAddToGallery?: boolean;
  canViewVersionHistory?: boolean;
  canManageTrash?: boolean;
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
  onShowRoles,
  onRestore,
  onMove,
  onCopy,
  onAddToGallery,
  onUploadExternalReference,
  onShowVersionHistory,
  isCadFile,
  canDownload,
  canEdit,
  canDelete,
  canAddToGallery,
  canViewVersionHistory,
}) => {
  const isRoot = node.isRoot;
  const isFolder = node.isFolder;

  const handleMenuAction = (action: () => void) => {
    action();
    onCloseMenu();
  };

  // 操作处理函数映射
  const actionHandlers: Record<ActionType, () => void> = {
    upload_external_reference: () =>
      onUploadExternalReference?.({
        stopPropagation: () => {},
        preventDefault: () => {},
      } as React.MouseEvent),
    download: () => onDownload?.(node),
    view_version_history: () => onShowVersionHistory?.(node),
    add_to_gallery: () => onAddToGallery?.(node),
    rename: () => onRename(node),
    move: () => onMove?.(node),
    copy: () => onCopy?.(node),
    restore: () => onRestore?.(node),
    delete: () => onDelete(node),
    permanently_delete: () => onPermanentlyDelete?.(node),
    edit: () => onEdit?.({ stopPropagation: () => {} } as React.MouseEvent),
    show_members: () =>
      onShowMembers?.({ stopPropagation: () => {} } as React.MouseEvent),
    show_roles: () =>
      onShowRoles?.({ stopPropagation: () => {} } as React.MouseEvent),
  };

  // 获取可用操作列表
  const availableActions = getAvailableActions({
    node,
    isTrash,
    isRoot,
    isCadFile: isCadFile(),
    isFolder,
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
    onDeleteNode: !!onDelete,
  });

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
        } as unknown as React.MouseEvent);
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [showMenu, menuButtonRef, menuContainerRef, onCloseMenu, onToggleMenu]);

  const renderMenu = () => {
    return (
      <>
        {availableActions.map((action, index) => {
          const isLast = index === availableActions.length - 1;
          const isDividerAfter =
            isLast && action.isDestructive && availableActions.length > 1;

          return (
            <React.Fragment key={action.type}>
              <button
                data-tour='menu-show-roles'
                onClick={(e) => {
                  e.stopPropagation();
                  handleMenuAction(() => actionHandlers[action.type]?.());
                }}
                className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                  action.colorClass || 'text-slate-700'
                } ${action.hoverClass || 'hover:bg-slate-50'}`}
              >
                {action.icon}
                {action.label}
              </button>
              {isDividerAfter ? <hr className="my-1 border-slate-100" /> : null}
            </React.Fragment>
          );
        })}
      </>
    );
  };

  // 没有可用操作时不显示菜单按钮
  if (availableActions.length === 0) {
    return null;
  }

  return (
    <>
      <button
        data-tour="file-item-menu-btn"
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
