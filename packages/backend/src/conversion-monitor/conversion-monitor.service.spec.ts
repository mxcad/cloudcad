///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import type { IFunctionExecutor } from '../function-executor/function-executor.interface';
import { ConversionMonitorService } from './conversion-monitor.service';

/** 监控只依赖 seam：测试夹具即一个按返回形态区分部署模式的假执行器 */
interface ExecutorFixture {
  queueStats?: jest.Mock;
  durationStats?: jest.Mock;
  listTasks?: jest.Mock;
}

function makeService(fixture: ExecutorFixture): ConversionMonitorService {
  return new ConversionMonitorService(
    fixture as unknown as IFunctionExecutor,
  );
}

const PRIORITY_QUEUE_STATS = {
  kind: 'priority-queue',
  stats: {
    queueLength: 3,
    criticalPriorityQueueLength: 1,
    highPriorityQueueLength: 1,
    lowPriorityQueueLength: 1,
    runningCount: 2,
    maxConcurrent: 4,
    timeout: 600000,
  },
} as const;

const PRIORITY_QUEUE_DURATION = {
  kind: 'priority-queue',
  stats: {
    sampleCount: 5,
    p50DurationMs: 100,
    p95DurationMs: 300,
    p50WaitMs: 0,
    p95WaitMs: 10,
  },
} as const;

const WORKER_POOL_STATS = {
  kind: 'worker-pool',
  tasks: {
    total: 10,
    pending: 2,
    processing: 1,
    completed: 6,
    failed: 1,
  },
  workers: {
    '1': {
      label: 'upload',
      maxConcurrent: 2,
      currentMax: 4,
      running: 2,
      waiting: 1,
      autoScale: true,
      backlogSince: 1700000000000,
    },
  },
} as const;

const TASK_DURATION_STATS = {
  kind: 'task',
  stats: { sampleCount: 6, p50Ms: 1200, p95Ms: 4500 },
} as const;

