import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { NodeType, FileStatus } from '@cloudcad/db';
import { DatabaseService } from '../database/database.service';
import { TreeWalker } from '../file-system/file-tree/tree-walker.service';
import { StorageManager } from '../storage-management/services/storage-manager.service';
import { NodeSizeResolverService } from '../file-system/storage-quota/node-size-resolver.service';
import { StorageUsageService } from '../vip/storage-usage/storage-usage.service';
import { NodeNameService } from './node-name.service';
import { NodeMutationGuard } from './node-mutation.guard';
import { NodeCopyMoveService } from './node-copy-move.service';
import { AuditLogService } from '../audit/audit-log.service';

describe('NodeCopyMoveService', () => {
  let service: NodeCopyMoveService;
  let prisma: any;
  let storageManager: Record<string, jest.Mock>;
  let treeWalker: Record<string, jest.Mock>;
  let nodeNameService: Record<string, jest.Mock>;
  let nodeMutationGuard: Record<string, jest.Mock>;
  let nodeSizeResolver: Record<string, jest.Mock>;
  let storageUsageService: Record<string, jest.Mock>;
  let auditLogService: Record<string, jest.Mock>;

  const fileNode = (overrides: Record<string, unknown> = {}) => ({
    id: 'node-1',
    name: 'drawing.dwg',
    originalName: 'drawing.dwg',
    nodeType: NodeType.FILE,
    parentId: 'folder-1',
    path: '202607/node-1/drawing.dwg.mxweb',
    size: 1024,
    mimeType: 'application/octet-stream',
    extension: 'dwg',
    fileStatus: FileStatus.COMPLETED,
    fileHash: 'hash-1',
    description: null,
    ownerId: 'user-1',
    projectId: 'proj-1',
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = {
      fileSystemNode: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          if (where.id === 'node-1') {
            return Promise.resolve(fileNode());
          }
          if (where.id === 'folder-1') {
            return Promise.resolve({
              id: 'folder-1',
              nodeType: NodeType.FOLDER,
              projectId: 'proj-1',
            });
          }
          if (where.id === 'folder-b') {
            return Promise.resolve({
              id: 'folder-b',
              nodeType: NodeType.FOLDER,
              projectId: 'proj-1',
            });
          }
          if (where.id === 'proj-1') {
            return Promise.resolve({
              id: 'proj-1',
              nodeType: NodeType.PROJECT,
            });
          }
          return Promise.resolve(null);
        }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(fileNode({ id: 'new-node' })),
        update: jest.fn().mockResolvedValue(fileNode({ id: 'new-node' })),
        aggregate: jest.fn(),
      },
      // 事务透传：直接以同一 prisma mock 执行回调（单测无需真实事务语义）
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };
    storageManager = {
      getFullPath: jest
        .fn()
        .mockReturnValue('/data/202607/node-1/drawing.dwg.mxweb'),
      getNodeDirectoryRelativePath: jest.fn().mockReturnValue('202607/node-1'),
      copyNodeDirectory: jest
        .fn()
        .mockResolvedValue('202607/new-node/drawing.dwg.mxweb'),
    };
    treeWalker = {
      getSubtreeIds: jest.fn().mockResolvedValue([]),
      resolveProjectId: jest.fn().mockResolvedValue('proj-1'),
      isDescendantOf: jest.fn().mockResolvedValue(false),
      getSubtreeRows: jest.fn().mockResolvedValue([]),
    };
    nodeNameService = {
      generateUniqueName: jest.fn().mockResolvedValue('drawing.dwg'),
    };
    nodeMutationGuard = {
      assertMutationAllowed: jest.fn().mockResolvedValue(undefined),
      assertByteQuota: jest.fn().mockResolvedValue(undefined),
      invalidateQuotaAfterMutation: jest.fn().mockResolvedValue(undefined),
    };
    nodeSizeResolver = {
      resolveFileSize: jest.fn().mockResolvedValue(1024),
      resolveFileSizes: jest.fn().mockResolvedValue(0),
    };
    storageUsageService = {
      getSubtreeFileNodes: jest.fn().mockResolvedValue([]),
    };
    auditLogService = {
      log: jest.fn(),
      logProjectNodeAction: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NodeCopyMoveService,
        { provide: DatabaseService, useValue: prisma },
        { provide: StorageManager, useValue: storageManager },
        { provide: TreeWalker, useValue: treeWalker },
        { provide: NodeNameService, useValue: nodeNameService },
        { provide: NodeMutationGuard, useValue: nodeMutationGuard },
        { provide: NodeSizeResolverService, useValue: nodeSizeResolver },
        { provide: StorageUsageService, useValue: storageUsageService },
        { provide: AuditLogService, useValue: auditLogService },
      ],
    }).compile();

    service = module.get(NodeCopyMoveService);
  });

  describe('copyNode — FILE 节点 size=null 的增量计算', () => {
    it('when size 为 null：按 NodeSizeResolverService 解析的真实大小计增量', async () => {
      prisma.fileSystemNode.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'node-1') {
          return Promise.resolve(fileNode({ size: null }));
        }
        if (where.id === 'folder-1') {
          return Promise.resolve({
            id: 'folder-1',
            nodeType: NodeType.FOLDER,
          });
        }
        return Promise.resolve(null);
      });
      nodeSizeResolver.resolveFileSize.mockResolvedValue(2048);

      await service.copyNode('node-1', 'folder-1', 'user-1');

      expect(nodeSizeResolver.resolveFileSize).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'node-1', size: null }),
        'node-1'
      );
      expect(nodeMutationGuard.assertMutationAllowed).toHaveBeenCalledWith(
        'user-1',
        'copy',
        {
          node: { id: 'node-1' },
          target: { id: 'folder-1' },
          incrementBytes: 2048,
        }
      );
      // 复制审计：resourceId 为新节点
      expect(auditLogService.logProjectNodeAction).toHaveBeenCalledWith(
        'NODE_COPY',
        'new-node',
        'user-1',
        { sourceNodeId: 'node-1', sourceName: 'drawing.dwg' },
        'FILE'
      );
    });

    it('when 物理文件不可读（resolver 抛错）：阻止操作并抛 BadRequestException', async () => {
      prisma.fileSystemNode.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'node-1') {
          return Promise.resolve(fileNode({ size: null }));
        }
        if (where.id === 'folder-1') {
          return Promise.resolve({
            id: 'folder-1',
            nodeType: NodeType.FOLDER,
          });
        }
        return Promise.resolve(null);
      });
      nodeSizeResolver.resolveFileSize.mockRejectedValue(
        new BadRequestException('无法读取文件大小，操作已取消')
      );

      await expect(
        service.copyNode('node-1', 'folder-1', 'user-1')
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(nodeMutationGuard.assertMutationAllowed).not.toHaveBeenCalled();
    });

    it('when size 正常：经 resolver 短路返回 DB size（不触物理读取）', async () => {
      await service.copyNode('node-1', 'folder-1', 'user-1');

      expect(nodeSizeResolver.resolveFileSize).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'node-1', size: 1024 }),
        'node-1'
      );
      expect(nodeMutationGuard.assertMutationAllowed).toHaveBeenCalledWith(
        'user-1',
        'copy',
        {
          node: { id: 'node-1' },
          target: { id: 'folder-1' },
          incrementBytes: 1024,
        }
      );
    });
  });

  describe('copyNode — FOLDER 子树聚合', () => {
    it('when 子树含 size=null 的 FILE 节点：经 resolveFileSizes 补齐聚合', async () => {
      prisma.fileSystemNode.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'folder-1') {
          return Promise.resolve(
            fileNode({
              id: 'folder-1',
              nodeType: NodeType.FOLDER,
              path: null,
              size: null,
              parentId: 'proj-1',
            })
          );
        }
        if (where.id === 'proj-1') {
          return Promise.resolve({
            id: 'proj-1',
            nodeType: NodeType.PROJECT,
          });
        }
        return Promise.resolve(null);
      });
      storageUsageService.getSubtreeFileNodes.mockResolvedValue([
        { id: 'child-1', size: null, path: '202607/child-1/f.mxweb' },
      ]);
      nodeSizeResolver.resolveFileSizes.mockResolvedValue(4096);

      await service.copyNode('folder-1', 'proj-1', 'user-1');

      expect(nodeSizeResolver.resolveFileSizes).toHaveBeenCalledWith([
        { id: 'child-1', size: null, path: '202607/child-1/f.mxweb' },
      ]);
      expect(nodeMutationGuard.assertMutationAllowed).toHaveBeenCalledWith(
        'user-1',
        'copy',
        {
          node: { id: 'folder-1' },
          target: { id: 'proj-1' },
          incrementBytes: 4096,
        }
      );
    });

    it('when 子树 FILE 节点 size 均正常：直接按 DB size 求和', async () => {
      prisma.fileSystemNode.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'folder-1') {
          return Promise.resolve(
            fileNode({
              id: 'folder-1',
              nodeType: NodeType.FOLDER,
              path: null,
              size: null,
              parentId: 'proj-1',
            })
          );
        }
        if (where.id === 'proj-1') {
          return Promise.resolve({
            id: 'proj-1',
            nodeType: NodeType.PROJECT,
          });
        }
        return Promise.resolve(null);
      });
      storageUsageService.getSubtreeFileNodes.mockResolvedValue([
        { id: 'child-1', size: 100, path: '202607/child-1/f.mxweb' },
        { id: 'child-2', size: 200, path: '202607/child-2/f.mxweb' },
      ]);
      nodeSizeResolver.resolveFileSizes.mockResolvedValue(300);

      await service.copyNode('folder-1', 'proj-1', 'user-1');

      expect(nodeSizeResolver.resolveFileSizes).toHaveBeenCalledWith([
        { id: 'child-1', size: 100, path: '202607/child-1/f.mxweb' },
        { id: 'child-2', size: 200, path: '202607/child-2/f.mxweb' },
      ]);
      expect(nodeMutationGuard.assertMutationAllowed).toHaveBeenCalledWith(
        'user-1',
        'copy',
        {
          node: { id: 'folder-1' },
          target: { id: 'proj-1' },
          incrementBytes: 300,
        }
      );
    });
  });

  describe('copyNode — 三阶段复制行为（计划 → 物理复制 → 单事务落库）', () => {
    const setupSource = () => {
      prisma.fileSystemNode.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'node-1') {
          return Promise.resolve(fileNode());
        }
        if (where.id === 'folder-1') {
          return Promise.resolve(
            fileNode({
              id: 'folder-1',
              nodeType: NodeType.FOLDER,
              path: null,
              parentId: 'proj-1',
            })
          );
        }
        if (where.id === 'proj-1') {
          return Promise.resolve({
            id: 'proj-1',
            nodeType: NodeType.PROJECT,
          });
        }
        return Promise.resolve(null);
      });
    };

    it('when 物理目录复制失败：抛 BadRequest 且不落库（$transaction 不执行）', async () => {
      setupSource();
      storageManager.copyNodeDirectory.mockRejectedValue(
        new Error('disk full')
      );

      await expect(
        service.copyNode('node-1', 'folder-1', 'user-1')
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.fileSystemNode.create).not.toHaveBeenCalled();
    });

    it('when 落库事务失败：异常向上抛出（回滚语义由 Prisma 保证）', async () => {
      setupSource();
      prisma.$transaction.mockRejectedValue(new Error('unique violation'));

      await expect(
        service.copyNode('node-1', 'folder-1', 'user-1')
      ).rejects.toThrow('unique violation');
      // 物理复制已先行完成
      expect(storageManager.copyNodeDirectory).toHaveBeenCalledTimes(1);
    });

    it('when FILE 复制成功：create 携带物理复制返回的新路径 + 新 ownerId', async () => {
      prisma.fileSystemNode.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'node-1') {
          return Promise.resolve(fileNode());
        }
        if (where.id === 'folder-1') {
          return Promise.resolve({
            id: 'folder-1',
            nodeType: NodeType.FOLDER,
          });
        }
        return Promise.resolve(null);
      });
      storageManager.copyNodeDirectory.mockResolvedValue(
        '202607/copied-dir/drawing.dwg.mxweb'
      );

      await service.copyNode('node-1', 'folder-1', 'user-2');

      expect(prisma.fileSystemNode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ownerId: 'user-2',
            path: '202607/copied-dir/drawing.dwg.mxweb',
            projectId: 'proj-1',
          }),
        })
      );
    });

    it('when FOLDER 子树复制：子节点入计划、兄弟重名自动加 (n) 后缀', async () => {
      setupSource();
      treeWalker.getSubtreeRows.mockResolvedValue([
        {
          id: 'child-a',
          parentId: 'folder-1',
          name: 'doc.dwg',
          originalName: null,
          nodeType: NodeType.FILE,
          path: '202607/child-a/doc.dwg.mxweb',
          size: 10,
          mimeType: null,
          extension: 'dwg',
          fileStatus: FileStatus.COMPLETED,
          fileHash: null,
          description: null,
        },
        {
          id: 'child-b',
          parentId: 'folder-1',
          name: 'doc.dwg',
          originalName: null,
          nodeType: NodeType.FILE,
          path: '202607/child-b/doc.dwg.mxweb',
          size: 20,
          mimeType: null,
          extension: 'dwg',
          fileStatus: FileStatus.COMPLETED,
          fileHash: null,
          description: null,
        },
      ]);
      storageManager.copyNodeDirectory.mockImplementation(
        (_src: string, targetNodeId: string) =>
          Promise.resolve(`202607/${targetNodeId}/doc.dwg.mxweb`)
      );

      await service.copyNode('folder-1', 'proj-1', 'user-1');

      // 根 + 两个子文件 = 3 条 create；重名者获得 " (1)" 后缀
      expect(prisma.fileSystemNode.create).toHaveBeenCalledTimes(3);
      const createdNames = prisma.fileSystemNode.create.mock.calls.map(
        (call: any) => call[0].data.name as string
      );
      expect(createdNames).toContain('doc.dwg');
      expect(createdNames).toContain('doc (1).dwg');
      // 子节点路径来自各自的物理复制结果（互不共享目录）；根为 FOLDER 无 path
      const createdPaths = prisma.fileSystemNode.create.mock.calls.map(
        (call: any) => call[0].data.path as string
      );
      expect(new Set(createdPaths.filter(Boolean)).size).toBe(2);
    });
  });

  describe('moveNode — 增量边界', () => {
    it('when 同项目移动：增量恒为 0，不经过 resolver', async () => {
      prisma.fileSystemNode.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'node-1') {
          return Promise.resolve(
            fileNode({ parentId: 'folder-a', projectId: 'proj-1', size: null })
          );
        }
        if (where.id === 'folder-b') {
          return Promise.resolve({
            id: 'folder-b',
            nodeType: NodeType.FOLDER,
            projectId: 'proj-1',
          });
        }
        return Promise.resolve(null);
      });

      await service.moveNode('node-1', 'folder-b', 'user-1');

      expect(nodeSizeResolver.resolveFileSize).not.toHaveBeenCalled();
      expect(nodeMutationGuard.assertMutationAllowed).toHaveBeenCalledWith(
        'user-1',
        'move',
        {
          node: { id: 'node-1' },
          target: { id: 'folder-b' },
          incrementBytes: 0,
        }
      );
      // 移动审计
      expect(auditLogService.logProjectNodeAction).toHaveBeenCalledWith(
        'NODE_MOVE',
        'node-1',
        'user-1',
        {
          oldParentId: 'folder-a',
          newParentId: 'folder-b',
          oldName: 'drawing.dwg',
          newName: 'drawing.dwg',
        },
        'FILE'
      );
    });

    it('when 跨项目移动 FILE size=null：按 resolver 解析的真实大小计增量', async () => {
      treeWalker.resolveProjectId.mockResolvedValue('proj-b');
      prisma.fileSystemNode.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'node-1') {
          return Promise.resolve(
            fileNode({ parentId: 'folder-a', projectId: 'proj-a', size: null })
          );
        }
        if (where.id === 'folder-b') {
          return Promise.resolve({
            id: 'folder-b',
            nodeType: NodeType.FOLDER,
            projectId: 'proj-b',
          });
        }
        return Promise.resolve(null);
      });
      nodeSizeResolver.resolveFileSize.mockResolvedValue(8192);

      await service.moveNode('node-1', 'folder-b', 'user-1');

      expect(nodeSizeResolver.resolveFileSize).toHaveBeenCalledTimes(1);
      expect(nodeMutationGuard.assertMutationAllowed).toHaveBeenCalledWith(
        'user-1',
        'move',
        {
          node: { id: 'node-1' },
          target: { id: 'folder-b' },
          incrementBytes: 8192,
        }
      );
    });

    it('when 跨项目移动 FOLDER：级联更新子树 projectId（消除陈旧字段）', async () => {
      treeWalker.resolveProjectId.mockResolvedValue('proj-b');
      treeWalker.getSubtreeIds.mockResolvedValue([
        'folder-1',
        'sub-1',
        'sub-2',
      ]);
      prisma.fileSystemNode.updateMany = jest
        .fn()
        .mockResolvedValue({ count: 3 });
      prisma.fileSystemNode.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'folder-1') {
          return Promise.resolve({
            id: 'folder-1',
            nodeType: NodeType.FOLDER,
            parentId: 'proj-a',
            name: 'design',
            ownerId: 'user-1',
            projectId: 'proj-a',
            size: null,
            path: null,
          });
        }
        if (where.id === 'folder-b') {
          return Promise.resolve({
            id: 'folder-b',
            nodeType: NodeType.FOLDER,
            projectId: 'proj-b',
          });
        }
        return Promise.resolve(null);
      });

      await service.moveNode('folder-1', 'folder-b', 'user-1');

      expect(treeWalker.getSubtreeIds).toHaveBeenCalledWith('folder-1', {
        includeRoot: true,
        includeDeleted: false,
      });
      expect(prisma.fileSystemNode.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['folder-1', 'sub-1', 'sub-2'] } },
        data: { projectId: 'proj-b' },
      });
    });

    it('when 同项目移动：不触发子树 projectId 级联', async () => {
      treeWalker.getSubtreeIds.mockResolvedValue(['folder-1', 'sub-1']);
      prisma.fileSystemNode.updateMany = jest
        .fn()
        .mockResolvedValue({ count: 0 });
      prisma.fileSystemNode.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'node-1') {
          return Promise.resolve(fileNode({ parentId: 'folder-a' }));
        }
        if (where.id === 'folder-b') {
          return Promise.resolve({
            id: 'folder-b',
            nodeType: NodeType.FOLDER,
            projectId: 'proj-1',
          });
        }
        return Promise.resolve(null);
      });

      await service.moveNode('node-1', 'folder-b', 'user-1');

      expect(treeWalker.getSubtreeIds).not.toHaveBeenCalled();
      expect(prisma.fileSystemNode.updateMany).not.toHaveBeenCalled();
    });
  });
});
