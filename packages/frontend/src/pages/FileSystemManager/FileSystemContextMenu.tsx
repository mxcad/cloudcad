import React from 'react';
import { Menu } from '@/components/ui/Menu';
import { EmptyContextMenu } from '@/components/common/EmptyContextMenu';
import { t } from '@/languages';
import {
  Trash2,
  RefreshCw,
  FolderPlus,
  Copy,
  Scissors,
  FilePlus,
  Clipboard,
} from 'lucide-react';
import type { FileSystemNode } from '@/types/filesystem';
import { FileSystemNodeContextMenu } from './FileSystemNodeContextMenu';
import type { FileSystemNodePermissionProps } from './hooks/useFileSystemNodePermissionProps';

export interface FileSystemContextMenuProps {
  contextMenuPos: { x: number; y: number } | null;
  contextMenuNode: FileSystemNode | null;
  selectedNodes: Set<string>;
  isTrashView: boolean;
  isAtRoot: boolean;
  nodes: FileSystemNode[];
  canBatchDelete: boolean;
  canBatchMove: boolean;
  canBatchCopy: boolean;
  canCreate: boolean;
  canRestoreFile: boolean;
  canPaste: boolean;
  clipboardHasItems: boolean;
  isSearchResult?: boolean;
  getNodePermissionProps: (
    node: FileSystemNode
  ) => FileSystemNodePermissionProps;
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
  onBatchDelete?: () => void;
  onBatchMove?: () => void;
  onBatchCopy?: () => void;
  onBatchRestore?: () => void;
  onClearTrash?: () => void;
  onRefresh: () => void;
  onCreateProject?: () => void;
  onCreateDrawingInCurrentDir?: () => void;
  onCreateFolderInCurrentDir?: () => void;
  onPasteInCurrentDir?: () => void;
  onClose: () => void;
}

/**
 * FileSystemContent 右键菜单容器：批量菜单 / 单节点菜单 / 空区域菜单
 */
