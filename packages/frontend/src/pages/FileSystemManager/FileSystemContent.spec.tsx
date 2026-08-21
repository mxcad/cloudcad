///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { FileSystemContent } from './FileSystemContent';
import { ProjectPermission } from '@/constants/permissions';
import type { FileSystemNode } from '@/types/filesystem';

// FileListGrid mock：直接调用 renderItem 渲染节点，并为每个节点包一层
// data-node-id（供右键菜单定位节点）
vi.mock('@/components/common/FileListGrid', () => ({
  FileListGrid: ({
    nodes,
    renderItem,
    onContextMenu,
  }: {
    nodes: FileSystemNode[];
    renderItem: (node: FileSystemNode, index: number, context: unknown) => ReactNode;
    onContextMenu?: (e: React.MouseEvent) => void;
  }) => (
    <div onContextMenu={onContextMenu}>
      {nodes.map((node, index) => (
        <div key={node.id} data-node-id={node.id}>
          {renderItem(node, index, {})}
        </div>
      ))}
    </div>
  ),
}));

// FileItem mock：将权限门控结果回显为 data-* 属性，供断言按钮可见性
vi.mock('@/components/FileItem', () => ({
  FileItem: ({
    node,
    canEdit,
    canDelete,
    onEdit,
    onDeleteNode,
    canUpload,
  }: {
    node: FileSystemNode;
    canEdit?: boolean;
    canDelete?: boolean;
    onEdit?: unknown;
    onDeleteNode?: unknown;
    canUpload?: boolean;
  }) => (
    <div
      data-testid={`file-item-${node.id}`}
      data-can-edit={String(!!canEdit)}
      data-can-delete={String(!!canDelete)}
      data-can-upload={String(!!canUpload)}
      data-has-on-edit={String(!!onEdit)}
      data-has-on-delete-node={String(!!onDeleteNode)}
    />
  ),
}));

vi.mock('@/components/common/EmptyContextMenu', () => ({
  EmptyContextMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/Menu', () => ({
  Menu: {
    Item: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Separator: () => null,
  },
}));

function makeNode(overrides: Partial<FileSystemNode> = {}): FileSystemNode {
  return {
    id: 'node-1',
    name: '项目A',
    nodeType: 'PROJECT',
    isFolder: true,
    isRoot: true,
    ...overrides,
  } as FileSystemNode;
}

function renderContent(overrides: {
  nodes?: FileSystemNode[];
  nodePermissions?: Map<string, { canEdit: boolean; canDelete: boolean; canManageMembers: boolean; canManageRoles: boolean }>;
  projectPermissions?: Record<string, boolean>;
  permissionsLoading?: boolean;
  isAtRoot?: boolean;
}) {
  const {
    nodes = [makeNode()],
    nodePermissions = new Map(),
    projectPermissions = {},
    permissionsLoading = false,
    isAtRoot = true,
  } = overrides;

  render(
    <FileSystemContent
      nodes={nodes}
      viewMode="grid"
      isTrashView={false}
      isAtRoot={isAtRoot}
      selectedNodes={new Set()}
      dropTargetId={null}
      nodePermissions={nodePermissions}
      projectPermissions={projectPermissions}
      permissionsLoading={permissionsLoading}
      paginationMeta={null}
      onNodeSelect={vi.fn()}
      onFileOpen={vi.fn()}
      onDownload={vi.fn()}
      onDelete={vi.fn()}
      onPermanentlyDelete={vi.fn()}
      onRename={vi.fn()}
      onRefresh={vi.fn()}
      onEdit={vi.fn()}
      onDeleteNode={vi.fn()}
      onDragStart={vi.fn()}
      onDragOver={vi.fn()}
      onDragLeave={vi.fn()}
      onDrop={vi.fn()}
      onPageChange={vi.fn()}
      onPageSizeChange={vi.fn()}
    />
  );

  const itemId = `file-item-${nodes[0].id}`;

  return {
    item: screen.getByTestId(itemId),
    openContextMenu: () => {
      fireEvent.contextMenu(screen.getByTestId(itemId));
    },
  };
}

