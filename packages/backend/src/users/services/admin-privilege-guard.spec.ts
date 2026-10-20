import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { DatabaseService } from '../../database/database.service';
import {
  assertNotSelfRoleChange,
  assertNotSelfStatusChange,
  assertKeepsUserAdminSurvivor,
  countOtherUserAdmins,
  roleGrantsUserAdmin,
  USER_ADMIN_PERMISSION,
} from './admin-privilege-guard';

/**
 * 用户管理页三条不变量的单测（不依赖 DB，全部走 jest mock）：
 * 1. 不得修改自己的角色 / 状态（自我降权会把账户锁死在用户管理页之外）
 * 2. 不得让「持有用户管理权限的账号」归零
 * 3. 「管理员」按权限 SYSTEM_USER_UPDATE 判定，而非按角色名
 */
describe('admin-privilege-guard', () => {
  describe('assertNotSelfRoleChange', () => {
    it('操作者修改自己的角色 → 403', () => {
      expect(() =>
        assertNotSelfRoleChange('op-1', 'op-1', 'role-user', 'role-admin'),
      ).toThrow(ForbiddenException);
    });

    it('操作者与目标不同 → 放行', () => {
      expect(() =>
        assertNotSelfRoleChange('op-1', 'other-1', 'role-user', 'role-admin'),
      ).not.toThrow();
    });

    it('未指定目标角色 → 放行', () => {
      expect(() =>
        assertNotSelfRoleChange('op-1', 'op-1', undefined, 'role-admin'),
      ).not.toThrow();
    });

    it('幂等保存（角色未变）→ 放行', () => {
      expect(() =>
        assertNotSelfRoleChange('op-1', 'op-1', 'role-admin', 'role-admin'),
      ).not.toThrow();
    });
  });

  describe('assertNotSelfStatusChange', () => {
    it('操作者把自己挂起 → 403', () => {
      expect(() =>
        assertNotSelfStatusChange('op-1', 'op-1', 'SUSPENDED', 'ACTIVE'),
      ).toThrow(ForbiddenException);
    });

    it('操作者把别人挂起 → 放行', () => {
      expect(() =>
        assertNotSelfStatusChange('op-1', 'other-1', 'SUSPENDED', 'ACTIVE'),
      ).not.toThrow();
    });

    it('状态未变（幂等保存）→ 放行', () => {
      expect(() =>
        assertNotSelfStatusChange('op-1', 'op-1', 'SUSPENDED', 'SUSPENDED'),
      ).not.toThrow();
    });
  });

  describe('assertKeepsUserAdminSurvivor', () => {
    const db = (otherAdmins: number) =>
      ({
        user: { count: jest.fn().mockResolvedValue(otherAdmins) },
      } as unknown as DatabaseService);

    it('降级且排除自己后已无其他管理员 → 409', async () => {
      await expect(
        assertKeepsUserAdminSurvivor(db(0), 'u1', true, false),
      ).rejects.toThrow(ConflictException);
    });

    it('降级但仍有其他管理员 → 放行', async () => {
      await expect(assertKeepsUserAdminSurvivor(db(2), 'u1', true, false)).resolves.toBeUndefined();
    });

    it('提权（目标仍持有）→ 放行且不查库', async () => {
      const mockDb = db(0);
      await expect(assertKeepsUserAdminSurvivor(mockDb, 'u1', false, true)).resolves.toBeUndefined();
      expect(mockDb.user.count).not.toHaveBeenCalled();
    });

    it('当前就不持有 → 放行且不查库', async () => {
      const mockDb = db(0);
      await expect(assertKeepsUserAdminSurvivor(mockDb, 'u1', false, false)).resolves.toBeUndefined();
      expect(mockDb.user.count).not.toHaveBeenCalled();
    });
  });

  describe('管理员判定按权限而非角色名', () => {
    it('USER_ADMIN_PERMISSION 是 SYSTEM_USER_UPDATE', () => {
      expect(USER_ADMIN_PERMISSION).toBe('SYSTEM_USER_UPDATE');
    });

    it('countOtherUserAdmins 排除自身、只统计未注销且持该权限的账号', async () => {
      const count = jest.fn().mockResolvedValue(1);
      await countOtherUserAdmins(
        { user: { count } } as never,
        'u-excluded'
      );
      expect(count).toHaveBeenCalledWith({
        where: {
          id: { not: 'u-excluded' },
          deletedAt: null,
          role: {
            permissions: { some: { permission: 'SYSTEM_USER_UPDATE' } },
          },
        },
      });
    });

    it('roleGrantsUserAdmin 按 roleId 查 rolePermission 关联', async () => {
      const count = jest.fn().mockResolvedValue(1);
      const grants = await roleGrantsUserAdmin(
        { rolePermission: { count } } as never,
        'role-admin'
      );
      expect(count).toHaveBeenCalledWith({
        where: { roleId: 'role-admin', permission: 'SYSTEM_USER_UPDATE' },
      });
      expect(grants).toBe(true);
    });

    it('roleGrantsUserAdmin 无该权限 → false', async () => {
      expect(
        await roleGrantsUserAdmin(
          { rolePermission: { count: jest.fn().mockResolvedValue(0) } } as never,
          'role-user'
        )
      ).toBe(false);
    });
  });
});
