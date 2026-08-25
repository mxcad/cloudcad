import { describe, it, expect } from 'vitest';
import { getFileItemPermissionProps } from './useFileItemProps';
import { ProjectPermission } from '../constants/permissions';
import type { FileSystemNode } from '../types/filesystem';

function makeNode(overrides: Partial<FileSystemNode> = {}): FileSystemNode {
  return {
    id: 'node-1',
    name: 'drawing.dwg',
    nodeType: 'FILE',
    isFolder: false,
    isRoot: false,
    ...overrides,
  } as FileSystemNode;
}

describe('getFileItemPermissionProps — 非根节点 canEdit/canDelete 乐观回退链（加载期悲观门控）', () => {
  it('权限加载期（permissionsLoading=true）+ projectPermissions 未就绪：canEdit/canDelete 恒 false，不进入 rootPerms 乐观回退', () => {
    const props = getFileItemPermissionProps(makeNode(), {
      projectPermissions: {},
      nodePermissions: { canEdit: true, canDelete: true },
      permissionsLoading: true,
    });

    expect(props.canEdit).toBe(false);
    expect(props.canDelete).toBe(false);
  });

  it('加载完成（permissionsLoading=false）：按 projectPermissions 真实值渲染，不回退 rootPerms', () => {
    const props = getFileItemPermissionProps(makeNode(), {
      projectPermissions: {
        [ProjectPermission.FILE_EDIT]: true,
        [ProjectPermission.FILE_DELETE]: false,
      },
      nodePermissions: { canEdit: true, canDelete: true },
      permissionsLoading: false,
    });

    expect(props.canEdit).toBe(true);
    expect(props.canDelete).toBe(false);
  });

  it('加载完成且权限位未包含（undefined）：保留 rootPerms 回退链（与现状一致）', () => {
    const props = getFileItemPermissionProps(makeNode(), {
      projectPermissions: {},
      nodePermissions: { canEdit: true, canDelete: false },
      permissionsLoading: false,
    });

    expect(props.canEdit).toBe(true);
    expect(props.canDelete).toBe(false);
  });

  it('不传 permissionsLoading（undefined）：回退链行为与现状一致（不破坏其它调用点）', () => {
    const props = getFileItemPermissionProps(makeNode(), {
      projectPermissions: {},
      nodePermissions: { canEdit: true, canDelete: true },
    });

    expect(props.canEdit).toBe(true);
    expect(props.canDelete).toBe(true);
  });

  it('根节点不受 permissionsLoading 门控影响：rootPerms 生效', () => {
    const root = makeNode({ id: 'root-1', name: '项目A', nodeType: 'PROJECT', isRoot: true });
    const props = getFileItemPermissionProps(root, {
      projectPermissions: {},
      nodePermissions: { canEdit: true, canDelete: true },
      permissionsLoading: true,
    });

    expect(props.canEdit).toBe(true);
    expect(props.canDelete).toBe(true);
  });

  it('其余权限位不受门控影响（悲观语义保持）', () => {
    const props = getFileItemPermissionProps(makeNode(), {
      projectPermissions: {},
      permissionsLoading: true,
    });

    expect(props.canShare).toBe(false);
    expect(props.canDownload).toBe(false);
    expect(props.canViewVersionHistory).toBe(false);
    expect(props.canMove).toBe(false);
    expect(props.canCopy).toBe(false);
    expect(props.canManageExternalReference).toBe(false);
  });
});

describe('getFileItemPermissionProps — 公共资源库外部参照管理映射', () => {
  // LibraryManagerContent 以 projectPermissions={{ [CAD_EXTERNAL_REFERENCE]: canManage }}
  // 把系统权限 LIBRARY_*_MANAGE 映射为外部参照管理可见性，此组测试锁定该契约
  it('库管理员（canManage → CAD_EXTERNAL_REFERENCE=true）：canManageExternalReference=true', () => {
    const props = getFileItemPermissionProps(makeNode(), {
      projectPermissions: {
        [ProjectPermission.CAD_EXTERNAL_REFERENCE]: true,
      },
      nodePermissions: { canEdit: true, canDelete: true },
    });

    expect(props.canManageExternalReference).toBe(true);
  });

  it('非管理员（CAD_EXTERNAL_REFERENCE=false）：canManageExternalReference=false', () => {
    const props = getFileItemPermissionProps(makeNode(), {
      projectPermissions: {
        [ProjectPermission.CAD_EXTERNAL_REFERENCE]: false,
      },
      nodePermissions: { canEdit: true, canDelete: true },
    });

    expect(props.canManageExternalReference).toBe(false);
  });

  it('未传该权限位：回退 false（不乐观显示）', () => {
    const props = getFileItemPermissionProps(makeNode(), {
      projectPermissions: {},
      nodePermissions: { canEdit: true, canDelete: true },
    });

    expect(props.canManageExternalReference).toBe(false);
  });
});
