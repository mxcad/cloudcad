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
