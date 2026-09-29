import { BatchDelegateConversionExecutor } from './batch-delegate.executor';
import type { IFunctionExecutor } from './function-executor.interface';
import type { ConfigService } from '@nestjs/config';
import * as http from 'http';
import type { AddressInfo } from 'net';

function collectBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

describe('BatchDelegateConversionExecutor（批量委托装饰器）', () => {
  let server: http.Server;
  let port: number;
  let baseExecutor: {
    isRemote: boolean;
    invoke: jest.Mock;
    getTaskStatus: jest.Mock;
    queueStats: jest.Mock;
    durationStats: jest.Mock;
    cancelTask?: jest.Mock;
    listTasks?: jest.Mock;
    clearQueue?: jest.Mock;
  };

  const startServer = async (
    handler: (
      req: http.IncomingMessage,
      res: http.ServerResponse
    ) => void | Promise<void>
  ): Promise<number> => {
    server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    return (server.address() as AddressInfo).port;
  };

  const makeConfigService = (
    extra: Record<string, unknown> = {}
  ): ConfigService => {
    return {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'batchDownload') {
          return {
            conversionServiceUrl: `http://127.0.0.1:${port}`,
            workflowPollIntervalMs: 5,
            workflowTimeoutMs: 10000,
            ...extra,
          };
        }
        return '';
      }),
    } as unknown as ConfigService;
  };

  const createExecutor = (config?: ConfigService) =>
    new BatchDelegateConversionExecutor(
      baseExecutor as unknown as IFunctionExecutor,
      config ?? makeConfigService()
    );

  beforeEach(() => {
    baseExecutor = {
      isRemote: false,
      invoke: jest.fn().mockResolvedValue({ taskId: 't1', status: 'COMPLETED' }),
      getTaskStatus: jest.fn(),
      queueStats: jest.fn().mockResolvedValue(null),
      durationStats: jest.fn().mockResolvedValue(null),
    };
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      server = undefined as any;
    }
  });

  describe('批量原语（submitBatch/waitBatch）', () => {
    it('submitBatch 提交任务到 batchConvert 并返回 batchId；waitBatch 轮询到终态并映射 results', async () => {
      const submittedBatches: Array<{ tasks: any[] }> = [];

      port = await startServer(async (req, res) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if (
          req.method === 'POST' &&
          url.pathname === '/v1/conversions/batchConvert'
        ) {
          submittedBatches.push({ tasks: JSON.parse(await collectBody(req)).tasks });
          res.writeHead(202, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ taskId: 'fw_1', status: 'PENDING' }));
          return;
        }
        if (
          req.method === 'GET' &&
          url.pathname === '/v1/conversions/tasks/fw_1'
        ) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              status: 'COMPLETED',
              result: {
                results: [
                  {
                    id: 'node-1:dwg',
                    success: true,
                    outputPath: '/data/files/projects/p1/drawing.dwg',
                  },
                ],
              },
            })
          );
          return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'not found' }));
      });

      const executor = createExecutor();
      const task = {
        id: 'node-1:dwg',
        srcPath: '/data/uploads/hash123.mxweb',
        fileHash: 'hash123',
        outname: 'hash123-dwg.dwg',
      };
      const { batchId } = await executor.submitBatch!([task]);
      expect(batchId).toBe('fw_1');
      expect(submittedBatches[0].tasks).toEqual([task]);

      const terminal = await executor.waitBatch!(batchId);
      expect(terminal.results).toEqual([
        {
          id: 'node-1:dwg',
          success: true,
          outputPath: '/data/files/projects/p1/drawing.dwg',
        },
      ]);
    });

    it('waitBatch 多次轮询直至终态', async () => {
      let pollCount = 0;

      port = await startServer(async (req, res) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if (
          req.method === 'POST' &&
          url.pathname === '/v1/conversions/batchConvert'
        ) {
          res.writeHead(202, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ taskId: 'fw_2', status: 'PENDING' }));
          return;
        }
        if (
          req.method === 'GET' &&
          url.pathname === '/v1/conversions/tasks/fw_2'
        ) {
          pollCount++;
          const terminal = pollCount >= 3;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              status: terminal ? 'COMPLETED' : 'PENDING',
              ...(terminal
                ? {
                    result: {
                      results: [{ id: 'node-1:dwg', success: true, outputPath: '/out.dwg' }],
                    },
                  }
                : {}),
            })
          );
          return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'not found' }));
      });

      const executor = createExecutor();
      const { batchId } = await executor.submitBatch!([
        { id: 'node-1:dwg', srcPath: '/s.mxweb', fileHash: 'h', outname: 'o.dwg' },
      ]);
      const terminal = await executor.waitBatch!(batchId);

      expect(pollCount).toBeGreaterThanOrEqual(3);
      expect(terminal.results[0].outputPath).toBe('/out.dwg');
    });

    it('waitBatch 按非活动终态（FAILED）返回 results', async () => {
      port = await startServer(async (req, res) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if (req.method === 'POST') {
          res.writeHead(202, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ taskId: 'fw_3', status: 'PENDING' }));
          return;
        }
        if (url.pathname === '/v1/conversions/tasks/fw_3') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              status: 'FAILED',
              result: {
                results: [{ id: 'node-1:dwg', success: false, error: 'out of memory' }],
              },
            })
          );
          return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'not found' }));
      });

      const executor = createExecutor();
      const { batchId } = await executor.submitBatch!([
        { id: 'node-1:dwg', srcPath: '/s.mxweb', fileHash: 'h', outname: 'o.dwg' },
      ]);
      const terminal = await executor.waitBatch!(batchId);

      expect(terminal.results[0].success).toBe(false);
      expect(terminal.results[0].error).toBe('out of memory');
    });

    it('submitBatch 缺 taskId 时抛错并进入熔断', async () => {
      let requestCount = 0;
      port = await startServer(async (_req, res) => {
        requestCount++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'PENDING' }));
      });

      const executor = createExecutor();

      await expect(
        executor.submitBatch!([
          { id: 't', srcPath: '/s.mxweb', fileHash: 'h', outname: 'o.dwg' },
        ])
      ).rejects.toThrow('Workflow batchConvert returned no taskId');

      // 熔断期：直接抛错、不再发请求
      await expect(
        executor.submitBatch!([
          { id: 't', srcPath: '/s.mxweb', fileHash: 'h', outname: 'o.dwg' },
        ])
      ).rejects.toThrow('cooldown');
      expect(requestCount).toBe(1);
    });

    it('服务不可达时 submitBatch 抛错并熔断（第二次不发请求）', async () => {
      let requestCount = 0;
      port = await startServer(async (_req, res) => {
        requestCount++;
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'service unavailable' }));
      });

      const executor = createExecutor();

      await expect(
        executor.submitBatch!([
          { id: 't', srcPath: '/s.mxweb', fileHash: 'h', outname: 'o.dwg' },
        ])
      ).rejects.toThrow();

      await expect(
        executor.submitBatch!([
          { id: 't', srcPath: '/s.mxweb', fileHash: 'h', outname: 'o.dwg' },
        ])
      ).rejects.toThrow('cooldown');
      expect(requestCount).toBe(1);
    });

    it('waitBatch 轮询超时抛错', async () => {
      port = await startServer(async (req, res) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if (req.method === 'POST') {
          res.writeHead(202, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ taskId: 'fw_4', status: 'PENDING' }));
          return;
        }
        if (url.pathname === '/v1/conversions/tasks/fw_4') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'PENDING' }));
          return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'not found' }));
      });

      const executor = createExecutor(
        makeConfigService({ workflowTimeoutMs: 30, workflowPollIntervalMs: 5 })
      );
      const { batchId } = await executor.submitBatch!([
        { id: 't', srcPath: '/s.mxweb', fileHash: 'h', outname: 'o.dwg' },
      ]);

      await expect(executor.waitBatch!(batchId)).rejects.toThrow('timed out');
    });
  });

  describe('其余原语透传 base', () => {
    it('invoke/getTaskStatus/queueStats/durationStats 透传', async () => {
      const executor = createExecutor();
      const task = {
        id: 't1',
        priority: 1 as const,
        createdAt: new Date(),
        type: 'convertFile' as const,
        params: {} as never,
      };

      await executor.invoke(task);
      await executor.getTaskStatus('t1');
      await executor.queueStats();
      await executor.durationStats();

      expect(baseExecutor.invoke).toHaveBeenCalledWith(task);
      expect(baseExecutor.getTaskStatus).toHaveBeenCalledWith('t1');
      expect(baseExecutor.queueStats).toHaveBeenCalled();
      expect(baseExecutor.durationStats).toHaveBeenCalled();
    });

    it('可选原语仅在 base 实现时暴露', async () => {
      const without = createExecutor();
      expect(without.cancelTask).toBeUndefined();
      expect(without.listTasks).toBeUndefined();
      expect(without.clearQueue).toBeUndefined();

      baseExecutor.cancelTask = jest.fn().mockResolvedValue({ ok: true });
      baseExecutor.listTasks = jest.fn().mockResolvedValue([]);
      baseExecutor.clearQueue = jest.fn().mockReturnValue(0);
      const withOptional = createExecutor();

      expect(withOptional.cancelTask).toBeDefined();
      expect(withOptional.listTasks).toBeDefined();
      expect(withOptional.clearQueue).toBeDefined();
      await expect(withOptional.cancelTask!('t1')).resolves.toEqual({ ok: true });
      expect(baseExecutor.cancelTask).toHaveBeenCalledWith('t1');
    });

    it('isRemote 随 base（invoke 的转发安全性由 base 决定）', () => {
      expect(createExecutor().isRemote).toBe(false);
      baseExecutor.isRemote = true;
      expect(createExecutor().isRemote).toBe(true);
    });
  });
});
