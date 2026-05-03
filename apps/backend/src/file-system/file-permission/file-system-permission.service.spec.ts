///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { FileSystemPermissionService } from './file-system-permission.service';
import { DatabaseService } from '../../database/database.service';
import { ProjectPermissionService } from '../../roles/project-permission.service';
import { FileTreeService } from '../file-tree/file-tree.service';
import { NotFoundException } from '@nestjs/common';
import { ProjectRole, ProjectPermission } from '../../common/enums/permissions.enum';

describe('FileSystemPermissionService', () => {
  let service: FileSystemPermissionService;

  const mockPrisma = {
    fileSystemNode: { findUnique: jest.fn() },
    projectMember: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockProjectPermissionService = {
    checkPermission: jest.fn(),
    clearUserCache: jest.fn(),
  };

  const mockFileTreeService = {
    getProjectId: jest.fn(),
    getLibraryKey: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileSystemPermissionService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: ProjectPermissionService, useValue: mockProjectPermissionService },
        { provide: FileTreeService, useValue: mockFileTreeService },
      ],
    }).compile();

    service = module.get<FileSystemPermissionService>(FileSystemPermissionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkNodePermission', () => {
    it('should check node permission successfully', async () => {
      const mockNode = {
        id: 'node1',
        deletedAt: null,
        isRoot: true,
        parentId: null,
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);
      mockProjectPermissionService.checkPermission.mockResolvedValue(true);

      const result = await service.checkNodePermission(
        'user1',
        'node1',
        ProjectPermission.FILE_OPEN
      );

      expect(mockPrisma.fileSystemNode.findUnique).toHaveBeenCalledWith({
        where: { id: 'node1' },
        select: { id: true, deletedAt: true, isRoot: true, parentId: true },
      });
      expect(mockProjectPermissionService.checkPermission).toHaveBeenCalledWith(
        'user1',
        'node1',
        ProjectPermission.FILE_OPEN
      );
      expect(result).toBe(true);
    });

    it('should throw NotFoundException if node not found', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);

      await expect(
        service.checkNodePermission(
          'user1',
          'invalid',
          ProjectPermission.FILE_OPEN
        )
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if node deleted', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'node1',
        deletedAt: new Date(),
        isRoot: true,
        parentId: null,
      });

      await expect(
        service.checkNodePermission(
          'user1',
          'node1',
          ProjectPermission.FILE_OPEN
        )
      ).rejects.toThrow(NotFoundException);
    });

    it('should use fileTreeService to get projectId if not root', async () => {
      const mockNode = {
        id: 'node1',
        deletedAt: null,
        isRoot: false,
        parentId: 'node2',
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);
      mockFileTreeService.getProjectId.mockResolvedValue('project1');
      mockProjectPermissionService.checkPermission.mockResolvedValue(true);

      await service.checkNodePermission(
        'user1',
        'node1',
        ProjectPermission.FILE_OPEN
      );

      expect(mockFileTreeService.getProjectId).toHaveBeenCalledWith('node1');
    });

    it('should return false if projectId not found', async () => {
      const mockNode = {
        id: 'node1',
        deletedAt: null,
        isRoot: false,
        parentId: 'node2',
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);
      mockFileTreeService.getProjectId.mockResolvedValue(null);

      const result = await service.checkNodePermission(
        'user1',
        'node1',
        ProjectPermission.FILE_OPEN
      );

      expect(result).toBe(false);
    });
  });

  describe('getNodeAccessRole', () => {
    it('should return owner role if user is owner', async () => {
      const mockNode = {
        id: 'node1',
        ownerId: 'user1',
        isRoot: true,
        parentId: null,
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);
      mockFileTreeService.getLibraryKey.mockResolvedValue(null);

      const result = await service.getNodeAccessRole('user1', 'node1');

      expect(result).toBe(ProjectRole.OWNER);
    });

    it('should return viewer role if it is a library node', async () => {
      const mockNode = {
        id: 'node1',
        ownerId: 'otherUser',
        isRoot: true,
        parentId: null,
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);
      mockFileTreeService.getLibraryKey.mockResolvedValue('libraryKey');

      const result = await service.getNodeAccessRole('user1', 'node1');

      expect(result).toBe(ProjectRole.VIEWER);
    });

    it('should return member role if user is project member', async () => {
      const mockNode = {
        id: 'node1',
        ownerId: 'ownerUser',
        isRoot: true,
        parentId: null,
      };
      const mockMember = {
        projectRole: { name: ProjectRole.EDITOR },
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);
      mockFileTreeService.getLibraryKey.mockResolvedValue(null);
      mockPrisma.projectMember.findUnique.mockResolvedValue(mockMember);

      const result = await service.getNodeAccessRole('user1', 'node1');

      expect(result).toBe(ProjectRole.EDITOR);
    });

    it('should return null if user is not a member', async () => {
      const mockNode = {
        id: 'node1',
        ownerId: 'ownerUser',
        isRoot: true,
        parentId: null,
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);
      mockFileTreeService.getLibraryKey.mockResolvedValue(null);
      mockPrisma.projectMember.findUnique.mockResolvedValue(null);

      const result = await service.getNodeAccessRole('user1', 'node1');

      expect(result).toBeNull();
    });

    it('should return null if node not found', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);

      const result = await service.getNodeAccessRole('user1', 'invalid');

      expect(result).toBeNull();
    });
  });

  describe('hasNodeAccessRole', () => {
    it('should return true if user has role', async () => {
      const mockNode = {
        id: 'node1',
        ownerId: 'user1',
        isRoot: true,
        parentId: null,
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);
      mockFileTreeService.getLibraryKey.mockResolvedValue(null);

      const result = await service.hasNodeAccessRole(
        'user1',
        'node1',
        [ProjectRole.OWNER, ProjectRole.ADMIN]
      );

      expect(result).toBe(true);
    });

    it('should return false if user does not have role', async () => {
      const mockNode = {
        id: 'node1',
        ownerId: 'user1',
        isRoot: true,
        parentId: null,
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);
      mockFileTreeService.getLibraryKey.mockResolvedValue(null);

      const result = await service.hasNodeAccessRole(
        'user1',
        'node1',
        [ProjectRole.EDITOR, ProjectRole.VIEWER]
      );

      expect(result).toBe(false);
    });
  });

  describe('setProjectMemberRole', () => {
    it('should set project member role', async () => {
      mockPrisma.projectMember.upsert.mockResolvedValue({
        projectId: 'project1',
        userId: 'user1',
        projectRoleId: 'role1',
      });

      await service.setProjectMemberRole(
        'project1',
        'user1',
        'role1'
      );

      expect(mockPrisma.projectMember.upsert).toHaveBeenCalled();
      expect(mockProjectPermissionService.clearUserCache).toHaveBeenCalledWith(
        'user1',
        'project1'
      );
    });
  });

  describe('removeProjectMember', () => {
    it('should remove project member', async () => {
      mockPrisma.projectMember.deleteMany.mockResolvedValue({ count: 1 });

      await service.removeProjectMember(
        'project1',
        'user1'
      );

      expect(mockPrisma.projectMember.deleteMany).toHaveBeenCalledWith({
        where: { projectId: 'project1', userId: 'user1' },
      });
      expect(mockProjectPermissionService.clearUserCache).toHaveBeenCalledWith(
        'user1',
        'project1'
      );
    });
  });

  describe('getProjectMembers', () => {
    it('should get project members', async () => {
      const mockMembers = [
        {
          userId: 'user1',
          user: { id: 'user1', email: 'user1@example.com' },
          projectRole: { id: 'role1', name: 'EDITOR' },
        },
      ];

      mockPrisma.projectMember.findMany.mockResolvedValue(mockMembers);

      const result = await service.getProjectMembers('project1');

      expect(mockPrisma.projectMember.findMany).toHaveBeenCalled();
      expect(result).toEqual(mockMembers);
    });
  });

  describe('batchAddProjectMembers', () => {
    it('should batch add project members', async () => {
      const members = [
        { userId: 'user1', projectRoleId: 'role1' },
        { userId: 'user2', projectRoleId: 'role2' },
      ];

      mockPrisma.$transaction.mockResolvedValue(undefined);

      await service.batchAddProjectMembers('project1', members);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('clearNodeCache', () => {
    it('should clear node cache', async () => {
      const mockMembers = [{ userId: 'user1' }, { userId: 'user2' }];
      const mockProject = { ownerId: 'owner1' };

      mockPrisma.projectMember.findMany.mockResolvedValue(mockMembers);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockProject);

      await service.clearNodeCache('project1');

      expect(mockProjectPermissionService.clearUserCache).toHaveBeenCalledTimes(3);
    });
  });
});
