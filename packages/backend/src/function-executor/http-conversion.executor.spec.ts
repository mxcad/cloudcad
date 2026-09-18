///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import * as http from 'http';
import { AddressInfo } from 'net';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { HttpConversionExecutor } from './http-conversion.executor';
import type { ConversionTask } from './function-executor.interface';

function makeTask(overrides: Partial<ConversionTask> = {}): ConversionTask {
  // ConversionTask 改为按 type 判别的联合后，{...默认值, ...overrides} 的展开结果
  // 丢失 type/params 的关联，无法直接赋值回 ConversionTask；测试夹具此处断言。
  return {
    id: 'task_1',
    type: 'convertFile',
    params: { srcPath: '/in/a.dwg', fileHash: 'hash_a' },
    priority: 1,
    createdAt: new Date(),
    ...overrides,
  } as ConversionTask;
}

function makeConfigService(port: number) {
  return {
    get: jest.fn((key: string) => {
      switch (key) {
        case 'CONVERSION_SERVICE_URL':
          return `http://127.0.0.1:${port}`;
        case 'CONVERSION_SERVICE_POLL_INTERVAL':
          return '5';
        case 'CONVERSION_SERVICE_POLL_TIMEOUT':
          return '2000';
        default:
          return undefined;
      }
    }),
  };
}

