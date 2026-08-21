///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { PermissionService } from './permission.service';
import { DatabaseService } from '../../database/database.service';
import { PermissionCacheService } from './permission-cache.service';
import { RoleInheritanceService } from './role-inheritance.service';
import { SystemPermission, SystemRole } from '../../common/enums/permissions.enum';
import { ISTORE_PERMISSION_STRATEGY } from '../strategies/store-permission.strategy';
import { ICONTEXT_PERMISSION_STRATEGY } from '../strategies/context-permission.strategy';
import type { IStorePermissionStrategy } from '../strategies/store-permission.strategy';
import type { IContextPermissionStrategy } from '../strategies/context-permission.strategy';
import { ClsService } from 'nestjs-cls';

describe('PermissionService', () => {
  let service: PermissionService;

  const mockPrisma = {
    user: { findUnique: jest.fn() },
  };

  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    clearUserCache: jest.fn(),
  };

  const mockRoleInheritanceService = {
    getRolePermissions: jest.fn(),
    checkUserPermissionWithInheritance: jest.fn(),
    clearRoleCache: jest.fn(),
  };

  const mockClsService = {
    get: jest.fn(),
  };

  const mockStoreStrategy: jest.Mocked<IStorePermissionStrategy> = {
    checkSystemPermission: jest.fn(),
    checkSystemPermissionsBatch: jest.fn(),
    clearUserCache: jest.fn(),
  };

  const mockContextStrategy: jest.Mocked<IContextPermissionStrategy> = {
    checkContextRules: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: PermissionCacheService, useValue: mockCacheService },
        { provide: RoleInheritanceService, useValue: mockRoleInheritanceService },
        { provide: ClsService, useValue: mockClsService },
        { provide: ISTORE_PERMISSION_STRATEGY, useValue: mockStoreStrategy },
        { provide: ICONTEXT_PERMISSION_STRATEGY, useValue: mockContextStrategy },
      ],
    }).compile();

    service = module.get<PermissionService>(PermissionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // =========================================================================
  // checkSystemPermission
  // =========================================================================

  describe('checkSystemPermission', () => {
    const userId = 'user-001';
    const permission = SystemPermission.SYSTEM_USER_READ;

    it('should return cached value when cache hit', async () => {
      mockStoreStrategy.checkSystemPermission.mockResolvedValue(null);
      mockCacheService.get.mockResolvedValue(true);

      const result = await service.checkSystemPermission(userId, permission);

      expect(mockCacheService.get).toHaveBeenCalledWith(
        `system_perm:${userId}:${permission}`
      );
      expect(result).toBe(true);
      expect(mockRoleInheritanceService.checkUserPermissionWithInheritance).not.toHaveBeenCalled();
    });

    it('should cache false when cache hit returns false', async () => {
      mockStoreStrategy.checkSystemPermission.mockResolvedValue(null);
      mockCacheService.get.mockResolvedValue(false);

      const result = await service.checkSystemPermission(userId, permission);

      expect(result).toBe(false);
      expect(mockRoleInheritanceService.checkUserPermissionWithInheritance).not.toHaveBeenCalled();
    });

    it('should delegate to RoleInheritanceService on cache miss and cache result', async () => {
      mockStoreStrategy.checkSystemPermission.mockResolvedValue(null);
      mockCacheService.get.mockResolvedValue(null);
      mockRoleInheritanceService.checkUserPermissionWithInheritance.mockResolvedValue(true);

      const result = await service.checkSystemPermission(userId, permission);

      expect(mockRoleInheritanceService.checkUserPermissionWithInheritance).toHaveBeenCalledWith(
        userId,
        permission
      );
      expect(mockCacheService.set).toHaveBeenCalledWith(
        `system_perm:${userId}:${permission}`,
        true,
        expect.any(Number)
      );
      expect(result).toBe(true);
    });

    it('should cache false on cache miss when permission denied', async () => {
      mockStoreStrategy.checkSystemPermission.mockResolvedValue(null);
      mockCacheService.get.mockResolvedValue(null);
      mockRoleInheritanceService.checkUserPermissionWithInheritance.mockResolvedValue(false);

      const result = await service.checkSystemPermission(userId, permission);

      expect(result).toBe(false);
      expect(mockCacheService.set).toHaveBeenCalledWith(
        `system_perm:${userId}:${permission}`,
        false,
        expect.any(Number)
      );
    });

    it('should delegate to store strategy when available', async () => {
      mockStoreStrategy.checkSystemPermission.mockResolvedValue(true);

      const result = await service.checkSystemPermission(userId, permission);

      expect(mockStoreStrategy.checkSystemPermission).toHaveBeenCalledWith(userId, permission);
      expect(mockCacheService.get).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when RoleInheritanceService throws', async () => {
      mockStoreStrategy.checkSystemPermission.mockResolvedValue(null);
      mockCacheService.get.mockResolvedValue(null);
      mockRoleInheritanceService.checkUserPermissionWithInheritance.mockRejectedValue(
        new Error('DB error')
      );

      const result = await service.checkSystemPermission(userId, permission);

      expect(result).toBe(false);
      expect(mockCacheService.set).not.toHaveBeenCalled();
    });

    it('should return false when cache service throws', async () => {
      mockStoreStrategy.checkSystemPermission.mockResolvedValue(null);
      mockCacheService.get.mockRejectedValue(new Error('Cache error'));

      const result = await service.checkSystemPermission(userId, permission);

      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // getUserPermissions
  // =========================================================================

  describe('getUserPermissions', () => {
    it('should return permissions from RoleInheritanceService', async () => {
      const user = {
        id: 'user-001',
        email: 'test@example.com',
        username: 'testuser',
        role: { id: 'role-1', name: 'ADMIN', isSystem: true },
        status: 'ACTIVE',
      };
      const expectedPermissions = [SystemPermission.SYSTEM_USER_READ, SystemPermission.SYSTEM_USER_CREATE];

      mockRoleInheritanceService.getRolePermissions.mockResolvedValue(expectedPermissions);

      const result = await service.getUserPermissions(user);

      expect(mockRoleInheritanceService.getRolePermissions).toHaveBeenCalledWith(
        user.role.name as SystemRole
      );
      expect(result).toEqual(expectedPermissions);
    });

    it('should return empty array when user has no role', async () => {
      const user = {
        id: 'user-001',
        email: 'test@example.com',
        username: 'testuser',
        role: null as any,
        status: 'ACTIVE',
      };

      const result = await service.getUserPermissions(user);

      expect(result).toEqual([]);
      expect(mockRoleInheritanceService.getRolePermissions).not.toHaveBeenCalled();
    });

    it('should return empty array when RoleInheritanceService throws', async () => {
      const user = {
        id: 'user-001',
        email: 'test@example.com',
        username: 'testuser',
        role: { id: 'role-1', name: 'ADMIN', isSystem: true },
        status: 'ACTIVE',
      };

      mockRoleInheritanceService.getRolePermissions.mockRejectedValue(new Error('DB error'));

      const result = await service.getUserPermissions(user);

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // hasRole
  // =========================================================================

  describe('hasRole', () => {
    it('should return true when user role matches one of the specified roles', () => {
      const user = {
        id: 'user-001',
        email: 'test@example.com',
        username: 'testuser',
        role: { id: 'role-1', name: 'ADMIN', isSystem: true },
        status: 'ACTIVE',
      };

      const result = service.hasRole(user, ['ADMIN', 'USER']);

      expect(result).toBe(true);
    });

    it('should return false when user role does not match any specified role', () => {
      const user = {
        id: 'user-001',
        email: 'test@example.com',
        username: 'testuser',
        role: { id: 'role-1', name: 'USER', isSystem: true },
        status: 'ACTIVE',
      };

      const result = service.hasRole(user, ['ADMIN']);

      expect(result).toBe(false);
    });

    it('should return false when user has no role name', () => {
      const user = {
        id: 'user-001',
        email: 'test@example.com',
        username: 'testuser',
        role: { id: 'role-1', name: '', isSystem: true },
        status: 'ACTIVE',
      };

      const result = service.hasRole(user, ['ADMIN']);

      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // checkSystemPermissionWithContext
  // =========================================================================

  describe('checkSystemPermissionWithContext', () => {
    const userId = 'user-001';
    const permission = SystemPermission.SYSTEM_USER_READ;
    const context = {
      time: new Date(),
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      metadata: {},
    };

    it('should return false when basic permission check fails', async () => {
      mockStoreStrategy.checkSystemPermission.mockResolvedValue(null);
      mockCacheService.get.mockResolvedValue(false);

      const result = await service.checkSystemPermissionWithContext(
        userId,
        permission,
        context
      );

      expect(result).toBe(false);
    });

    it('should return true when basic permission passes and context allows', async () => {
      mockStoreStrategy.checkSystemPermission.mockResolvedValue(null);
      mockCacheService.get.mockResolvedValue(true);
      mockContextStrategy.checkContextRules.mockResolvedValue(true);

      const result = await service.checkSystemPermissionWithContext(
        userId,
        permission,
        context
      );

      expect(result).toBe(true);
      expect(mockContextStrategy.checkContextRules).toHaveBeenCalledWith(userId, permission, context);
    });

    it('should return false when context rules deny', async () => {
      mockStoreStrategy.checkSystemPermission.mockResolvedValue(null);
      mockCacheService.get.mockResolvedValue(true);
      mockContextStrategy.checkContextRules.mockResolvedValue(false);

      const result = await service.checkSystemPermissionWithContext(
        userId,
        permission,
        context
      );

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockStoreStrategy.checkSystemPermission.mockResolvedValue(null);
      mockCacheService.get.mockRejectedValue(new Error('Cache error'));

      const result = await service.checkSystemPermissionWithContext(
        userId,
        permission,
        context
      );

      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // checkSystemPermissionsBatch
  // =========================================================================

  describe('checkSystemPermissionsBatch', () => {
    const userId = 'user-001';
    const permissions = [
      SystemPermission.SYSTEM_USER_READ,
      SystemPermission.SYSTEM_USER_CREATE,
      SystemPermission.SYSTEM_ADMIN,
    ];

    it('should delegate to store strategy when available', async () => {
      const storeResult = new Map<SystemPermission, boolean>();
      storeResult.set(SystemPermission.SYSTEM_USER_READ, true);
      storeResult.set(SystemPermission.SYSTEM_USER_CREATE, false);
      storeResult.set(SystemPermission.SYSTEM_ADMIN, true);
      mockStoreStrategy.checkSystemPermissionsBatch.mockResolvedValue(storeResult);

      const result = await service.checkSystemPermissionsBatch(userId, permissions);

      expect(mockStoreStrategy.checkSystemPermissionsBatch).toHaveBeenCalledWith(userId, permissions);
      expect(result.get(SystemPermission.SYSTEM_USER_READ)).toBe(true);
      expect(result.get(SystemPermission.SYSTEM_USER_CREATE)).toBe(false);
    });

    it('should return cached results for permissions already in cache', async () => {
      mockStoreStrategy.checkSystemPermissionsBatch.mockResolvedValue(null);
      mockCacheService.get.mockImplementation((key: string) => {
        if (key === `system_perm:${userId}:${SystemPermission.SYSTEM_USER_READ}`) return Promise.resolve(true);
        if (key === `system_perm:${userId}:${SystemPermission.SYSTEM_USER_CREATE}`) return Promise.resolve(false);
        return Promise.resolve(null);
      });

      mockPrisma.user.findUnique.mockResolvedValue({
        role: { name: 'ADMIN' },
      });
      mockRoleInheritanceService.getRolePermissions.mockResolvedValue([
        SystemPermission.SYSTEM_USER_READ,
        SystemPermission.SYSTEM_USER_CREATE,
        SystemPermission.SYSTEM_ADMIN,
      ]);

      const result = await service.checkSystemPermissionsBatch(userId, permissions);

      expect(result.get(SystemPermission.SYSTEM_USER_READ)).toBe(true);
      expect(result.get(SystemPermission.SYSTEM_USER_CREATE)).toBe(false);
      expect(result.get(SystemPermission.SYSTEM_ADMIN)).toBe(true);
    });

    it('should return false for all permissions when user has no role', async () => {
      mockStoreStrategy.checkSystemPermissionsBatch.mockResolvedValue(null);
      mockCacheService.get.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.checkSystemPermissionsBatch(userId, permissions);

      expect(result.get(SystemPermission.SYSTEM_USER_READ)).toBe(false);
      expect(result.get(SystemPermission.SYSTEM_USER_CREATE)).toBe(false);
      expect(result.get(SystemPermission.SYSTEM_ADMIN)).toBe(false);
    });

    it('should return false for all uncached permissions on error', async () => {
      mockStoreStrategy.checkSystemPermissionsBatch.mockResolvedValue(null);
      mockCacheService.get.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockRejectedValue(new Error('DB error'));

      const result = await service.checkSystemPermissionsBatch(userId, permissions);

      expect(result.get(SystemPermission.SYSTEM_USER_READ)).toBe(false);
      expect(result.get(SystemPermission.SYSTEM_USER_CREATE)).toBe(false);
      expect(result.get(SystemPermission.SYSTEM_ADMIN)).toBe(false);
    });

    it('should cache uncached permission results', async () => {
      mockStoreStrategy.checkSystemPermissionsBatch.mockResolvedValue(null);
      mockCacheService.get.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        role: { name: 'ADMIN' },
      });
      mockRoleInheritanceService.getRolePermissions.mockResolvedValue([
        SystemPermission.SYSTEM_USER_READ,
      ]);

      await service.checkSystemPermissionsBatch(userId, permissions);

      expect(mockCacheService.set).toHaveBeenCalledTimes(permissions.length);
    });
  });

  // =========================================================================
  // clearUserCache
  // =========================================================================

  describe('clearUserCache', () => {
    const userId = 'user-001';

    it('should delegate to store strategy when available', async () => {
      mockStoreStrategy.clearUserCache.mockResolvedValue(true);

      await service.clearUserCache(userId);

      expect(mockStoreStrategy.clearUserCache).toHaveBeenCalledWith(userId);
      expect(mockCacheService.clearUserCache).not.toHaveBeenCalled();
    });

    it('should clear user cache via cacheService when no store', async () => {
      mockStoreStrategy.clearUserCache.mockResolvedValue(false);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await service.clearUserCache(userId);

      expect(mockStoreStrategy.clearUserCache).toHaveBeenCalledWith(userId);
      expect(mockCacheService.clearUserCache).toHaveBeenCalledWith(userId);
    });

    it('should also clear role cache when user has a role', async () => {
      mockStoreStrategy.clearUserCache.mockResolvedValue(false);
      mockPrisma.user.findUnique.mockResolvedValue({
        role: { name: 'ADMIN' },
      });

      await service.clearUserCache(userId);

      expect(mockCacheService.clearUserCache).toHaveBeenCalledWith(userId);
      expect(mockRoleInheritanceService.clearRoleCache).toHaveBeenCalledWith('ADMIN' as SystemRole);
    });

    it('should propagate error when user lookup fails', async () => {
      mockStoreStrategy.clearUserCache.mockResolvedValue(false);
      mockPrisma.user.findUnique.mockRejectedValue(new Error('DB error'));

      await expect(service.clearUserCache(userId)).rejects.toThrow('DB error');
    });
  });

  // =========================================================================
  // checkSystemPermission - 审核/检查路径
  // =========================================================================

  describe('checkSystemPermission - different permissions', () => {
    const userId = 'user-001';

    it.each([
      SystemPermission.SYSTEM_USER_READ,
      SystemPermission.SYSTEM_USER_CREATE,
      SystemPermission.SYSTEM_USER_UPDATE,
      SystemPermission.SYSTEM_USER_DELETE,
      SystemPermission.SYSTEM_ROLE_READ,
      SystemPermission.SYSTEM_ADMIN,
      SystemPermission.SYSTEM_CONFIG_READ,
    ])('should check permission: %s', async (permission) => {
      mockStoreStrategy.checkSystemPermission.mockResolvedValue(null);
      mockCacheService.get.mockResolvedValue(null);
      mockRoleInheritanceService.checkUserPermissionWithInheritance.mockResolvedValue(true);

      const result = await service.checkSystemPermission(userId, permission);

      expect(mockRoleInheritanceService.checkUserPermissionWithInheritance).toHaveBeenCalledWith(
        userId,
        permission
      );
      expect(result).toBe(true);
    });
  });
});
