import { Test, type TestingModule } from '@nestjs/testing';
import { FileStatus, NodeType } from '@cloudcad/db';
import { DatabaseService } from '../../database/database.service';
import { TreeWalker } from '../../file-system/file-tree/tree-walker.service';
import { StorageUsageService } from './storage-usage.service';

describe('StorageUsageService', () => {
  let service: StorageUsageService;
  let prisma: any;
  let treeWalker: any;

  beforeEach(async () => {
    prisma = {
      fileSystemNode: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { size: 123 } }),
        findFirst: jest.fn().mockResolvedValue({ id: 'ps-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    treeWalker = {
      getSubtreeIds: jest.fn().mockResolvedValue(['child-1', 'child-2']),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageUsageService,
        { provide: DatabaseService, useValue: prisma },
        { provide: TreeWalker, useValue: treeWalker },
      ],
    }).compile();

    service = module.get<StorageUsageService>(StorageUsageService);
  });

  describe('usageSize — kind: personal', () => {
    it('when 个人空间存在：聚合个人空间下未删除的 COMPLETED 文件', async () => {
      prisma.fileSystemNode.findFirst.mockResolvedValue({ id: 'ps-1' });

      const size = await service.usageSize({ kind: 'personal', userId: 'user-1' });

      expect(prisma.fileSystemNode.findFirst).toHaveBeenCalledWith({
        where: { ownerId: 'user-1', nodeType: NodeType.PERSONAL_SPACE },
        select: { id: true },
      });
      expect(prisma.fileSystemNode.aggregate).toHaveBeenCalledWith({
        where: {
          ownerId: 'user-1',
          projectId: 'ps-1',
          nodeType: NodeType.FILE,
          fileStatus: FileStatus.COMPLETED,
          deletedAt: null,
        },
        _sum: { size: true },
      });
      expect(size).toBe(123);
    });

    it('when 个人空间缺失：返回 0 且不查询 aggregate', async () => {
      prisma.fileSystemNode.findFirst.mockResolvedValue(null);

      const size = await service.usageSize({ kind: 'personal', userId: 'user-1' });

      expect(size).toBe(0);
      expect(prisma.fileSystemNode.aggregate).not.toHaveBeenCalled();
    });
  });

  describe('usageSize — kind: project', () => {
    it('聚合全项目成员文件（无 ownerId 过滤，ADR-0017 项目口径）', async () => {
      const size = await service.usageSize({
        kind: 'project',
        projectId: 'project-1',
      });

      expect(prisma.fileSystemNode.aggregate).toHaveBeenCalledWith({
        where: {
          projectId: 'project-1',
          nodeType: NodeType.FILE,
          fileStatus: FileStatus.COMPLETED,
          deletedAt: null,
        },
        _sum: { size: true },
      });
      expect(size).toBe(123);
    });
  });

  describe('usageSize — kind: subtree', () => {
    it('when status: completed：经 TreeWalker 收集子树，过滤未删除的 COMPLETED 文件', async () => {
      const size = await service.usageSize({
        kind: 'subtree',
        nodeId: 'root-1',
        status: 'completed',
      });

      expect(treeWalker.getSubtreeIds).toHaveBeenCalledWith('root-1');
      expect(prisma.fileSystemNode.aggregate).toHaveBeenCalledWith({
        where: {
          id: { in: ['child-1', 'child-2'] },
          nodeType: NodeType.FILE,
          fileStatus: FileStatus.COMPLETED,
          deletedAt: null,
        },
        _sum: { size: true },
      });
      expect(size).toBe(123);
    });

    it('when status: all：不过滤 fileStatus 与 deletedAt（trash 恢复场景）', async () => {
      await service.usageSize({ kind: 'subtree', nodeId: 'root-1', status: 'all' });

      expect(prisma.fileSystemNode.aggregate).toHaveBeenCalledWith({
        where: {
          id: { in: ['child-1', 'child-2'] },
          nodeType: NodeType.FILE,
        },
        _sum: { size: true },
      });
    });

    it('when 子树为空：返回 0 且不查询 aggregate', async () => {
      treeWalker.getSubtreeIds.mockResolvedValue([]);

      const size = await service.usageSize({
        kind: 'subtree',
        nodeId: 'root-1',
        status: 'completed',
      });

      expect(size).toBe(0);
      expect(prisma.fileSystemNode.aggregate).not.toHaveBeenCalled();
    });
  });

  describe('usageSize — kind: owned', () => {
    it('聚合用户拥有的全部文件（不过滤 COMPLETED，仪表盘统计）', async () => {
      const size = await service.usageSize({ kind: 'owned', userId: 'user-1' });

      expect(prisma.fileSystemNode.aggregate).toHaveBeenCalledWith({
        where: {
          ownerId: 'user-1',
          nodeType: NodeType.FILE,
          deletedAt: null,
        },
        _sum: { size: true },
      });
      expect(size).toBe(123);
    });
  });

  describe('getSubtreeFileNodes', () => {
    it('when status: completed：返回子树 FILE 节点元数据（含 size/path 供物理兜底）', async () => {
      const files = [
        { id: 'child-1', size: null, path: '202607/child-1/f.mxweb' },
      ];
      prisma.fileSystemNode.findMany.mockResolvedValue(files);

      const result = await service.getSubtreeFileNodes({
        kind: 'subtree',
        nodeId: 'root-1',
        status: 'completed',
      });

      expect(treeWalker.getSubtreeIds).toHaveBeenCalledWith('root-1');
      expect(prisma.fileSystemNode.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['child-1', 'child-2'] },
          nodeType: NodeType.FILE,
          fileStatus: FileStatus.COMPLETED,
          deletedAt: null,
        },
        select: { id: true, size: true, path: true },
      });
      expect(result).toBe(files);
    });

    it('when status: all：findMany 不过滤 fileStatus 与 deletedAt', async () => {
      await service.getSubtreeFileNodes({
        kind: 'subtree',
        nodeId: 'root-1',
        status: 'all',
      });

      expect(prisma.fileSystemNode.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['child-1', 'child-2'] },
          nodeType: NodeType.FILE,
        },
        select: { id: true, size: true, path: true },
      });
    });

    it('when 子树为空：返回空数组且不查询 findMany', async () => {
      treeWalker.getSubtreeIds.mockResolvedValue([]);

      const result = await service.getSubtreeFileNodes({
        kind: 'subtree',
        nodeId: 'root-1',
        status: 'completed',
      });

      expect(result).toEqual([]);
      expect(prisma.fileSystemNode.findMany).not.toHaveBeenCalled();
    });
  });
});
