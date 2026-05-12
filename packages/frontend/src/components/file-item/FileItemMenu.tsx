import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreIcon } from '../FileIcons';
import { FileSystemNode } from '../../types/filesystem';
import { getAvailableActions, type ActionType } from './fileActionConfig';
import { Tooltip } from '../ui/Tooltip';

// 视口边界检测：确保菜单不超出屏幕
const VIEWPORT_PADDING = 8;
const MENU_MIN_WIDTH = 120;
const MENU_OFFSET = 4;

function clampPosition(
  buttonRect: DOMRect,
  menuEl: HTMLDivElement | null
): { top: number; left: number } {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const menuWidth = menuEl ? menuEl.offsetWidth : MENU_MIN_WIDTH;
  const menuHeight = menuEl ? menuEl.offsetHeight : 200;

  // 首选位置：菜单右边缘对齐按钮右边缘，位于按钮下方
  let left = buttonRect.right - menuWidth;
  let top = buttonRect.bottom + MENU_OFFSET;

  // 水平方向翻转：右侧空间不足时翻转到左侧
  if (buttonRect.right - menuWidth < VIEWPORT_PADDING) {
    left = buttonRect.left;
  }
  // 如果左侧也溢出，退化为按钮右边缘对齐
  if (left < VIEWPORT_PADDING) {
    left = Math.min(buttonRect.right, viewportWidth - menuWidth - VIEWPORT_PADDING);
  }

  // 垂直方向翻转：底部空间不足时翻转到上方
  if (buttonRect.bottom + MENU_OFFSET + menuHeight > viewportHeight - VIEWPORT_PADDING) {
    top = buttonRect.top - menuHeight - MENU_OFFSET;
  }
  // 如果上方也溢出，退化为贴底
  if (top < VIEWPORT_PADDING) {
    top = Math.max(VIEWPORT_PADDING, viewportHeight - menuHeight - VIEWPORT_PADDING);
  }

  // 最终边界夹持
  left = Math.max(VIEWPORT_PADDING, Math.min(left, viewportWidth - menuWidth - VIEWPORT_PADDING));
  top = Math.max(VIEWPORT_PADDING, Math.min(top, viewportHeight - menuHeight - VIEWPORT_PADDING));

  return { top, left };
}

interface FileItemMenuProps {
  node: FileSystemNode;
  isTrash: boolean;
  showMenu: boolean;
  menuPosition?: { top: number; left: number } | null;
  menuButtonRef: React.RefObject<HTMLButtonElement | null>;
  menuContainerRef: React.RefObject<HTMLDivElement | null>;
  onToggleMenu: (e: React.MouseEvent) => void;
  onCloseMenu: () => void;
  onDownload?: (node: FileSystemNode) => void;
  onDelete?: (node: FileSystemNode) => void;
  onPermanentlyDelete?: (node: FileSystemNode) => void;
  onRename?: (node: FileSystemNode) => void;
  onEdit?: (e: React.MouseEvent) => void;
  onShowMembers?: (e: React.MouseEvent) => void;
  onShowRoles?: (e: React.MouseEvent) => void;
  onRestore?: (node: FileSystemNode) => void;
  onMove?: (node: FileSystemNode) => void;
  onCopy?: (node: FileSystemNode) => void;
  onUploadExternalReference?: (e: React.MouseEvent) => void;
  onShowVersionHistory?: (node: FileSystemNode) => void;
  isCadFile: () => boolean;
  // 权限检查
  canDownload?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canViewVersionHistory?: boolean;
  canManageExternalReference?: boolean;
  canManageTrash?: boolean;
  // 图库模式
  galleryMode?: boolean;
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
  onUploadExternalReference,
  onShowVersionHistory,
  isCadFile,
  canDownload,
  canEdit,
  canDelete,
  canViewVersionHistory,
  canManageExternalReference,
  galleryMode,
}) => {
  const isRoot = node.isRoot;
  const isFolder = node.isFolder;

  // 内部视口感知定位 state
  const [adjustedPosition, setAdjustedPosition] = useState<{ top: number; left: number } | null>(null);

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
    rename: () => onRename?.(node),
    move: () => onMove?.(node),
    copy: () => onCopy?.(node),
    restore: () => onRestore?.(node),
    delete: () => onDelete?.(node),
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
    onDeleteNode: isRoot ? canDelete !== false : !!onDelete,
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

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu, menuButtonRef, menuContainerRef, onCloseMenu]);

  // 菜单打开时计算视口感知位置
  useEffect(() => {
    if (showMenu && menuButtonRef.current) {
      requestAnimationFrame(() => {
        if (menuButtonRef.current) {
          const rect = menuButtonRef.current.getBoundingClientRect();
          const pos = clampPosition(rect, menuContainerRef.current);
          setAdjustedPosition(pos);
        }
      });
    } else {
      setAdjustedPosition(null);
    }
  }, [showMenu]);

  // 滚动时更新菜单位置
  useEffect(() => {
    if (!showMenu) return;
    const handleScroll = () => {
      if (menuButtonRef.current) {
        const rect = menuButtonRef.current.getBoundingClientRect();
        const pos = clampPosition(rect, menuContainerRef.current);
        setAdjustedPosition(pos);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', handleScroll, { capture: true });
  }, [showMenu]);

  const renderMenu = () => {
    return (
      <>
        {availableActions.map((action, index) => {
          const isLast = index === availableActions.length - 1;
          const isDividerAfter =
            isLast && action.isDestructive && availableActions.length > 1;

          // 根据操作类型确定颜色
          const getColorStyle = () => {
            if (
              action.type === 'delete' ||
              action.type === 'permanently_delete'
            ) {
              return 'text-[var(--error)] hover:bg-[rgba(239,68,68,0.1)]';
            }
            if (action.type === 'restore') {
              return 'text-[var(--success)] hover:bg-[rgba(34,197,94,0.1)]';
            }
            if (action.type === 'view_version_history') {
              return 'text-[var(--info)] hover:bg-[rgba(59,130,246,0.1)]';
            }
            if (action.type === 'upload_external_reference') {
              return 'text-[var(--warning)] hover:bg-[rgba(245,158,11,0.1)]';
            }
            return 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]';
          };

          return (
            <React.Fragment key={action.type}>
              <button
                {...action.props}
                onClick={(e) => {
                  e.stopPropagation();
                  handleMenuAction(() => actionHandlers[action.type]?.());
                }}
                className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors ${getColorStyle()}`}
              >
                {action.icon}
                {action.label}
              </button>
              {isDividerAfter ? (
                <hr className="my-1 border-[var(--border-subtle)]" />
              ) : null}
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
      <Tooltip content="更多操作" position="top">
        <button
          data-tour="file-item-menu-btn"
          ref={menuButtonRef}
          onClick={onToggleMenu}
          className="w-8 h-8 rounded-full bg-[var(--bg-elevated)] hover:bg-[var(--bg-tertiary)] shadow-sm border border-[var(--border-default)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        >
          <MoreIcon size={16} />
        </button>
      </Tooltip>

      {showMenu &&
        adjustedPosition &&
        createPortal(
          <div
            ref={menuContainerRef}
            className="fixed bg-[var(--bg-elevated)] rounded-lg shadow-xl border border-[var(--border-default)] py-1 min-w-[120px] z-[99999] animate-scale-in origin-top-right pointer-events-auto"
            style={{
              top: `${adjustedPosition.top}px`,
              left: `${adjustedPosition.left}px`,
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
