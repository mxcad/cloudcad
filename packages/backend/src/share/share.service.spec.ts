import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ShareService } from './share.service';

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
    const projectPermissionService = {
      isProjectOwner: jest.fn(),
      checkPermission: jest.fn(),
    };
    const systemPermissionService = { checkSystemPermission: jest.fn() };
    const auditLogService = {
      log: jest.fn(),
      logProjectNodeAction: jest.fn(),
    };
    return new ShareService(
      prisma as never,
      projectPermissionService as never,
      systemPermissionService as never,
      auditLogService as never
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
      {} as never
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
      {} as never
    );
    await expect(
      service.validateShareFileAccess('tok-abc', '202509/node-1/main.dwg')
    ).rejects.toThrow(NotFoundException);
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
      {} as never
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
