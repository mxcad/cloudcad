import { describe, expect, it } from 'vitest';

import {
  ProjectPermission,
  PROJECT_PERMISSION_DEPENDENCIES,
  PROJECT_ROLE_KEYS,
  completePermissionDependencies,
  getDependentPermissions,
} from './project';

describe('@cloudcad/platform · permissions/project', () => {
  describe('ProjectPermission 枚举', () => {
    it('21 项，值与键同名（大写下划线，与后端枚举一致）', () => {
      const entries = Object.entries(ProjectPermission);
      expect(entries).toHaveLength(21);
      for (const [key, value] of entries) {
        expect(value).toBe(key);
      }
    });

    it('依赖图只引用枚举内的权限码（无幽灵权限）', () => {
      const all = new Set(Object.values(ProjectPermission));
      for (const deps of Object.values(PROJECT_PERMISSION_DEPENDENCIES)) {
        for (const dep of deps ?? []) {
          expect(all.has(dep as (typeof ProjectPermission)[keyof typeof ProjectPermission])).toBe(
            true
          );
        }
      }
    });

    it('PROJECT_ROLE_KEYS 为 5 个稳定角色键', () => {
      expect(PROJECT_ROLE_KEYS).toEqual([
        'PROJECT_OWNER',
        'PROJECT_ADMIN',
        'PROJECT_EDITOR',
        'PROJECT_MEMBER',
        'PROJECT_VIEWER',
      ]);
    });
  });

  describe('completePermissionDependencies', () => {
    it('勾选删除项目 → 连带编辑项目 + 打开文件（传递闭包）', () => {
      const result = completePermissionDependencies(
        PROJECT_PERMISSION_DEPENDENCIES,
        ['PROJECT_DELETE']
      );
      expect(result.sort()).toEqual(
        ['FILE_OPEN', 'PROJECT_DELETE', 'PROJECT_UPDATE'].sort()
      );
    });

    it('幂等：补全后再补全结果不变', () => {
      const once = completePermissionDependencies(
        PROJECT_PERMISSION_DEPENDENCIES,
        ['FILE_CREATE']
      );
      const twice = completePermissionDependencies(
        PROJECT_PERMISSION_DEPENDENCIES,
        once
      );
      expect(twice.sort()).toEqual(once.sort());
    });

    it('无前置权限（FILE_OPEN）不新增', () => {
      expect(
        completePermissionDependencies(PROJECT_PERMISSION_DEPENDENCIES, [
          'FILE_OPEN',
        ])
      ).toEqual(['FILE_OPEN']);
    });

    it('空选择 → 空结果', () => {
      expect(
        completePermissionDependencies(PROJECT_PERMISSION_DEPENDENCIES, [])
      ).toEqual([]);
    });
  });

  describe('getDependentPermissions', () => {
    it('取消 FILE_OPEN → 级联出所有依赖它的已勾选权限', () => {
      const result = getDependentPermissions(
        PROJECT_PERMISSION_DEPENDENCIES,
        'FILE_OPEN',
        ['FILE_OPEN', 'FILE_CREATE', 'FILE_DOWNLOAD', 'PROJECT_UPDATE']
      );
      // FILE_CREATE / FILE_DOWNLOAD / PROJECT_UPDATE 都（直接或传递）依赖 FILE_OPEN
      expect(result.sort()).toEqual(
        ['FILE_CREATE', 'FILE_DOWNLOAD', 'PROJECT_UPDATE'].sort()
      );
    });

    it('取消叶子权限（无下游）→ 空', () => {
      expect(
        getDependentPermissions(
          PROJECT_PERMISSION_DEPENDENCIES,
          'FILE_CREATE',
          ['FILE_OPEN', 'FILE_CREATE']
        )
      ).toEqual([]);
    });

    it('传递级联：取消 PROJECT_UPDATE → 级联 PROJECT_DELETE', () => {
      const result = getDependentPermissions(
        PROJECT_PERMISSION_DEPENDENCIES,
        'PROJECT_UPDATE',
        ['FILE_OPEN', 'PROJECT_UPDATE', 'PROJECT_DELETE']
      );
      expect(result).toEqual(['PROJECT_DELETE']);
    });
  });
});
