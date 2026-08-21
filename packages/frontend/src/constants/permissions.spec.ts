import { describe, it, expect, vi } from 'vitest';

// PERMISSION_GROUPS 初始化会调用 t()，这里只测纯函数，mock 掉 i18n
vi.mock('@/languages', () => ({
  t: (key: string) => key,
}));

import {
  PERMISSION_DEPENDENCIES,
  completePermissionDependencies,
  getDependentPermissions,
  togglePermission,
} from './permissions';

describe('completePermissionDependencies（勾选自动补全前置）', () => {
  it('勾选"创建角色"自动补上"查看角色"', () => {
    const result = completePermissionDependencies(['SYSTEM_ROLE_CREATE']);
    expect(result).toEqual(
      expect.arrayContaining(['SYSTEM_ROLE_CREATE', 'SYSTEM_ROLE_READ'])
    );
  });

  it('创建用户自动补上"查看用户"+"查看角色"（角色下拉依赖）', () => {
    const result = completePermissionDependencies(['SYSTEM_USER_CREATE']);
    expect(result).toEqual(
      expect.arrayContaining([
        'SYSTEM_USER_CREATE',
        'SYSTEM_USER_READ',
        'SYSTEM_ROLE_READ',
      ])
    );
  });

  it('传递依赖：删除项目 → 编辑项目 → 查看文件', () => {
    const result = completePermissionDependencies(['PROJECT_DELETE']);
    expect(result).toEqual(
      expect.arrayContaining(['PROJECT_DELETE', 'PROJECT_UPDATE', 'FILE_OPEN'])
    );
  });

  it('修改配置自动补上查看配置', () => {
    const result = completePermissionDependencies(['SYSTEM_CONFIG_WRITE']);
    expect(result).toEqual(
      expect.arrayContaining(['SYSTEM_CONFIG_WRITE', 'SYSTEM_CONFIG_READ'])
    );
  });

  it('幂等：已含前置时不重复添加', () => {
    const once = completePermissionDependencies([
      'SYSTEM_ROLE_CREATE',
      'SYSTEM_ROLE_READ',
    ]);
    const twice = completePermissionDependencies(once);
    expect(once.length).toBe(2);
    expect(twice.sort()).toEqual(once.sort());
  });

  it('无依赖权限原样返回', () => {
    expect(completePermissionDependencies(['PROJECT_CREATE'])).toEqual([
      'PROJECT_CREATE',
    ]);
  });
});

describe('getDependentPermissions（取消前置时的下游权限）', () => {
  it('直接下游：查看角色 → 创建/编辑/删除角色、角色权限管理', () => {
    const selected = [
      'SYSTEM_ROLE_READ',
      'SYSTEM_ROLE_CREATE',
      'SYSTEM_ROLE_UPDATE',
      'SYSTEM_ROLE_DELETE',
      'SYSTEM_ROLE_PERMISSION_MANAGE',
    ];
    const dependents = getDependentPermissions('SYSTEM_ROLE_READ', selected);
    expect(dependents.sort()).toEqual([
      'SYSTEM_ROLE_CREATE',
      'SYSTEM_ROLE_DELETE',
      'SYSTEM_ROLE_PERMISSION_MANAGE',
      'SYSTEM_ROLE_UPDATE',
    ]);
  });

  it('传递下游：取消查看文件会连带编辑/删除文件', () => {
    const selected = ['FILE_OPEN', 'FILE_EDIT', 'FILE_DELETE'];
    const dependents = getDependentPermissions('FILE_OPEN', selected);
    expect(dependents.sort()).toEqual(['FILE_DELETE', 'FILE_EDIT']);
  });

  it('无下游时返回空数组', () => {
    expect(
      getDependentPermissions('SYSTEM_ROLE_READ', ['SYSTEM_ROLE_READ'])
    ).toEqual([]);
    expect(
      getDependentPermissions('SYSTEM_ROLE_READ', [
        'SYSTEM_ROLE_READ',
        'SYSTEM_USER_READ',
      ])
    ).toEqual([]);
  });
});

describe('togglePermission', () => {
  it('勾选时自动补全前置权限', () => {
    const setSelected = vi.fn();
    togglePermission('SYSTEM_ROLE_CREATE', [], setSelected);
    const result = setSelected.mock.calls[0][0] as string[];
    expect(result).toEqual(
      expect.arrayContaining(['SYSTEM_ROLE_CREATE', 'SYSTEM_ROLE_READ'])
    );
  });

  it('取消时仅移除目标权限（级联取消由组件层弹确认处理）', () => {
    const setSelected = vi.fn();
    togglePermission(
      'SYSTEM_ROLE_READ',
      ['SYSTEM_ROLE_READ', 'SYSTEM_ROLE_CREATE'],
      setSelected
    );
    expect(setSelected.mock.calls[0][0]).toEqual(['SYSTEM_ROLE_CREATE']);
  });
});

describe('依赖表完整性守卫', () => {
  it('角色权限族全部依赖查看角色', () => {
    for (const perm of [
      'SYSTEM_ROLE_CREATE',
      'SYSTEM_ROLE_UPDATE',
      'SYSTEM_ROLE_DELETE',
      'SYSTEM_ROLE_PERMISSION_MANAGE',
    ]) {
      expect(PERMISSION_DEPENDENCIES[perm]).toContain('SYSTEM_ROLE_READ');
    }
  });

  it('写权限族都有查看前置', () => {
    const pairs: Array<[string, string]> = [
      ['SYSTEM_USER_CREATE', 'SYSTEM_USER_READ'],
      ['SYSTEM_USER_UPDATE', 'SYSTEM_USER_READ'],
      ['SYSTEM_CONFIG_WRITE', 'SYSTEM_CONFIG_READ'],
      ['SYSTEM_BILLING_WRITE', 'SYSTEM_BILLING_READ'],
      ['FILE_EDIT', 'FILE_OPEN'],
      ['FILE_UPLOAD', 'FILE_OPEN'],
      ['PROJECT_ROLE_MANAGE', 'PROJECT_UPDATE'],
    ];
    for (const [perm, dep] of pairs) {
      expect(PERMISSION_DEPENDENCIES[perm]).toContain(dep);
    }
  });
});
