import { describe, it, expect } from 'vitest';
import { roleGrantsUserAdmin, isAdminDemotion } from './userAdminPrivilege';

const ROLES = [
  { id: 'role-admin', permissions: ['SYSTEM_USER_UPDATE', 'SYSTEM_ROLE_READ'] },
  { id: 'role-audit', permissions: ['AUDIT_ADMIN'] },
  { id: 'role-user', permissions: ['PROJECT_CREATE'] },
];

describe('roleGrantsUserAdmin', () => {
  it('按 SYSTEM_USER_UPDATE 判定，而不是按角色名', () => {
    expect(roleGrantsUserAdmin(ROLES[0])).toBe(true);
    expect(roleGrantsUserAdmin(ROLES[1])).toBe(false);
    expect(roleGrantsUserAdmin(ROLES[2])).toBe(false);
  });

  it('自定义角色名含 ADMIN 但不持有该权限 → 不算管理员', () => {
    expect(roleGrantsUserAdmin({ id: 'x', permissions: ['SYSTEM_ROLE_READ'] })).toBe(
      false
    );
  });

  it('无角色 / 无权限字段 → false', () => {
    expect(roleGrantsUserAdmin(undefined)).toBe(false);
    expect(roleGrantsUserAdmin({ id: 'y' })).toBe(false);
  });
});

describe('isAdminDemotion', () => {
  it('管理员换成非管理员角色 → true', () => {
    expect(
      isAdminDemotion({
        currentRoleId: 'role-admin',
        nextRoleId: 'role-user',
        roles: ROLES,
        currentStatus: 'ACTIVE',
        nextStatus: 'ACTIVE',
      })
    ).toBe(true);
  });

  it('管理员清空角色 → true', () => {
    expect(
      isAdminDemotion({
        currentRoleId: 'role-admin',
        nextRoleId: '',
        roles: ROLES,
        currentStatus: 'ACTIVE',
        nextStatus: 'ACTIVE',
      })
    ).toBe(true);
  });

  it('角色不变、仅把状态改为 SUSPENDED → true', () => {
    expect(
      isAdminDemotion({
        currentRoleId: 'role-admin',
        nextRoleId: 'role-admin',
        roles: ROLES,
        currentStatus: 'ACTIVE',
        nextStatus: 'SUSPENDED',
      })
    ).toBe(true);
  });

  it('换成仍持有该权限的自定义角色 → false', () => {
    const custom = {
      id: 'role-custom',
      permissions: ['SYSTEM_USER_UPDATE', 'SYSTEM_USER_READ'],
    };
    expect(
      isAdminDemotion({
        currentRoleId: 'role-admin',
        nextRoleId: 'role-custom',
        roles: [...ROLES, custom],
        currentStatus: 'ACTIVE',
        nextStatus: 'ACTIVE',
      })
    ).toBe(false);
  });

  it('普通用户之间换角色 → false（当前就不具备用户管理能力）', () => {
    expect(
      isAdminDemotion({
        currentRoleId: 'role-user',
        nextRoleId: 'role-audit',
        roles: ROLES,
        currentStatus: 'ACTIVE',
        nextStatus: 'ACTIVE',
      })
    ).toBe(false);
  });

  it('已是非 ACTIVE 的用户再改状态 → false（早已失去使用能力，不构成新的降级）', () => {
    expect(
      isAdminDemotion({
        currentRoleId: 'role-admin',
        nextRoleId: 'role-admin',
        roles: ROLES,
        currentStatus: 'SUSPENDED',
        nextStatus: 'INACTIVE',
      })
    ).toBe(false);
  });

  it('默认值：状态缺省按 ACTIVE 处理', () => {
    expect(
      isAdminDemotion({
        currentRoleId: 'role-admin',
        nextRoleId: 'role-admin',
        roles: ROLES,
        currentStatus: '',
        nextStatus: 'SUSPENDED',
      })
    ).toBe(true);
  });
});
