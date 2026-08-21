import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { StorageManager } from '../storage-management/services/storage-manager.service';
import { UserCleanupService } from './user-cleanup.service';
import { NodeType, ProjectStatus } from '@cloudcad/db';

describe('UserCleanupService', () => {
  let service: UserCleanupService;
  let prisma: any;
  let storageManager: {
    deleteNodeStorage: jest.Mock;
  };

  const txFactory = () => {
    const state: any = { deleted: {}, updated: {}, users: {} };
    const tx = {
      projectMember: { deleteMany: jest.fn(async (a: any) => { state.deleted.members = a.where; return { count: 2 }; }) },
      fileSystemNode: {
        findMany: jest.fn(async (a: any) => {
          if (a.where.nodeType === NodeType.PROJECT) {
            return [{ id: 'proj-1' }, { id: 'proj-2' }];
          }
          if (a.select.path) {
            return [{ path: '202607/node-1' }, { path: '202608/node-2' }, { path: 'badpath' }];
          }
          return [{ id: 'node-1' }, { id: 'node-2' }];
        }),
        update: jest.fn(async (a: any) => { state.updated.node = a.data; return {}; }),
        updateMany: jest.fn(async (a: any) => { state.updated.storage = a.data; return { count: 2 }; }),
      },
      auditLog: { deleteMany: jest.fn(async () => ({ count: 3 })) },
      refreshToken: { deleteMany: jest.fn(async () => ({ count: 1 })) },
      uploadSession: { deleteMany: jest.fn(async () => ({ count: 1 })) },
      runtimeConfigLog: { deleteMany: jest.fn(async () => ({ count: 2 })) },
      paymentOrder: { deleteMany: jest.fn(async () => ({ count: 2 })) },
      userMembership: { deleteMany: jest.fn(async () => ({ count: 1 })) },
      fileShare: { deleteMany: jest.fn(async () => ({ count: 3 })) },
      batchDownloadJob: { deleteMany: jest.fn(async () => ({ count: 1 })) },
      user: { delete: jest.fn(async (a: any) => { state.users.deleted = a.where; return {}; }) },
    };
    return { tx, state };
  };

  beforeEach(async () => {
    prisma = { $transaction: jest.fn(), user: { findMany: jest.fn() } };
    storageManager = { deleteNodeStorage: jest.fn(async () => {}) };

    const module = await Test.createTestingModule({
      providers: [
        UserCleanupService,
        { provide: DatabaseService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: jest.fn(() => 30) },
        },
        {
          provide: 'CONFIG',
          useValue: { getValue: jest.fn().mockResolvedValue(7) },
        },
        { provide: StorageManager, useValue: storageManager },
      ],
    }).compile();

    service = module.get(UserCleanupService);
  });

  it('cleanupUser 不删除账号', async () => {
    const { tx, state } = txFactory();
    prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(tx));

    const result = await service.cleanupUser('u-1');

    expect(state.users.deleted).toBeUndefined();
    expect(result.deletedPaymentOrders).toBe(2);
    expect(result.deletedFileShares).toBe(3);
    expect(result.deletedBatchJobs).toBe(1);
    expect(result.deletedMembers).toBe(2);
    expect(result.deletedProjects).toBe(2);
    expect(result.markedForStorageCleanup).toBe(2);
  });

  it('deleteUserCompletely 同事务删除账号 + 物理删除存储', async () => {
    const { tx, state } = txFactory();
    prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(tx));

    const result = await service.deleteUserCompletely('u-1');

    expect(state.users.deleted).toEqual({ id: 'u-1' });
    expect(storageManager.deleteNodeStorage).toHaveBeenCalledWith('node-1', '202607');
    expect(storageManager.deleteNodeStorage).toHaveBeenCalledWith('node-2', '202608');
    expect(storageManager.deleteNodeStorage).toHaveBeenCalledTimes(2);
    expect(result.storagePaths).toEqual(['202607/node-1', '202608/node-2', 'badpath']);
  });

  it('deleteUserCompletely 先收集路径再删除账号（防级联丢路径）', async () => {
    const { tx, state } = txFactory();
    prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(tx));

    await service.deleteUserCompletely('u-1');

    const findCall = tx.fileSystemNode.findMany.mock.calls.find(
      (c: any) => c[0]?.select?.path
    );
    const deleteCall = tx.user.delete.mock.calls;
    expect(findCall).toBeDefined();
    expect(deleteCall.length).toBe(1);
  });

  it('cleanupUserTx 软删项目 + 标记存储', async () => {
    const { tx, state } = txFactory();
    prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(tx));

    await service.cleanupUser('u-1');

    expect(state.updated.node).toEqual({
      deletedAt: expect.any(Date),
      projectStatus: ProjectStatus.DELETED,
    });
    expect(state.updated.storage).toEqual({ deletedFromStorage: expect.any(Date) });
  });

  it('deleteOwnedStorage 路径格式错误跳过', async () => {
    const { tx } = txFactory();
    prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(tx));

    await service.deleteUserCompletely('u-1');

    expect(storageManager.deleteNodeStorage).toHaveBeenCalledTimes(2);
  });

  it('cleanupExpiredUsers 累计并删除账号', async () => {
    const { tx, state } = txFactory();
    prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));
    prisma.user.findMany.mockResolvedValue([{ id: 'u-1', email: 'a@b.c', deletedAt: new Date() }]);

    const result = await service.cleanupExpiredUsers();

    expect(result.processedUsers).toBe(1);
    expect(result.deletedPaymentOrders).toBe(2);
    expect(state.users.deleted).toEqual({ id: 'u-1' });
    expect(result.success).toBe(true);
  });

  it('cleanupExpiredUsers 单个用户失败不影响其他', async () => {
    const { tx } = txFactory();
    prisma.$transaction
      .mockImplementationOnce(async (fn: any) => {
        throw new Error('fk fail');
      })
      .mockImplementationOnce(async (fn: any) => fn(tx));
    prisma.user.findMany.mockResolvedValue([
      { id: 'u-1', email: 'a@b.c', deletedAt: new Date() },
      { id: 'u-2', email: 'c@d.e', deletedAt: new Date() },
    ]);

    const result = await service.cleanupExpiredUsers();

    expect(result.processedUsers).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.success).toBe(false);
  });

  it('manualCleanup 删除账号', async () => {
    const { tx, state } = txFactory();
    prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));
    prisma.user.findMany.mockResolvedValue([{ id: 'u-1' }]);

    const result = await service.manualCleanup(30);

    expect(result.processedUsers).toBe(1);
    expect(state.users.deleted).toEqual({ id: 'u-1' });
  });
});
