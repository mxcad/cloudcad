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
  return {
    id: 'task_1',
    type: 'convertFile',
    params: { srcPath: '/in/a.dwg' },
    priority: 1,
    createdAt: new Date(),
    ...overrides,
  };
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

    it('should map permanent flag from the conversion-service response (S6-7)', async () => {
      port = await startServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            taskId: 'fw_6',
            status: 'FAILED',
            error: '永久失败（内容不可转换）：解析失败',
            permanent: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:01:00.000Z',
          }),
        );
      });
      executor = await createExecutor();

      const status = await executor.getTaskStatus('fw_6');
      expect(status.permanent).toBe(true);
      expect(status.error).toBe('永久失败（内容不可转换）：解析失败');
    });

    it('should map permanent=false when the response omits the flag (S6-7 普通任务)', async () => {
      port = await startServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            taskId: 'fw_7',
            status: 'FAILED',
            error: '瞬时失败',
            // 无 permanent 字段（普通任务）
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:01:00.000Z',
          }),
        );
      });
      executor = await createExecutor();

      const status = await executor.getTaskStatus('fw_7');
      expect(status.permanent).toBe(false);
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
  });
});
