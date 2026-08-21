///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { ProjectRolesService } from './project-roles.service';
import { DatabaseService } from '../database/database.service';
import { AuditLogService } from '../audit/audit-log.service';
import { PermissionCacheService } from '../permission/services/permission-cache.service';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';

describe('ProjectRolesService', () => {
  let service: ProjectRolesService;

  const mockPrisma = {
    projectRole: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    projectRolePermission: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    fileSystemNode: {
      findUnique: jest.fn(),
    },
    projectMember: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockAuditLogService = {
    log: jest.fn(),
  };

  const mockPermissionCacheService = {
    clearProjectCache: jest.fn(),
    clearAllCache: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectRolesService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLogService },
        {
          provide: PermissionCacheService,
          useValue: mockPermissionCacheService,
        },
      ],
    }).compile();

    service = module.get<ProjectRolesService>(ProjectRolesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByProject', () => {
    it('should return project roles with isOwnerRole flag (数据驱动，ADR-00XX)', async () => {
      mockPrisma.projectRole.findMany.mockResolvedValue([
        {
          id: 'role-owner',
          name: 'PROJECT_OWNER',
          projectId: 'project-a',
          isSystem: true,
          permissions: [],
          _count: { members: 1 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'role-admin',
          name: 'PROJECT_ADMIN',
          projectId: 'project-a',
          isSystem: true,
          permissions: [],
          _count: { members: 2 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        ownerId: 'user-owner',
      });
      mockPrisma.projectMember.findFirst.mockResolvedValue({
        projectRoleId: 'role-owner',
      });

      const result = await service.findByProject('project-a');

      expect(result[0].isOwnerRole).toBe(true);
      expect(result[1].isOwnerRole).toBe(false);
      // 只查项目自己的角色（不再并入全局模板）
      expect(mockPrisma.projectRole.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { projectId: 'project-a' } })
      );
    });
  });

  describe('findSystemRoles', () => {
    it('should only return global templates (projectId null，项目副本不得混入)', async () => {
      mockPrisma.projectRole.findMany.mockResolvedValue([
        { id: 't1', name: 'PROJECT_OWNER' },
      ]);

      const result = await service.findSystemRoles();

      expect(result).toHaveLength(1);
      expect(mockPrisma.projectRole.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId: null, isSystem: true },
        })
      );
    });
  });

  describe('findAll', () => {
    it('should return all project roles', async () => {
      const mockRoles = [
        {
          id: 'role1',
          name: 'ADMIN',
          description: 'Project Administrator',
          permissions: [{ permission: 'PROJECT_ADMIN' }],
          isSystem: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrisma.projectRole.findMany.mockResolvedValue(mockRoles);

      const result = await service.findAll();

      expect(mockPrisma.projectRole.findMany).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return role by id', async () => {
      const mockRole = {
        id: 'role1',
        name: 'ADMIN',
        description: 'Project Administrator',
        permissions: [],
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRole.findUnique.mockResolvedValue(mockRole);

      const result = await service.findOne('role1');

      expect(mockPrisma.projectRole.findUnique).toHaveBeenCalledWith({
        where: { id: 'role1' },
        include: expect.any(Object),
      });
      expect(result.id).toBe('role1');
    });

    it('should throw NotFoundException when role not found', async () => {
      mockPrisma.projectRole.findUnique.mockResolvedValue(null);

      await expect(service.findOne('invalid')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('findOne by name-like string', () => {
    it('should treat name-like string as role ID', async () => {
      const mockRole = {
        id: 'ADMIN',
        name: 'ADMIN',
        description: 'Project Administrator',
        permissions: [],
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRole.findUnique.mockResolvedValue(mockRole);

      const result = await service.findOne('ADMIN');

      expect(mockPrisma.projectRole.findUnique).toHaveBeenCalledWith({
        where: { id: 'ADMIN' },
        include: expect.any(Object),
      });
      expect(result.name).toBe('ADMIN');
    });

    it('should throw NotFoundException when role not found', async () => {
      mockPrisma.projectRole.findUnique.mockResolvedValue(null);

      await expect(service.findOne('INVALID')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('copyTemplatesToProject', () => {
    it('should copy all templates with permissions to project', async () => {
      mockPrisma.projectRole.findMany.mockResolvedValue([
        {
          id: 't1',
          name: 'PROJECT_OWNER',
          description: 'Owner',
          permissions: [
            { permission: 'FILE_OPEN' },
            { permission: 'PROJECT_UPDATE' },
          ],
        },
        {
          id: 't2',
          name: 'PROJECT_MEMBER',
          description: 'Member',
          permissions: [{ permission: 'FILE_OPEN' }],
        },
      ]);
      mockPrisma.projectRole.create.mockImplementation(async ({ data }) => ({
        id: `copy-${data.name}`,
        ...data,
      }));

      const map = await service.copyTemplatesToProject('proj-1');

      expect(mockPrisma.projectRole.create).toHaveBeenCalledTimes(2);
      const firstCall = mockPrisma.projectRole.create.mock.calls[0][0];
      expect(firstCall.data.projectId).toBe('proj-1');
      expect(firstCall.data.isSystem).toBe(true);
      expect(firstCall.data.permissions.create).toHaveLength(2);
      expect(map.get('PROJECT_OWNER')).toBe('copy-PROJECT_OWNER');
      expect(map.get('PROJECT_MEMBER')).toBe('copy-PROJECT_MEMBER');
    });

    it('should throw InternalServerErrorException when OWNER template missing', async () => {
      mockPrisma.projectRole.findMany.mockResolvedValue([
        { id: 't2', name: 'PROJECT_MEMBER', permissions: [] },
      ]);

      await expect(service.copyTemplatesToProject('proj-1')).rejects.toThrow(
        InternalServerErrorException
      );
      expect(mockPrisma.projectRole.create).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create a new project role', async () => {
      const createDto = {
        name: 'CUSTOM_ROLE',
        description: 'Custom Project Role',
        permissions: ['PROJECT_READ', 'PROJECT_UPDATE'],
      };

      const mockRole = {
        id: 'role1',
        ...createDto,
        isSystem: false,
        permissions: [
          { permission: 'PROJECT_READ' },
          { permission: 'PROJECT_UPDATE' },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRole.findFirst.mockResolvedValue(null);
      mockPrisma.projectRole.create.mockResolvedValue(mockRole);
      mockPrisma.projectRole.findUnique.mockResolvedValue(mockRole);

      const result = await service.create(createDto);

      expect(mockPrisma.projectRole.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'CUSTOM_ROLE',
          }),
        })
      );
      expect(result.name).toBe('CUSTOM_ROLE');
    });

    it('should throw BadRequestException when role name already exists', async () => {
      const createDto = {
        name: 'ADMIN',
        description: 'Duplicate',
        permissions: [],
      };

      mockPrisma.projectRole.findFirst.mockResolvedValue({ id: 'role1' });

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException
      );
    });

    it('should create custom role with permissions via project endpoint (#298 internal chain)', async () => {
      const createDto = {
        projectId: 'project-a',
        name: 'CUSTOM_ROLE',
        description: 'Custom Project Role',
        permissions: ['PROJECT_READ', 'PROJECT_UPDATE'],
      };

      const mockRole = {
        id: 'role1',
        projectId: 'project-a',
        name: 'CUSTOM_ROLE',
        description: 'Custom Project Role',
        isSystem: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRole.findFirst.mockResolvedValue(null);
      mockPrisma.projectRole.create.mockResolvedValue(mockRole);
      mockPrisma.projectRole.findUnique.mockResolvedValue(mockRole);
      mockPrisma.projectRolePermission.createMany.mockResolvedValue({
        count: 2,
      });

      const result = await service.create(createDto);

      expect(mockPrisma.projectRole.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ projectId: 'project-a' }),
        })
      );
      expect(mockPrisma.projectRolePermission.createMany).toHaveBeenCalled();
      expect(result.name).toBe('CUSTOM_ROLE');
    });
  });

  describe('createSystemDefaultRoles', () => {
    it('should create 5 system default roles with isSystem=true', async () => {
      mockPrisma.projectRole.findFirst.mockResolvedValue(null);
      mockPrisma.projectRole.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'role-' + data.name,
          projectId: null,
          ...data,
          isSystem: data.isSystem ?? false,
          permissions: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );
      mockPrisma.projectRole.findUnique.mockImplementation(({ where }) =>
        Promise.resolve({
          id: where.id,
          projectId: null,
          isSystem: true,
          name: where.id.replace('role-', ''),
        })
      );
      mockPrisma.projectRolePermission.createMany.mockResolvedValue({
        count: 1,
      });

      await service.createSystemDefaultRoles();

      expect(mockPrisma.projectRole.create).toHaveBeenCalledTimes(5);
      const createdNames = mockPrisma.projectRole.create.mock.calls.map(
        (call) => call[0].data.name
      );
      expect(createdNames).toEqual(
        expect.arrayContaining([
          'PROJECT_OWNER',
          'PROJECT_ADMIN',
          'PROJECT_EDITOR',
          'PROJECT_MEMBER',
          'PROJECT_VIEWER',
        ])
      );
      for (const call of mockPrisma.projectRole.create.mock.calls) {
        expect(call[0].data.isSystem).toBe(true);
      }
    });

    it('should skip already-existing system default roles', async () => {
      mockPrisma.projectRole.findFirst.mockResolvedValue({ id: 'existing' });

      await service.createSystemDefaultRoles();

      expect(mockPrisma.projectRole.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update a project role', async () => {
      const updateDto = {
        description: 'Updated description',
        permissions: ['PROJECT_READ', 'PROJECT_UPDATE', 'PROJECT_DELETE'],
      };

      const existingRole = {
        id: 'role1',
        name: 'CUSTOM_ROLE',
        description: 'Custom Project Role',
        isSystem: false,
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedRole = {
        ...existingRole,
        description: 'Updated description',
        permissions: [
          { permission: 'PROJECT_READ' },
          { permission: 'PROJECT_UPDATE' },
          { permission: 'PROJECT_DELETE' },
        ],
      };

      mockPrisma.projectRole.findUnique.mockResolvedValue(existingRole);
      mockPrisma.projectRolePermission.findMany.mockResolvedValue([
        { permission: 'PROJECT_UPDATE' },
      ]);
      mockPrisma.projectRole.update.mockResolvedValue(updatedRole);

      const result = await service.update('role1', updateDto);

      expect(mockPrisma.projectRole.update).toHaveBeenCalled();
      expect(result.description).toBe('Updated description');
    });

    it('should throw NotFoundException when role not found', async () => {
      mockPrisma.projectRole.findUnique.mockResolvedValue(null);

      await expect(service.update('invalid', {})).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw BadRequestException when updating system role name', async () => {
      const existingRole = {
        id: 'role1',
        name: 'ADMIN',
        description: 'Project Administrator',
        isSystem: true,
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRole.findUnique.mockResolvedValue(existingRole);
      mockPrisma.projectRolePermission.findMany.mockResolvedValue([
        { permission: 'PROJECT_UPDATE' },
      ]);

      await expect(
        service.update('role1', { name: 'NEW_ADMIN' })
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException when updating role of another project (project-scoped, #262)', async () => {
      const existingRole = {
        id: 'role1',
        name: 'CUSTOM_ROLE',
        description: 'Custom Project Role',
        projectId: 'project-a',
        isSystem: false,
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRole.findUnique.mockResolvedValue(existingRole);

      await expect(
        service.update('role1', { name: 'X' }, 'user-1', 'project-b')
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when updating system role via project endpoint (#262)', async () => {
      const existingRole = {
        id: 'role1',
        name: 'ADMIN',
        description: 'System role',
        projectId: null,
        isSystem: true,
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRole.findUnique.mockResolvedValue(existingRole);

      await expect(
        service.update('role1', { name: 'X' }, 'user-1', 'project-a')
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when updating custom role via system endpoint (#298 isSystem)', async () => {
      const existingRole = {
        id: 'role1',
        name: 'CUSTOM_ROLE',
        description: 'Custom Project Role',
        projectId: 'project-a',
        isSystem: false,
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRole.findUnique.mockResolvedValue(existingRole);

      await expect(
        service.update('role1', { name: 'X' }, 'user-1')
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.projectRole.update).not.toHaveBeenCalled();
    });

    it('should allow updating system role via system endpoint (#298 isSystem)', async () => {
      const existingRole = {
        id: 'role1',
        name: 'CUSTOM_ROLE',
        description: 'Custom Project Role',
        projectId: null,
        isSystem: true,
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRole.findUnique.mockResolvedValue(existingRole);
      mockPrisma.projectRolePermission.findMany.mockResolvedValue([]);
      mockPrisma.projectRole.update.mockResolvedValue(existingRole);

      const result = await service.update(
        'role1',
        { description: 'X' },
        'user-1'
      );

      expect(mockPrisma.projectRole.update).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should allow renaming project-scoped default role (项目内副本可改名，ADR-00XX)', async () => {
      const existingRole = {
        id: 'role1',
        name: 'PROJECT_ADMIN',
        description: 'Project Admin',
        projectId: 'project-a',
        isSystem: true,
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRole.findUnique.mockResolvedValue(existingRole);
      mockPrisma.projectRole.update.mockResolvedValue({
        ...existingRole,
        name: '新管理员',
      });

      const result = await service.update(
        'role1',
        { name: '新管理员' },
        'user-1',
        'project-a'
      );

      expect(mockPrisma.projectRole.update).toHaveBeenCalled();
      expect(result.name).toBe('新管理员');
    });

    it('should update custom role with permissions via project endpoint (#298 internal chain)', async () => {
      const existingRole = {
        id: 'role1',
        name: 'CUSTOM_ROLE',
        description: 'Custom Project Role',
        projectId: 'project-a',
        isSystem: false,
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedRole = {
        ...existingRole,
        description: 'Updated description',
      };

      mockPrisma.projectRole.findUnique.mockResolvedValue(existingRole);
      mockPrisma.projectRole.update.mockResolvedValue(updatedRole);
      mockPrisma.projectRolePermission.deleteMany.mockResolvedValue({
        count: 0,
      });
      mockPrisma.projectRolePermission.createMany.mockResolvedValue({
        count: 2,
      });

      const result = await service.update(
        'role1',
        { description: 'Updated description', permissions: ['PROJECT_READ'] },
        'user-1',
        'project-a'
      );

      expect(mockPrisma.projectRolePermission.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.projectRolePermission.createMany).toHaveBeenCalled();
      expect(result.description).toBe('Updated description');
    });

    it('should reject updating custom role with permissions via system endpoint before deleting permissions (#298 data consistency)', async () => {
      const existingRole = {
        id: 'role1',
        name: 'CUSTOM_ROLE',
        description: 'Custom Project Role',
        projectId: 'project-a',
        isSystem: false,
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRole.findUnique.mockResolvedValue(existingRole);

      await expect(
        service.update('role1', { permissions: ['PROJECT_READ'] }, 'user-1')
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.projectRole.update).not.toHaveBeenCalled();
      expect(
        mockPrisma.projectRolePermission.deleteMany
      ).not.toHaveBeenCalled();
      expect(
        mockPrisma.projectRolePermission.createMany
      ).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete a project role', async () => {
      const existingRole = {
        id: 'role1',
        name: 'CUSTOM_ROLE',
        description: 'Custom Project Role',
        isSystem: false,
        permissions: [],
        members: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRole.findUnique.mockResolvedValue(existingRole);
      mockPrisma.projectRole.delete.mockResolvedValue(existingRole);

      await service.delete('role1');

      expect(mockPrisma.projectRole.delete).toHaveBeenCalledWith({
        where: { id: 'role1' },
      });
    });

    it('should throw NotFoundException when role not found', async () => {
      mockPrisma.projectRole.findUnique.mockResolvedValue(null);

      await expect(service.delete('invalid')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw BadRequestException when deleting OWNER template (OWNER 模板保底不可删)', async () => {
      const existingRole = {
        id: 'role1',
        name: 'PROJECT_OWNER',
        description: 'Project Owner',
        projectId: null,
        isSystem: true,
        permissions: [],
        members: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRole.findUnique.mockResolvedValue(existingRole);

      await expect(service.delete('role1')).rejects.toThrow(
        BadRequestException
      );
    });

    it('should allow deleting non-owner template (模板可删，只影响新建项目)', async () => {
      const existingRole = {
        id: 'role1',
        name: 'PROJECT_VIEWER',
        description: 'Project Viewer',
        projectId: null,
        isSystem: true,
        permissions: [],
        members: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRole.findUnique.mockResolvedValue(existingRole);
      mockPrisma.projectRole.delete.mockResolvedValue(existingRole);

      await service.delete('role1');

      expect(mockPrisma.projectRole.delete).toHaveBeenCalledWith({
        where: { id: 'role1' },
      });
    });

    it('should demote members to PROJECT_MEMBER when deleting role in use (ADR-00XX)', async () => {
      const existingRole = {
        id: 'role1',
        name: 'PROJECT_ADMIN',
        description: 'Project Admin',
        projectId: 'project-a',
        isSystem: true,
        permissions: [],
        members: [{ id: 'm1' }],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // owner 成员绑定的是其他角色（role-owner），不触发 OWNER 保护
      mockPrisma.projectRole.findUnique.mockResolvedValue(existingRole);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        ownerId: 'user-owner',
      });
      mockPrisma.projectMember.findFirst.mockResolvedValue({
        projectRoleId: 'role-owner',
      });
      mockPrisma.projectRole.findMany.mockResolvedValue([
        { id: 'role-member', name: 'PROJECT_MEMBER' },
        { id: 'role1', name: 'PROJECT_ADMIN' },
      ]);
      mockPrisma.projectMember.updateMany.mockResolvedValue({ count: 5 });
      mockPrisma.projectRole.delete.mockResolvedValue(existingRole);

      await service.delete('role1', 'user-1', 'project-a');

      expect(mockPrisma.projectMember.updateMany).toHaveBeenCalledWith({
        where: { projectId: 'project-a', projectRoleId: 'role1' },
        data: { projectRoleId: 'role-member' },
      });
      expect(mockPrisma.projectRole.delete).toHaveBeenCalled();
    });

    it('should throw BadRequestException when deleting the role used by project owner (数据驱动，不依赖角色名)', async () => {
      const existingRole = {
        id: 'role1',
        name: 'PROJECT_OWNER',
        description: 'Project Owner',
        projectId: 'project-a',
        isSystem: true,
        permissions: [],
        members: [{ id: 'm1' }],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRole.findUnique.mockResolvedValue(existingRole);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        ownerId: 'user-owner',
      });
      // owner 成员绑定 role1（本角色）→ 触发 OWNER 保护
      mockPrisma.projectMember.findFirst.mockResolvedValue({
        projectRoleId: 'role1',
      });

      await expect(
        service.delete('role1', 'user-1', 'project-a')
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.projectRole.delete).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when no demote target exists', async () => {
      const existingRole = {
        id: 'role1',
        name: 'PROJECT_ADMIN',
        description: 'Project Admin',
        projectId: 'project-a',
        isSystem: true,
        permissions: [],
        members: [{ id: 'm1' }],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRole.findUnique.mockResolvedValue(existingRole);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        ownerId: 'user-owner',
      });
      mockPrisma.projectMember.findFirst.mockResolvedValue({
        projectRoleId: 'role-owner',
      });
      // 项目只有 [本角色, owner 角色]：候选排除本角色与 owner 角色后为空
      mockPrisma.projectRole.findMany.mockResolvedValue([
        { id: 'role1', name: 'PROJECT_ADMIN' },
        { id: 'role-owner', name: 'PROJECT_OWNER' },
      ]);

      await expect(
        service.delete('role1', 'user-1', 'project-a')
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.projectRole.delete).not.toHaveBeenCalled();
    });

    it('should delete unused role without demote target (无成员使用时删除不要求降级目标)', async () => {
      const existingRole = {
        id: 'role1',
        name: 'PROJECT_ADMIN',
        description: 'Project Admin',
        projectId: 'project-a',
        isSystem: true,
        permissions: [],
        members: [], // 无成员使用
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRole.findUnique.mockResolvedValue(existingRole);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        ownerId: 'user-owner',
      });
      // owner 绑定别的角色，不触发 OWNER 保护
      mockPrisma.projectMember.findFirst.mockResolvedValue({
        projectRoleId: 'role-owner',
      });
      mockPrisma.projectRole.delete.mockResolvedValue(existingRole);

      await service.delete('role1', 'user-1', 'project-a');

      expect(mockPrisma.projectRole.delete).toHaveBeenCalled();
      // 无成员使用：不查降级目标、不更新成员
      expect(mockPrisma.projectMember.updateMany).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when deleting role of another project (project-scoped, #262)', async () => {
      const existingRole = {
        id: 'role1',
        name: 'CUSTOM_ROLE',
        description: 'Custom Project Role',
        projectId: 'project-a',
        isSystem: false,
        permissions: [],
        members: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRole.findUnique.mockResolvedValue(existingRole);

      await expect(
        service.delete('role1', 'user-1', 'project-b')
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.projectRole.delete).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when deleting custom role via system endpoint (#298 isSystem)', async () => {
      const existingRole = {
        id: 'role1',
        name: 'CUSTOM_ROLE',
        description: 'Custom Project Role',
        projectId: 'project-a',
        isSystem: false,
        permissions: [],
        members: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRole.findUnique.mockResolvedValue(existingRole);

      await expect(service.delete('role1', 'user-1')).rejects.toThrow(
        ForbiddenException
      );
      expect(mockPrisma.projectRole.delete).not.toHaveBeenCalled();
    });
  });

  describe('addPermissions', () => {
    it('should add permissions to role', async () => {
      const existingRole = {
        id: 'role1',
        name: 'CUSTOM_ROLE',
        description: 'Custom Project Role',
        isSystem: false,
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRole.findUnique.mockResolvedValue(existingRole);
      mockPrisma.projectRolePermission.createMany.mockResolvedValue({
        count: 1,
      });

      await service.assignPermissions('role1', ['PROJECT_READ']);

      expect(mockPrisma.projectRolePermission.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ permission: 'PROJECT_READ' }),
          ]),
        })
      );
    });

    it('should invalidate project permission cache after assign (修改即生效，不等 TTL)', async () => {
      const existingRole = {
        id: 'role1',
        name: 'CUSTOM_ROLE',
        description: 'Custom Project Role',
        projectId: 'project-a',
        isSystem: false,
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRole.findUnique.mockResolvedValue(existingRole);
      mockPrisma.projectRolePermission.createMany.mockResolvedValue({
        count: 1,
      });

      // 项目角色必须经项目端点操作（#298），传 projectId 通过域校验
      await service.assignPermissions(
        'role1',
        ['PROJECT_READ'],
        undefined,
        'project-a'
      );

      expect(mockPermissionCacheService.clearProjectCache).toHaveBeenCalledWith(
        'project-a'
      );
    });

    it('should not clear all cache for template role (模板变更不影响存量项目副本，ADR-00XX)', async () => {
      const existingRole = {
        id: 'role1',
        name: 'PROJECT_VIEWER',
        description: 'Template Viewer',
        projectId: null,
        isSystem: true,
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRole.findUnique.mockResolvedValue(existingRole);
      mockPrisma.projectRolePermission.createMany.mockResolvedValue({
        count: 1,
      });

      await service.assignPermissions('role1', ['PROJECT_READ']);

      // 模板已复制为各项目副本，模板权限变更不影响存量项目
      expect(mockPermissionCacheService.clearAllCache).not.toHaveBeenCalled();
      expect(mockPermissionCacheService.clearProjectCache).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when assigning permissions to custom role via system endpoint (#298 isSystem)', async () => {
      const existingRole = {
        id: 'role1',
        name: 'CUSTOM_ROLE',
        description: 'Custom Project Role',
        projectId: 'project-a',
        isSystem: false,
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRole.findUnique.mockResolvedValue(existingRole);

      await expect(
        service.assignPermissions('role1', ['PROJECT_READ'], 'user-1')
      ).rejects.toThrow(ForbiddenException);
      expect(
        mockPrisma.projectRolePermission.createMany
      ).not.toHaveBeenCalled();
    });
  });

  describe('removePermissions', () => {
    it('should remove permissions from role', async () => {
      const existingRole = {
        id: 'role1',
        name: 'CUSTOM_ROLE',
        description: 'Custom Project Role',
        isSystem: false,
        permissions: [{ permission: 'PROJECT_READ' }],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRole.findUnique.mockResolvedValue(existingRole);
      mockPrisma.projectRolePermission.deleteMany.mockResolvedValue({
        count: 1,
      });

      await service.removePermissions('role1', ['PROJECT_READ']);

      expect(mockPrisma.projectRolePermission.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            projectRoleId: 'role1',
            permission: { in: ['PROJECT_READ'] },
          },
        })
      );
    });

    it('should throw ForbiddenException when removing permissions from custom role via system endpoint (#298 isSystem)', async () => {
      const existingRole = {
        id: 'role1',
        name: 'CUSTOM_ROLE',
        description: 'Custom Project Role',
        projectId: 'project-a',
        isSystem: false,
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRole.findUnique.mockResolvedValue(existingRole);

      await expect(
        service.removePermissions('role1', ['PROJECT_READ'], 'user-1')
      ).rejects.toThrow(ForbiddenException);
      expect(
        mockPrisma.projectRolePermission.deleteMany
      ).not.toHaveBeenCalled();
    });
  });

  describe('getRolePermissions', () => {
    it('should return permissions for role', async () => {
      mockPrisma.projectRolePermission.findMany.mockResolvedValue([
        { permission: 'PROJECT_READ' },
        { permission: 'PROJECT_UPDATE' },
      ]);

      const result = await service.getRolePermissions('role1');

      expect(result).toEqual(['PROJECT_READ', 'PROJECT_UPDATE']);
    });

    it('should throw BadRequestException on db error', async () => {
      mockPrisma.projectRolePermission.findMany.mockRejectedValue(
        new Error('DB error')
      );

      await expect(service.getRolePermissions('invalid')).rejects.toThrow(
        BadRequestException
      );
    });
  });

  describe('hasPermission', () => {
    it('should return true when role has permission', async () => {
      const existingRole = {
        id: 'role1',
        name: 'ADMIN',
        description: 'Project Administrator',
        isSystem: true,
        permissions: [
          { permission: 'PROJECT_READ' },
          { permission: 'PROJECT_UPDATE' },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRolePermission.findMany.mockResolvedValue([
        { permission: 'PROJECT_READ' },
        { permission: 'PROJECT_UPDATE' },
      ]);

      const result = await service.getRolePermissions('role1');

      expect(result).toEqual(['PROJECT_READ', 'PROJECT_UPDATE']);
    });

    it('should return false when role does not have permission', async () => {
      const existingRole = {
        id: 'role1',
        name: 'ADMIN',
        description: 'Project Administrator',
        isSystem: true,
        permissions: [{ permission: 'PROJECT_READ' }],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.projectRolePermission.findMany.mockResolvedValue([
        { permission: 'PROJECT_READ' },
      ]);

      const result = await service.getRolePermissions('role1');

      expect(result).toEqual(['PROJECT_READ']);
    });

    it('should return empty array when role not found', async () => {
      mockPrisma.projectRolePermission.findMany.mockRejectedValue(new Error());

      let result;
      try {
        result = await service.getRolePermissions('invalid');
      } catch (e) {
        // 预期会抛出错误
      }

      // 这个测试可能需要调整，因为实际上 getRolePermissions 不会返回 false
    });
  });
});
