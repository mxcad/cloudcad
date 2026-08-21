///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { RolesService } from './roles.service';
import { DatabaseService } from '../database/database.service';
import { PermissionCacheService } from '../permission/services/permission-cache.service';
import { AuditLogService } from '../audit/audit-log.service';
import { AuditAction, ResourceType } from '../common/enums/audit.enum';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { RoleCategory, SystemPermission } from '../common/enums/permissions.enum';

describe('RolesService', () => {
  let service: RolesService;

  const mockPrisma = {
    role: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockCacheService = {
    cleanup: jest.fn(),
    clearRoleCache: jest.fn(),
  };

  const mockAuditLogService = {
    log: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: PermissionCacheService, useValue: mockCacheService },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all roles', async () => {
      const mockRoles = [
        {
          id: 'role1',
          name: 'ADMIN',
          description: 'Administrator',
          category: 'SYSTEM',
          level: 100,
          isSystem: true,
          permissions: [{ permission: 'SYSTEM_ADMIN' }],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrisma.role.findMany.mockResolvedValue(mockRoles);

      const result = await service.findAll();

      expect(mockPrisma.role.findMany).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('ADMIN');
    });
  });

  describe('findByCategory', () => {
    it('should return roles by category', async () => {
      const mockRoles = [
        {
          id: 'role1',
          name: 'ADMIN',
          description: 'Administrator',
          category: 'SYSTEM',
          level: 100,
          isSystem: true,
          permissions: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrisma.role.findMany.mockResolvedValue(mockRoles);

      const result = await service.findByCategory(RoleCategory.SYSTEM);

      expect(mockPrisma.role.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { category: RoleCategory.SYSTEM },
        })
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return role by id', async () => {
      const mockRole = {
        id: 'role1',
        name: 'ADMIN',
        description: 'Administrator',
        category: 'SYSTEM',
        level: 100,
        isSystem: true,
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.role.findUnique.mockResolvedValue(mockRole);

      const result = await service.findOne('role1');

      expect(mockPrisma.role.findUnique).toHaveBeenCalledWith({
        where: { id: 'role1' },
        include: expect.any(Object),
      });
      expect(result.id).toBe('role1');
    });

    it('should throw NotFoundException when role not found', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);

      await expect(service.findOne('invalid')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('create', () => {
    it('should create a new role', async () => {
      const createDto = {
        name: 'CUSTOM_ROLE',
        description: 'Custom role',
        category: RoleCategory.CUSTOM,
        level: 50,
        permissions: [SystemPermission.SYSTEM_USER_READ],
      };

      const mockRole = {
        id: 'role1',
        ...createDto,
        isSystem: false,
        permissions: [{ permission: SystemPermission.SYSTEM_USER_READ }],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.role.create.mockResolvedValue(mockRole);

      const result = await service.create(createDto);

      expect(mockPrisma.role.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'CUSTOM_ROLE',
            isSystem: false,
          }),
        })
      );
      expect(mockCacheService.cleanup).toHaveBeenCalled();
      expect(result.name).toBe('CUSTOM_ROLE');
    });

    it('should auto-complete missing prerequisite permissions on create', async () => {
      // 只传"创建角色"，服务端必须自动补上"查看角色"，避免出现"能创建但看不到"的无效组合
      const createDto = {
        name: 'CUSTOM_ROLE',
        permissions: [SystemPermission.SYSTEM_ROLE_CREATE],
      };

      mockPrisma.role.create.mockResolvedValue({
        id: 'role1',
        name: 'CUSTOM_ROLE',
        category: 'CUSTOM',
        level: 0,
        isSystem: false,
        permissions: [
          { permission: SystemPermission.SYSTEM_ROLE_CREATE },
          { permission: SystemPermission.SYSTEM_ROLE_READ },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.create(createDto);

      const createCall = mockPrisma.role.create.mock.calls[0][0];
      const createdPermissions = createCall.data.permissions.create.map(
        (p: { permission: string }) => p.permission
      );
      expect(createdPermissions).toEqual(
        expect.arrayContaining([
          SystemPermission.SYSTEM_ROLE_CREATE,
          SystemPermission.SYSTEM_ROLE_READ,
        ])
      );
    });

    it('should write ROLE_CREATE audit when userId provided (#207)', async () => {
      const createDto = {
        name: 'CUSTOM_ROLE2',
        permissions: [SystemPermission.SYSTEM_USER_READ],
      };

      mockPrisma.role.create.mockResolvedValue({
        id: 'role2',
        name: 'CUSTOM_ROLE2',
        category: 'CUSTOM',
        level: 0,
        isSystem: false,
        permissions: [{ permission: SystemPermission.SYSTEM_USER_READ }],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.create(createDto, 'admin-1');

      expect(mockAuditLogService.log).toHaveBeenCalledWith(
        AuditAction.ROLE_CREATE,
        ResourceType.ROLE,
        'role2',
        'admin-1',
        true,
        undefined,
        undefined,
        undefined,
        'CUSTOM_ROLE2',
        { roleName: 'CUSTOM_ROLE2' }
      );
    });

    it('should skip audit when userId not provided (#207)', async () => {
      mockPrisma.role.create.mockResolvedValue({
        id: 'role3',
        name: 'CUSTOM_ROLE3',
        category: 'CUSTOM',
        level: 0,
        isSystem: false,
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.create({ name: 'CUSTOM_ROLE3', permissions: [] });

      expect(mockAuditLogService.log).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update a role', async () => {
      const updateDto = {
        description: 'Updated description',
        permissions: [SystemPermission.SYSTEM_USER_READ, SystemPermission.SYSTEM_USER_UPDATE],
      };

      const existingRole = {
        id: 'role1',
        name: 'CUSTOM_ROLE',
        description: 'Custom role',
        category: 'CUSTOM',
        level: 50,
        isSystem: false,
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedRole = {
        ...existingRole,
        description: 'Updated description',
        permissions: [
          { permission: SystemPermission.SYSTEM_USER_READ },
          { permission: SystemPermission.SYSTEM_USER_UPDATE },
        ],
      };

      mockPrisma.role.findUnique.mockResolvedValue(existingRole);
      mockPrisma.role.update.mockResolvedValue(updatedRole);

      const result = await service.update('role1', updateDto);

      expect(mockPrisma.role.update).toHaveBeenCalled();
      expect(mockCacheService.clearRoleCache).toHaveBeenCalled();
      expect(result.description).toBe('Updated description');
    });

    it('should auto-complete missing prerequisite permissions on update', async () => {
      const updateDto = {
        permissions: [SystemPermission.SYSTEM_ROLE_CREATE],
      };

      const existingRole = {
        id: 'role1',
        name: 'CUSTOM_ROLE',
        description: 'Custom role',
        category: 'CUSTOM',
        level: 50,
        isSystem: false,
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedRole = {
        ...existingRole,
        permissions: [
          { permission: SystemPermission.SYSTEM_ROLE_CREATE },
          { permission: SystemPermission.SYSTEM_ROLE_READ },
        ],
      };

      mockPrisma.role.findUnique.mockResolvedValue(existingRole);
      mockPrisma.role.update.mockResolvedValue(updatedRole);

      // 只传"创建角色"，update 也应自动补上"查看角色"
      await service.update('role1', updateDto);

      const updateCall = mockPrisma.role.update.mock.calls[0][0];
      const createdPermissions = updateCall.data.permissions.create.map(
        (p: { permission: string }) => p.permission
      );
      expect(createdPermissions).toEqual(
        expect.arrayContaining([
          SystemPermission.SYSTEM_ROLE_CREATE,
          SystemPermission.SYSTEM_ROLE_READ,
        ])
      );
    });

    it('should throw NotFoundException when role not found', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);

      await expect(service.update('invalid', {})).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw BadRequestException when updating system role name', async () => {
      const existingRole = {
        id: 'role1',
        name: 'ADMIN',
        description: 'Administrator',
        category: 'SYSTEM',
        level: 100,
        isSystem: true,
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.role.findUnique.mockResolvedValue(existingRole);

      await expect(
        service.update('role1', { name: 'NEW_ADMIN' })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('should delete a role', async () => {
      const existingRole = {
        id: 'role1',
        name: 'CUSTOM_ROLE',
        description: 'Custom role',
        category: 'CUSTOM',
        level: 50,
        isSystem: false,
        permissions: [],
        _count: { users: 0 },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.role.findUnique.mockResolvedValue(existingRole);
      mockPrisma.role.delete.mockResolvedValue(existingRole);

      await service.remove('role1');

      expect(mockPrisma.role.delete).toHaveBeenCalledWith({
        where: { id: 'role1' },
      });
      expect(mockCacheService.cleanup).toHaveBeenCalled();
    });

    it('should write ROLE_DELETE audit when userId provided (#207)', async () => {
      const existingRole = {
        id: 'role1',
        name: 'CUSTOM_ROLE',
        category: 'CUSTOM',
        level: 50,
        isSystem: false,
        permissions: [],
        _count: { users: 0 },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.role.findUnique.mockResolvedValue(existingRole);
      mockPrisma.role.delete.mockResolvedValue(existingRole);

      await service.remove('role1', 'admin-1');

      expect(mockAuditLogService.log).toHaveBeenCalledWith(
        AuditAction.ROLE_DELETE,
        ResourceType.ROLE,
        'role1',
        'admin-1',
        true,
        undefined,
        undefined,
        undefined,
        'CUSTOM_ROLE',
        { roleName: 'CUSTOM_ROLE' }
      );
    });

    it('should throw NotFoundException when role not found', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);

      await expect(service.remove('invalid')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw BadRequestException when deleting system role', async () => {
      const existingRole = {
        id: 'role1',
        name: 'ADMIN',
        description: 'Administrator',
        category: 'SYSTEM',
        level: 100,
        isSystem: true,
        permissions: [],
        _count: { users: 0 },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.role.findUnique.mockResolvedValue(existingRole);

      await expect(service.remove('role1')).rejects.toThrow(
        BadRequestException
      );
    });

    it('should throw BadRequestException when role is in use', async () => {
      const existingRole = {
        id: 'role1',
        name: 'CUSTOM_ROLE',
        description: 'Custom role',
        category: 'CUSTOM',
        level: 50,
        isSystem: false,
        permissions: [],
        _count: { users: 5 },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.role.findUnique.mockResolvedValue(existingRole);

      await expect(service.remove('role1')).rejects.toThrow(
        BadRequestException
      );
    });
  });

  describe('addPermissions', () => {
    it('should add permissions to role', async () => {
      const existingRole = {
        id: 'role1',
        name: 'CUSTOM_ROLE',
        description: 'Custom role',
        category: 'CUSTOM',
        level: 50,
        isSystem: false,
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedRole = {
        ...existingRole,
        permissions: [{ permission: 'SYSTEM_USER_READ' }],
      };

      mockPrisma.role.findUnique.mockResolvedValue(existingRole);
      mockPrisma.role.update.mockResolvedValue(updatedRole);

      await service.addPermissions('role1', ['SYSTEM_USER_READ']);

      expect(mockPrisma.role.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'role1' },
          data: expect.objectContaining({
            permissions: expect.objectContaining({
              createMany: expect.any(Object),
            }),
          }),
        })
      );
    });

    it('should auto-complete missing prerequisite permissions on addPermissions', async () => {
      const existingRole = {
        id: 'role1',
        name: 'CUSTOM_ROLE',
        description: 'Custom role',
        category: 'CUSTOM',
        level: 50,
        isSystem: false,
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedRole = {
        ...existingRole,
        permissions: [
          { permission: 'SYSTEM_ROLE_CREATE' },
          { permission: 'SYSTEM_ROLE_READ' },
        ],
      };

      mockPrisma.role.findUnique.mockResolvedValue(existingRole);
      mockPrisma.role.update.mockResolvedValue(updatedRole);

      // 只传"创建角色"，直连 API 绕过 UI 时后端也应自动补上"查看角色"
      await service.addPermissions('role1', ['SYSTEM_ROLE_CREATE']);

      const updateCall = mockPrisma.role.update.mock.calls[0][0];
      const createdPermissions =
        updateCall.data.permissions.createMany.data.map(
          (p: { permission: string }) => p.permission
        );
      expect(createdPermissions).toEqual(
        expect.arrayContaining([
          'SYSTEM_ROLE_CREATE',
          'SYSTEM_ROLE_READ',
        ])
      );
    });

    it('should write PERMISSION_GRANT audit when userId provided (#207)', async () => {
      const existingRole = {
        id: 'role1',
        name: 'CUSTOM_ROLE',
        category: 'CUSTOM',
        level: 50,
        isSystem: false,
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.role.findUnique.mockResolvedValue(existingRole);
      mockPrisma.role.update.mockResolvedValue(existingRole);
      mockPrisma.role.findUnique.mockResolvedValueOnce(existingRole);
      mockPrisma.role.findMany.mockResolvedValue([existingRole]);

      await service.addPermissions('role1', ['SYSTEM_USER_READ'], 'admin-1');

      expect(mockAuditLogService.log).toHaveBeenCalledWith(
        AuditAction.PERMISSION_GRANT,
        ResourceType.ROLE,
        'role1',
        'admin-1',
        true,
        undefined,
        undefined,
        undefined,
        'CUSTOM_ROLE',
        expect.objectContaining({
          roleName: 'CUSTOM_ROLE',
          permissionName: 'SYSTEM_USER_READ',
        })
      );
    });
  });

  describe('removePermissions', () => {
    it('should remove permissions from role', async () => {
      const existingRole = {
        id: 'role1',
        name: 'CUSTOM_ROLE',
        description: 'Custom role',
        category: 'CUSTOM',
        level: 50,
        isSystem: false,
        permissions: [{ permission: 'SYSTEM_USER_READ' }],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.role.findUnique.mockResolvedValue(existingRole);

      await service.removePermissions('role1', ['SYSTEM_USER_READ']);

      expect(mockPrisma.role.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'role1' },
          data: expect.objectContaining({
            permissions: expect.objectContaining({
              deleteMany: expect.any(Object),
            }),
          }),
        })
      );
    });
  });

  describe('getRolePermissions', () => {
    it('should return permissions for role', async () => {
      const existingRole = {
        id: 'role1',
        name: 'CUSTOM_ROLE',
        description: 'Custom role',
        category: 'CUSTOM',
        level: 50,
        isSystem: false,
        permissions: [
          { permission: 'SYSTEM_USER_READ' },
          { permission: 'SYSTEM_USER_UPDATE' },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.role.findUnique.mockResolvedValue(existingRole);

      const result = await service.getRolePermissions('role1');

      expect(result).toEqual(['SYSTEM_USER_READ', 'SYSTEM_USER_UPDATE']);
    });

    it('should throw NotFoundException when role not found', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);

      await expect(service.getRolePermissions('invalid')).rejects.toThrow(
        NotFoundException
      );
    });
  });
});
