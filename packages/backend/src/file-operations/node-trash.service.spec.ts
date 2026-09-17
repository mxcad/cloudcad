import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { NodeType, FileStatus as PrismaFileStatus } from '@cloudcad/db';
import { FileStatus } from '../common/enums/file-status.enum';
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
  let executor: Record<string, jest.Mock>;

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
        delete: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      // 事务直接执行回调，事务内直接用 prisma mock（无独立 tx 代理）
      $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
        fn(prisma)
      ),
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
      getSubtreeFiles: jest.fn().mockResolvedValue([]),
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
    // 默认无 cancelTask（process-pool / cloud-faas 模式），按需用例补上
    executor = {
      cancelTask: jest.fn().mockResolvedValue({ ok: true, status: 'CANCELLED' }),
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
        { provide: ModuleRef, useValue: { get: jest.fn(() => executor) } },
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

  describe('deleteNode — 取消在途转换（软删/硬删共用）', () => {
    /** cancelInflightConversions 是 fire-and-forget，deleteNode 返回后需等微任务链跑完 */
    async function flush(): Promise<void> {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    /** 直调私有方法，避免依赖 fire-and-forget 的时序 */
    function callCancel(nodeIds: string[]): Promise<void> {
      return (
        service as unknown as {
          cancelInflightConversions: (ids: string[]) => Promise<void>;
        }
      ).cancelInflightConversions(nodeIds);
    }

    const inFlightRows = [
      { id: 'node-1', taskId: 'async_node-1_1' },
      { id: 'child-1', taskId: 'async_child-1_2' },
    ];

    const stubInflightScan = (rows: typeof inFlightRows) => {
      prisma.fileSystemNode.findMany.mockImplementation(({ where }: any) =>
        where.fileStatus?.in ? Promise.resolve(rows) : Promise.resolve([])
      );
    };

    it('软删：扫描子树在途节点、清 taskId 后逐个 cancelTask', async () => {
      stubInflightScan(inFlightRows);
      treeWalker.getSubtreeIds.mockResolvedValue(['node-1', 'child-1']);

      await service.deleteNode('node-1');
      await flush();

      expect(prisma.fileSystemNode.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['node-1', 'child-1'] },
          taskId: { not: null },
          fileStatus: { in: [FileStatus.PROCESSING, FileStatus.UPLOADING] },
        },
        select: { id: true, taskId: true },
      });
      expect(prisma.fileSystemNode.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['node-1', 'child-1'] } },
        data: { taskId: null },
      });
      expect(executor.cancelTask).toHaveBeenCalledTimes(2);
      expect(executor.cancelTask).toHaveBeenCalledWith('async_node-1_1');
      expect(executor.cancelTask).toHaveBeenCalledWith('async_child-1_2');
    });

    it('执行器无 cancelTask（process-pool / cloud-faas）时直接跳过', async () => {
      delete executor.cancelTask;

      await callCancel(['node-1']);

      expect(prisma.fileSystemNode.findMany).not.toHaveBeenCalled();
      expect(prisma.fileSystemNode.updateMany).not.toHaveBeenCalled();
    });

    it('cancelTask 抛错或返回 ok=false：降级为告警，整体正常返回', async () => {
      stubInflightScan(inFlightRows);
      executor.cancelTask
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce({ ok: false, reason: 'already done' });

      await expect(callCancel(['node-1', 'child-1'])).resolves.toBe(undefined);

      expect(executor.cancelTask).toHaveBeenCalledTimes(2);
      expect(prisma.fileSystemNode.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['node-1', 'child-1'] } },
        data: { taskId: null },
      });
    });

    it('硬删：取消必须发生在物理删除事务之前，且带上根节点 id', async () => {
      stubInflightScan([{ id: 'node-1', taskId: 'async_node-1_9' }]);
      treeWalker.getSubtreeIds.mockResolvedValue(['child-1']);
      jest
        .spyOn(service, 'deleteFileFromStorage')
        .mockResolvedValue(undefined);

      await service.deleteNode('node-1', true);
      await flush();

      expect(prisma.fileSystemNode.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['child-1', 'node-1'] },
          taskId: { not: null },
          fileStatus: { in: [FileStatus.PROCESSING, FileStatus.UPLOADING] },
        },
        select: { id: true, taskId: true },
      });
      expect(prisma.fileSystemNode.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['node-1'] } },
        data: { taskId: null },
      });
      expect(executor.cancelTask).toHaveBeenCalledWith('async_node-1_9');
      // 事务会物理删行，若在事务后才扫描就查不到任何在途任务
      expect(prisma.fileSystemNode.findMany.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.$transaction.mock.invocationCallOrder[0]
      );
    });
  });
});
