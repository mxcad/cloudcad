import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NodeType, FileStatus as PrismaFileStatus } from '@cloudcad/db';
import { DatabaseService } from '../database/database.service';
import { StorageManager } from '../storage-management/services/storage-manager.service';
import { VERSION_CONTROL_TOKEN } from '../version-control/interfaces/version-control.interface';
import { IStorageProvider } from '../storage/interfaces/storage-provider.interface';
import { IPROJECT_PERMISSION_SERVICE } from '../roles/interfaces/project-permission-service.interface';
import { IPERMISSION_SERVICE } from '../permission/interfaces/permission-service.interface';
import { NodeNameService } from './node-name.service';
import { TreeWalker } from '../file-system/file-tree/tree-walker.service';
import { NodeMutationGuard } from './node-mutation.guard';
import { NodeStatusTransitioner } from '../file-system/file-status/node-status-transitioner';
import { NodeSizeResolverService } from '../file-system/storage-quota/node-size-resolver.service';
import { StorageUsageService } from '../vip/storage-usage/storage-usage.service';
import { NodeTrashService } from './node-trash.service';
import { AuditLogService } from '../audit/audit-log.service';

describe('NodeTrashService', () => {
  let service: NodeTrashService;
  let prisma: any;
  let storageManager: Record<string, jest.Mock>;
  let nodeNameService: Record<string, jest.Mock>;
  let treeWalker: Record<string, jest.Mock>;
  let nodeMutationGuard: Record<string, jest.Mock>;
  let nodeStatusTransitioner: Record<string, jest.Mock>;
  let projectPermissionService: Record<string, jest.Mock>;
  let nodeSizeResolver: Record<string, jest.Mock>;
  let storageUsageService: Record<string, jest.Mock>;
  let auditLogService: Record<string, jest.Mock>;

  const fileNode = (overrides: Record<string, unknown> = {}) => ({
    id: 'node-1',
    name: 'drawing.dwg',
    nodeType: NodeType.FILE,
    deletedAt: new Date('2026-07-01T00:00:00Z'),
    deletedByCascade: false,
    parentId: 'folder-parent',
    ownerId: 'user-1',
    projectId: 'proj-1',
    fileStatus: PrismaFileStatus.DELETED,
    size: 1024,
    path: '202607/node-1/drawing.dwg.mxweb',
    ...overrides,
  });

  const parentFolder = () => ({
    id: 'folder-parent',
    nodeType: NodeType.FOLDER,
    projectId: 'proj-1',
    deletedAt: null,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = {
      fileSystemNode: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          if (where.id === 'node-1') {
            return Promise.resolve(fileNode());
          }
          if (where.id === 'folder-parent') {
            return Promise.resolve(parentFolder());
          }
          if (where.id === 'proj-1') {
            return Promise.resolve({ nodeType: NodeType.PROJECT });
          }
          return Promise.resolve(null);
        }),
        findMany: jest.fn().mockImplementation(({ where }: any) => {
          if (where.fileStatus) {
            return Promise.resolve([]);
          }
          return Promise.resolve([]);
        }),
        update: jest.fn().mockResolvedValue(fileNode()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    storageManager = {
      getFullPath: jest
        .fn()
        .mockReturnValue('/data/202607/node-1/drawing.dwg.mxweb'),
    };
    nodeNameService = {
      generateUniqueName: jest.fn().mockResolvedValue('drawing.dwg'),
    };
    treeWalker = {
      getSubtreeIds: jest.fn().mockResolvedValue([]),
      resolveProjectId: jest.fn().mockResolvedValue('proj-1'),
    };
    nodeMutationGuard = {
      assertMutationAllowed: jest.fn().mockResolvedValue(undefined),
      assertByteQuota: jest.fn().mockResolvedValue(undefined),
      assertProjectQuota: jest.fn().mockResolvedValue(undefined),
      invalidateQuotaAfterMutation: jest.fn().mockResolvedValue(undefined),
    };
    nodeStatusTransitioner = {
      transition: jest.fn().mockResolvedValue(undefined),
    };
    projectPermissionService = {
      checkPermission: jest.fn().mockResolvedValue(true),
    };
    nodeSizeResolver = {
      resolveFileSize: jest.fn().mockResolvedValue(1024),
      resolveFileSizes: jest.fn().mockResolvedValue(0),
    };
    storageUsageService = {
      getSubtreeFileNodes: jest.fn().mockResolvedValue([]),
    };
    auditLogService = {
      log: jest.fn().mockResolvedValue(undefined),
      logProjectNodeAction: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NodeTrashService,
        { provide: DatabaseService, useValue: prisma },
        { provide: StorageManager, useValue: storageManager },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: VERSION_CONTROL_TOKEN,
          useValue: { isReady: jest.fn().mockReturnValue(false) },
        },
        { provide: IStorageProvider, useValue: {} },
        {
          provide: IPROJECT_PERMISSION_SERVICE,
          useValue: projectPermissionService,
        },
        {
          provide: IPERMISSION_SERVICE,
          useValue: { checkSystemPermission: jest.fn() },
        },
        { provide: NodeNameService, useValue: nodeNameService },
        { provide: TreeWalker, useValue: treeWalker },
        { provide: NodeMutationGuard, useValue: nodeMutationGuard },
        { provide: NodeStatusTransitioner, useValue: nodeStatusTransitioner },
        { provide: NodeSizeResolverService, useValue: nodeSizeResolver },
        { provide: StorageUsageService, useValue: storageUsageService },
        { provide: AuditLogService, useValue: auditLogService },
      ],
    }).compile();

    service = module.get(NodeTrashService);
  });

  describe('restoreNode — FILE 节点 size=null 的恢复大小计算', () => {
    it('when size 为 null：按 NodeSizeResolverService 解析的真实大小做配额校验', async () => {
      prisma.fileSystemNode.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'node-1') {
          return Promise.resolve(fileNode({ size: null }));
        }
        if (where.id === 'folder-parent') {
          return Promise.resolve(parentFolder());
        }
        if (where.id === 'proj-1') {
          return Promise.resolve({ nodeType: NodeType.PROJECT });
        }
        return Promise.resolve(null);
      });
      nodeSizeResolver.resolveFileSize.mockResolvedValue(2048);

      await service.restoreNode('node-1', 'user-1');

      expect(nodeSizeResolver.resolveFileSize).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'node-1', size: null }),
        'node-1'
      );
      expect(nodeMutationGuard.assertByteQuota).toHaveBeenCalledWith(
        { node: { id: 'node-1' }, incrementBytes: 2048 },
        'user-1'
      );
      // 恢复审计（NODE_RESTORE）
      expect(auditLogService.logProjectNodeAction).toHaveBeenCalledWith(
        'NODE_RESTORE',
        'node-1',
        'user-1',
        { restoredName: 'drawing.dwg' },
        'FILE'
      );
    });

    it('when 物理文件不可读（resolver 抛错）：阻止恢复并抛 BadRequestException', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(
        fileNode({ size: null })
      );
      nodeSizeResolver.resolveFileSize.mockRejectedValue(
        new BadRequestException('无法读取文件大小，操作已取消')
      );

      await expect(
        service.restoreNode('node-1', 'user-1')
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(nodeMutationGuard.assertByteQuota).not.toHaveBeenCalled();
    });

    it('when size 为 null 且 path 缺失：阻止恢复并抛 BadRequestException', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(
        fileNode({ size: null, path: null })
      );

      await expect(
        service.restoreNode('node-1', 'user-1')
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(nodeSizeResolver.resolveFileSize).toHaveBeenCalled();
    });

    it('when size 正常：经 resolver 短路返回 DB size（不触物理读取）', async () => {
      await service.restoreNode('node-1', 'user-1');

      expect(nodeSizeResolver.resolveFileSize).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'node-1', size: 1024 }),
        'node-1'
      );
      expect(nodeMutationGuard.assertByteQuota).toHaveBeenCalledWith(
        { node: { id: 'node-1' }, incrementBytes: 1024 },
        'user-1'
      );
    });
  });

  describe('restoreNode — FOLDER 子树聚合', () => {
    it('when 子树含 size=null 的 FILE 节点：经 resolveFileSizes 补齐聚合', async () => {
      const folderNode = fileNode({
        nodeType: NodeType.FOLDER,
        name: 'folder',
        size: null,
        path: null,
      });
      prisma.fileSystemNode.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'node-1') {
          return Promise.resolve(folderNode);
        }
        if (where.id === 'folder-parent') {
          return Promise.resolve({
            id: 'folder-parent',
            nodeType: NodeType.FOLDER,
            projectId: 'proj-1',
            deletedAt: null,
          });
        }
        return Promise.resolve({ nodeType: NodeType.PROJECT });
      });
      prisma.fileSystemNode.findMany.mockImplementation(({ where }: any) => {
        if (where.fileStatus === PrismaFileStatus.DELETED) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });
      prisma.fileSystemNode.update.mockResolvedValue(folderNode);
      treeWalker.getSubtreeIds.mockResolvedValue(['child-1']);
      storageUsageService.getSubtreeFileNodes.mockResolvedValue([
        { id: 'child-1', size: null, path: '202607/child-1/f.mxweb' },
      ]);
      nodeSizeResolver.resolveFileSizes.mockResolvedValue(5120);

      await service.restoreNode('node-1', 'user-1');

      expect(nodeSizeResolver.resolveFileSizes).toHaveBeenCalledWith([
        { id: 'child-1', size: null, path: '202607/child-1/f.mxweb' },
      ]);
      expect(nodeMutationGuard.assertByteQuota).toHaveBeenCalledWith(
        { node: { id: 'node-1' }, incrementBytes: 5120 },
        'user-1'
      );
    });
  });
});
