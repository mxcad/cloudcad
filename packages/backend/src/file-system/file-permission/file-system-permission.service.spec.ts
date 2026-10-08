///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { NodeType } from "@cloudcad/db";
import { Test, TestingModule } from '@nestjs/testing';
import { FileSystemPermissionService } from './file-system-permission.service';
import { DatabaseService } from '../../database/database.service';
import { IPROJECT_PERMISSION_SERVICE } from '../../roles/interfaces/project-permission-service.interface';
import { IPERMISSION_SERVICE } from '../../permission/interfaces/permission-service.interface';
import { TreeWalker } from '../file-tree/tree-walker.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ProjectRole, ProjectPermission, SystemPermission } from '../../common/enums/permissions.enum';

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

	const mockTreeWalker = {
		resolveProjectId: jest.fn(),
		resolveRootContext: jest.fn(),
	};

  const mockSystemPermissionService = {
    checkSystemPermission: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileSystemPermissionService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: IPROJECT_PERMISSION_SERVICE, useValue: mockProjectPermissionService },
        { provide: TreeWalker, useValue: mockTreeWalker },
        { provide: IPERMISSION_SERVICE, useValue: mockSystemPermissionService },
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
        nodeType: NodeType.PROJECT,
        parentId: null,
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);
      // PROJECT 根经 resolveProjectId 解析为自身
      mockTreeWalker.resolveProjectId.mockResolvedValue('node1');
      mockProjectPermissionService.checkPermission.mockResolvedValue(true);

      const result = await service.checkNodePermission(
        'user1',
        'node1',
        ProjectPermission.FILE_OPEN
      );

      expect(mockPrisma.fileSystemNode.findUnique).toHaveBeenCalledWith({
        where: { id: 'node1' },
        select: { id: true, deletedAt: true, nodeType: true, parentId: true },
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

    it('should return false if node deleted', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'node1',
        deletedAt: new Date(),
        nodeType: NodeType.PROJECT,
        parentId: null,
      });

      const result = await service.checkNodePermission(
        'user1',
        'node1',
        ProjectPermission.FILE_OPEN
      );

      expect(result).toBe(false);
    });

    it('should use treeWalker to resolve projectId if not root', async () => {
      const mockNode = {
        id: 'node1',
        deletedAt: null,
        nodeType: NodeType.FILE,
        parentId: 'node2',
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);
      mockTreeWalker.resolveProjectId.mockResolvedValue('project1');
      mockProjectPermissionService.checkPermission.mockResolvedValue(true);

      await service.checkNodePermission(
        'user1',
        'node1',
        ProjectPermission.FILE_OPEN
      );

      expect(mockTreeWalker.resolveProjectId).toHaveBeenCalledWith('node1');
    });

    it('should return false if projectId not found', async () => {
      const mockNode = {
        id: 'node1',
        deletedAt: null,
        nodeType: NodeType.FILE,
        parentId: 'node2',
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);
      mockTreeWalker.resolveProjectId.mockResolvedValue(null);

      const result = await service.checkNodePermission(
        'user1',
        'node1',
        ProjectPermission.FILE_OPEN
      );

      expect(result).toBe(false);
    });
  });

  describe('assertNodeAccess', () => {
    it('should pass for project file when user has the project permission', async () => {
      const fileNode = { id: 'file1', nodeType: NodeType.FILE, projectId: 'project1' };
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(fileNode);
      mockTreeWalker.resolveRootContext.mockResolvedValue({
        rootId: 'project1',
        rootType: NodeType.PROJECT,
        ownerId: 'owner1',
      });
      mockTreeWalker.resolveProjectId.mockResolvedValue('project1');
      mockProjectPermissionService.checkPermission.mockResolvedValue(true);

      await expect(
        service.assertNodeAccess('user1', 'file1', ProjectPermission.FILE_DOWNLOAD)
      ).resolves.toBeUndefined();
      // checkNodePermission 内部解析出项目根后按项目维度判定
      expect(mockProjectPermissionService.checkPermission).toHaveBeenCalledWith(
        'user1',
        'project1',
        ProjectPermission.FILE_DOWNLOAD
      );
    });

    it('should throw ForbiddenException when user lacks the project permission (IDOR)', async () => {
      const fileNode = { id: 'file1', nodeType: NodeType.FILE, projectId: 'project1' };
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(fileNode);
      mockTreeWalker.resolveRootContext.mockResolvedValue({
        rootId: 'project1',
        rootType: NodeType.PROJECT,
        ownerId: 'owner1',
      });
      // 根可解析、权限判定为 false：拒绝必须来自权限判定而非根解析失败
      mockTreeWalker.resolveProjectId.mockResolvedValue('project1');
      mockProjectPermissionService.checkPermission.mockResolvedValue(false);

      await expect(
        service.assertNodeAccess('user1', 'file1', ProjectPermission.FILE_DOWNLOAD)
      ).rejects.toThrow(ForbiddenException);
    });

    it('should pass for personal space file via project permission path (owner logic in store)', async () => {
      const fileNode = { id: 'file1', nodeType: NodeType.FILE, projectId: 'ps1' };
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(fileNode);
      mockTreeWalker.resolveRootContext.mockResolvedValue({
        rootId: 'ps1',
        rootType: NodeType.PERSONAL_SPACE,
        ownerId: 'owner1',
      });
      mockTreeWalker.resolveProjectId.mockResolvedValue('ps1');
      mockProjectPermissionService.checkPermission.mockResolvedValue(true);

      await expect(
        service.assertNodeAccess('owner1', 'file1', ProjectPermission.FILE_OPEN)
      ).resolves.toBeUndefined();
    });

    it('should require LIBRARY_DRAWING_MANAGE for file under drawing library root', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'lib-file1',
        nodeType: NodeType.FILE,
        projectId: 'lib-root',
      });
      mockTreeWalker.resolveRootContext.mockResolvedValue({
        rootId: 'lib-root',
        rootType: NodeType.LIBRARY_DRAWING,
        ownerId: 'admin1',
      });
      mockSystemPermissionService.checkSystemPermission.mockResolvedValue(true);

      await expect(
        service.assertNodeAccess('admin1', 'lib-file1', ProjectPermission.FILE_DOWNLOAD)
      ).resolves.toBeUndefined();
      expect(mockSystemPermissionService.checkSystemPermission).toHaveBeenCalledWith(
        'admin1',
        SystemPermission.LIBRARY_DRAWING_MANAGE
      );
      // 库上下文不走项目权限
      expect(mockProjectPermissionService.checkPermission).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException for library file without system permission (IDOR)', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'lib-file1',
        nodeType: NodeType.FILE,
        projectId: 'lib-root',
      });
      mockTreeWalker.resolveRootContext.mockResolvedValue({
        rootId: 'lib-root',
        rootType: NodeType.LIBRARY_BLOCK,
        ownerId: 'admin1',
      });
      mockSystemPermissionService.checkSystemPermission.mockResolvedValue(false);

      await expect(
        service.assertNodeAccess('user1', 'lib-file1', ProjectPermission.FILE_DOWNLOAD)
      ).rejects.toThrow(ForbiddenException);
      expect(mockSystemPermissionService.checkSystemPermission).toHaveBeenCalledWith(
        'user1',
        SystemPermission.LIBRARY_BLOCK_MANAGE
      );
    });

    it('should treat the node itself as root when it is a library root', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'lib-root',
        nodeType: NodeType.LIBRARY_DRAWING,
        projectId: null,
      });
      mockTreeWalker.resolveRootContext.mockResolvedValue({
        rootId: 'lib-root',
        rootType: NodeType.LIBRARY_DRAWING,
        ownerId: 'admin1',
      });
      mockSystemPermissionService.checkSystemPermission.mockResolvedValue(true);

      await expect(
        service.assertNodeAccess('admin1', 'lib-root', ProjectPermission.FILE_OPEN)
      ).resolves.toBeUndefined();
      // 节点自身即根：不应触发根节点二次查询
      expect(mockPrisma.fileSystemNode.findUnique).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when node does not exist', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);

      await expect(
        service.assertNodeAccess('user1', 'missing', ProjectPermission.FILE_OPEN)
      ).rejects.toThrow(NotFoundException);
    });

    it('should fail closed when root cannot be resolved', async () => {
      // 节点自身 + checkNodePermission 复查均返回同一孤儿节点；根解析走 treeWalker 返回 null
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'orphan1',
        nodeType: NodeType.FILE,
        projectId: null,
      });
      mockTreeWalker.resolveRootContext.mockResolvedValue(null);
      mockTreeWalker.resolveProjectId.mockResolvedValue(null);

      await expect(
        service.assertNodeAccess('user1', 'orphan1', ProjectPermission.FILE_OPEN)
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getNodeAccessRole', () => {
    it('should return owner role if user is owner', async () => {
      const mockNode = {
        id: 'node1',
        ownerId: 'user1',
        nodeType: NodeType.PROJECT,
        parentId: null,
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);
      mockTreeWalker.resolveRootContext.mockResolvedValue({
        rootId: 'node1',
        rootType: NodeType.PROJECT,
        ownerId: 'user1',
      });
      // getNodeAccessRole checks ownerId first, then nodeType for PROJECT → looks up members
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        projectRole: { name: ProjectRole.OWNER },
      });

      const result = await service.getNodeAccessRole('user1', 'node1');

      expect(result).toBe(ProjectRole.OWNER);
    });

    it('should return viewer role if it is a library node', async () => {
      const mockNode = {
        id: 'node1',
        ownerId: 'otherUser',
        nodeType: NodeType.LIBRARY_DRAWING,
        parentId: null,
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);
      mockTreeWalker.resolveRootContext.mockResolvedValue({
        rootId: 'node1',
        rootType: NodeType.LIBRARY_DRAWING,
        ownerId: 'otherUser',
      });

      const result = await service.getNodeAccessRole('user1', 'node1');

      expect(result).toBe(ProjectRole.VIEWER);
    });

    it('should return viewer role for file under library root (walk-up unification)', async () => {
      const mockNode = {
        id: 'lib-file1',
        ownerId: 'otherUser',
        nodeType: NodeType.FILE,
        parentId: 'lib-root',
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);
      mockTreeWalker.resolveRootContext.mockResolvedValue({
        rootId: 'lib-root',
        rootType: NodeType.LIBRARY_DRAWING,
        ownerId: 'admin1',
      });

      const result = await service.getNodeAccessRole('user1', 'lib-file1');

      expect(result).toBe(ProjectRole.VIEWER);
    });

    it('should return member role if user is project member', async () => {
      const mockNode = {
        id: 'node1',
        ownerId: 'ownerUser',
        nodeType: NodeType.PROJECT,
        parentId: null,
      };
      const mockMember = {
        projectRole: { name: ProjectRole.EDITOR },
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);
      mockTreeWalker.resolveRootContext.mockResolvedValue({
        rootId: 'node1',
        rootType: NodeType.PROJECT,
        ownerId: 'ownerUser',
      });
      mockPrisma.projectMember.findUnique.mockResolvedValue(mockMember);

      const result = await service.getNodeAccessRole('user1', 'node1');

      expect(result).toBe(ProjectRole.EDITOR);
    });

    it('should return null if user is not a member', async () => {
      const mockNode = {
        id: 'node1',
        ownerId: 'ownerUser',
        nodeType: NodeType.PROJECT,
        parentId: null,
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);
      mockTreeWalker.resolveRootContext.mockResolvedValue({
        rootId: 'node1',
        rootType: NodeType.PROJECT,
        ownerId: 'ownerUser',
      });
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
        nodeType: NodeType.PROJECT,
        parentId: null,
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);
      mockTreeWalker.resolveRootContext.mockResolvedValue({
        rootId: 'node1',
        rootType: NodeType.PROJECT,
        ownerId: 'user1',
      });
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        projectRole: { name: ProjectRole.OWNER },
      });

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
        nodeType: NodeType.PROJECT,
        parentId: null,
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);
      mockTreeWalker.resolveRootContext.mockResolvedValue({
        rootId: 'node1',
        rootType: NodeType.PROJECT,
        ownerId: 'user1',
      });
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        projectRole: { name: ProjectRole.OWNER },
      });

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
