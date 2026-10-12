import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ShareService } from './share.service';
import { StorageManager } from '../storage-management/services/storage-manager.service';
import { ProjectPermission } from '../common/enums/permissions.enum';

/**
 * validateShareFileAccess 路径匹配回归测试。
 *
 * storagePath 来自 URL 路径参数（mxcad-file-access 的 filesData/*path，攻击者可控）。
 * 有效 shareToken 只应放行「主文件本身 + 同一 nodeId 目录下的关联文件（外部参照）」，
 * 裸 startsWith 会让同月前缀兄弟目录（YYYYMM/<nodeId>-evil/…）被误判为同节点。
 */
describe('ShareService.validateShareFileAccess', () => {
  const validShare = {
    id: 'share-1',
    token: 'tok-abc',
    fileId: 'node-1',
    createdBy: 'user-1',
    deletedAt: null,
    expiresAt: null,
    usedCount: 0,
  };
  const mainNode = {
    id: 'node-1',
    path: '202509/node-1/main.dwg',
    deletedAt: null,
  };

  const createService = (fileNode: unknown) => {
    const prisma = {
      fileShare: {
        findUnique: jest.fn().mockResolvedValue(validShare),
        update: jest.fn().mockResolvedValue(validShare),
      },
      fileSystemNode: {
        findUnique: jest.fn().mockResolvedValue(fileNode),
        findFirst: jest.fn(),
      },
    };
    // 授权判定已委托 assertNodeAccess；validateShareFileAccess 不走该路径，空壳即可
    const fileSystemPermissionService = { assertNodeAccess: jest.fn() };
    const auditLogService = {
      log: jest.fn(),
      logProjectNodeAction: jest.fn(),
    };
    // isSameNodeStoragePath 是纯路径比较，依赖项传空壳即可
    return new ShareService(
      prisma as never,
      fileSystemPermissionService as never,
      auditLogService as never,
      new StorageManager({} as never, {} as never)
    );
  };

  it('主文件路径精确匹配：放行', async () => {
    const service = createService(mainNode);
    await expect(
      service.validateShareFileAccess('tok-abc', '202509/node-1/main.dwg')
    ).resolves.toBeUndefined();
  });

  it('同 nodeId 目录下的外部参照：放行', async () => {
    const service = createService(mainNode);
    await expect(
      service.validateShareFileAccess('tok-abc', '202509/node-1/A1.dwg.mxweb')
    ).resolves.toBeUndefined();
  });

  it('同月前缀兄弟目录（node-1-evil）：拒绝（非同节点）', async () => {
    const service = createService(mainNode);
    await expect(
      service.validateShareFileAccess('tok-abc', '202509/node-1-evil/other.dwg')
    ).rejects.toThrow(ForbiddenException);
  });

  it('其他节点目录：拒绝', async () => {
    const service = createService(mainNode);
    await expect(
      service.validateShareFileAccess('tok-abc', '202509/node-2/other.dwg')
    ).rejects.toThrow(ForbiddenException);
  });

  it('主文件已被删除：404', async () => {
    const service = createService({ ...mainNode, deletedAt: new Date() });
    await expect(
      service.validateShareFileAccess('tok-abc', '202509/node-1/main.dwg')
    ).rejects.toThrow(NotFoundException);
  });

  it('分享已撤销：404', async () => {
    const prisma = {
      fileShare: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...validShare, deletedAt: new Date() }),
        update: jest.fn(),
      },
      fileSystemNode: { findUnique: jest.fn(), findFirst: jest.fn() },
    };
    const service = new ShareService(
      prisma as never,
      {} as never,
      {} as never,
      new StorageManager({} as never, {} as never)
    );
    await expect(
      service.validateShareFileAccess('tok-abc', '202509/node-1/main.dwg')
    ).rejects.toThrow(NotFoundException);
  });

  it('分享已过期：404', async () => {
    const prisma = {
      fileShare: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            ...validShare,
            expiresAt: new Date(Date.now() - 1000),
          }),
        update: jest.fn(),
      },
      fileSystemNode: { findUnique: jest.fn(), findFirst: jest.fn() },
    };
    const service = new ShareService(
      prisma as never,
      {} as never,
      {} as never,
      new StorageManager({} as never, {} as never)
    );
    await expect(
      service.validateShareFileAccess('tok-abc', '202509/node-1/main.dwg')
    ).rejects.toThrow(NotFoundException);
  });
});

