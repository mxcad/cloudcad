///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { ProjectMemberService } from './project-member.service';
import { DatabaseService } from '../../database/database.service';
import { FileSystemPermissionService } from '../file-permission/file-system-permission.service';
import { ProjectPermissionService } from '../../roles/project-permission.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ProjectRole, ProjectPermission } from '../../common/enums/permissions.enum';

describe('ProjectMemberService', () => {
  let service: ProjectMemberService;

  const mockPrisma = {
    fileSystemNode: { findUnique: jest.fn() },
    projectMember: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    projectRole: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockPermissionService = { clearNodeCache: jest.fn() };

  const mockProjectPermissionService = { checkPermission: jest.fn() };

  const mockAuditLogService = { log: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectMemberService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: FileSystemPermissionService, useValue: mockPermissionService },
        { provide: ProjectPermissionService, useValue: mockProjectPermissionService },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<ProjectMemberService>(ProjectMemberService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getProjectMembers', () => {
    it('should get project members successfully', async () => {
      const mockProject = { id: 'project1', isRoot: true };
      const mockMembers = [
        {
          user: {
            id: 'user1',
            email: 'user1@example.com',
            username: 'user1',
            nickname: 'User 1',
            avatar: 'avatar1',
            role: 'MEMBER',
            status: 'ACTIVE',
          },
          projectRole: {
            id: 'role1',
            name: 'EDITOR',
            permissions: [],
          },
          createdAt: new Date(),
        },
      ];

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockProject);
      mockPrisma.projectMember.findMany.mockResolvedValue(mockMembers);

      const result = await service.getProjectMembers('project1');

      expect(mockPrisma.fileSystemNode.findUnique).toHaveBeenCalledWith({
        where: { id: 'project1', isRoot: true },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('user1');
    });

    it('should throw NotFoundException if project not found', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);

      await expect(service.getProjectMembers('invalid')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('addProjectMember', () => {
    it('should add project member successfully', async () => {
      const mockProject = { id: 'project1', isRoot: true, personalSpaceKey: null };
      const mockUser = { id: 'user1', email: 'user1@example.com' };
      const mockRole = { id: 'role1', name: 'EDITOR' };
      const mockMember = {
        projectId: 'project1',
        userId: 'user1',
        projectRoleId: 'role1',
        user: mockUser,
        projectRole: { permissions: [] },
      };

      mockProjectPermissionService.checkPermission.mockResolvedValue(true);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockProject);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.projectRole.findUnique.mockResolvedValue(mockRole);
      mockPrisma.projectMember.findUnique.mockResolvedValue(null);
      mockPrisma.projectMember.create.mockResolvedValue(mockMember);

      const result = await service.addProjectMember(
        'project1',
        'user1',
        'role1',
        'operator1'
      );

      expect(mockProjectPermissionService.checkPermission).toHaveBeenCalledWith(
        'operator1',
        'project1',
        ProjectPermission.PROJECT_MEMBER_MANAGE
      );
      expect(mockPrisma.projectMember.create).toHaveBeenCalled();
      expect(result.userId).toBe('user1');
    });

    it('should throw ForbiddenException if no permission', async () => {
      mockProjectPermissionService.checkPermission.mockResolvedValue(false);

      await expect(
        service.addProjectMember(
          'project1',
          'user1',
          'role1',
          'operator1'
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if project not found', async () => {
      mockProjectPermissionService.checkPermission.mockResolvedValue(true);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);

      await expect(
        service.addProjectMember(
          'project1',
          'user1',
          'role1',
          'operator1'
        )
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if personal space', async () => {
      const mockProject = {
        id: 'project1',
        isRoot: true,
        personalSpaceKey: 'personal',
      };

      mockProjectPermissionService.checkPermission.mockResolvedValue(true);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockProject);

      await expect(
        service.addProjectMember(
          'project1',
          'user1',
          'role1',
          'operator1'
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if user not found', async () => {
      const mockProject = { id: 'project1', isRoot: true, personalSpaceKey: null };

      mockProjectPermissionService.checkPermission.mockResolvedValue(true);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockProject);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.addProjectMember(
          'project1',
          'user1',
          'role1',
          'operator1'
        )
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if role not found', async () => {
      const mockProject = { id: 'project1', isRoot: true, personalSpaceKey: null };
      const mockUser = { id: 'user1', email: 'user1@example.com' };

      mockProjectPermissionService.checkPermission.mockResolvedValue(true);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockProject);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.projectRole.findUnique.mockResolvedValue(null);

      await expect(
        service.addProjectMember(
          'project1',
          'user1',
          'role1',
          'operator1'
        )
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if already member', async () => {
      const mockProject = { id: 'project1', isRoot: true, personalSpaceKey: null };
      const mockUser = { id: 'user1', email: 'user1@example.com' };
      const mockRole = { id: 'role1', name: 'EDITOR' };

      mockProjectPermissionService.checkPermission.mockResolvedValue(true);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockProject);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.projectRole.findUnique.mockResolvedValue(mockRole);
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        projectId: 'project1',
        userId: 'user1',
      });

      await expect(
        service.addProjectMember(
          'project1',
          'user1',
          'role1',
          'operator1'
        )
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateProjectMember', () => {
    it('should update project member role successfully', async () => {
      const mockProject = {
        id: 'project1',
        isRoot: true,
        personalSpaceKey: null,
        ownerId: 'owner1',
      };
      const mockRole = { id: 'role2', name: 'ADMIN' };
      const mockMember = {
        projectId: 'project1',
        userId: 'user1',
        projectRoleId: 'role1',
      };

      mockProjectPermissionService.checkPermission.mockResolvedValue(true);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockProject);
      mockPrisma.projectRole.findUnique.mockResolvedValue(mockRole);
      mockPrisma.projectMember.findUnique.mockResolvedValue(mockMember);
      mockPrisma.projectMember.update.mockResolvedValue({
        ...mockMember,
        projectRoleId: 'role2',
      });

      const result = await service.updateProjectMember(
        'project1',
        'user1',
        'role2',
        'operator1'
      );

      expect(result).toBeDefined();
    });

    it('should throw ForbiddenException if no permission', async () => {
      mockProjectPermissionService.checkPermission.mockResolvedValue(false);

      await expect(
        service.updateProjectMember(
          'project1',
          'user1',
          'role1',
          'operator1'
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if project not found', async () => {
      mockProjectPermissionService.checkPermission.mockResolvedValue(true);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);

      await expect(
        service.updateProjectMember(
          'project1',
          'user1',
          'role1',
          'operator1'
        )
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if personal space', async () => {
      const mockProject = {
        id: 'project1',
        isRoot: true,
        personalSpaceKey: 'personal',
        ownerId: 'owner1',
      };

      mockProjectPermissionService.checkPermission.mockResolvedValue(true);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockProject);

      await expect(
        service.updateProjectMember(
          'project1',
          'user1',
          'role1',
          'operator1'
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if updating owner', async () => {
      const mockProject = {
        id: 'project1',
        isRoot: true,
        personalSpaceKey: null,
        ownerId: 'user1',
      };

      mockProjectPermissionService.checkPermission.mockResolvedValue(true);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockProject);

      await expect(
        service.updateProjectMember(
          'project1',
          'user1',
          'role1',
          'operator1'
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if role not found', async () => {
      const mockProject = {
        id: 'project1',
        isRoot: true,
        personalSpaceKey: null,
        ownerId: 'owner1',
      };

      mockProjectPermissionService.checkPermission.mockResolvedValue(true);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockProject);
      mockPrisma.projectRole.findUnique.mockResolvedValue(null);

      await expect(
        service.updateProjectMember(
          'project1',
          'user1',
          'role1',
          'operator1'
        )
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if setting owner role', async () => {
      const mockProject = {
        id: 'project1',
        isRoot: true,
        personalSpaceKey: null,
        ownerId: 'owner1',
      };
      const mockRole = { id: 'role1', name: ProjectRole.OWNER };

      mockProjectPermissionService.checkPermission.mockResolvedValue(true);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockProject);
      mockPrisma.projectRole.findUnique.mockResolvedValue(mockRole);

      await expect(
        service.updateProjectMember(
          'project1',
          'user1',
          'role1',
          'operator1'
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if member not found', async () => {
      const mockProject = {
        id: 'project1',
        isRoot: true,
        personalSpaceKey: null,
        ownerId: 'owner1',
      };
      const mockRole = { id: 'role1', name: 'EDITOR' };

      mockProjectPermissionService.checkPermission.mockResolvedValue(true);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockProject);
      mockPrisma.projectRole.findUnique.mockResolvedValue(mockRole);
      mockPrisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.updateProjectMember(
          'project1',
          'user1',
          'role1',
          'operator1'
        )
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeProjectMember', () => {
    it('should remove project member successfully', async () => {
      const mockProject = {
        id: 'project1',
        isRoot: true,
        personalSpaceKey: null,
        ownerId: 'owner1',
      };

      mockProjectPermissionService.checkPermission.mockResolvedValue(true);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockProject);
      mockPrisma.projectMember.delete.mockResolvedValue(undefined);

      const result = await service.removeProjectMember(
        'project1',
        'user1',
        'operator1'
      );

      expect(result).toEqual({ message: '成员移除成功' });
    });

    it('should throw ForbiddenException if no permission', async () => {
      mockProjectPermissionService.checkPermission.mockResolvedValue(false);

      await expect(
        service.removeProjectMember(
          'project1',
          'user1',
          'operator1'
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if project not found', async () => {
      mockProjectPermissionService.checkPermission.mockResolvedValue(true);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);

      await expect(
        service.removeProjectMember(
          'project1',
          'user1',
          'operator1'
        )
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if personal space', async () => {
      const mockProject = {
        id: 'project1',
        isRoot: true,
        personalSpaceKey: 'personal',
        ownerId: 'owner1',
      };

      mockProjectPermissionService.checkPermission.mockResolvedValue(true);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockProject);

      await expect(
        service.removeProjectMember(
          'project1',
          'user1',
          'operator1'
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if removing owner', async () => {
      const mockProject = {
        id: 'project1',
        isRoot: true,
        personalSpaceKey: null,
        ownerId: 'user1',
      };

      mockProjectPermissionService.checkPermission.mockResolvedValue(true);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockProject);

      await expect(
        service.removeProjectMember(
          'project1',
          'user1',
          'operator1'
        )
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('transferProjectOwnership', () => {
    it('should transfer project ownership successfully', async () => {
      const mockProject = {
        id: 'project1',
        isRoot: true,
        personalSpaceKey: null,
        ownerId: 'currentOwner',
      };
      const mockNewOwnerMember = {
        projectId: 'project1',
        userId: 'newOwner',
      };
      const mockOwnerRole = { id: 'ownerRole', name: 'PROJECT_OWNER' };
      const mockAdminRole = { id: 'adminRole', name: 'PROJECT_ADMIN' };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockProject);
      mockPrisma.projectMember.findUnique.mockResolvedValue(
        mockNewOwnerMember
      );
      mockPrisma.projectRole.findFirst.mockResolvedValueOnce(
        mockOwnerRole
      ).mockResolvedValueOnce(mockAdminRole);

      const result = await service.transferProjectOwnership(
        'project1',
        'newOwner',
        'currentOwner'
      );

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual({ message: '项目所有权转让成功' });
    });

    it('should throw NotFoundException if project not found', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);

      await expect(
        service.transferProjectOwnership(
          'project1',
          'newOwner',
          'currentOwner'
        )
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if personal space', async () => {
      const mockProject = {
        id: 'project1',
        isRoot: true,
        personalSpaceKey: 'personal',
        ownerId: 'currentOwner',
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockProject);

      await expect(
        service.transferProjectOwnership(
          'project1',
          'newOwner',
          'currentOwner'
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if not owner', async () => {
      const mockProject = {
        id: 'project1',
        isRoot: true,
        personalSpaceKey: null,
        ownerId: 'otherOwner',
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockProject);

      await expect(
        service.transferProjectOwnership(
          'project1',
          'newOwner',
          'currentOwner'
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if transfer to self', async () => {
      const mockProject = {
        id: 'project1',
        isRoot: true,
        personalSpaceKey: null,
        ownerId: 'currentOwner',
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockProject);

      await expect(
        service.transferProjectOwnership(
          'project1',
          'currentOwner',
          'currentOwner'
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if new owner not member', async () => {
      const mockProject = {
        id: 'project1',
        isRoot: true,
        personalSpaceKey: null,
        ownerId: 'currentOwner',
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockProject);
      mockPrisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.transferProjectOwnership(
          'project1',
          'newOwner',
          'currentOwner'
        )
      ).rejects.toThrow(BadRequestException);
    });
  });
});
