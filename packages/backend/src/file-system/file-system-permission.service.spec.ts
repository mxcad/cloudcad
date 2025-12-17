import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { FileSystemPermissionService } from './file-system-permission.service';
import { DatabaseService } from '../database/database.service';
import { PermissionCacheService } from '../common/services/permission-cache.service';
import { Permission } from '../common/enums/permissions.enum';
import { UserRole } from '@prisma/client';

describe('FileSystemPermissionService', () => {
  let service: FileSystemPermissionService;
  let prisma: DatabaseService;
  let cache: PermissionCacheService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
    },
    fileSystemNode: {
      findUnique: jest.fn(),
    },
    fileAccess: {
      findUnique: jest.fn(),
    },
    projectMember: {
      findUnique: jest.fn(),
    },
  };

  const mockCache = {
    get: jest.fn(),
    set: jest.fn(),
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
          provide: PermissionCacheService,
          useValue: mockCache,
        },
      ],
    }).setLogger({ log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), verbose: jest.fn() }).compile();

    service = module.get<FileSystemPermissionService>(FileSystemPermissionService);
    prisma = module.get<DatabaseService>(DatabaseService);
    cache = module.get<PermissionCacheService>(PermissionCacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkNodePermission', () => {
    const userId = 'user-123';
    const nodeId = 'node-123';
    const permission = Permission.FILE_READ;

    it('应该从缓存返回权限结�?, async () => {
      mockCache.get.mockReturnValue(true);

      const result = await service.checkNodePermission(userId, nodeId, permission);

      expect(result).toBe(true);
      expect(mockCache.get).toHaveBeenCalledWith(
        expect.stringContaining(`perm:${userId}:${nodeId}:${permission}`)
      );
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('应该允许管理员访问所有节�?, async () => {
      mockCache.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        role: UserRole.ADMIN,
      });

      const result = await service.checkNodePermission(userId, nodeId, permission);

      expect(result).toBe(true);
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.any(String),
        true,
        600000
      );
    });

    it('应该允许节点所有者访�?, async () => {
      mockCache.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        role: UserRole.USER,
      });
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        ownerId: userId,
        isRoot: false,
        parentId: 'parent-123',
      });

      const result = await service.checkNodePermission(userId, nodeId, permission);

      expect(result).toBe(true);
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.any(String),
        true,
        600000
      );
    });

    it('应该在节点不存在时抛出异�?, async () => {
      mockCache.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        role: UserRole.USER,
      });
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);

      await expect(
        service.checkNodePermission(userId, nodeId, permission)
      ).rejects.toThrow(NotFoundException);
    });

    it('应该通过节点级权限（FileAccess）授�?, async () => {
      mockCache.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        role: UserRole.USER,
      });
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        ownerId: 'other-user',
        isRoot: false,
        parentId: 'parent-123',
      });
      mockPrisma.fileAccess.findUnique.mockResolvedValue({
        userId,
        nodeId,
        role: 'EDITOR',
      });

      const result = await service.checkNodePermission(userId, nodeId, permission);

      expect(result).toBe(true);
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.any(String),
        true,
        300000
      );
    });

    it('应该拒绝无编辑权限的VIEWER用户', async () => {
      mockCache.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        role: UserRole.USER,
      });
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        ownerId: 'other-user',
        isRoot: false,
        parentId: 'parent-123',
      });
      mockPrisma.fileAccess.findUnique.mockResolvedValue({
        userId,
        nodeId,
        role: 'VIEWER',
      });

      const result = await service.checkNodePermission(
        userId,
        nodeId,
        Permission.FILE_WRITE
      );

      expect(result).toBe(false);
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.any(String),
        false,
        300000
      );
    });

    it('应该通过项目级权限（ProjectMember）授�?, async () => {
      mockCache.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        role: UserRole.USER,
      });
      mockPrisma.fileSystemNode.findUnique
        .mockResolvedValueOnce({
          ownerId: 'other-user',
          isRoot: false,
          parentId: 'parent-123',
        })
        .mockResolvedValueOnce({
          id: 'parent-123',
          isRoot: false,
          parentId: 'root-123',
        })
        .mockResolvedValueOnce({
          id: 'root-123',
          isRoot: true,
          parentId: null,
        });
      mockPrisma.fileAccess.findUnique.mockResolvedValue(null);
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        userId,
        nodeId: 'root-123',
        role: 'MEMBER',
      });

      const result = await service.checkNodePermission(userId, nodeId, permission);

      expect(result).toBe(true);
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.any(String),
        true,
        300000
      );
    });

    it('应该拒绝无权限的用户', async () => {
      mockCache.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        role: UserRole.USER,
      });
      mockPrisma.fileSystemNode.findUnique
        .mockResolvedValueOnce({
          ownerId: 'other-user',
          isRoot: false,
          parentId: 'parent-123',
        })
        .mockResolvedValueOnce({
          id: 'parent-123',
          isRoot: true,
          parentId: null,
        });
      mockPrisma.fileAccess.findUnique.mockResolvedValue(null);
      mockPrisma.projectMember.findUnique.mockResolvedValue(null);

      const result = await service.checkNodePermission(userId, nodeId, permission);

      expect(result).toBe(false);
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.any(String),
        false,
        300000
      );
    });

    it('应该允许项目OWNER删除文件', async () => {
      mockCache.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        role: UserRole.USER,
      });
      mockPrisma.fileSystemNode.findUnique
        .mockResolvedValueOnce({
          ownerId: 'other-user',
          isRoot: false,
          parentId: 'root-123',
        })
        .mockResolvedValueOnce({
          id: 'root-123',
          isRoot: true,
          parentId: null,
        });
      mockPrisma.fileAccess.findUnique.mockResolvedValue(null);
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        userId,
        nodeId: 'root-123',
        role: 'OWNER',
      });

      const result = await service.checkNodePermission(
        userId,
        nodeId,
        Permission.FILE_DELETE
      );

      expect(result).toBe(true);
    });

    it('应该拒绝项目VIEWER删除文件', async () => {
      mockCache.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        role: UserRole.USER,
      });
      mockPrisma.fileSystemNode.findUnique
        .mockResolvedValueOnce({
          ownerId: 'other-user',
          isRoot: false,
          parentId: 'root-123',
        })
        .mockResolvedValueOnce({
          id: 'root-123',
          isRoot: true,
          parentId: null,
        });
      mockPrisma.fileAccess.findUnique.mockResolvedValue(null);
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        userId,
        nodeId: 'root-123',
        role: 'VIEWER',
      });

      const result = await service.checkNodePermission(
        userId,
        nodeId,
        Permission.FILE_DELETE
      );

      expect(result).toBe(false);
    });
  });

  describe('findRootNode', () => {
    it('应该找到根节�?, async () => {
      const nodeId = 'node-123';
      mockPrisma.fileSystemNode.findUnique
        .mockResolvedValueOnce({
          id: nodeId,
          isRoot: false,
          parentId: 'parent-123',
        })
        .mockResolvedValueOnce({
          id: 'parent-123',
          isRoot: true,
          parentId: null,
        });

      const result = await service['findRootNode'](nodeId);

      expect(result).toEqual({
        id: 'parent-123',
        isRoot: true,
        parentId: null,
      });
    });

    it('应该处理节点本身就是根节点的情况', async () => {
      const nodeId = 'root-123';
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: nodeId,
        isRoot: true,
        parentId: null,
      });

      const result = await service['findRootNode'](nodeId);

      expect(result).toEqual({
        id: nodeId,
        isRoot: true,
        parentId: null,
      });
    });

    it('应该在节点不存在时返回null', async () => {
      const nodeId = 'nonexistent';
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);

      const result = await service['findRootNode'](nodeId);

      expect(result).toBeNull();
    });

    it('应该在没有父节点时返回null', async () => {
      const nodeId = 'orphan-123';
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: nodeId,
        isRoot: false,
        parentId: null,
      });

      const result = await service['findRootNode'](nodeId);

      expect(result).toBeNull();
    });

    it('应该处理多层嵌套结构', async () => {
      const nodeId = 'deep-node';
      mockPrisma.fileSystemNode.findUnique
        .mockResolvedValueOnce({
          id: nodeId,
          isRoot: false,
          parentId: 'level-2',
        })
        .mockResolvedValueOnce({
          id: 'level-2',
          isRoot: false,
          parentId: 'level-1',
        })
        .mockResolvedValueOnce({
          id: 'level-1',
          isRoot: false,
          parentId: 'root-123',
        })
        .mockResolvedValueOnce({
          id: 'root-123',
          isRoot: true,
          parentId: null,
        });

      const result = await service['findRootNode'](nodeId);

      expect(result).toEqual({
        id: 'root-123',
        isRoot: true,
        parentId: null,
      });
    });
  });

  describe('权限优先级测�?, () => {
    const userId = 'user-123';
    const nodeId = 'node-123';
    const permission = Permission.FILE_READ;

    it('节点级权限应该覆盖项目级权限', async () => {
      mockCache.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        role: UserRole.USER,
      });
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        ownerId: 'other-user',
        isRoot: false,
        parentId: 'root-123',
      });
      mockPrisma.fileAccess.findUnique.mockResolvedValue({
        userId,
        nodeId,
        role: 'VIEWER',
      });

      const result = await service.checkNodePermission(
        userId,
        nodeId,
        Permission.FILE_WRITE
      );

      expect(result).toBe(false);
      expect(mockPrisma.projectMember.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('边界情况', () => {
    const userId = 'user-123';
    const nodeId = 'node-123';
    const permission = Permission.FILE_READ;

    it('应该处理找不到根节点的情�?, async () => {
      mockCache.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        role: UserRole.USER,
      });
      mockPrisma.fileSystemNode.findUnique
        .mockResolvedValueOnce({
          ownerId: 'other-user',
          isRoot: false,
          parentId: 'parent-123',
        })
        .mockResolvedValueOnce({
          id: 'parent-123',
          isRoot: false,
          parentId: null,
        });
      mockPrisma.fileAccess.findUnique.mockResolvedValue(null);

      const result = await service.checkNodePermission(userId, nodeId, permission);

      expect(result).toBe(false);
    });

    it('应该处理数据库查询错�?, async () => {
      mockCache.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      await expect(
        service.checkNodePermission(userId, nodeId, permission)
      ).rejects.toThrow('Database error');
    });
  });
});