describe('HttpConversionExecutor', () => {
  let server: http.Server;
  let port: number;
  let executor: HttpConversionExecutor;
  let requests: Array<{ method: string; path: string; body?: unknown }> = [];

  beforeEach(() => {
    requests = [];
  });

  const startServer = async (
    handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  ): Promise<number> => {
    server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    return (server.address() as AddressInfo).port;
  };

  const createExecutor = async (): Promise<HttpConversionExecutor> => {
    const module = await Test.createTestingModule({
      providers: [
        HttpConversionExecutor,
        { provide: ConfigService, useValue: makeConfigService(port) },
        { provide: ClsService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    return module.get(HttpConversionExecutor);
  };

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  describe('when calling invoke', () => {
    it('should submit via async endpoint and poll until COMPLETED', async () => {
      let taskQueryCount = 0;
      port = await startServer((req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          requests.push({ method: req.method ?? '', path: req.url ?? '', body: body ? JSON.parse(body) : undefined });
          if (req.method === 'POST' && req.url === '/v1/conversions/async/convertFile') {
            res.writeHead(202, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ taskId: 'fw_1', status: 'PENDING' }));
            return;
          }
          if (req.method === 'GET' && req.url === '/v1/conversions/tasks/fw_1') {
            taskQueryCount += 1;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              taskQueryCount >= 2
                ? JSON.stringify({
                    taskId: 'fw_1',
                    status: 'COMPLETED',
                    result: { code: 0, newpath: '/out/r.mxweb' },
                  })
                : JSON.stringify({ taskId: 'fw_1', status: 'PROCESSING', progress: 50 }),
            );
            return;
          }
          res.writeHead(404);
          res.end();
        });
      });
      executor = await createExecutor();

      const result = await executor.invoke(makeTask());

      expect(requests[0]).toMatchObject({
        method: 'POST',
        path: '/v1/conversions/async/convertFile',
        body: {
          priority: 1,
          callbackUrl: null,
          params: { type: 'convertFile', srcPath: '/in/a.dwg' },
        },
      });
      expect(requests.some((r) => r.path === '/v1/conversions/tasks/fw_1')).toBe(true);
      expect(result).toMatchObject({
        taskId: 'fw_1',
        status: 'COMPLETED',
        outputPath: '/out/r.mxweb',
      });
    });

    it('should return FAILED when the task reaches a FAILED terminal state', async () => {
      port = await startServer((req, res) => {
        if (req.method === 'POST') {
          res.writeHead(202, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ taskId: 'fw_2' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ taskId: 'fw_2', status: 'FAILED', error: 'convert error' }));
      });
      executor = await createExecutor();

      const result = await executor.invoke(makeTask());

      expect(result).toMatchObject({ status: 'FAILED', error: 'convert error' });
    });

    it('should return FAILED (not poll until timeout) when the task is CANCELLED', async () => {
      port = await startServer((req, res) => {
        if (req.method === 'POST') {
          res.writeHead(202, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ taskId: 'fw_4' }));
          return;
        }
        // 取消不携带 error（task-store.cancel 只改状态）
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ taskId: 'fw_4', status: 'CANCELLED' }));
      });
      executor = await createExecutor();

      const t0 = Date.now();
      const result = await executor.invoke(makeTask());

      expect(result).toMatchObject({
        status: 'FAILED',
        error: 'Conversion task was cancelled',
      });
      // pollTimeout=2000ms：CANCELLED 终态应首轮轮询即返回，不空转到超时谎报 timed out
      expect(Date.now() - t0).toBeLessThan(1500);
    });

    it('should return FAILED when submission is rejected', async () => {
      port = await startServer((_req, res) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'workflow down' }));
      });
      executor = await createExecutor();

      const result = await executor.invoke(makeTask());

      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('Failed to submit task');
    });

    it('should return FAILED when no taskId is returned', async () => {
      port = await startServer((_req, res) => {
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'PENDING' }));
      });
      executor = await createExecutor();

      const result = await executor.invoke(makeTask());

      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('did not return a taskId');
    });

    it('should return FAILED on poll timeout', async () => {
      port = await startServer((req, res) => {
        if (req.method === 'POST') {
          res.writeHead(202, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ taskId: 'fw_3' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ taskId: 'fw_3', status: 'PENDING' }));
      });
      executor = await createExecutor();

      const result = await executor.invoke(makeTask());

      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('timed out');
    });
  });

  describe('when calling getTaskStatus', () => {
    it('should GET /v1/conversions/tasks/:taskId and map fields', async () => {
      port = await startServer((req, res) => {
        requests.push({ method: req.method ?? '', path: req.url ?? '' });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            taskId: 'fw_4',
            status: 'PROCESSING',
            progress: 50,
            error: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:01:00.000Z',
          }),
        );
      });
      executor = await createExecutor();

      const status = await executor.getTaskStatus('fw_4');

      expect(requests[0].method).toBe('GET');
      expect(requests[0].path).toBe('/v1/conversions/tasks/fw_4');
      expect(status).toMatchObject({
        taskId: 'fw_4',
        status: 'PROCESSING',
        progress: 50,
      });
      expect(status.createdAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    });

    it('should map error from the conversion-service FAILED response', async () => {
      port = await startServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            taskId: 'fw_6',
            status: 'FAILED',
            error: '转换失败',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:01:00.000Z',
          }),
        );
      });
      executor = await createExecutor();

      const status = await executor.getTaskStatus('fw_6');
      expect(status.error).toBe('转换失败');
    });

    it('should map queuePosition from the conversion-service response (S6-5)', async () => {
      port = await startServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            taskId: 'fw_8',
            status: 'PENDING',
            queuePosition: 3,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:01:00.000Z',
          }),
        );
      });
      executor = await createExecutor();

      const status = await executor.getTaskStatus('fw_8');
      expect(status.queuePosition).toBe(3);
    });

    it('should map queuePosition=null to undefined (S6-5 运行中/未入队)', async () => {
      port = await startServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            taskId: 'fw_9',
            status: 'PROCESSING',
            queuePosition: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:01:00.000Z',
          }),
        );
      });
      executor = await createExecutor();

      const status = await executor.getTaskStatus('fw_9');
      expect(status.queuePosition).toBeUndefined();
    });

    it('should reject when connection is refused', async () => {
      const module = await Test.createTestingModule({
        providers: [
          HttpConversionExecutor,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(() => 'http://127.0.0.1:1'),
            },
          },
          { provide: ClsService, useValue: { get: jest.fn() } },
        ],
      }).compile();
      executor = module.get(HttpConversionExecutor);

      await expect(executor.getTaskStatus('fw_5')).rejects.toBeTruthy();
    });
  describe('observability via the seam', () => {
    it('should expose worker pool stats from the remote stats endpoint', async () => {
      port = await startServer((req, res) => {
        requests.push({ method: req.method ?? '', path: req.url ?? '' });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
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
          })
        );
      });
      executor = await createExecutor();

      const queue = await executor.queueStats();
      const duration = await executor.durationStats();

      expect(queue).toEqual({
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
      });
      expect(duration).toEqual({
        kind: 'task',
        stats: { sampleCount: 6, p50Ms: 1200, p95Ms: 4500 },
      });
      expect(requests.map((r) => r.path)).toEqual([
        '/v1/conversions/stats',
        '/v1/conversions/stats',
      ]);
    });

    it('should tolerate malformed remote stats responses', async () => {
      port = await startServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            tasks: { pending: '2' },
            workers: { '2': { label: 'export', running: '1' } },
          })
        );
      });
      executor = await createExecutor();

      const queue = await executor.queueStats();
      const duration = await executor.durationStats();

      expect(queue?.kind).toBe('worker-pool');
      if (queue?.kind === 'worker-pool') {
        expect(queue.tasks.pending).toBe(2);
        expect(queue.tasks.total).toBe(0);
        expect(queue.workers['2'].running).toBe(1);
        expect(queue.workers['2'].autoScale).toBe(false);
        expect(queue.workers['2'].label).toBe('export');
      }
      expect(duration?.kind).toBe('task');
      if (duration?.kind === 'task') {
        expect(duration.stats.p95Ms).toBeNull();
      }
    });

    it('should proxy task records and forward the status filter', async () => {
      port = await startServer((req, res) => {
        requests.push({ method: req.method ?? '', path: req.url ?? '' });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            tasks: [
              {
                id: 't-1',
                type: 'open',
                status: 'COMPLETED',
                progress: 100,
                createdAt: '2026-09-03T00:00:00Z',
                updatedAt: '2026-09-03T00:01:00Z',
                startedAt: '2026-09-03T00:00:10Z',
                completedAt: '2026-09-03T00:01:00Z',
                contentKey: 'abc123',
              },
              { id: '', progress: 0, status: 7, createdAt: 0 },
            ],
            total: 2,
          })
        );
      });
      executor = await createExecutor();

      const records = await executor.listTasks('failed');

      expect(requests.map((r) => r.path)).toEqual([
        '/v1/conversions/tasks?status=failed',
      ]);
      // 无 id 的记录被丢弃；status 归一化为小写，缺字段回落默认值
      expect(records).toEqual([
        {
          id: 't-1',
          type: 'open',
          status: 'completed',
          progress: 100,
          createdAt: '2026-09-03T00:00:00Z',
          updatedAt: '2026-09-03T00:01:00Z',
          startedAt: '2026-09-03T00:00:10Z',
          completedAt: '2026-09-03T00:01:00Z',
          error: undefined,
          contentKey: 'abc123',
        },
      ]);
    });

    it('should send the internal service secret on stats requests (#419)', async () => {
      let seenHeaders: Record<string, string | undefined> = {};
      port = await startServer((req, res) => {
        seenHeaders = {
          'x-internal-service-secret': req.headers['x-internal-service-secret'] as
            | string
            | undefined,
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ tasks: {}, duration: {}, workers: {} }));
      });
      const module = await Test.createTestingModule({
        providers: [
          HttpConversionExecutor,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'CONVERSION_SERVICE_URL') {
                  return `http://127.0.0.1:${port}`;
                }
                if (key === 'INTERNAL_SERVICE_SECRET') return 'topsecret';
                return undefined;
              }),
            },
          },
          { provide: ClsService, useValue: { get: jest.fn() } },
        ],
      }).compile();
      executor = module.get(HttpConversionExecutor);

      await executor.queueStats();

      expect(seenHeaders['x-internal-service-secret']).toBe('topsecret');
    });
  });
  });
});
