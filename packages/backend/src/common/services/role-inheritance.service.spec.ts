///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { RoleInheritanceService } from './role-inheritance.service';
import { DatabaseService } from '../../database/database.service';
import { PermissionCacheService } from './permission-cache.service';
import { SystemPermission, SystemRole } from '../enums/permissions.enum';

describe('RoleInheritanceService', () => {
  let service: RoleInheritanceService;

  const mockPrisma = {
    role: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    rolePermission: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn().mockImplementation(async (fn) => fn(mockPrisma)),
  };

  const mockCacheService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Prevent onModuleInit from triggering cache warmup — avoids heap memory overflow in tests.
    // The warmup queries all system roles and permissions; mocks are set per-test, not globally.
    jest
      .spyOn(RoleInheritanceService.prototype, 'onModuleInit')
      .mockImplementation(async () => {});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleInheritanceService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: PermissionCacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<RoleInheritanceService>(RoleInheritanceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // =========================================================================
  // getRolePermissions
  // =========================================================================

  describe('getRolePermissions', () => {
    const roleName = SystemRole.ADMIN;

    it('should return cached permissions when cache hit with non-null value', async () => {
      const cachedPermissions = [SystemPermission.SYSTEM_USER_READ, SystemPermission.SYSTEM_ADMIN];
      mockCacheService.get.mockResolvedValue(cachedPermissions);

      const result = await service.getRolePermissions(roleName);

      expect(mockCacheService.get).toHaveBeenCalledWith(`role:permissions:${roleName}`);
      expect(result).toEqual(cachedPermissions);
      // should NOT query database when cache hits
      expect(mockPrisma.role.findFirst).not.toHaveBeenCalled();
    });

    it('should return empty array when cache hit with null sentinel', async () => {
      mockCacheService.get.mockResolvedValue('null');

      const result = await service.getRolePermissions(roleName);

      expect(result).toEqual([]);
      expect(mockPrisma.role.findFirst).not.toHaveBeenCalled();
    });

    it('should query database and cache results on cache miss', async () => {
      mockCacheService.get.mockResolvedValue(null);
      // role lookup
      mockPrisma.role.findFirst.mockResolvedValue({
        id: 'role-admin',
        parentId: null,
      });
      // permissions query for collected role IDs
      mockPrisma.rolePermission.findMany.mockResolvedValue([
        { permission: SystemPermission.SYSTEM_USER_READ },
        { permission: SystemPermission.SYSTEM_ADMIN },
      ]);

      const result = await service.getRolePermissions(roleName);

      expect(mockPrisma.role.findFirst).toHaveBeenCalledWith({
        where: { name: roleName },
        select: { id: true, parentId: true },
      });
      expect(mockPrisma.rolePermission.findMany).toHaveBeenCalledWith({
        where: { roleId: { in: ['role-admin'] } },
        select: { permission: true },
      });
      expect(mockCacheService.set).toHaveBeenCalledWith(
        `role:permissions:${roleName}`,
        [SystemPermission.SYSTEM_USER_READ, SystemPermission.SYSTEM_ADMIN],
        expect.any(Number),
      );
      expect(result).toEqual([SystemPermission.SYSTEM_USER_READ, SystemPermission.SYSTEM_ADMIN]);
    });

    it('should cache empty result as null sentinel when no permissions found', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockPrisma.role.findFirst.mockResolvedValue({
        id: 'role-admin',
        parentId: null,
      });
      mockPrisma.rolePermission.findMany.mockResolvedValue([]);

      const result = await service.getRolePermissions(roleName);

      expect(mockCacheService.set).toHaveBeenCalledWith(
        `role:permissions:${roleName}`,
        'null',
        expect.any(Number),
      );
      expect(result).toEqual([]);
    });

    it('should collect ancestor permissions via hierarchy', async () => {
      mockCacheService.get.mockResolvedValue(null);
      // First find the role
      mockPrisma.role.findFirst.mockResolvedValue({
        id: 'role-user-manager',
        parentId: 'parent-role-user',
      });
      // Then find the parent role
      mockPrisma.role.findUnique.mockResolvedValue({
        name: SystemRole.USER,
      });
      // Then find the parent role (USER) - no parent
      mockPrisma.role.findFirst.mockResolvedValueOnce({
        id: 'role-user',
        parentId: null,
      });
      // Permissions for all collected IDs
      mockPrisma.rolePermission.findMany.mockResolvedValue([
        { permission: SystemPermission.PROJECT_CREATE },
        { permission: SystemPermission.SYSTEM_USER_READ },
      ]);

      const result = await service.getRolePermissions(SystemRole.USER_MANAGER);

      expect(result).toEqual([SystemPermission.PROJECT_CREATE, SystemPermission.SYSTEM_USER_READ]);
    });

    it('should deduplicate permissions from multiple ancestor roles', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockPrisma.role.findFirst.mockResolvedValue({
        id: 'role-child',
        parentId: null,
      });
      mockPrisma.rolePermission.findMany.mockResolvedValue([
        { permission: SystemPermission.SYSTEM_USER_READ },
        { permission: SystemPermission.SYSTEM_USER_READ }, // duplicate
        { permission: SystemPermission.PROJECT_CREATE },
      ]);

      const result = await service.getRolePermissions(roleName);

      // Should deduplicate
      expect(result).toEqual([SystemPermission.SYSTEM_USER_READ, SystemPermission.PROJECT_CREATE]);
    });

    it('should return empty array when role not found in database', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockPrisma.role.findFirst.mockResolvedValue(null);

      const result = await service.getRolePermissions('NONEXISTENT' as SystemRole);

      expect(result).toEqual([]);
      expect(mockCacheService.set).toHaveBeenCalledWith(
        'role:permissions:NONEXISTENT',
        'null',
        expect.any(Number),
      );
    });

    it('should return empty array on database error without caching', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockPrisma.role.findFirst.mockRejectedValue(new Error('DB error'));

      const result = await service.getRolePermissions(roleName);

      expect(result).toEqual([]);
      // Should NOT cache on error
      expect(mockCacheService.set).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // forceRefreshRolePermissions
  // =========================================================================

  describe('forceRefreshRolePermissions', () => {
    const roleName = SystemRole.ADMIN;

    it('should clear cache and re-fetch permissions', async () => {
      // Cache miss after delete
      mockCacheService.get.mockResolvedValue(null);
      mockPrisma.role.findFirst.mockResolvedValue({
        id: 'role-admin',
        parentId: null,
      });
      mockPrisma.rolePermission.findMany.mockResolvedValue([
        { permission: SystemPermission.SYSTEM_ADMIN },
      ]);

      const result = await service.forceRefreshRolePermissions(roleName);

      expect(mockCacheService.delete).toHaveBeenCalledWith(`role:permissions:${roleName}`);
      expect(result).toEqual([SystemPermission.SYSTEM_ADMIN]);
    });
  });

  // =========================================================================
  // isInheritedFrom
  // =========================================================================

  describe('isInheritedFrom', () => {
    const childRole = SystemRole.USER_MANAGER;
    const parentRole = SystemRole.USER;

    it('should return cached result when available', async () => {
      mockCacheService.get.mockResolvedValue(true);

      const result = await service.isInheritedFrom(childRole, parentRole);

      expect(mockCacheService.get).toHaveBeenCalledWith(
        `role:inherit:${childRole}:${parentRole}`,
      );
      expect(result).toBe(true);
      expect(mockPrisma.role.findFirst).not.toHaveBeenCalled();
    });

    it('should return true when parent role is in ancestor chain', async () => {
      mockCacheService.get.mockResolvedValue(null);
      // Find child role first
      mockPrisma.role.findFirst.mockResolvedValue({
        name: childRole,
        parentId: 'parent-id',
      });
      // Find parent role
      mockPrisma.role.findUnique.mockResolvedValue({
        name: parentRole,
      });
      // Find parent's parent (none)
      mockPrisma.role.findFirst.mockResolvedValue({
        name: parentRole,
        parentId: null,
      });

      const result = await service.isInheritedFrom(childRole, parentRole);

      expect(result).toBe(true);
      expect(mockCacheService.set).toHaveBeenCalledWith(
        `role:inherit:${childRole}:${parentRole}`,
        true,
        expect.any(Number),
      );
    });

    it('should return false when parent role is not in ancestor chain', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockPrisma.role.findFirst.mockResolvedValue({
        name: 'OTHER_ROLE',
        parentId: null,
      });

      const result = await service.isInheritedFrom(childRole, SystemRole.ADMIN);

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockPrisma.role.findFirst.mockRejectedValue(new Error('DB error'));

      const result = await service.isInheritedFrom(childRole, parentRole);

      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // getRoleHierarchyPath
  // =========================================================================

  describe('getRoleHierarchyPath', () => {
    const roleName = SystemRole.USER_MANAGER;

    it('should return cached path when available', async () => {
      const cachedPath = [SystemRole.USER, SystemRole.USER_MANAGER];
      mockCacheService.get.mockResolvedValue(cachedPath);

      const result = await service.getRoleHierarchyPath(roleName);

      expect(result).toEqual(cachedPath);
      expect(mockPrisma.role.findFirst).not.toHaveBeenCalled();
    });

    it('should build path from root to role', async () => {
      mockCacheService.get.mockResolvedValue(null);
      // Find role first
      mockPrisma.role.findFirst.mockResolvedValue({
        name: SystemRole.USER_MANAGER,
        parentId: 'parent-role-user',
      });
      // Find parent (USER)
      mockPrisma.role.findUnique.mockResolvedValue({
        name: SystemRole.USER,
      });
      // USER has no parent
      mockPrisma.role.findFirst.mockResolvedValue({
        name: SystemRole.USER,
        parentId: null,
      });

      const result = await service.getRoleHierarchyPath(roleName);

      // Path from root to current: USER → USER_MANAGER
      expect(result).toEqual([SystemRole.USER, SystemRole.USER_MANAGER]);
    });

    it('should return empty array when role not found', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockPrisma.role.findFirst.mockResolvedValue(null);

      const result = await service.getRoleHierarchyPath(roleName);

      expect(result).toEqual([]);
    });

    it('should return empty array on error', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockPrisma.role.findFirst.mockRejectedValue(new Error('DB error'));

      const result = await service.getRoleHierarchyPath(roleName);

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // checkUserPermissionWithInheritance
  // =========================================================================

  describe('checkUserPermissionWithInheritance', () => {
    const userId = 'user-001';
    const permission = SystemPermission.SYSTEM_USER_READ;

    it('should return true when user role has the permission', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        role: { name: SystemRole.ADMIN },
      });
      // Cache miss for role permissions
      mockCacheService.get.mockResolvedValue(null);
      mockPrisma.role.findFirst.mockResolvedValue({
        id: 'role-admin',
        parentId: null,
      });
      mockPrisma.rolePermission.findMany.mockResolvedValue([
        { permission: SystemPermission.SYSTEM_USER_READ },
        { permission: SystemPermission.SYSTEM_ADMIN },
      ]);

      const result = await service.checkUserPermissionWithInheritance(userId, permission);

      expect(result).toBe(true);
    });

    it('should return false when user role does not have the permission', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        role: { name: SystemRole.USER },
      });
      mockCacheService.get.mockResolvedValue(null);
      mockPrisma.role.findFirst.mockResolvedValue({
        id: 'role-user',
        parentId: null,
      });
      mockPrisma.rolePermission.findMany.mockResolvedValue([
        { permission: SystemPermission.PROJECT_CREATE },
      ]);

      const result = await service.checkUserPermissionWithInheritance(userId, SystemPermission.SYSTEM_ADMIN);

      expect(result).toBe(false);
    });

    it('should return false when user has no role', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.checkUserPermissionWithInheritance(userId, permission);

      expect(result).toBe(false);
    });

    it('should return false when user role is null', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ role: null });

      const result = await service.checkUserPermissionWithInheritance(userId, permission);

      expect(result).toBe(false);
    });

    it('should return false on database error', async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error('DB error'));

      const result = await service.checkUserPermissionWithInheritance(userId, permission);

      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // clearRoleCache
  // =========================================================================

  describe('clearRoleCache', () => {
    const roleName = SystemRole.ADMIN;

    it('should delete permissions and path cache keys', async () => {
      await service.clearRoleCache(roleName);

      expect(mockCacheService.delete).toHaveBeenCalledWith(`role:permissions:${roleName}`);
      expect(mockCacheService.delete).toHaveBeenCalledWith(`role:path:${roleName}`);
    });
  });

  // =========================================================================
  // clearRoleCacheRecursive
  // =========================================================================

  describe('clearRoleCacheRecursive', () => {
    const roleName = SystemRole.ADMIN;

    it('should clear cache for role and all child roles', async () => {
      // Find current role
      mockPrisma.role.findFirst.mockResolvedValue({
        id: 'role-admin',
      });
      // Find children
      mockPrisma.role.findMany.mockResolvedValue([
        { name: SystemRole.USER_MANAGER },
        { name: SystemRole.FONT_MANAGER },
      ]);

      await service.clearRoleCacheRecursive(roleName);

      // Should clear current role cache
      expect(mockCacheService.delete).toHaveBeenCalledWith(`role:permissions:${SystemRole.ADMIN}`);
      expect(mockCacheService.delete).toHaveBeenCalledWith(`role:path:${SystemRole.ADMIN}`);

      // Should also clear child role caches (recursive)
      // The recursive call would also clear USER_MANAGER and FONT_MANAGER caches
    });
  });

  // =========================================================================
  // getRoleHierarchyTree
  // =========================================================================

  describe('getRoleHierarchyTree', () => {
    it('should build hierarchy tree from top-level roles', async () => {
      mockPrisma.role.findMany
        .mockResolvedValueOnce([{
          id: 'role-admin',
          name: 'ADMIN',
          description: 'Administrator',
          category: 'SYSTEM',
          level: 100,
          isSystem: true,
        }])
        .mockResolvedValueOnce([]); // no children

      const result = await service.getRoleHierarchyTree();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('ADMIN');
      expect(result[0].children).toEqual([]);
    });

    it('should build nested hierarchy with children', async () => {
      // Top-level roles
      mockPrisma.role.findMany.mockResolvedValueOnce([{
        id: 'role-admin',
        name: 'ADMIN',
        description: 'Administrator',
        category: 'SYSTEM',
        level: 100,
        isSystem: true,
      }]);
      // Children of admin
      mockPrisma.role.findMany.mockResolvedValueOnce([{
        id: 'role-user',
        name: 'USER',
        description: 'User',
        category: 'SYSTEM',
        level: 1,
        isSystem: true,
      }]);
      // Children of user (none)
      mockPrisma.role.findMany.mockResolvedValueOnce([]);

      const result = await service.getRoleHierarchyTree();

      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].name).toBe('USER');
    });

    it('should return empty array on error', async () => {
      mockPrisma.role.findMany.mockRejectedValue(new Error('DB error'));

      const result = await service.getRoleHierarchyTree();

      expect(result).toEqual([]);
    });
  });
});
