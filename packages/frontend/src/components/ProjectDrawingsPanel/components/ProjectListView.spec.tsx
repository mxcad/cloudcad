///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectListView } from './ProjectListView';
import type { FileSystemNode } from '@/types/filesystem';

// 捕获 FileItem 收到的 props，验证项目级动作接线（成员/角色/操作历史）
const capturedFileItemProps: Record<string, unknown>[] = [];
vi.mock('@/components/FileItem', () => ({
  FileItem: (props: Record<string, unknown>) => {
    capturedFileItemProps.push(props);
    return <div data-testid="mock-file-item">{String(props.node?.name)}</div>;
  },
}));
vi.mock('@/languages', () => ({ t: (m: string) => m }));

const projectNode: FileSystemNode = {
  id: 'proj-1',
  name: '项目A',
  nodeType: 'PROJECT',
  isFolder: true,
  isRoot: true,
} as FileSystemNode;

function renderList(overrides: {
  onShowOperationHistory?: (project: FileSystemNode) => void;
  canManageMembers?: boolean;
  canManageRoles?: boolean;
} = {}) {
  const onShowMembers = vi.fn();
  const onShowRoles = vi.fn();
  const nodePermissions = new Map([
    [
      'proj-1',
      {
        canEdit: true,
        canDelete: true,
        canManageMembers: overrides.canManageMembers ?? false,
        canManageRoles: overrides.canManageRoles ?? false,
      },
    ],
  ]);
  render(
    <ProjectListView
      projects={[projectNode]}
      searchQuery=""
      projectFilter="all"
      onProjectFilterChange={() => {}}
      nodePermissions={nodePermissions}
      onEnterProject={() => {}}
      onEditProject={() => {}}
      onShowMembers={onShowMembers}
      onShowRoles={onShowRoles}
      onShowOperationHistory={overrides.onShowOperationHistory}
    />
  );
  return { onShowMembers, onShowRoles };
}

describe('ProjectListView — 项目级动作接线', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedFileItemProps.length = 0;
  });

  it('传入 onShowOperationHistory 时透传给 FileItem', () => {
    renderList({ onShowOperationHistory: () => {} });
    expect(capturedFileItemProps).toHaveLength(1);
    expect(capturedFileItemProps[0].onShowOperationHistory).toBeTypeOf(
      'function'
    );
  });

  it('未传 onShowOperationHistory 时 FileItem 收到 undefined（入口不出现）', () => {
    renderList();
    expect(capturedFileItemProps).toHaveLength(1);
    expect(capturedFileItemProps[0].onShowOperationHistory).toBeUndefined();
  });

  it('成员/角色按钮受 canManageMembers/canManageRoles 门控，操作历史不受门控', () => {
    renderList({ onShowOperationHistory: () => {} });
    const props = capturedFileItemProps[0];
    expect(props.onShowMembers).toBeUndefined();
    expect(props.onShowRoles).toBeUndefined();
    expect(props.onShowOperationHistory).toBeTypeOf('function');
  });

  it('有成员/角色权限时对应回调透传', () => {
    renderList({
      onShowOperationHistory: () => {},
      canManageMembers: true,
      canManageRoles: true,
    });
    const props = capturedFileItemProps[0];
    expect(props.onShowMembers).toBeTypeOf('function');
    expect(props.onShowRoles).toBeTypeOf('function');
  });
});
