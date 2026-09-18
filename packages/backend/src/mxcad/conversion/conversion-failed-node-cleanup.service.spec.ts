///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this code, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FileStatus } from '@cloudcad/db';
import { DatabaseService } from '../../database/database.service';
import { NodeTrashService } from '../../file-operations/node-trash.service';
import { ConversionFailedNodeCleanupService } from './conversion-failed-node-cleanup.service';

describe('ConversionFailedNodeCleanupService', () => {
  let service: ConversionFailedNodeCleanupService;
  let mockPrisma: { fileSystemNode: { findMany: jest.Mock } };
  let mockNodeTrashService: { deleteNode: jest.Mock };

  async function createService(
    config: Record<string, string | undefined> = {}
  ) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversionFailedNodeCleanupService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((k: string) => config[k]) },
        },
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: NodeTrashService, useValue: mockNodeTrashService },
      ],
    }).compile();
    return module.get<ConversionFailedNodeCleanupService>(
      ConversionFailedNodeCleanupService
    );
  }

  beforeEach(() => {
    mockPrisma = { fileSystemNode: { findMany: jest.fn() } };
    mockNodeTrashService = { deleteNode: jest.fn() };
    // fake timers 才能让 setSystemTime 影响 Date.now()（cutoff 由当前时间算出）
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('保留窗口到期清理', () => {
    it('默认保留 24h：超窗口的 FAILED 节点彻底删除，返回扫描/删除计数', async () => {
      const stale = new Date('2025-12-31T11:59:00.000Z');
      mockPrisma.fileSystemNode.findMany.mockResolvedValue([
        { id: 'node-1', name: 'a.dwg', updatedAt: stale },
      ]);
      service = await createService();

      const result = await service.cleanupExpired();

      expect(result).toEqual({ scanned: 1, deleted: 1 });
      // 彻底删除（permanently=true），不进回收站；不传 userId → 不写 FILE_DELETE 审计
      expect(mockNodeTrashService.deleteNode).toHaveBeenCalledWith(
        'node-1',
        true
      );
    });

    it('查询条件：仅未删除的 FAILED 上传幽灵节点（path=null），updatedAt 不晚于 cutoff，批量上限 200', async () => {
      mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
      service = await createService();

      await service.cleanupExpired();

      const expectedCutoff = new Date('2025-12-31T12:00:00.000Z');
      expect(mockPrisma.fileSystemNode.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          fileStatus: FileStatus.FAILED,
          // 只清上传幽灵（path=null）；path 已就位的真实文件不删（防误删用户数据）
          path: null,
          updatedAt: { lte: expectedCutoff },
        },
        select: { id: true, name: true, updatedAt: true },
        orderBy: { updatedAt: 'asc' },
        take: 200,
      });
    });

    it('保留窗口可配：窗口内的 FAILED 节点不进候选（cutoff 随窗口变化）', async () => {
      mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
      service = await createService({
        CONVERSION_FAILED_NODE_RETENTION_HOURS: '1',
      });

      await service.cleanupExpired();

      expect(mockPrisma.fileSystemNode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            updatedAt: { lte: new Date('2026-01-01T11:00:00.000Z') },
          }),
        })
      );
    });

    it('无候选时不删除任何节点', async () => {
      mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
      service = await createService();

      expect(await service.cleanupExpired()).toEqual({
        scanned: 0,
        deleted: 0,
      });
      expect(mockNodeTrashService.deleteNode).not.toHaveBeenCalled();
    });

    it('单个节点删除失败不中断整批，留待下次扫描', async () => {
      mockPrisma.fileSystemNode.findMany.mockResolvedValue([
        {
          id: 'bad',
          name: 'bad.dwg',
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          id: 'ok',
          name: 'ok.dwg',
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      mockNodeTrashService.deleteNode.mockRejectedValueOnce(new Error('boom'));
      service = await createService();

      expect(await service.cleanupExpired()).toEqual({
        scanned: 2,
        deleted: 1,
      });
      expect(mockNodeTrashService.deleteNode).toHaveBeenCalledTimes(2);
    });
  });

  describe('配置', () => {
    it('保留窗口 <= 0 时禁用清理：不查库、不删除、不起定时器', async () => {
      mockPrisma.fileSystemNode.findMany.mockResolvedValue([
        {
          id: 'node-1',
          name: 'a.dwg',
          updatedAt: new Date('2020-01-01T00:00:00.000Z'),
        },
      ]);
      service = await createService({
        CONVERSION_FAILED_NODE_RETENTION_HOURS: '0',
      });

      expect(await service.cleanupExpired()).toEqual({
        scanned: 0,
        deleted: 0,
      });
      expect(mockPrisma.fileSystemNode.findMany).not.toHaveBeenCalled();
      expect(mockNodeTrashService.deleteNode).not.toHaveBeenCalled();

      service.onModuleInit();
      expect(mockPrisma.fileSystemNode.findMany).not.toHaveBeenCalled();
      service.onModuleDestroy();
    });

    it('配置值非法时回落默认 24h', async () => {
      mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
      service = await createService({
        CONVERSION_FAILED_NODE_RETENTION_HOURS: 'not-a-number',
      });

      await service.cleanupExpired();
      expect(mockPrisma.fileSystemNode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            updatedAt: { lte: new Date('2025-12-31T12:00:00.000Z') },
          }),
        })
      );
    });

    it('启用时 onModuleInit 按启动延迟触发一次清理，销毁后周期轮询不再触发', async () => {
      mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
      service = await createService();

      service.onModuleInit();
      expect(mockPrisma.fileSystemNode.findMany).not.toHaveBeenCalled();

      // 启动延迟 5min 后触发首次清理
      await jest.advanceTimersByTimeAsync(5 * 60 * 1000);
      expect(mockPrisma.fileSystemNode.findMany).toHaveBeenCalledTimes(1);

      // 销毁后周期轮询（1h）不再触发
      service.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(mockPrisma.fileSystemNode.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
