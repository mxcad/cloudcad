///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import {
  SYSTEM_PERMISSION_DEPENDENCIES,
  PROJECT_PERMISSION_DEPENDENCIES,
  completePermissionDependencies,
} from './permission-dependencies.constants';

describe('completePermissionDependencies', () => {
  it('自动补全单层前置：创建角色自动带上查看角色', () => {
    expect(
      completePermissionDependencies(['SYSTEM_ROLE_CREATE'])
    ).toEqual(expect.arrayContaining(['SYSTEM_ROLE_CREATE', 'SYSTEM_ROLE_READ']));
  });

  it('自动补全传递依赖：删除项目 → 编辑项目 → 查看文件', () => {
    const result = completePermissionDependencies(['PROJECT_DELETE']);
    expect(result).toEqual(
      expect.arrayContaining([
        'PROJECT_DELETE',
        'PROJECT_UPDATE',
        'FILE_OPEN',
      ])
    );
  });

  it('创建/编辑用户同时补全用户查看与角色查看（角色下拉依赖）', () => {
    const result = completePermissionDependencies(['SYSTEM_USER_CREATE']);
    expect(result).toEqual(
      expect.arrayContaining([
        'SYSTEM_USER_CREATE',
        'SYSTEM_USER_READ',
        'SYSTEM_ROLE_READ',
      ])
    );
  });

  it('幂等：重复调用结果一致', () => {
    const once = completePermissionDependencies([
      'SYSTEM_ROLE_CREATE',
      'SYSTEM_ROLE_READ',
    ]);
    const twice = completePermissionDependencies(once);
    expect(once.sort()).toEqual(twice.sort());
  });

  it('无依赖的权限原样返回', () => {
    expect(completePermissionDependencies(['PROJECT_CREATE'])).toEqual([
      'PROJECT_CREATE',
    ]);
  });

  it('空数组返回空数组', () => {
    expect(completePermissionDependencies([])).toEqual([]);
  });
});

describe('依赖表完整性', () => {
  it('系统权限依赖与前端生成脚本规则一致（SYSTEM_ROLE_READ 前置族）', () => {
    const roleWritePerms = [
      'SYSTEM_ROLE_CREATE',
      'SYSTEM_ROLE_UPDATE',
      'SYSTEM_ROLE_DELETE',
      'SYSTEM_ROLE_PERMISSION_MANAGE',
    ];
    for (const perm of roleWritePerms) {
      expect(SYSTEM_PERMISSION_DEPENDENCIES[perm as keyof typeof SYSTEM_PERMISSION_DEPENDENCIES]).toContain(
        'SYSTEM_ROLE_READ'
      );
    }
  });

  it('系统权限写操作的前置都是同族读权限', () => {
    // 每个有依赖的系统权限，其前置必须是"查看"类权限且与自身同族
    const expectedDeps: Record<string, string[]> = {
      SYSTEM_USER_CREATE: ['SYSTEM_USER_READ', 'SYSTEM_ROLE_READ'],
      SYSTEM_USER_UPDATE: ['SYSTEM_USER_READ', 'SYSTEM_ROLE_READ'],
      SYSTEM_USER_DELETE: ['SYSTEM_USER_READ'],
      SYSTEM_USER_MEMBERSHIP_MANAGE: ['SYSTEM_USER_READ'],
      SYSTEM_ROLE_CREATE: ['SYSTEM_ROLE_READ'],
      SYSTEM_ROLE_UPDATE: ['SYSTEM_ROLE_READ'],
      SYSTEM_ROLE_DELETE: ['SYSTEM_ROLE_READ'],
      SYSTEM_ROLE_PERMISSION_MANAGE: ['SYSTEM_ROLE_READ'],
      SYSTEM_BILLING_WRITE: ['SYSTEM_BILLING_READ'],
      SYSTEM_CONFIG_WRITE: ['SYSTEM_CONFIG_READ'],
      SYSTEM_FONT_UPLOAD: ['SYSTEM_FONT_READ'],
      SYSTEM_FONT_DELETE: ['SYSTEM_FONT_READ'],
      SYSTEM_FONT_DOWNLOAD: ['SYSTEM_FONT_READ'],
    };
    expect(SYSTEM_PERMISSION_DEPENDENCIES).toEqual(expectedDeps);
  });

  it('项目权限写操作都有 FILE_OPEN/PROJECT_UPDATE 前置链', () => {
    // 依赖表里的每个项目权限，其依赖最终都能收敛到 FILE_OPEN（根），
    // PROJECT_* 权限额外要求收敛到 PROJECT_UPDATE
    for (const perm of Object.keys(PROJECT_PERMISSION_DEPENDENCIES)) {
      const completed = completePermissionDependencies([perm]);
      expect(completed).toContain('FILE_OPEN');
      if (perm.startsWith('PROJECT_')) {
        expect(completed).toContain('PROJECT_UPDATE');
      }
    }
  });
});
