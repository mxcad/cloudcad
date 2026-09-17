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

import { ConfigService } from '@nestjs/config';
import { ConversionMonitorService } from './conversion-monitor.service';
import { ProcessPoolExecutor } from '../function-executor/process-pool.executor';

function makeService(
  env: Record<string, string>,
  executor: Partial<ProcessPoolExecutor>,
): ConversionMonitorService {
  const configService = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
  const service = new ConversionMonitorService(
    configService,
    executor as ProcessPoolExecutor,
  );
  (service as unknown as { httpGet: jest.Mock }).httpGet = jest.fn();
  return service;
}

const REMOTE_STATS = {
  tasks: {
    total: 10,
    pending: 2,
    processing: 1,
    completed: 6,
    failed: 1,
  },
  duration: { sampleCount: 6, p50Ms: 1200, p95Ms: 4500 },
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
};

describe('ConversionMonitorService', () => {
  describe('mode routing', () => {
    it('should return process-pool stats when mode is process-pool', async () => {
      const executor = {
        getQueueStats: jest.fn().mockReturnValue({
          queueLength: 3,
          criticalPriorityQueueLength: 1,
          highPriorityQueueLength: 1,
          lowPriorityQueueLength: 1,
          runningCount: 2,
          maxConcurrent: 4,
          timeout: 600000,
        }),
        getDurationStats: jest.fn().mockReturnValue({
          sampleCount: 5,
          p50DurationMs: 100,
          p95DurationMs: 300,
          p50WaitMs: 0,
          p95WaitMs: 10,
        }),
      };
      const service = makeService({ FUNCTION_EXECUTOR: '' }, executor);

      const stats = await service.getStats();
      expect(stats.mode).toBe('process-pool');
      expect(stats.processPool?.queueLength).toBe(3);
      expect(stats.processPool?.duration.p95DurationMs).toBe(300);
      expect(stats.conversionService).toBeNull();
      expect(stats.conversionServiceError).toBeNull();
    });

    it('should return null data blocks for cloud-faas mode', async () => {
      const service = makeService(
        { FUNCTION_EXECUTOR: 'cloud-faas' },
        {} as Partial<ProcessPoolExecutor>,
      );

      const stats = await service.getStats();
      expect(stats.mode).toBe('cloud-faas');
      expect(stats.processPool).toBeNull();
      expect(stats.conversionService).toBeNull();
      expect(stats.conversionServiceError).toBeNull();
    });

    it('should fetch and parse remote stats in conversion-service mode', async () => {
      const service = makeService(
        {
          FUNCTION_EXECUTOR: 'conversion-service',
          CONVERSION_SERVICE_URL: 'http://cs:3100',
        },
        {} as Partial<ProcessPoolExecutor>,
      );
      (service as unknown as { httpGet: jest.Mock }).httpGet.mockResolvedValue(
        REMOTE_STATS,
      );

      const stats = await service.getStats();
      expect(stats.mode).toBe('conversion-service');
      expect(stats.processPool).toBeNull();
      expect(stats.conversionService?.tasks.pending).toBe(2);
      expect(stats.conversionService?.duration.p95Ms).toBe(4500);
      expect(stats.conversionService?.workers['1'].currentMax).toBe(4);
      expect(stats.conversionServiceError).toBeNull();
      expect((service as unknown as { httpGet: jest.Mock }).httpGet).toHaveBeenCalledWith(
        '/v1/conversions/stats',
      );
    });

    it('should surface remote fetch failures as conversionServiceError', async () => {
      const service = makeService(
        { FUNCTION_EXECUTOR: 'conversion-service' },
        {} as Partial<ProcessPoolExecutor>,
      );
      (service as unknown as { httpGet: jest.Mock }).httpGet.mockRejectedValue(
        new Error('ECONNREFUSED'),
      );

      const stats = await service.getStats();
      expect(stats.conversionService).toBeNull();
      expect(stats.conversionServiceError).toContain('ECONNREFUSED');
    });

    it('should tolerate malformed remote responses', async () => {
      const service = makeService(
        { FUNCTION_EXECUTOR: 'conversion-service' },
        {} as Partial<ProcessPoolExecutor>,
      );
      (service as unknown as { httpGet: jest.Mock }).httpGet.mockResolvedValue({
        tasks: { pending: '2' },
        workers: { '2': { label: 'export', running: '1' } },
      });

      const stats = await service.getStats();
      expect(stats.conversionService?.tasks.pending).toBe(2);
      expect(stats.conversionService?.tasks.total).toBe(0);
      expect(stats.conversionService?.duration.p95Ms).toBeNull();
      expect(stats.conversionService?.workers['2'].running).toBe(1);
      expect(stats.conversionService?.workers['2'].autoScale).toBe(false);
    });
  });

  describe('sampler', () => {
    it('should append a sample to history in process-pool mode', async () => {
      const executor = {
        getQueueStats: jest.fn().mockReturnValue({
          queueLength: 1,
          runningCount: 2,
        }),
        getDurationStats: jest.fn().mockReturnValue({ p95DurationMs: 999 }),
      };
      const service = makeService({}, executor);

      await (service as unknown as { sample: () => Promise<void> }).sample();

      const stats = await service.getStats();
      expect(stats.history).toHaveLength(1);
      expect(stats.history[0].queueDepth).toBe(1);
      expect(stats.history[0].running).toBe(2);
      expect(stats.history[0].p95DurationMs).toBe(999);
    });

    it('should leave history fields null for cloud-faas mode', async () => {
      const service = makeService(
        { FUNCTION_EXECUTOR: 'cloud-faas' },
        {} as Partial<ProcessPoolExecutor>,
      );

      await (service as unknown as { sample: () => Promise<void> }).sample();

      const stats = await service.getStats();
      expect(stats.history[0].queueDepth).toBeNull();
      expect(stats.history[0].running).toBeNull();
      expect(stats.history[0].p95DurationMs).toBeNull();
    });

    it('should trim history samples older than the 24h window', async () => {
      const executor = {
        getQueueStats: jest.fn().mockReturnValue({
          queueLength: 0,
          runningCount: 0,
        }),
        getDurationStats: jest.fn().mockReturnValue({ p95DurationMs: null }),
      };
      const service = makeService({}, executor);
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
    it('conversion-service 模式 proxy 远端列出任务明细', async () => {
      const service = makeService(
        { FUNCTION_EXECUTOR: 'conversion-service' },
        {} as Partial<ProcessPoolExecutor>,
      );
      (service as unknown as { httpGet: jest.Mock }).httpGet.mockResolvedValue({
        tasks: [
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
        ],
        total: 2,
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
        expect.objectContaining({
          id: 't-2',
          status: 'processing',
          progress: 50,
        }),
      );
      expect((service as unknown as { httpGet: jest.Mock }).httpGet).toHaveBeenCalledWith(
        '/v1/conversions/tasks',
      );
    });

    it('conversion-service 模式按 status 过滤（携带 query）', async () => {
      const service = makeService(
        { FUNCTION_EXECUTOR: 'conversion-service' },
        {} as Partial<ProcessPoolExecutor>,
      );
      (service as unknown as { httpGet: jest.Mock }).httpGet.mockResolvedValue({
        tasks: [],
        total: 0,
      });

      await service.listTasks('failed');
      expect((service as unknown as { httpGet: jest.Mock }).httpGet).toHaveBeenCalledWith(
        '/v1/conversions/tasks?status=failed',
      );
    });

    it('process-pool 模式无任务明细，返回空列表且不调远端', async () => {
      const service = makeService(
        { FUNCTION_EXECUTOR: '' },
        {} as Partial<ProcessPoolExecutor>,
      );

      const list = await service.listTasks();
      expect(list).toEqual({ items: [], total: 0 });
      expect((service as unknown as { httpGet: jest.Mock }).httpGet).not.toHaveBeenCalled();
    });

    it('远端拉取失败降级为空列表（不抛错）', async () => {
      const service = makeService(
        { FUNCTION_EXECUTOR: 'conversion-service' },
        {} as Partial<ProcessPoolExecutor>,
      );
      (service as unknown as { httpGet: jest.Mock }).httpGet.mockRejectedValue(
        new Error('ECONNREFUSED'),
      );

      const list = await service.listTasks();
      expect(list).toEqual({ items: [], total: 0 });
    });
  });
});
