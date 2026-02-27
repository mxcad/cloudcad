import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { FileSystemPermissionService } from './file-system-permission.service';
import { DatabaseService } from '../database/database.service';
import { ProjectPermissionService } from '../roles/project-permission.service';
import { ProjectPermission, ProjectRole } from '../common/enums/permissions.enum';

describe('FileSystemPermissionService', () => {
  let service: FileSystemPermissionService;
  let prisma: DatabaseService;
  let projectPermissionService: ProjectPermissionService;

  const mockPrisma = {
    fileSystemNode: {
      findUnique: jest.fn(),
    },
    projectMember: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((callback) => {
      return callback(mockPrisma);
    }),
  };

  const mockProjectPermissionService = {
    checkPermission: jest.fn().mockResolvedValue(true),
    clearUserCache: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileSystemPermissionService,
        {
          provide: DatabaseService,
          useValue: mockPrisma,
        },
        {
          provide: ProjectPermissionService,
          useValue: mockProjectPermissionService,
        },
      ],
    })
      .setLogger({
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        verbose: jest.fn(),
      })
      .compile();

    service = module.get<FileSystemPermissionService>(
      FileSystemPermissionService
    );
    prisma = module.get<DatabaseService>(DatabaseService);
    projectPermissionService = module.get<ProjectPermissionService>(
      ProjectPermissionService
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkNodePermission', () => {
    const userId = 'user-123';
    const nodeId = 'node-123';
    const permission = ProjectPermission.FILE_OPEN;

    it('应该成功检查节点权限', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: nodeId,
        deletedAt: null,
      });
      mockProjectPermissionService.checkPermission.mockResolvedValue(true);

      const result = await service.checkNodePermission(
        userId,
        nodeId,
        permission
      );

      expect(result).toBe(true);
      expect(mockPrisma.fileSystemNode.findUnique).toHaveBeenCalledWith({
        where: { id: nodeId },
        select: { id: true, deletedAt: true },
      });
      expect(mockProjectPermissionService.checkPermission).toHaveBeenCalledWith(
        userId,
        nodeId,
        permission
      );
    });

    it('应该在节点不存在时抛出异常', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);

      await expect(
        service.checkNodePermission(userId, nodeId, permission)
      ).rejects.toThrow(NotFoundException);
    });

    it('应该在节点已被删除时抛出异常', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: nodeId,
        deletedAt: new Date(),
      });

      await expect(
        service.checkNodePermission(userId, nodeId, permission)
      ).rejects.toThrow(NotFoundException);
    });

    it('应该返回拒绝的权限', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: nodeId,
        deletedAt: null,
      });
      mockProjectPermissionService.checkPermission.mockResolvedValue(false);

      const result = await service.checkNodePermission(
        userId,
        nodeId,
        permission
      );

      expect(result).toBe(false);
    });

    it('应该处理删除权限检查', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: nodeId,
        deletedAt: null,
      });
      mockProjectPermissionService.checkPermission.mockResolvedValue(true);

      const result = await service.checkNodePermission(
        userId,
        nodeId,
        ProjectPermission.FILE_DELETE
      );

      expect(result).toBe(true);
      expect(mockProjectPermissionService.checkPermission).toHaveBeenCalledWith(
        userId,
        nodeId,
        ProjectPermission.FILE_DELETE
      );
    });
  });

  describe('getNodeAccessRole', () => {
    it('应该返回用户的访问角色', async () => {
      const userId = 'user-123';
      const nodeId = 'node-123';
      const mockMember = {
        projectRole: { name: ProjectRole.EDITOR },
      };

      mockPrisma.projectMember.findUnique.mockResolvedValue(mockMember);

      const result = await service.getNodeAccessRole(userId, nodeId);

      expect(result).toBe(ProjectRole.EDITOR);
    });

    it('应该在用户不是成员时返回 null', async () => {
      const userId = 'user-123';
      const nodeId = 'node-123';

      mockPrisma.projectMember.findUnique.mockResolvedValue(null);

      const result = await service.getNodeAccessRole(userId, nodeId);

      expect(result).toBeNull();
    });

    it('应该在角色不存在时返回 null', async () => {
      const userId = 'user-123';
      const nodeId = 'node-123';
      const mockMember = {
        projectRole: null,
      };

      mockPrisma.projectMember.findUnique.mockResolvedValue(mockMember);

      const result = await service.getNodeAccessRole(userId, nodeId);

      expect(result).toBeNull();
    });
  });

  describe('hasNodeAccessRole', () => {
    it('应该在用户具有指定角色时返回 true', async () => {
      const userId = 'user-123';
      const nodeId = 'node-123';
      const mockMember = {
        projectRole: { name: ProjectRole.EDITOR },
      };

      mockPrisma.projectMember.findUnique.mockResolvedValue(mockMember);

      const result = await service.hasNodeAccessRole(userId, nodeId, [
        ProjectRole.EDITOR,
        ProjectRole.VIEWER,
      ]);

      expect(result).toBe(true);
    });

    it('应该在用户不具有指定角色时返回 false', async () => {
      const userId = 'user-123';
      const nodeId = 'node-123';
      const mockMember = {
        projectRole: { name: ProjectRole.VIEWER },
      };

      mockPrisma.projectMember.findUnique.mockResolvedValue(mockMember);

      const result = await service.hasNodeAccessRole(userId, nodeId, [
        ProjectRole.EDITOR,
        ProjectRole.OWNER,
      ]);

      expect(result).toBe(false);
    });

    it('应该在用户不是成员时返回 false', async () => {
      const userId = 'user-123';
      const nodeId = 'node-123';

      mockPrisma.projectMember.findUnique.mockResolvedValue(null);

      const result = await service.hasNodeAccessRole(userId, nodeId, [
        ProjectRole.EDITOR,
      ]);

      expect(result).toBe(false);
    });
  });

  describe('setProjectMemberRole', () => {
    it('应该成功设置项目成员角色', async () => {
      const projectId = 'project-123';
      const userId = 'user-123';
      const projectRoleId = 'role-123';

      mockPrisma.projectMember.upsert.mockResolvedValue({});

      await service.setProjectMemberRole(projectId, userId, projectRoleId);

      expect(mockPrisma.projectMember.upsert).toHaveBeenCalledWith({
        where: {
          projectId_userId: {
            projectId,
            userId,
          },
        },
        update: {
          projectRoleId,
        },
        create: {
          projectId,
          userId,
          projectRoleId,
        },
      });
      expect(mockProjectPermissionService.clearUserCache).toHaveBeenCalledWith(
        userId,
        projectId
      );
    });
  });

  describe('removeProjectMember', () => {
    it('应该成功移除项目成员', async () => {
      const projectId = 'project-123';
      const userId = 'user-123';

      mockPrisma.projectMember.deleteMany.mockResolvedValue({ count: 1 });

      await service.removeProjectMember(projectId, userId);

      expect(mockPrisma.projectMember.deleteMany).toHaveBeenCalledWith({
        where: {
          projectId,
          userId,
        },
      });
      expect(mockProjectPermissionService.clearUserCache).toHaveBeenCalledWith(
        userId,
        projectId
      );
    });
  });

  describe('getProjectMembers', () => {
    it('应该返回项目成员列表', async () => {
      const projectId = 'project-123';
      const mockMembers = [
        {
          user: {
            id: 'user-1',
            email: 'user1@example.com',
            username: 'user1',
            nickname: 'User 1',
            avatar: null,
          },
          projectRole: {
            id: 'role-1',
            name: ProjectRole.EDITOR,
            description: 'Editor role',
          },
        },
      ];

      mockPrisma.projectMember.findMany.mockResolvedValue(mockMembers);

      const result = await service.getProjectMembers(projectId);

      expect(result).toEqual(mockMembers);
      expect(mockPrisma.projectMember.findMany).toHaveBeenCalledWith({
        where: {
          projectId,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              nickname: true,
              avatar: true,
            },
          },
          projectRole: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });
    });
  });

  describe('batchAddProjectMembers', () => {
    it('应该成功批量添加项目成员', async () => {
      const projectId = 'project-123';
      const members = [
        { userId: 'user-1', projectRoleId: 'role-1' },
        { userId: 'user-2', projectRoleId: 'role-2' },
      ];

      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      await service.batchAddProjectMembers(projectId, members);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockProjectPermissionService.clearUserCache).toHaveBeenCalledTimes(
        2
      );
    });
  });

  describe('batchUpdateProjectMembers', () => {
    it('应该成功批量更新项目成员角色', async () => {
      const projectId = 'project-123';
      const updates = [
        { userId: 'user-1', projectRoleId: 'role-1' },
        { userId: 'user-2', projectRoleId: 'role-2' },
      ];

      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      await service.batchUpdateProjectMembers(projectId, updates);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockProjectPermissionService.clearUserCache).toHaveBeenCalledTimes(
        2
      );
    });
  });
});
