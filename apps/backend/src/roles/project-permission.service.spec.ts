///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { ProjectPermissionService } from './project-permission.service';
import { DatabaseService } from '../database/database.service';
import { ProjectRolesService } from './project-roles.service';
import { PermissionCacheService } from '../common/services/permission-cache.service';
import { ProjectPermission, ProjectRole } from '../common/enums/permissions.enum';

describe('ProjectPermissionService', () => {
  let service: ProjectPermissionService;

  const mockPrisma = {
    fileSystemNode: {
      findUnique: jest.fn(),
    },
    projectMember: {
      findUnique: jest.fn(),
    },
  };

  const mockProjectRolesService = {};

  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectPermissionService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: ProjectRolesService, useValue: mockProjectRolesService },
        { provide: PermissionCacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<ProjectPermissionService>(ProjectPermissionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkPermission', () => {
    it('should return cached permission value when available', async () => {
      mockCacheService.get.mockResolvedValue(true);

      const result = await service.checkPermission(
        'user1',
        'project1',
        ProjectPermission.PROJECT_UPDATE
      );

      expect(mockCacheService.get).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should check permission from database when cache miss', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        projectRole: {
          permissions: [
            { permission: ProjectPermission.PROJECT_UPDATE },
            { permission: ProjectPermission.PROJECT_UPDATE },
          ],
        },
      });

      const result = await service.checkPermission(
        'user1',
        'project1',
        ProjectPermission.PROJECT_UPDATE
      );

      expect(mockCacheService.set).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when permission not found', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        projectRole: {
          permissions: [{ permission: ProjectPermission.PROJECT_UPDATE }],
        },
      });

      const result = await service.checkPermission(
        'user1',
        'project1',
        ProjectPermission.PROJECT_DELETE
      );

      expect(result).toBe(false);
    });

    it('should return false when user not in project', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockPrisma.projectMember.findUnique.mockResolvedValue(null);

      const result = await service.checkPermission(
        'user1',
        'project1',
        ProjectPermission.PROJECT_UPDATE
      );

      expect(result).toBe(false);
    });
  });

  describe('isProjectOwner', () => {
    it('should return true when user is project owner', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        ownerId: 'user1',
      });

      const result = await service.isProjectOwner('user1', 'project1');

      expect(mockCacheService.set).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when user is not project owner', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        ownerId: 'other-user',
      });

      const result = await service.isProjectOwner('user1', 'project1');

      expect(result).toBe(false);
    });

    it('should return cached value when available', async () => {
      mockCacheService.get.mockResolvedValue(true);

      const result = await service.isProjectOwner('user1', 'project1');

      expect(mockCacheService.get).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe('getUserPermissions', () => {
    it('should return permissions for user in project', async () => {
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        projectRole: {
          permissions: [
            { permission: ProjectPermission.PROJECT_UPDATE },
            { permission: ProjectPermission.PROJECT_UPDATE },
            { permission: ProjectPermission.FILE_READ },
          ],
        },
      });

      const result = await service.getUserPermissions('user1', 'project1');

      expect(result).toEqual([
        ProjectPermission.PROJECT_UPDATE,
        ProjectPermission.PROJECT_UPDATE,
        ProjectPermission.FILE_READ,
      ]);
    });

    it('should return empty array when user not in project', async () => {
      mockPrisma.projectMember.findUnique.mockResolvedValue(null);

      const result = await service.getUserPermissions('user1', 'project1');

      expect(result).toEqual([]);
    });

    it('should return empty array when project role not found', async () => {
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        projectRole: null,
      });

      const result = await service.getUserPermissions('user1', 'project1');

      expect(result).toEqual([]);
    });
  });

  describe('getUserRole', () => {
    it('should return user role in project', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        projectRole: { name: ProjectRole.EDITOR },
      });

      const result = await service.getUserRole('user1', 'project1');

      expect(mockCacheService.set).toHaveBeenCalled();
      expect(result).toBe(ProjectRole.EDITOR);
    });

    it('should return cached role when available', async () => {
      mockCacheService.get.mockResolvedValue(ProjectRole.ADMIN);

      const result = await service.getUserRole('user1', 'project1');

      expect(result).toBe(ProjectRole.ADMIN);
    });

    it('should return null when user not in project', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockPrisma.projectMember.findUnique.mockResolvedValue(null);

      const result = await service.getUserRole('user1', 'project1');

      expect(result).toBeNull();
    });

    it('should return null when project role not found', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        projectRole: null,
      });

      const result = await service.getUserRole('user1', 'project1');

      expect(result).toBeNull();
    });
  });

  describe('hasRole', () => {
    it('should return true when user has specified role', async () => {
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        projectRole: { name: ProjectRole.EDITOR },
      });

      const result = await service.hasRole('user1', 'project1', [
        ProjectRole.EDITOR,
        ProjectRole.ADMIN,
      ]);

      expect(result).toBe(true);
    });

    it('should return false when user does not have specified role', async () => {
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        projectRole: { name: ProjectRole.VIEWER },
      });

      const result = await service.hasRole('user1', 'project1', [
        ProjectRole.EDITOR,
        ProjectRole.ADMIN,
      ]);

      expect(result).toBe(false);
    });
  });

  describe('isProjectMember', () => {
    it('should return true when user is project owner', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        ownerId: 'user1',
      });

      const result = await service.isProjectMember('user1', 'project1');

      expect(result).toBe(true);
    });

    it('should return true when user is project member', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        ownerId: 'other-user',
      });
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        id: 'member1',
      });

      const result = await service.isProjectMember('user1', 'project1');

      expect(result).toBe(true);
    });

    it('should return false when user is not project member', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        ownerId: 'other-user',
      });
      mockPrisma.projectMember.findUnique.mockResolvedValue(null);

      const result = await service.isProjectMember('user1', 'project1');

      expect(result).toBe(false);
    });
  });

  describe('clearUserCache', () => {
    it('should clear all relevant cache keys', async () => {
      await service.clearUserCache('user1', 'project1');

      expect(mockCacheService.delete).toHaveBeenCalledWith(
        'project:owner:user1:project1'
      );
      expect(mockCacheService.delete).toHaveBeenCalledWith(
        'project:role:user1:project1'
      );
    });
  });

  describe('checkAnyPermission', () => {
    it('should return true when user has any of the permissions', async () => {
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        projectRole: {
          permissions: [{ permission: ProjectPermission.PROJECT_UPDATE }],
        },
      });

      const result = await service.checkAnyPermission('user1', 'project1', [
        ProjectPermission.PROJECT_UPDATE,
        ProjectPermission.PROJECT_UPDATE,
        ProjectPermission.PROJECT_DELETE,
      ]);

      expect(result).toBe(true);
    });

    it('should return false when user has none of the permissions', async () => {
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        projectRole: {
          permissions: [{ permission: ProjectPermission.PROJECT_UPDATE }],
        },
      });

      const result = await service.checkAnyPermission('user1', 'project1', [
        ProjectPermission.PROJECT_UPDATE,
        ProjectPermission.PROJECT_DELETE,
      ]);

      expect(result).toBe(false);
    });
  });

  describe('checkAllPermissions', () => {
    it('should return true when user has all permissions', async () => {
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        projectRole: {
          permissions: [
            { permission: ProjectPermission.PROJECT_UPDATE },
            { permission: ProjectPermission.PROJECT_UPDATE },
          ],
        },
      });

      const result = await service.checkAllPermissions('user1', 'project1', [
        ProjectPermission.PROJECT_UPDATE,
        ProjectPermission.PROJECT_UPDATE,
      ]);

      expect(result).toBe(true);
    });

    it('should return false when user missing one permission', async () => {
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        projectRole: {
          permissions: [{ permission: ProjectPermission.PROJECT_UPDATE }],
        },
      });

      const result = await service.checkAllPermissions('user1', 'project1', [
        ProjectPermission.PROJECT_UPDATE,
        ProjectPermission.PROJECT_UPDATE,
      ]);

      expect(result).toBe(false);
    });
  });
});