describe('FileSystemContent — getNodePermissionProps 加载期悲观门控（defaultPermissions 乐观默认）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('根节点 + 权限加载期（permissionsLoading=true、nodePermissions 空）：编辑/删除按钮不显示', () => {
    const { item, openContextMenu } = renderContent({
      permissionsLoading: true,
      nodePermissions: new Map(),
    });

    expect(item.getAttribute('data-can-edit')).toBe('false');
    expect(item.getAttribute('data-can-delete')).toBe('false');
    expect(item.getAttribute('data-has-on-edit')).toBe('false');
    expect(item.getAttribute('data-has-on-delete-node')).toBe('false');
    expect(item.getAttribute('data-can-upload')).toBe('false');

    // 右键菜单同步悲观：无「编辑」「删除」项
    openContextMenu();
    expect(screen.queryByText('编辑')).not.toBeInTheDocument();
    expect(screen.queryByText('删除')).not.toBeInTheDocument();
  });

  it('根节点 + 加载完成（permissionsLoading=false）：乐观默认保留（与现状一致）', () => {
    const { item, openContextMenu } = renderContent({
      permissionsLoading: false,
      nodePermissions: new Map(),
    });

    expect(item.getAttribute('data-can-edit')).toBe('true');
    expect(item.getAttribute('data-can-delete')).toBe('true');
    expect(item.getAttribute('data-has-on-edit')).toBe('true');
    expect(item.getAttribute('data-has-on-delete-node')).toBe('true');

    openContextMenu();
    expect(screen.getByText('编辑')).toBeInTheDocument();
    expect(screen.getByText('删除')).toBeInTheDocument();
  });

  it('根节点 + 加载完成后按真实权限渲染：nodePermissions 缓存 canEdit=false 时不显示编辑', () => {
    const nodePermissions = new Map([
      [
        'node-1',
        {
          canEdit: false,
          canDelete: true,
          canManageMembers: true,
          canManageRoles: false,
        },
      ],
    ]);
    const { item, openContextMenu } = renderContent({
      permissionsLoading: false,
      nodePermissions,
    });

    expect(item.getAttribute('data-can-edit')).toBe('false');
    expect(item.getAttribute('data-can-delete')).toBe('true');
    expect(item.getAttribute('data-has-on-edit')).toBe('false');
    expect(item.getAttribute('data-has-on-delete-node')).toBe('true');

    openContextMenu();
    expect(screen.queryByText('编辑')).not.toBeInTheDocument();
    expect(screen.getByText('删除')).toBeInTheDocument();
  });

  it('非根节点 + 权限加载期：canEdit/canDelete 恒 false（不进入乐观回退链）', () => {
    const { item } = renderContent({
      nodes: [makeNode({ id: 'file-1', name: 'drawing.dwg', nodeType: 'FILE', isRoot: false, isFolder: false })],
      permissionsLoading: true,
      nodePermissions: new Map(),
    });

    expect(item.getAttribute('data-can-edit')).toBe('false');
    expect(item.getAttribute('data-can-delete')).toBe('false');
  });

  it('非根节点 + 加载完成：按 projectPermissions 真实权限渲染', () => {
    const { item } = renderContent({
      nodes: [makeNode({ id: 'file-1', name: 'drawing.dwg', nodeType: 'FILE', isRoot: false, isFolder: false })],
      permissionsLoading: false,
      projectPermissions: {
        [ProjectPermission.FILE_EDIT]: true,
        [ProjectPermission.FILE_DELETE]: true,
      },
    });

    expect(item.getAttribute('data-can-edit')).toBe('true');
    expect(item.getAttribute('data-can-delete')).toBe('true');
  });
});
