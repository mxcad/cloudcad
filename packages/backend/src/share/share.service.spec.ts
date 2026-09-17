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