describe('ConversionMonitorService', () => {
  describe('executor shape routing', () => {
    it('should return priority queue stats for the embedded executor', async () => {
      const service = makeService({
        queueStats: jest.fn().mockResolvedValue(PRIORITY_QUEUE_STATS),
        durationStats: jest.fn().mockResolvedValue(PRIORITY_QUEUE_DURATION),
      });

      const stats = await service.getStats();
      expect(stats.mode).toBe('process-pool');
      expect(stats.processPool?.queueLength).toBe(3);
      expect(stats.processPool?.duration.p95DurationMs).toBe(300);
      expect(stats.conversionService).toBeNull();
      expect(stats.conversionServiceError).toBeNull();
    });

    it('should return null data blocks when the executor has no queue', async () => {
      const service = makeService({
        queueStats: jest.fn().mockResolvedValue(null),
        durationStats: jest.fn().mockResolvedValue(null),
      });

      const stats = await service.getStats();
      expect(stats.mode).toBe('cloud-faas');
      expect(stats.processPool).toBeNull();
      expect(stats.conversionService).toBeNull();
      expect(stats.conversionServiceError).toBeNull();
    });

    it('should return worker pool stats for the standalone-service executor', async () => {
      const service = makeService({
        queueStats: jest.fn().mockResolvedValue(WORKER_POOL_STATS),
        durationStats: jest.fn().mockResolvedValue(TASK_DURATION_STATS),
      });

      const stats = await service.getStats();
      expect(stats.mode).toBe('conversion-service');
      expect(stats.processPool).toBeNull();
      expect(stats.conversionService?.tasks.pending).toBe(2);
      expect(stats.conversionService?.duration.p95Ms).toBe(4500);
      expect(stats.conversionService?.workers['1'].currentMax).toBe(4);
      expect(stats.conversionServiceError).toBeNull();
    });

    it('should surface fetch failures as conversionServiceError', async () => {
      // 只有独立服务形态涉及 IO（另两种为进程内读或无队列），失败即该形态
      const service = makeService({
        queueStats: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
        durationStats: jest.fn().mockResolvedValue(null),
      });

      const stats = await service.getStats();
      expect(stats.mode).toBe('conversion-service');
      expect(stats.conversionService).toBeNull();
      expect(stats.conversionServiceError).toContain('ECONNREFUSED');
    });
  });

  describe('sampler', () => {
    it('should append a sample to history for the embedded executor', async () => {
      const service = makeService({
        queueStats: jest.fn().mockResolvedValue({
          kind: 'priority-queue',
          stats: { queueLength: 1, runningCount: 2 },
        }),
        durationStats: jest.fn().mockResolvedValue({
          kind: 'priority-queue',
          stats: { p95DurationMs: 999 },
        }),
      });

      await (service as unknown as { sample: () => Promise<void> }).sample();

      const stats = await service.getStats();
      expect(stats.history).toHaveLength(1);
      expect(stats.history[0].queueDepth).toBe(1);
      expect(stats.history[0].running).toBe(2);
      expect(stats.history[0].p95DurationMs).toBe(999);
    });

    it('should map worker pool counts onto the sampler fields', async () => {
      const service = makeService({
        queueStats: jest.fn().mockResolvedValue({
          kind: 'worker-pool',
          tasks: { pending: 4, processing: 3 },
          workers: {},
        }),
        durationStats: jest.fn().mockResolvedValue({
          kind: 'task',
          stats: { p95Ms: 1500 },
        }),
      });

      await (service as unknown as { sample: () => Promise<void> }).sample();

      const stats = await service.getStats();
      expect(stats.history[0].queueDepth).toBe(4);
      expect(stats.history[0].running).toBe(3);
      expect(stats.history[0].p95DurationMs).toBe(1500);
    });

    it('should leave history fields null when the executor has no queue', async () => {
      const service = makeService({
        queueStats: jest.fn().mockResolvedValue(null),
        durationStats: jest.fn().mockResolvedValue(null),
      });

      await (service as unknown as { sample: () => Promise<void> }).sample();

      const stats = await service.getStats();
      expect(stats.history[0].queueDepth).toBeNull();
      expect(stats.history[0].running).toBeNull();
      expect(stats.history[0].p95DurationMs).toBeNull();
    });

    it('should trim history samples older than the 24h window', async () => {
      const service = makeService({
        queueStats: jest.fn().mockResolvedValue({
          kind: 'priority-queue',
          stats: { queueLength: 0, runningCount: 0 },
        }),
        durationStats: jest.fn().mockResolvedValue({
          kind: 'priority-queue',
          stats: { p95DurationMs: null },
        }),
      });
      const history = (
        service as unknown as {
          history: Array<{ t: number; queueDepth: number | null }>;
        }
      ).history;
      const now = Date.now();
      history.push({ t: now - 25 * 60 * 60 * 1000, queueDepth: 9 });
      history.push({ t: now - 60 * 60 * 1000, queueDepth: 8 });

      await (service as unknown as { sample: () => Promise<void> }).sample();

      expect(history).toHaveLength(2);
      expect(history[0].t).toBeGreaterThanOrEqual(now - 24 * 60 * 60 * 1000);
      expect(history[history.length - 1].queueDepth).toBe(0);
    });
  });

  describe('listTasks（#478 监控 Tab 逐任务明细）', () => {
    it('should pass executor task records straight through', async () => {
      const records = [
        {
          id: 't-1',
          type: 'open',
          status: 'completed',
          progress: 100,
          createdAt: '2026-09-03T00:00:00Z',
          updatedAt: '2026-09-03T00:01:00Z',
          startedAt: '2026-09-03T00:00:10Z',
          completedAt: '2026-09-03T00:01:00Z',
          contentKey: 'abc123',
        },
        {
          id: 't-2',
          type: 'export',
          status: 'processing',
          progress: 50,
          createdAt: '2026-09-03T00:02:00Z',
          updatedAt: '2026-09-03T00:03:00Z',
          startedAt: '2026-09-03T00:02:10Z',
          completedAt: null,
        },
      ];
      const service = makeService({
        listTasks: jest.fn().mockResolvedValue(records),
      });

      const list = await service.listTasks();
      expect(list.total).toBe(2);
      expect(list.items[0]).toEqual(
        expect.objectContaining({
          id: 't-1',
          status: 'completed',
          progress: 100,
          contentKey: 'abc123',
        }),
      );
      expect(list.items[1]).toEqual(
        expect.objectContaining({ id: 't-2', progress: 50 }),
      );
    });

    it('should forward the status filter to the executor', async () => {
      const listTasks = jest.fn().mockResolvedValue([]);
      const service = makeService({ listTasks });

      await service.listTasks('failed');
      expect(listTasks).toHaveBeenCalledWith('failed');
    });

    it('should return an empty list when the executor has no task store', async () => {
      const service = makeService({});

      const list = await service.listTasks();
      expect(list).toEqual({ items: [], total: 0 });
    });

    it('should degrade to an empty list when the executor rejects', async () => {
      const service = makeService({
        listTasks: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      });

      const list = await service.listTasks();
      expect(list).toEqual({ items: [], total: 0 });
    });
  });
});