/**
 * resolveShareNode 已删节点元数据泄漏回归。
 *
 * 旧实现对已入回收站的节点仍回吐 path + fileHash（兄弟端点 resolveShare /
 * validateShareFileAccess 对同一 token 均 404）。移动端 useFileLoader 依赖
 * resolveShareNode 对已删节点返回 200 + deletedAt（先判 deletedAt 再判 fileHash）
 * 以提示「文件已被删除」，故不能改 404；改为对已删节点保留 deletedAt、
 * 但置空存储定位字段 path/fileHash，与兄弟端点「已删节点不可用」口径对齐。
 */
describe('ShareService.resolveShareNode 已删节点元数据', () => {
  const validShare = {
    id: 'share-1',
    token: 'tok-abc',
    fileId: 'node-1',
    createdBy: 'user-1',
    deletedAt: null,
    expiresAt: null,
    usedCount: 0,
  };
  const baseNode = {
    id: 'node-1',
    name: 'main.dwg',
    fileHash: 'hash-1',
    path: '202509/node-1/main.dwg',
    parentId: 'root-1',
    deletedAt: null,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const createService = (fileNode: unknown) => {
    const prisma = {
      fileShare: {
        findUnique: jest.fn().mockResolvedValue(validShare),
        update: jest.fn().mockResolvedValue(validShare),
      },
      fileSystemNode: {
        findUnique: jest.fn().mockResolvedValue(fileNode),
        findFirst: jest.fn(),
      },
    };
    return new ShareService(
      prisma as never,
      {} as never,
      {} as never,
      new StorageManager({} as never, {} as never)
    );
  };

  it('存活节点：回吐 path + fileHash', async () => {
    const service = createService(baseNode);
    const result = await service.resolveShareNode('tok-abc');
    expect(result.path).toBe('202509/node-1/main.dwg');
    expect(result.fileHash).toBe('hash-1');
    expect(result.deletedAt).toBeNull();
  });

  it('已删节点：保留 deletedAt 但置空 path/fileHash（不再泄漏存储定位字段）', async () => {
    const service = createService({ ...baseNode, deletedAt: new Date() });
    const result = await service.resolveShareNode('tok-abc');
    expect(result.deletedAt).toEqual(expect.any(String));
    expect(result.path).toBeNull();
    expect(result.fileHash).toBeNull();
  });
});

/**
 * listShares 状态筛选下推回归。
 *
 * 移动端「全部/有效/已过期」原先是客户端过滤已加载页，而 total 由服务端未过滤计数返回，
 * 过滤后会出现「还能加载但已无有效项」、全选计数口径也不一致。修法是把 status 下推到 DB，
 * 让 count 与 findMany 走同一个 where。这里锁死三种分支的 where 形状与 total 来源。
 */
describe('ShareService.listShares status 筛选', () => {
  const createService = () => {
    const count = jest.fn().mockResolvedValue(0);
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      fileShare: { count, findMany },
      fileSystemNode: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ShareService(
      prisma as never,
      {} as never,
      {} as never,
      new StorageManager({} as never, {} as never)
    );
    return { service, count, findMany };
  };

  const capturedWhere = (mock: jest.Mock) =>
    (mock.mock.calls[0][0].where as { OR?: Array<Record<string, unknown>> });

  it('status=active：永不过期（expiresAt 为 null）或未到期', async () => {
    const { service, count, findMany } = createService();
    await service.listShares('user-1', { status: 'active' });
    expect(capturedWhere(count).OR).toEqual([
      { expiresAt: null },
      { expiresAt: { gt: expect.any(Date) } },
    ]);
    // count 与 findMany 必须走同一个 where，否则 total 与列表口径不一致
    expect(capturedWhere(findMany).OR).toEqual(capturedWhere(count).OR);
  });

  it('status=expired：expiresAt 不晚于当前时间', async () => {
    const { service, count } = createService();
    await service.listShares('user-1', { status: 'expired' });
    expect(capturedWhere(count).OR).toEqual([
      { expiresAt: { lte: expect.any(Date) } },
    ]);
  });

  it('不传 status 或传未知值：按全部返回，不加 OR 条件', async () => {
    for (const query of [{}, { status: 'foo' }]) {
      const { service, count } = createService();
      await service.listShares('user-1', query as never);
      expect(capturedWhere(count).OR).toBeUndefined();
    }
  });

  it('total 来自过滤后的 count，而非全量条数', async () => {
    const { service, count } = createService();
    count.mockResolvedValue(3);
    const result = await service.listShares('user-1', { status: 'expired' });
    expect(result.total).toBe(3);
  });
});

/**
 * #1 分享授权委托 assertNodeAccess 回归（唯一授权绕过）。
 *
 * 旧实现按节点自身 nodeType 走四段梯子：库内子文件 nodeType=FILE 但根为 LIBRARY_*，
 * 会漏判库两段、只剩 ownerId 段 → 另存进库的普通成员（ownerId=自己）绕过
 * LIBRARY_DRAWING_MANAGE、库管理员分享他人图纸反被 403。新实现统一委托
 * assertNodeAccess（按 TreeWalker 解析的根类型判定，fail-closed）。
 */
describe('ShareService 分享授权委托 assertNodeAccess（#1 回归）', () => {
  // 库内子文件：projectId=null、nodeType 为 FILE（非 LIBRARY_*），根才是 LIBRARY_DRAWING
  const subFileNode = { id: 'sub-1', projectId: null, name: 'sub.dwg' };
  const createdShare = { token: 'tok-new', expiresAt: null };

  const createService = (assertNodeAccess: jest.Mock) => {
    const prisma = {
      fileSystemNode: { findFirst: jest.fn().mockResolvedValue(subFileNode) },
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({ fileShare: { create: jest.fn().mockResolvedValue(createdShare) } })
      ),
    };
    const auditLogService = { log: jest.fn() };
    const service = new ShareService(
      prisma as never,
      { assertNodeAccess } as never,
      auditLogService as never,
      new StorageManager({} as never, {} as never)
    );
    return { service, assertNodeAccess };
  };

  it('createShare 委托 assertNodeAccess(userId, fileId, FILE_SHARE)', async () => {
    const assertNodeAccess = jest.fn().mockResolvedValue(undefined);
    const { service } = createService(assertNodeAccess);

    await service.createShare({ fileId: 'sub-1' }, 'member-1');

    expect(assertNodeAccess).toHaveBeenCalledWith(
      'member-1',
      'sub-1',
      ProjectPermission.FILE_SHARE
    );
  });

  it('库内子文件：无 LIBRARY_DRAWING_MANAGE 的普通成员被拒（旧 ownerId 旁路已消除）', async () => {
    // 普通成员把图纸另存进库后（ownerId=自己），旧实现会经 ownerId 段放行；
    // 新实现委托 assertNodeAccess 按根类型（LIBRARY_DRAWING）要求系统权限，拒绝并 fail-closed
    const assertNodeAccess = jest
      .fn()
      .mockRejectedValue(new ForbiddenException('没有访问该资源库的权限'));
    const { service } = createService(assertNodeAccess);

    await expect(
      service.createShare({ fileId: 'sub-1' }, 'member-1')
    ).rejects.toThrow(ForbiddenException);

    expect(assertNodeAccess).toHaveBeenCalledWith(
      'member-1',
      'sub-1',
      ProjectPermission.FILE_SHARE
    );
  });
});
