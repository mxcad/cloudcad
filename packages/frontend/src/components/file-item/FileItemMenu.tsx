import React from 'react';
import { MoreIcon } from '../FileIcons';
import { FileSystemNode } from '../../types/filesystem';
import { getAvailableActions, type ActionType } from './fileActionConfig';
import { Tooltip } from '../ui/Tooltip';
import { Menu } from '../ui/Menu';

const variantMap: Record<ActionType, 'default' | 'danger' | 'success' | 'info' | 'warning'> = {
  upload_external_reference: 'warning',
  download: 'default',
  view_version_history: 'info',
  rename: 'default',
  move: 'default',
  copy: 'default',
  restore: 'success',
  delete: 'danger',
  permanently_delete: 'danger',
  edit: 'default',
  show_members: 'default',
  show_roles: 'default',
};

interface FileItemMenuProps {
  node: FileSystemNode;
  isTrash: boolean;
  showMenu: boolean;
  menuButtonRef: React.RefObject<HTMLButtonElement | null>;
  onOpenMenu: () => void;
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
  canDownload?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canViewVersionHistory?: boolean;
  canManageExternalReference?: boolean;
  canManageTrash?: boolean;
}

export const FileItemMenu: React.FC<FileItemMenuProps> = ({
  node,
  isTrash,
  showMenu,
  menuButtonRef,
  onOpenMenu,
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
}) => {
  const isRoot = node.isRoot;
  const isFolder = node.isFolder;

  const handleMenuAction = (action: () => void) => {
    action();
    onCloseMenu();
  };

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

  if (availableActions.length === 0) {
    return null;
  }

  const mainActions = availableActions.filter((a) => !a.isDestructive);
  const destructiveActions = availableActions.filter((a) => a.isDestructive);

  return (
    <>
      <Menu open={showMenu} onOpenChange={(open) => {
        if (open) onOpenMenu();
        else onCloseMenu();
      }} modal={false}>
        <Tooltip content="更多操作" position="top">
          <Menu.Trigger>
            <button
              data-tour="file-item-menu-btn"
              ref={menuButtonRef}
              onClick={(e) => e.stopPropagation()}
              className="w-8 h-8 rounded-full bg-[var(--bg-elevated)] hover:bg-[var(--bg-tertiary)] shadow-sm border border-[var(--border-default)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
            >
              <MoreIcon size={16} />
            </button>
          </Menu.Trigger>
        </Tooltip>

        <Menu.Content align="end" side="bottom" sideOffset={4}>
          {mainActions.map((action) => (
            <Menu.Item
              key={action.type}
              variant={variantMap[action.type]}
              icon={action.icon}
              onClick={() => handleMenuAction(() => actionHandlers[action.type]?.())}
              {...(action.props as Record<string, unknown>)}
            >
              {action.label}
            </Menu.Item>
          ))}

          {destructiveActions.length > 0 && mainActions.length > 0 && <Menu.Separator />}

          {destructiveActions.map((action) => (
            <Menu.Item
              key={action.type}
              variant="danger"
              icon={action.icon}
              onClick={() => handleMenuAction(() => actionHandlers[action.type]?.())}
            >
              {action.label}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu>
    </>
  );
};
