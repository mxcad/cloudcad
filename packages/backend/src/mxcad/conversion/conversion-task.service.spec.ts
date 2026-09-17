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

import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { UnifiedConversionService } from './conversion-task.service';
import { AsyncConversionService } from './async-conversion.service';
import { DatabaseService } from '../../database/database.service';
import { IFunctionExecutor } from '../../function-executor/function-executor.interface';

describe('UnifiedConversionService', () => {
  let service: UnifiedConversionService;
  let asyncConversionService: {
    convertNode: jest.Mock;
    convertNodeForExport: jest.Mock;
  };
  let executor: { getTaskStatus: jest.Mock };
  let prisma: {
    fileSystemNode: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedConversionService,
        {
          provide: AsyncConversionService,
          useValue: {
            convertNode: jest.fn(),
            convertNodeForExport: jest.fn(),
          },
        },
        {
          provide: IFunctionExecutor,
          useValue: { invoke: jest.fn(), getTaskStatus: jest.fn() },
        },
        {
          provide: DatabaseService,
          useValue: {
            fileSystemNode: {
              findMany: jest.fn(),
              count: jest.fn(),
              findFirst: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<UnifiedConversionService>(
      UnifiedConversionService
    );
    asyncConversionService = module.get(AsyncConversionService);
    executor = module.get(IFunctionExecutor);
    prisma = module.get(DatabaseService);
  });

  describe('submitTask', () => {
    it('无 nodeId（游客/公开图纸）时抛 BadRequestException（本地记录，不经服务器）', async () => {
      await expect(
        service.submitTask({ type: 'open', target: {} })
      ).rejects.toThrow(BadRequestException);
      expect(asyncConversionService.convertNode).not.toHaveBeenCalled();
    });

    it('打开类型（open + nodeId）复用 convertNode，默认优先级 1', async () => {
      asyncConversionService.convertNode.mockResolvedValue('task-1');
      const result = await service.submitTask({
        type: 'open',
        target: { nodeId: 'node-1' },
      });
      expect(asyncConversionService.convertNode).toHaveBeenCalledWith(
        'node-1',
        1
      );
      expect(result).toEqual({
        taskId: 'task-1',
        nodeId: 'node-1',
        async: true,
      });
    });

    it('透传自定义优先级', async () => {
      asyncConversionService.convertNode.mockResolvedValue('task-2');
      await service.submitTask({
        type: 'open',
        target: { nodeId: 'node-1' },
        priority: 2,
      });
      expect(asyncConversionService.convertNode).toHaveBeenCalledWith(
        'node-1',
        2
      );
    });

    it('下载类型（download + nodeId + format + userId）复用 convertNodeForExport，默认优先级 2', async () => {
      asyncConversionService.convertNodeForExport.mockResolvedValue('task-3');
      const result = await service.submitTask(
        {
          type: 'download',
          target: { nodeId: 'node-1', format: 'dwg' },
        },
        'user-1'
      );
      expect(asyncConversionService.convertNodeForExport).toHaveBeenCalledWith(
        'node-1',
        'dwg',
        'user-1',
        2
      );
      expect(result).toEqual({
        taskId: 'task-3',
        nodeId: 'node-1',
        async: true,
      });
    });

    it('下载类型缺 format 时抛 BadRequestException', async () => {
      await expect(
        service.submitTask(
          { type: 'download', target: { nodeId: 'node-1' } },
          'user-1'
        )
      ).rejects.toThrow(BadRequestException);
      expect(asyncConversionService.convertNodeForExport).not.toHaveBeenCalled();
    });

    it('下载类型缺 userId（游客）时抛 BadRequestException', async () => {
      await expect(
        service.submitTask({
          type: 'download',
          target: { nodeId: 'node-1', format: 'dwg' },
        })
      ).rejects.toThrow(BadRequestException);
      expect(asyncConversionService.convertNodeForExport).not.toHaveBeenCalled();
    });
  });

  describe('cancelTask', () => {
    it('执行器不支持取消（process-pool/cloud-faas）时返回 ok=false + reason', async () => {
      // 默认 mock 无 cancelTask → 走「不支持」分支
      const result = await service.cancelTask('task-1');
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/不支持取消/);
    });

    it('conversion-service 模式（executor.cancelTask 存在）时转发', async () => {
      (executor as unknown as { cancelTask: jest.Mock }).cancelTask = jest.fn().mockResolvedValue({
        ok: true,
        status: 'CANCELLED',
      });
      const result = await service.cancelTask('task-1');
      expect(result).toEqual({ ok: true, status: 'CANCELLED' });
    });

    it('节点已软删时不转发执行器，返回 ok=false + 精确原因', async () => {
      (executor as unknown as { cancelTask: jest.Mock }).cancelTask = jest
        .fn()
        .mockResolvedValue({ ok: true, status: 'CANCELLED' });
      prisma.fileSystemNode.findFirst.mockImplementation(
        ({ where }: { where: { deletedAt?: unknown } }) =>
          Promise.resolve(where.deletedAt ? { id: 'node-1' } : null)
      );

      const result = await service.cancelTask('task-1');
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/已删除/);
      expect((executor as unknown as { cancelTask: jest.Mock }).cancelTask)
        .not.toHaveBeenCalled();
    });
  });

  describe('listTasks', () => {
    it('进行中节点解析实时任务状态（executor.getTaskStatus）', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([
        {
          id: 'node-1',
          name: 'a.dwg',
          fileStatus: 'PROCESSING',
          taskId: 'task-1',
          updatedAt: new Date('2026-09-01T00:00:00Z'),
        },
      ]);
      executor.getTaskStatus.mockResolvedValue({
        taskId: 'task-1',
        status: 'PROCESSING',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.listTasks('user-1');
      expect(result.total).toBe(1);
      expect(result.tasks[0]).toMatchObject({
        nodeId: 'node-1',
        name: 'a.dwg',
        fileStatus: 'PROCESSING',
        taskId: 'task-1',
        taskStatus: 'PROCESSING',
      });
      expect(executor.getTaskStatus).toHaveBeenCalledWith('task-1');
    });

    it('失败节点据任务记录取 permanent + error（S6-7：taskStatus 仍空，节点态为终态真相）', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([
        {
          id: 'node-2',
          name: 'b.dwg',
          fileStatus: 'FAILED',
          taskId: 'task-2',
          updatedAt: new Date('2026-09-01T00:00:00Z'),
        },
      ]);
      executor.getTaskStatus.mockResolvedValue({
        taskId: 'task-2',
        status: 'FAILED',
        error: '永久失败（内容不可转换）：解析失败',
        permanent: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.listTasks('user-1');
      // 节点 fileStatus=FAILED 是终态真相 → taskStatus 不覆盖（保持 undefined，面板据 fileStatus 展示「失败」）
      // permanent + error 从任务记录透传（面板据 permanent 展示「永久失败」）
      expect(result.tasks[0]).toMatchObject({
        nodeId: 'node-2',
        fileStatus: 'FAILED',
        taskStatus: undefined,
        error: '永久失败（内容不可转换）：解析失败',
        permanent: true,
      });
      expect(executor.getTaskStatus).toHaveBeenCalledWith('task-2');
    });

    it('失败节点任务记录丢失（404）时降级为普通失败（无 permanent/error，S6-7）', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([
        {
          id: 'node-5',
          name: 'e.dwg',
          fileStatus: 'FAILED',
          taskId: 'task-5',
          updatedAt: new Date('2026-09-01T00:00:00Z'),
        },
      ]);
      executor.getTaskStatus.mockRejectedValue(new Error('task gone'));

      const result = await service.listTasks('user-1');
      expect(result.tasks[0]).toMatchObject({
        nodeId: 'node-5',
        fileStatus: 'FAILED',
        taskStatus: undefined,
        error: undefined,
        permanent: undefined,
      });
      expect(executor.getTaskStatus).toHaveBeenCalledWith('task-5');
    });

    it('失败节点非永久失败（permanent=false）时不透传 permanent（S6-7）', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([
        {
          id: 'node-6',
          name: 'f.dwg',
          fileStatus: 'FAILED',
          taskId: 'task-6',
          updatedAt: new Date('2026-09-01T00:00:00Z'),
        },
      ]);
      executor.getTaskStatus.mockResolvedValue({
        taskId: 'task-6',
        status: 'FAILED',
        error: '瞬时失败（超时）',
        permanent: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.listTasks('user-1');
      // permanent=false（非永久失败）→ 面板展示普通「转换失败」
      expect(result.tasks[0].permanent).toBe(false);
      expect(result.tasks[0].error).toBe('瞬时失败（超时）');
    });

    it('进行中节点任务状态解析失败时降级为 UNKNOWN', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([
        {
          id: 'node-3',
          name: 'c.dwg',
          fileStatus: 'PROCESSING',
          taskId: 'task-3',
          updatedAt: new Date('2026-09-01T00:00:00Z'),
        },
      ]);
      executor.getTaskStatus.mockRejectedValue(new Error('task gone'));

      const result = await service.listTasks('user-1');
      expect(result.tasks[0].taskStatus).toBe('UNKNOWN');
    });

    it('进行中节点透传任务 progress（S4-2，面板展示转换进度）', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([
        {
          id: 'node-1',
          name: 'a.dwg',
          fileStatus: 'PROCESSING',
          taskId: 'task-1',
          updatedAt: new Date('2026-09-01T00:00:00Z'),
        },
      ]);
      executor.getTaskStatus.mockResolvedValue({
        taskId: 'task-1',
        status: 'PROCESSING',
        progress: 42,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.listTasks('user-1');
      expect(result.tasks[0].progress).toBe(42);
    });

    it('progress 缺省时不透传（undefined）', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([
        {
          id: 'node-4',
          name: 'd.dwg',
          fileStatus: 'PROCESSING',
          taskId: 'task-4',
          updatedAt: new Date('2026-09-01T00:00:00Z'),
        },
      ]);
      executor.getTaskStatus.mockResolvedValue({
        taskId: 'task-4',
        status: 'PROCESSING',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.listTasks('user-1');
      expect(result.tasks[0].progress).toBeUndefined();
    });

    it('进行中节点透传排队位置 queuePosition（S6-5，面板展示「第 N 位」）', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([
        {
          id: 'node-7',
          name: 'g.dwg',
          fileStatus: 'PROCESSING',
          taskId: 'task-7',
          updatedAt: new Date('2026-09-01T00:00:00Z'),
        },
      ]);
      executor.getTaskStatus.mockResolvedValue({
        taskId: 'task-7',
        status: 'PENDING',
        queuePosition: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.listTasks('user-1');
      expect(result.tasks[0].queuePosition).toBe(2);
    });

    it('queuePosition 缺省时不透传（undefined，运行中/未入队任务）', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([
        {
          id: 'node-8',
          name: 'h.dwg',
          fileStatus: 'PROCESSING',
          taskId: 'task-8',
          updatedAt: new Date('2026-09-01T00:00:00Z'),
        },
      ]);
      executor.getTaskStatus.mockResolvedValue({
        taskId: 'task-8',
        status: 'PROCESSING',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.listTasks('user-1');
      expect(result.tasks[0].queuePosition).toBeUndefined();
    });
  });

  describe('listHistory', () => {
    it('返回已完成（COMPLETED）任务，映射为 items + total + hasMore', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([
        {
          id: 'node-c1',
          name: 'done.dwg',
          fileStatus: 'COMPLETED',
          taskId: 'task-c1',
          updatedAt: new Date('2026-08-01T00:00:00Z'),
        },
      ]);
      prisma.fileSystemNode.count.mockResolvedValue(1);

      const result = await service.listHistory('user-1', 20, 0);
      expect(result.tasks).toEqual([
        {
          nodeId: 'node-c1',
          name: 'done.dwg',
          fileStatus: 'COMPLETED',
          taskId: 'task-c1',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      ]);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('分页：hasMore = offset + 本页数 < total（还有更多）', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([
        {
          id: 'n1',
          name: 'a.dwg',
          fileStatus: 'COMPLETED',
          taskId: 't1',
          updatedAt: new Date('2026-08-01T00:00:00Z'),
        },
        {
          id: 'n2',
          name: 'b.dwg',
          fileStatus: 'COMPLETED',
          taskId: 't2',
          updatedAt: new Date('2026-08-02T00:00:00Z'),
        },
      ]);
      prisma.fileSystemNode.count.mockResolvedValue(30);

      const result = await service.listHistory('user-1', 20, 0);
      expect(result.tasks).toHaveLength(2);
      expect(result.total).toBe(30);
      expect(result.hasMore).toBe(true);
    });

    it('limit 超上限 clamp 到 50，offset 负数 clamp 到 0', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([]);
      prisma.fileSystemNode.count.mockResolvedValue(0);

      await service.listHistory('user-1', 999, -5);
      const call = prisma.fileSystemNode.findMany.mock.calls[0][0];
      expect(call.take).toBe(50);
      expect(call.skip).toBe(0);
    });

    it('limit/offset 非法（NaN）时回退默认（limit=20, offset=0）', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([]);
      prisma.fileSystemNode.count.mockResolvedValue(0);

      await service.listHistory('user-1', Number.NaN, Number.NaN);
      const call = prisma.fileSystemNode.findMany.mock.calls[0][0];
      expect(call.take).toBe(20);
      expect(call.skip).toBe(0);
    });

    it('范围：where 含 nodeType=FILE + fileStatus=COMPLETED + ownerId=用户（只列自己账号文件，不要求 taskId），count 复用同一 where', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([]);
      prisma.fileSystemNode.count.mockResolvedValue(0);

      await service.listHistory('user-1');
      const call = prisma.fileSystemNode.findMany.mock.calls[0][0];
      expect(call.where.nodeType).toBe('FILE');
      expect(call.where.fileStatus).toBe('COMPLETED');
      // 历史不要求 taskId 非空（绝大多数已完成文件 taskId 为 null）
      expect(call.where.taskId).toBeUndefined();
      // 只列归当前用户所有（ownerId=userId）的文件，不含"所在项目的他人文件"
      expect(call.where.ownerId).toBe('user-1');
      expect(call.where.OR).toBeUndefined();
      expect(prisma.fileSystemNode.count).toHaveBeenCalledWith({
        where: call.where,
      });
    });

    it('search 非空：where 含 name contains 模糊匹配（DB 侧搜索，count 复用同一 where）', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([]);
      prisma.fileSystemNode.count.mockResolvedValue(0);

      await service.listHistory('user-1', 20, 0, 'dwg');
      const call = prisma.fileSystemNode.findMany.mock.calls[0][0];
      expect(call.where.name).toEqual({ contains: 'dwg' });
      expect(call.where.ownerId).toBe('user-1');
      expect(prisma.fileSystemNode.count).toHaveBeenCalledWith({
        where: call.where,
      });
    });

    it('search 为空白：trim 后为空，不加 name 过滤（where 无 name 字段）', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([]);
      prisma.fileSystemNode.count.mockResolvedValue(0);

      await service.listHistory('user-1', 20, 0, '   ');
      const call = prisma.fileSystemNode.findMany.mock.calls[0][0];
      expect(call.where.name).toBeUndefined();
    });
  });

  describe('retryTask', () => {
    it('别人的 taskId（查询无结果）时抛 NotFoundException（归属校验与 404 合并）', async () => {
      prisma.fileSystemNode.findFirst.mockResolvedValue(null);

      await expect(service.retryTask('task-other', 'user-1')).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.fileSystemNode.findFirst).toHaveBeenCalledWith({
        where: {
          taskId: 'task-other',
          deletedAt: null,
          OR: expect.any(Array),
        },
        select: { id: true, fileStatus: true, deletedAt: true },
      });
      expect(asyncConversionService.convertNode).not.toHaveBeenCalled();
    });

    it('已删除节点拒绝重试（node_deleted 精确原因），不重新排队', async () => {
      prisma.fileSystemNode.findFirst.mockResolvedValue({
        id: 'node-1',
        fileStatus: 'FAILED',
        deletedAt: new Date('2026-09-17T03:55:29Z'),
      });

      await expect(service.retryTask('task-1', 'user-1')).rejects.toThrow(
        /已删除/
      );
      expect(asyncConversionService.convertNode).not.toHaveBeenCalled();
    });

    it('非 FAILED 状态拒绝（retry_not_failed），不重新排队', async () => {
      prisma.fileSystemNode.findFirst.mockResolvedValue({
        id: 'node-1',
        fileStatus: 'COMPLETED',
      });

      await expect(service.retryTask('task-1', 'user-1')).rejects.toThrow(
        BadRequestException
      );
      expect(asyncConversionService.convertNode).not.toHaveBeenCalled();
    });

    it('FAILED 节点原地重新排队：convertNode 以 priority 2 被调，返回新 taskId + 原 nodeId', async () => {
      prisma.fileSystemNode.findFirst.mockResolvedValue({
        id: 'node-1',
        fileStatus: 'FAILED',
      });
      asyncConversionService.convertNode.mockResolvedValue('task-new');

      const result = await service.retryTask('task-1', 'user-1');
      expect(asyncConversionService.convertNode).toHaveBeenCalledWith(
        'node-1',
        2
      );
      expect(result).toEqual({ taskId: 'task-new', nodeId: 'node-1' });
    });
  });
});

