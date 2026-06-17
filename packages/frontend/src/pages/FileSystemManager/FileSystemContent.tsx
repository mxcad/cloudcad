import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Menu } from '@/components/ui/Menu';
import { FileItem } from '@/components/FileItem';
import { FileListGrid } from '@/components/common/FileListGrid';
import { EmptyContextMenu } from '@/components/common/EmptyContextMenu';
import { getFileItemPermissionProps } from '@/hooks/useFileItemProps';
import { getAvailableActions, getActionGroups, ACTION_VARIANT_MAP, type ActionType } from '@/components/file-item/fileActionConfig';
import type { FileSystemNode } from '@/types/filesystem';

interface FileSystemContentProps {
  nodes: FileSystemNode[];
  viewMode: 'grid' | 'list';
  isTrashView: boolean;
  isAtRoot: boolean;
  selectedNodes: Set<string>;
  dropTargetId: string | null;
  nodePermissions: Map<string, { canEdit: boolean; canDelete: boolean; canManageMembers: boolean; canManageRoles: boolean }>;
  projectPermissions: Record<string, boolean>;
  paginationMeta: { total: number; page: number; limit: number; totalPages: number } | null;
  onNodeSelect: (nodeId: string, ctrlKey?: boolean) => void;
  onFileOpen: (node: FileSystemNode) => void;
  onDownload: (node: FileSystemNode) => void;
  onDelete: (node: FileSystemNode) => void;
  onPermanentlyDelete: (node: FileSystemNode) => void;
  onRename: (node: FileSystemNode) => void;
  onRefresh: () => void;
  onRestore: ((node: FileSystemNode) => void) | undefined;
  onEdit: ((node: FileSystemNode) => void) | undefined;
  onDeleteNode: ((node: FileSystemNode) => void) | undefined;
  onShowMembers: ((node: FileSystemNode) => void) | undefined;
  onShowRoles: ((node: FileSystemNode) => void) | undefined;
  onMove: ((node: FileSystemNode) => void) | undefined;
  onCopy: ((node: FileSystemNode) => void) | undefined;
  onShowVersionHistory: ((node: FileSystemNode) => void) | undefined;
  onShare: ((node: FileSystemNode) => void) | undefined;
  onDragStart: (e: React.DragEvent, node: FileSystemNode) => void;
  onDragOver: (e: React.DragEvent, node: FileSystemNode) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, node: FileSystemNode) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onDeleteProject?: (nodeId: string, nodeName: string) => void;
  onPermanentlyDeleteProject?: (nodeId: string, nodeName: string) => void;
  fileDropHandlers?: {
    onDragEnter: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  isFileDragOver?: boolean;
  onRubberBandSelect?: (nodeIds: string[]) => void;
  onBatchDelete?: () => void;
  onBatchMove?: () => void;
  onBatchCopy?: () => void;
  onBatchRestore?: () => void;
  isSearchResult?: boolean;
  currentAncestorPath?: string;
  onOpen?: (node: FileSystemNode) => void;
  onOpenInNewTab?: (node: FileSystemNode) => void;
  onOpenFileLocation?: (node: FileSystemNode) => void;
  onNewFolder?: (node: FileSystemNode) => void;
  onCopyClipboard?: (node: FileSystemNode) => void;
  onCut?: (node: FileSystemNode) => void;
  onDownloadFolder?: (node: FileSystemNode) => void;
  onCopyPath?: (node: FileSystemNode) => void;
  loading?: boolean;
  currentPage?: number;
  totalPages?: number;
  onScrollPageChange?: (page: number, direction: 'prev' | 'next') => void;
  highlightNodeId?: string;
  onCreateFolderInCurrentDir?: () => void;
  onCreateDrawingInCurrentDir?: () => void;
  onUpload?: () => void;
  onPasteInCurrentDir?: () => void;
  clipboardHasItems?: boolean;
  onCreateProject?: () => void;
  onClearTrash?: (projectId?: string) => void;
}

