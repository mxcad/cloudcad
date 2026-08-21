import React from 'react';
import { Menu } from '@/components/ui/Menu';
import type {
  ActionCallbacks,
  FileActionContext,
} from '@/components/file-item/fileActionConfig';
import { buildNodeActions } from '@/hooks/file-browser';
import type { FileSystemNode } from '@/types/filesystem';
import type { FileSystemNodePermissionProps } from './hooks/useFileSystemNodePermissionProps';

export interface FileSystemNodeContextMenuProps {
  node: FileSystemNode;
  nodePerms: FileSystemNodePermissionProps;
  isTrashView: boolean;
  isSearchResult: boolean;
  canCreate: boolean;
  canRestoreFile: boolean;
  onFileOpen: (node: FileSystemNode) => void;
  onDownload?: (node: FileSystemNode) => void;
  onDelete?: (node: FileSystemNode) => void;
  onPermanentlyDelete?: (node: FileSystemNode) => void;
  onRename?: (node: FileSystemNode) => void;
  onRestore?: (node: FileSystemNode) => void;
  onMove?: (node: FileSystemNode) => void;
  onCopy?: (node: FileSystemNode) => void;
  onShare?: (node: FileSystemNode) => void;
  onShowVersionHistory?: (node: FileSystemNode) => void;
  onOpenInNewTab?: (node: FileSystemNode) => void;
  onOpenFileLocation?: (node: FileSystemNode) => void;
  onCopyClipboard?: (node: FileSystemNode) => void;
  onCut?: (node: FileSystemNode) => void;
  onFolderDownload?: (node: FileSystemNode) => void;
  onCopyPath?: (node: FileSystemNode) => void;
  onClose: () => void;
}

/**
 * 单节点右键菜单：基于 fileActionConfig 组装可用操作并分发
 */
export const FileSystemNodeContextMenu: React.FC<
  FileSystemNodeContextMenuProps
> = ({
  node,
  nodePerms,
  isTrashView,
  isSearchResult,
  canCreate,
  canRestoreFile,
  onFileOpen,
  onDownload,
  onDelete,
  onPermanentlyDelete,
  onRename,
  onRestore,
  onMove,
  onCopy,
  onShare,
  onShowVersionHistory,
  onOpenInNewTab,
  onOpenFileLocation,
  onCopyClipboard,
  onCut,
  onFolderDownload,
  onCopyPath,
  onClose,
}) => {
  // 动作构建收敛为内核纯函数 buildNodeActions（#283 FileBrowserCore）
  // 统一回调集：事件型回调（edit/成员/角色/操作历史）包装 nodePerms 注入，
  // 节点型回调直接透传 props；onDeleteNode 信号位经 overrides 覆盖
  const callbacks: ActionCallbacks = {
    onOpen: onFileOpen,
    onDownload,
    onRename,
    onMove,
    onCopy,
    onRestore,
    onDelete,
    onPermanentlyDelete,
    onShare,
    onShowVersionHistory,
    onOpenInNewTab,
    onOpenFileLocation,
    onCopyClipboard,
    onCut,
    onFolderDownload,
    onCopyPath,
    onEdit: nodePerms.onEdit,
    onShowMembers: nodePerms.onShowMembers,
    onShowRoles: nodePerms.onShowRoles,
    onShowOperationHistory: nodePerms.onShowOperationHistory,
    onDeleteNode: nodePerms.onDeleteNode,
  };

  const { main, destructive } = buildNodeActions({
    node,
    isTrash: isTrashView,
    isSearchResult,
    permissions: {
      canDownload: nodePerms.canDownload,
      canEdit: nodePerms.canEdit,
      canDelete: nodePerms.canDelete,
      canShare: nodePerms.canShare,
      canViewVersionHistory: nodePerms.canViewVersionHistory,
      canManageExternalReference: nodePerms.canManageExternalReference,
      canMove: nodePerms.canMove,
      canCopy: nodePerms.canCopy,
      canCreate,
      canManageTrash: canRestoreFile,
    },
    callbacks,
    overrides: {
      onDeleteNode: !!nodePerms.onDeleteNode || !!onDelete,
    },
  });

  const runAction = (action: { run: (ctx: FileActionContext) => void }) => {
    onClose();
    action.run({
      node,
      e: new MouseEvent('click') as unknown as React.MouseEvent,
      callbacks,
    });
  };

  return (
    <>
      {main.map((action) => (
        <Menu.Item
          key={action.type}
          variant={action.variant}
          icon={action.icon}
          onClick={() => runAction(action)}
        >
          {action.label}
        </Menu.Item>
      ))}
      {destructive.length > 0 && main.length > 0 && <Menu.Separator />}
      {destructive.map((action) => (
        <Menu.Item
          key={action.type}
          variant="danger"
          icon={action.icon}
          onClick={() => runAction(action)}
        >
          {action.label}
        </Menu.Item>
      ))}
    </>
  );
};