export const FileSystemContextMenu: React.FC<FileSystemContextMenuProps> = ({
  contextMenuPos,
  contextMenuNode,
  selectedNodes,
  isTrashView,
  isAtRoot,
  nodes,
  canBatchDelete,
  canBatchMove,
  canBatchCopy,
  canCreate,
  canRestoreFile,
  canPaste,
  clipboardHasItems,
  isSearchResult,
  getNodePermissionProps,
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
  onBatchDelete,
  onBatchMove,
  onBatchCopy,
  onBatchRestore,
  onClearTrash,
  onRefresh,
  onCreateProject,
  onCreateDrawingInCurrentDir,
  onCreateFolderInCurrentDir,
  onPasteInCurrentDir,
  onClose,
}) => {
  return (
    <EmptyContextMenu pos={contextMenuPos} onClose={onClose}>
      {contextMenuNode ? (
        selectedNodes.size > 1 && selectedNodes.has(contextMenuNode.id) ? (
          <>
            {onBatchDelete && canBatchDelete && (
              <Menu.Item
                variant="danger"
                onClick={() => {
                  onBatchDelete();
                  onClose();
                }}
              >
                {t('删除 {count} 个选中项', { count: selectedNodes.size })}
              </Menu.Item>
            )}
            {!isAtRoot && !isTrashView && onBatchMove && canBatchMove && (
              <Menu.Item
                onClick={() => {
                  onBatchMove();
                  onClose();
                }}
              >
                {t('剪切')}
              </Menu.Item>
            )}
            {!isAtRoot && !isTrashView && onBatchCopy && canBatchCopy && (
              <Menu.Item
                onClick={() => {
                  onBatchCopy();
                  onClose();
                }}
              >
                {t('复制')}
              </Menu.Item>
            )}
            {onBatchRestore && canRestoreFile && (
              <Menu.Item
                variant="success"
                onClick={() => {
                  onBatchRestore();
                  onClose();
                }}
              >
                {t('恢复 {count} 个选中项', { count: selectedNodes.size })}
              </Menu.Item>
            )}
          </>
        ) : (
          <FileSystemNodeContextMenu
            node={contextMenuNode}
            nodePerms={getNodePermissionProps(contextMenuNode)}
            isTrashView={isTrashView}
            isSearchResult={isSearchResult ?? false}
            canCreate={canCreate}
            canRestoreFile={canRestoreFile}
            onFileOpen={onFileOpen}
            onDownload={onDownload}
            onDelete={onDelete}
            onPermanentlyDelete={onPermanentlyDelete}
            onRename={onRename}
            onRestore={onRestore}
            onMove={onMove}
            onCopy={onCopy}
            onShare={onShare}
            onShowVersionHistory={onShowVersionHistory}
            onOpenInNewTab={onOpenInNewTab}
            onOpenFileLocation={onOpenFileLocation}
            onCopyClipboard={onCopyClipboard}
            onCut={onCut}
            onFolderDownload={onFolderDownload}
            onCopyPath={onCopyPath}
            onClose={onClose}
          />
        )
      ) : isTrashView ? (
        <>
          {nodes.length > 0 && onClearTrash && canRestoreFile && (
            <Menu.Item
              variant="danger"
              icon={<Trash2 size={14} />}
              onClick={() => {
                onClearTrash();
                onClose();
              }}
            >
              {t('清空回收站')}
            </Menu.Item>
          )}
          <Menu.Separator />
          <Menu.Item
            icon={<RefreshCw size={14} />}
            onClick={() => {
              onRefresh();
              onClose();
            }}
          >
            {t('刷新')}
          </Menu.Item>
        </>
      ) : isAtRoot ? (
        <>
          {selectedNodes.size > 0 && onBatchDelete && canBatchDelete && (
            <Menu.Item
              variant="danger"
              icon={<Trash2 size={14} />}
              onClick={() => {
                onBatchDelete();
                onClose();
              }}
            >
              {t('删除')}
            </Menu.Item>
          )}
          {onCreateProject && (
            <Menu.Item
              icon={<FolderPlus size={14} />}
              onClick={() => {
                onCreateProject();
                onClose();
              }}
            >
              {t('新建项目')}
            </Menu.Item>
          )}
          <Menu.Separator />
          <Menu.Item
            icon={<RefreshCw size={14} />}
            onClick={() => {
              onRefresh();
              onClose();
            }}
          >
            {t('刷新')}
          </Menu.Item>
        </>
      ) : (
        <>
          {selectedNodes.size > 0 && (
            <>
              {onBatchCopy && canBatchCopy && (
                <Menu.Item
                  icon={<Copy size={14} />}
                  onClick={() => {
                    onBatchCopy();
                    onClose();
                  }}
                >
                  {t('复制')}
                </Menu.Item>
              )}
              {onBatchMove && canBatchMove && (
                <Menu.Item
                  icon={<Scissors size={14} />}
                  onClick={() => {
                    onBatchMove();
                    onClose();
                  }}
                >
                  {t('剪切')}
                </Menu.Item>
              )}
              {onBatchDelete && canBatchDelete && (
                <Menu.Item
                  variant="danger"
                  icon={<Trash2 size={14} />}
                  onClick={() => {
                    onBatchDelete();
                    onClose();
                  }}
                >
                  {t('删除')}
                </Menu.Item>
              )}
              <Menu.Separator />
            </>
          )}
          {!isAtRoot && onCreateDrawingInCurrentDir && canCreate && (
            <Menu.Item
              icon={<FilePlus size={14} />}
              onClick={() => {
                onCreateDrawingInCurrentDir?.();
                onClose();
              }}
            >
              {t('新建图纸')}
            </Menu.Item>
          )}
          {canCreate && (
            <Menu.Item
              icon={<FolderPlus size={14} />}
              onClick={() => {
                onCreateFolderInCurrentDir?.();
                onClose();
              }}
            >
              {t('新建文件夹')}
            </Menu.Item>
          )}

          {clipboardHasItems && canPaste && (
            <Menu.Item
              icon={<Clipboard size={14} />}
              onClick={() => {
                onPasteInCurrentDir?.();
                onClose();
              }}
            >
              {t('粘贴')}
            </Menu.Item>
          )}
          <Menu.Separator />
          <Menu.Item
            icon={<RefreshCw size={14} />}
            onClick={() => {
              onRefresh();
              onClose();
            }}
          >
            {t('刷新')}
          </Menu.Item>
        </>
      )}
    </EmptyContextMenu>
  );
};
