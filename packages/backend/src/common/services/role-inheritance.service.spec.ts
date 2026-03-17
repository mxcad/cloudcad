///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { RoleInheritanceService } from './role-inheritance.service';
import { DatabaseService } from '../../database/database.service';
import { PermissionCacheService } from './permission-cache.service';
import { SystemRole, SystemPermission } from '../enums/permissions.enum';
import { PrismaClient } from '@prisma/client';

describe('RoleInheritanceService', () => {
  let service: RoleInheritanceService;
  let prisma: PrismaClient;
  let cacheService: jest.Mocked<PermissionCacheService>;

  const mockPrisma = {
    role: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  } as unknown as jest.Mocked<PermissionCacheService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleInheritanceService,
        {
          provide: DatabaseService,
          useValue: { prisma: mockPrisma },
        },
        {
          provide: PermissionCacheService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    service = module.get<RoleInheritanceService>(RoleInheritanceService);
    prisma = module.get<PrismaClient>(PrismaClient);

    jest.clearAllMocks();
  });

  it('应该成功创建服务实例', () => {
    expect(service).toBeDefined();
  });

  describe('getRolePermissions', () => {
    it('应该获取角色的所有权限（包括继承的权限）', async () => {
      // Mock 缓存未命中
      mockCacheService.get.mockReturnValue(null);

      // Mock USER_MANAGER 角色
      mockPrisma.role.findUnique
        .mockResolvedValueOnce({
          id: 'user-mgr-id',
          name: SystemRole.USER_MANAGER,
          parentId: 'user-id',
          permissions: [
            { permission: SystemPermission.SYSTEM_USER_READ },
            { permission: SystemPermission.SYSTEM_USER_CREATE },
          ],
        })
        .mockResolvedValueOnce({
          id: 'user-mgr-id',
          parentId: 'user-id',
        })
        .mockResolvedValueOnce({
          name: SystemRole.USER,
        })
        .mockResolvedValueOnce({
          id: 'user-id',
          name: SystemRole.USER,
          parentId: null,
          permissions: [],
        })
        .mockResolvedValueOnce({
          id: 'user-id',
          parentId: null,
        });

      const permissions = await service.getRolePermissions(
        SystemRole.USER_MANAGER
      );

      expect(permissions).toContain(SystemPermission.SYSTEM_USER_READ);
      expect(permissions).toContain(SystemPermission.SYSTEM_USER_CREATE);
      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('应该使用缓存的权限', async () => {
      const cachedPermissions = [SystemPermission.SYSTEM_USER_READ];
      mockCacheService.get.mockReturnValue(cachedPermissions);

      const permissions = await service.getRolePermissions(SystemRole.USER);

      expect(permissions).toEqual(cachedPermissions);
      expect(mockPrisma.role.findUnique).not.toHaveBeenCalled();
    });

    it('角色不存在时应该返回空数组', async () => {
      mockCacheService.get.mockReturnValue(null);
      mockPrisma.role.findUnique.mockResolvedValue(null);

      const permissions = await service.getRolePermissions(SystemRole.USER);

      expect(permissions).toEqual([]);
    });
  });

  describe('isInheritedFrom', () => {
    it('应该正确检测角色继承关系', async () => {
      mockCacheService.get.mockReturnValue(null);

      // Mock USER_MANAGER 继承自 USER
      mockPrisma.role.findUnique
        .mockResolvedValueOnce({
          id: 'user-mgr-id',
          parentId: 'user-id',
        })
        .mockResolvedValueOnce({
          name: SystemRole.USER,
          parentId: null,
        });

      const result = await service.isInheritedFrom(
        SystemRole.USER_MANAGER,
        SystemRole.USER
      );

      expect(result).toBe(true);
      expect(mockCacheService.set).toHaveBeenCalledWith(
        'role:inherit:USER_MANAGER:USER',
        true,
        600000
      );
    });

    it('没有继承关系时应该返回 false', async () => {
      mockCacheService.get.mockReturnValue(null);

      // Mock ADMIN 不继承自 USER
      mockPrisma.role.findUnique.mockResolvedValue({
        id: 'admin-id',
        parentId: null,
      });

      const result = await service.isInheritedFrom(
        SystemRole.ADMIN,
        SystemRole.USER
      );

      expect(result).toBe(false);
    });

    it('应该使用缓存的继承关系', async () => {
      mockCacheService.get.mockReturnValue(true);

      const result = await service.isInheritedFrom(
        SystemRole.USER_MANAGER,
        SystemRole.USER
      );

      expect(result).toBe(true);
      expect(mockPrisma.role.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('getRoleHierarchyPath', () => {
    it('应该返回完整的角色层级路径', async () => {
      // Mock USER_MANAGER -> USER
      mockPrisma.role.findUnique
        .mockResolvedValueOnce({
          id: 'user-mgr-id',
          parentId: 'user-id',
        })
        .mockResolvedValueOnce({
          name: SystemRole.USER,
          parentId: null,
        })
        .mockResolvedValueOnce({
          id: 'user-id',
          parentId: null,
        });

      const path = await service.getRoleHierarchyPath(SystemRole.USER_MANAGER);

      expect(path).toEqual([SystemRole.USER, SystemRole.USER_MANAGER]);
    });

    it('顶级角色应该只返回自己', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({
        id: 'admin-id',
        parentId: null,
      });

      const path = await service.getRoleHierarchyPath(SystemRole.ADMIN);

      expect(path).toEqual([SystemRole.ADMIN]);
    });
  });

  describe('checkUserPermissionWithInheritance', () => {
    it('应该检查用户权限（考虑继承）', async () => {
      // Mock 用户角色为 USER_MANAGER
      mockPrisma.role.findUnique
        .mockResolvedValueOnce({
          id: 'user-mgr-id',
          name: SystemRole.USER_MANAGER,
          parentId: 'user-id',
          permissions: [{ permission: SystemPermission.SYSTEM_USER_READ }],
        })
        .mockResolvedValueOnce({
          id: 'user-mgr-id',
          parentId: 'user-id',
        })
        .mockResolvedValueOnce({
          name: SystemRole.USER,
        })
        .mockResolvedValueOnce({
          id: 'user-id',
          parentId: null,
          permissions: [],
        })
        .mockResolvedValueOnce({
          id: 'user-id',
          parentId: null,
        });

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-id',
        role: {
          name: SystemRole.USER_MANAGER,
        },
      });

      const hasPermission = await service.checkUserPermissionWithInheritance(
        'user-id',
        SystemPermission.SYSTEM_USER_READ
      );

      expect(hasPermission).toBe(true);
    });

    it('用户没有权限时应该返回 false', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-id',
        role: {
          name: SystemRole.VIEWER,
        },
      });

      mockPrisma.role.findUnique.mockResolvedValue({
        id: 'viewer-id',
        name: SystemRole.VIEWER,
        parentId: null,
        permissions: [],
      });

      const hasPermission = await service.checkUserPermissionWithInheritance(
        'user-id',
        SystemPermission.SYSTEM_USER_DELETE
      );

      expect(hasPermission).toBe(false);
    });
  });

  describe('getRoleHierarchyTree', () => {
    it('应该返回完整的角色层级树', async () => {
      // Mock 顶级角色
      mockPrisma.role.findMany
        .mockResolvedValueOnce([
          { id: 'admin-id', name: SystemRole.ADMIN, parentId: null },
          { id: 'user-id', name: SystemRole.USER, parentId: null },
        ])
        // Mock ADMIN 的子角色（无）
        .mockResolvedValueOnce([])
        // Mock USER 的子角色
        .mockResolvedValueOnce([
          {
            id: 'user-mgr-id',
            name: SystemRole.USER_MANAGER,
            parentId: 'user-id',
          },
          {
            id: 'font-mgr-id',
            name: SystemRole.FONT_MANAGER,
            parentId: 'user-id',
          },
        ])
        // Mock USER_MANAGER 的子角色（无）
        .mockResolvedValueOnce([])
        // Mock FONT_MANAGER 的子角色（无）
        .mockResolvedValueOnce([]);

      const tree = await service.getRoleHierarchyTree();

      expect(tree).toHaveLength(2);
      expect(tree[0].name).toBe(SystemRole.ADMIN);
      expect(tree[1].name).toBe(SystemRole.USER);
      expect(tree[1].children).toHaveLength(2);
      expect(tree[1].children[0].name).toBe(SystemRole.USER_MANAGER);
      expect(tree[1].children[1].name).toBe(SystemRole.FONT_MANAGER);
    });
  });

  describe('clearRoleCache', () => {
    it('应该清除角色权限缓存', async () => {
      await service.clearRoleCache(SystemRole.USER_MANAGER);

      expect(mockCacheService.delete).toHaveBeenCalledWith(
        'role:permissions:USER_MANAGER'
      );
    });
  });
});