export const FileSystemContent: React.FC<FileSystemContentProps> = ({
  nodes,
  viewMode,
  isTrashView,
  isAtRoot,
  selectedNodes,
  dropTargetId,
  nodePermissions,
  projectPermissions,
  paginationMeta,
  onNodeSelect,
  onFileOpen,
  onDownload,
  onDelete,
  onPermanentlyDelete,
  onRename,
  onRefresh,
  onRestore,
  onEdit,
  onDeleteNode,
  onShowMembers,
  onShowRoles,
  onMove,
  onCopy,
  onShowVersionHistory,
  onShare,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onPageChange,
  onPageSizeChange,
  onDeleteProject,
  onPermanentlyDeleteProject,
  fileDropHandlers: _fileDropHandlers,
  isFileDragOver: _isFileDragOver,
  onRubberBandSelect,
  onBatchDelete,
  onBatchMove,
  onBatchCopy,
  onBatchRestore,
  loading = false,
  currentPage: _currentPage,
  totalPages: _totalPages,
  onScrollPageChange,
  highlightNodeId,
  isSearchResult = false,
  currentAncestorPath,
  onOpen,
  onOpenInNewTab,
  onOpenFileLocation,
  onNewFolder,
  onCopyClipboard,
  onCut,
  onDownloadFolder,
  onCopyPath,
  onCreateFolderInCurrentDir,
  onCreateDrawingInCurrentDir,
  onUpload,
  onPasteInCurrentDir,
  clipboardHasItems = false,
  onCreateProject,
  onClearTrash,
}) => {
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuNode, setContextMenuNode] = useState<FileSystemNode | null>(null);
  const highlightHandledRef = useRef(false);

  useEffect(() => {
    if (!highlightNodeId) {
      highlightHandledRef.current = false;
      return;
    }
    if (highlightHandledRef.current) return;
    highlightHandledRef.current = true;

    let cancelled = false;
    let retryCount = 0;
    const maxRetries = 30;

    const tryScroll = () => {
      if (cancelled) return;
      const el = document.querySelector(`[data-node-id="${highlightNodeId}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.classList.add('file-item-highlight');
        setTimeout(() => {
          el.classList.remove('file-item-highlight');
        }, 3500);
      } else if (retryCount < maxRetries) {
        retryCount++;
        setTimeout(tryScroll, 100);
      }
    };

    const timer = setTimeout(tryScroll, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [highlightNodeId]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[role="menu"]') || target.closest('[data-menu-content]')) return;
    e.preventDefault();

    const fileItem = target.closest('[data-node-id]');
    if (fileItem) {
      const nodeId = fileItem.getAttribute('data-node-id');
      if (!nodeId) return;
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      if (!selectedNodes.has(nodeId) && onNodeSelect) {
        onNodeSelect(nodeId, false);
      }
      setContextMenuNode(node);
    } else {
      setContextMenuNode(null);
    }
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  }, [isTrashView, nodes, selectedNodes, onNodeSelect]);

  const closeContextMenu = useCallback(() => {
    setContextMenuPos(null);
    setContextMenuNode(null);
  }, []);

  const getNodePermissionProps = (node: FileSystemNode) => {
    const cachedPermissions = nodePermissions.get(node.id);
    const defaultPermissions = {
      canEdit: true,
      canDelete: true,
      canManageMembers: true,
      canManageRoles: true,
    };

    const permissions = node.isRoot
      ? cachedPermissions || defaultPermissions
      : cachedPermissions || {
          canEdit: true,
          canDelete: true,
          canManageMembers: false,
          canManageRoles: false,
        };

    const fileItemProps = getFileItemPermissionProps(node, {
      projectPermissions,
      nodePermissions: permissions,
    });

    if (Object.keys(projectPermissions).length === 0) {
      fileItemProps.canShare = false;
    }

    let onEditHandler: ((e: React.MouseEvent) => void) | undefined;
    let onDeleteHandler: ((e: React.MouseEvent) => void) | undefined;
    let onShowMembersHandler: ((e: React.MouseEvent) => void) | undefined;
    let onShowRolesHandler: ((e: React.MouseEvent) => void) | undefined;

    if (node.isRoot && permissions.canEdit && onEdit) {
      onEditHandler = () => onEdit(node);
    }
    if (node.isRoot && permissions.canDelete) {
      onDeleteHandler = () => {
        if (isTrashView && onPermanentlyDeleteProject) {
          onPermanentlyDeleteProject(node.id, node.name);
        } else if (onDeleteProject) {
          onDeleteProject(node.id, node.name);
        }
      };
    }
    if (node.isRoot && onShowMembers) {
      onShowMembersHandler = () => onShowMembers(node);
    }
    if (node.isRoot && permissions.canManageRoles && onShowRoles) {
      onShowRolesHandler = () => onShowRoles(node);
    }

    return {
      ...fileItemProps,
      onEdit: onEditHandler,
      onDeleteNode: onDeleteHandler,
      onShowMembers: onShowMembersHandler,
      onShowRoles: onShowRolesHandler,
    };
  };

  return (
    <>
      <FileListGrid
        nodes={nodes}
        viewMode={viewMode}
        selectedNodes={selectedNodes}
        loading={loading}
        paginationMeta={paginationMeta}
        onNodeSelect={onNodeSelect}
        onRubberBandSelect={onRubberBandSelect}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        onScrollPageChange={onScrollPageChange}
        onContextMenu={handleContextMenu}
        renderItem={(node, _index, { isRubberBanding, rubberBandJustEndedRef }) => {
          const extraProps = getNodePermissionProps(node);
          const isRootLevel = isAtRoot;

          return (
            <FileItem
              node={node}
              isSelected={selectedNodes.has(node.id)}
              viewMode={viewMode}
              hideSelectionCircle={false}
              isRubberBanding={isRubberBanding}
              rubberBandJustEndedRef={rubberBandJustEndedRef}
              selectedCount={selectedNodes.size}
              onBatchDelete={isRootLevel ? undefined : onBatchDelete}
              onBatchMove={isRootLevel ? undefined : onBatchMove}
              onBatchCopy={isRootLevel ? undefined : onBatchCopy}
              onBatchRestore={onBatchRestore}
              isTrash={isTrashView}
              onSelect={onNodeSelect}
              onEnter={onFileOpen}
              onDownload={onDownload}
              onDelete={onDelete}
              onPermanentlyDelete={onPermanentlyDelete}
              onRename={onRename}
              onRefresh={onRefresh}
              onRestore={isTrashView ? onRestore : undefined}
              onEdit={extraProps.onEdit}
              onDeleteNode={extraProps.onDeleteNode}
              onShowMembers={extraProps.onShowMembers}
              onShowRoles={extraProps.onShowRoles}
              onMove={!node.isRoot && projectPermissions['FILE_MOVE' as keyof typeof projectPermissions] ? onMove : undefined}
              onCopy={!node.isRoot && projectPermissions['FILE_COPY' as keyof typeof projectPermissions] ? onCopy : undefined}
              onShowVersionHistory={!node.isFolder && !isTrashView && (node.extension === '.dwg' || node.extension === '.dxf') ? onShowVersionHistory : undefined}
              onShare={!node.isFolder && onShare ? onShare : undefined}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              isDropTarget={isRootLevel ? false : dropTargetId === node.id}
              canUpload={extraProps.canUpload}
              canEdit={extraProps.canEdit}
              canDelete={extraProps.canDelete}
              canShare={extraProps.canShare}
              canDownload={extraProps.canDownload}
              canViewVersionHistory={extraProps.canViewVersionHistory}
              canManageExternalReference={extraProps.canManageExternalReference}
               isSearchResult={isSearchResult}
               isProjectRootLevel={isAtRoot}
               currentAncestorPath={currentAncestorPath}
               onOpen={onOpen}
              onOpenInNewTab={onOpenInNewTab}
              onOpenFileLocation={onOpenFileLocation}
              onNewFolder={onNewFolder}
              onCopyClipboard={onCopyClipboard}
              onCut={onCut}
              onDownloadFolder={onDownloadFolder}
               onCopyPath={onCopyPath}
            />
          );
        }}
      />
      <EmptyContextMenu pos={contextMenuPos} onClose={closeContextMenu}>
        {contextMenuNode ? (
          selectedNodes.size > 1 && selectedNodes.has(contextMenuNode.id) ? (
            <>
              {onBatchDelete && (
                <Menu.Item variant="danger" onClick={() => { onBatchDelete(); closeContextMenu(); }}>
                  删除 {selectedNodes.size} 个选中项
                </Menu.Item>
              )}
              {!isAtRoot && !isTrashView && onBatchMove && (
                <Menu.Item onClick={() => { onBatchMove(); closeContextMenu(); }}>
                  剪切
                </Menu.Item>
              )}
              {!isAtRoot && !isTrashView && onBatchCopy && (
                <Menu.Item onClick={() => { onBatchCopy(); closeContextMenu(); }}>
                  复制
                </Menu.Item>
              )}
              {onBatchRestore && (
                <Menu.Item variant="success" onClick={() => { onBatchRestore(); closeContextMenu(); }}>
                  恢复 {selectedNodes.size} 个选中项
                </Menu.Item>
              )}
            </>
          ) : (() => {
            const node = contextMenuNode;
            const nodePerms = getNodePermissionProps(node);
            const actionProps = {
              node,
              isTrash: isTrashView,
              isRoot: node.isRoot,
              isCadFile: !node.isFolder && !node.isRoot && ['.dwg', '.dxf', '.mxweb'].includes(node.extension?.toLowerCase() || ''),
              isFolder: node.isFolder,
              hasMissingExternalReferences: node.hasMissingExternalReferences || false,
              canDownload: nodePerms.canDownload,
              canEdit: nodePerms.canEdit,
              canDelete: nodePerms.canDelete,
              canShare: nodePerms.canShare,
              canViewVersionHistory: nodePerms.canViewVersionHistory,
              canManageExternalReference: nodePerms.canManageExternalReference,
              canManageTrash: !!onRestore || !!onPermanentlyDelete,
              onDownload: !!onDownload,
              onShowVersionHistory: !!onShowVersionHistory,
              onEdit: !!nodePerms.onEdit,
              onShowMembers: !!nodePerms.onShowMembers,
              onShowRoles: !!nodePerms.onShowRoles,
              onShare: !!onShare,
              onMove: !node.isRoot && !!onMove,
              onCopy: !node.isRoot && !!onCopy,
              onRestore: !!onRestore,
              onPermanentlyDelete: !!onPermanentlyDelete,
              onDeleteNode: node.isRoot ? !!nodePerms.onDeleteNode : (!!nodePerms.onDeleteNode || !!onDelete),
              isSearchResult: !!isSearchResult,
              onOpen: !!onFileOpen,
              onOpenInNewTab: !!onOpenInNewTab,
              onOpenFileLocation: !!onOpenFileLocation,
              onNewFolder: !!onNewFolder,
              onCopyClipboard: !!onCopyClipboard,
              onCut: !!onCut,
              onDownloadFolder: !!onDownloadFolder,
               onCopyPath: !!onCopyPath,
             };
             const availableActions = getAvailableActions(actionProps);
            const { main, secondary, destructive } = getActionGroups(availableActions);
            return (
              <>
                {main.map((action) => (
                  <Menu.Item
                    key={action.type}
                    variant={ACTION_VARIANT_MAP[action.type] || 'default'}
                    icon={action.icon}
                    onClick={() => {
                      const type = action.type;
                      closeContextMenu();
                      switch (type) {
                        case 'open': onFileOpen(node); break;
                        case 'download': onDownload?.(node); break;
                        case 'rename': onRename?.(node); break;
                        case 'delete': onDelete?.(node); break;
                        case 'permanently_delete': onPermanentlyDelete?.(node); break;
                        case 'restore': onRestore?.(node); break;
                        case 'move': onMove?.(node); break;
                        case 'copy': onCopy?.(node); break;
                        case 'share': onShare?.(node); break;
                        case 'view_version_history': onShowVersionHistory?.(node); break;
                        case 'edit': nodePerms.onEdit?.(new MouseEvent('click') as unknown as React.MouseEvent); break;
                        case 'show_members': nodePerms.onShowMembers?.(new MouseEvent('click') as unknown as React.MouseEvent); break;
                        case 'show_roles': nodePerms.onShowRoles?.(new MouseEvent('click') as unknown as React.MouseEvent); break;
                        case 'open_in_new_tab': onOpenInNewTab?.(node); break;
                        case 'open_file_location': onOpenFileLocation?.(node); break;
                        case 'new_folder': onNewFolder?.(node); break;
                        case 'copy_clipboard': onCopyClipboard?.(node); break;
                        case 'cut': onCut?.(node); break;
                        case 'download_folder': onDownloadFolder?.(node); break;
                        case 'copy_path': onCopyPath?.(node); break;
                        default: break;
                      }
                    }}
                  >
                    {action.label}
                  </Menu.Item>
                ))}
                {secondary.length > 0 && (
                  <Menu.Submenu label="其他操作" icon={secondary[0]?.icon}>
                    {secondary.map((action) => (
                      <Menu.Item
                        key={action.type}
                        variant={ACTION_VARIANT_MAP[action.type] || 'default'}
                        icon={action.icon}
                        onClick={() => {
                          const type = action.type;
                          closeContextMenu();
                          switch (type) {
                            case 'open': onFileOpen(node); break;
                            case 'download': onDownload?.(node); break;
                            case 'rename': onRename?.(node); break;
                            case 'delete': onDelete?.(node); break;
                            case 'permanently_delete': onPermanentlyDelete?.(node); break;
                            case 'restore': onRestore?.(node); break;
                            case 'move': onMove?.(node); break;
                            case 'copy': onCopy?.(node); break;
                            case 'share': onShare?.(node); break;
                            case 'view_version_history': onShowVersionHistory?.(node); break;
                            case 'edit': nodePerms.onEdit?.(new MouseEvent('click') as unknown as React.MouseEvent); break;
                            case 'show_members': nodePerms.onShowMembers?.(new MouseEvent('click') as unknown as React.MouseEvent); break;
                            case 'show_roles': nodePerms.onShowRoles?.(new MouseEvent('click') as unknown as React.MouseEvent); break;
                            case 'open_in_new_tab': onOpenInNewTab?.(node); break;
                            case 'open_file_location': onOpenFileLocation?.(node); break;
                            case 'new_folder': onNewFolder?.(node); break;
                            case 'copy_clipboard': onCopyClipboard?.(node); break;
                            case 'cut': onCut?.(node); break;
                            case 'download_folder': onDownloadFolder?.(node); break;
                            case 'copy_path': onCopyPath?.(node); break;
                            default: break;
                          }
                        }}
                      >
                        {action.label}
                      </Menu.Item>
                    ))}
                  </Menu.Submenu>
                )}
                {(destructive.length > 0) && (main.length > 0 || secondary.length > 0) && <Menu.Separator />}
                {destructive.map((action) => (
                  <Menu.Item
                    key={action.type}
                    variant="danger"
                    icon={action.icon}
                    onClick={() => {
                      const type = action.type;
                      closeContextMenu();
                      if (type === 'permanently_delete') {
                        onPermanentlyDelete?.(node);
                      } else {
                        onDelete?.(node);
                      }
                    }}
                  >
                    {action.label}
                  </Menu.Item>
                ))}
              </>
            );
          })()
        ) : isTrashView ? (
          <>
            {nodes.length > 0 && onClearTrash && (
              <Menu.Item
                variant="danger"
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>}
                onClick={() => { onClearTrash(); closeContextMenu(); }}
              >
                清空回收站
              </Menu.Item>
            )}
            <Menu.Separator />
            <Menu.Item
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>}
              onClick={() => { onRefresh(); closeContextMenu(); }}
            >
              刷新
            </Menu.Item>
          </>
        ) : isAtRoot ? (
          <>
            {selectedNodes.size > 0 && onBatchDelete && (
              <Menu.Item
                variant="danger"
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>}
                onClick={() => { onBatchDelete(); closeContextMenu(); }}
              >
                删除
              </Menu.Item>
            )}
            {onCreateProject && (
              <Menu.Item
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>}
                onClick={() => { onCreateProject(); closeContextMenu(); }}
              >
                新建项目
              </Menu.Item>
            )}
            <Menu.Separator />
            <Menu.Item
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>}
              onClick={() => { onRefresh(); closeContextMenu(); }}
            >
              刷新
            </Menu.Item>
          </>
        ) : (
          <>
            {selectedNodes.size > 0 && (
              <>
                {onBatchCopy && (
                  <Menu.Item
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>}
                    onClick={() => { onBatchCopy(); closeContextMenu(); }}
                  >
                    复制
                  </Menu.Item>
                )}
                {onBatchMove && (
                  <Menu.Item
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 15 21 15 21 19 17 19" /><line x1="3" y1="11" x2="21" y2="11" /><polyline points="7 7 3 11 7 15" /></svg>}
                    onClick={() => { onBatchMove(); closeContextMenu(); }}
                  >
                    剪切
                  </Menu.Item>
                )}
                {onBatchDelete && (
                  <Menu.Item
                    variant="danger"
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>}
                    onClick={() => { onBatchDelete(); closeContextMenu(); }}
                  >
                    删除
                  </Menu.Item>
                )}
                <Menu.Separator />
              </>
            )}
            {!isAtRoot && onCreateDrawingInCurrentDir && (
              <Menu.Item
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg>}
                onClick={() => { onCreateDrawingInCurrentDir?.(); closeContextMenu(); }}
              >
                新建图纸
              </Menu.Item>
            )}
            <Menu.Item
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v1" /><line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" /></svg>}
              onClick={() => { onCreateFolderInCurrentDir?.(); closeContextMenu(); }}
            >
              新建文件夹
            </Menu.Item>
            {!isAtRoot && onUpload && (
              <Menu.Item
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>}
                onClick={() => { onUpload?.(); closeContextMenu(); }}
              >
                上传
              </Menu.Item>
            )}
            {clipboardHasItems && (
              <Menu.Item
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>}
                onClick={() => { onPasteInCurrentDir?.(); closeContextMenu(); }}
              >
                粘贴
              </Menu.Item>
            )}
            <Menu.Separator />
            <Menu.Item
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>}
              onClick={() => { onRefresh(); closeContextMenu(); }}
            >
              刷新
            </Menu.Item>
          </>
        )}
      </EmptyContextMenu>
    </>
  );
};
