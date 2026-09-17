import { Test, type TestingModule } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IStorageService } from '../storage/interfaces/storage-service.interface';
import { StorageManager } from '../storage-management/services/storage-manager.service';
import { ConversionRunner } from './conversion-runner';
import { RestrictionEngine } from '../vip/restriction-engine.service';
import { FileDownloadExportService } from '../file-system/file-download/file-download-export.service';
import { PublicFileService } from '../public-file/public-file.service';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as fs from 'fs';
import * as crypto from 'crypto';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(true),
  promises: {
    ...jest.requireActual('fs').promises,
    unlink: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockResolvedValue(Buffer.from('drawing-content')),
    copyFile: jest.fn().mockResolvedValue(undefined),
  },
}));

type WorkflowState = {
  status: string;
  results: Array<{
    id: string;
    success: boolean;
    outputPath?: string;
    error?: string;
  }>;
};

function collectBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

describe('ConversionRunner (delegate workflow)', () => {
  let service: ConversionRunner;
  let server: http.Server;
  let port: number;
  let mockConversionService: any;
  let submittedBatches: Array<{ tasks: any[] }>;

  const mockNode = {
    id: 'node-1',
    fileHash: 'hash123',
    path: 'projects/p1/drawing.mxweb',
    name: 'drawing.dwg',
  };

  // 步骤 1：快照 hash = md5(readFile 内容)，与 snapshotMxweb 一致
  const contentHash = crypto
    .createHash('md5')
    .update(Buffer.from('drawing-content'))
    .digest('hex');

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

  const createService = async (delegate = true): Promise<ConversionRunner> => {
    const mockFs = jest.requireMock('fs') as jest.Mocked<typeof fs>;
    mockFs.existsSync.mockReturnValue(true);
    (mockFs.promises.readFile as unknown as jest.Mock).mockResolvedValue(
      Buffer.from('drawing-content')
    );
    (mockFs.promises.copyFile as unknown as jest.Mock).mockResolvedValue(
      undefined
    );

    mockConversionService = {
      convertServerFile: jest.fn().mockResolvedValue({ code: 0 }),
    };

    const mockStorageManager = {
      getFullPath: jest
        .fn()
        .mockImplementation((p: string) => `/data/files/${p}`),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'batchDownload') {
          return {
            maxConcurrency: 3,
            delegateWorkflow: delegate,
            conversionServiceUrl: `http://127.0.0.1:${port}`,
            workflowPollIntervalMs: 5,
            workflowTimeoutMs: 10000,
          };
        }
        if (key === 'mxcadUploadPath') return '/data/uploads';
        return '';
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversionRunner,
        {
          provide: ModuleRef,
          useValue: { get: jest.fn().mockReturnValue(mockConversionService) },
        },
        { provide: IStorageService, useValue: {} },
        { provide: StorageManager, useValue: mockStorageManager },
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: RestrictionEngine,
          useValue: {
            reserveConversionCountOrThrow: jest
              .fn()
              .mockResolvedValue(undefined),
            releaseConversionCount: jest.fn().mockResolvedValue(undefined),
            assertExportDownloadAllowed: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: FileDownloadExportService,
          useValue: {
            getFreshConversionCachePath: jest.fn().mockReturnValue(null),
            storeConversionCache: jest.fn(),
            snapshotMxweb: jest.fn().mockResolvedValue({
              snapshotPath: `/data/uploads/${contentHash}.mxweb`,
              hash: contentHash,
            }),
            buildParamKey: jest.fn((format, params) => {
              if (format === 'pdf') {
                const safe = (v?: string) => (v || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
                return `pdf-${safe(params?.width) || '2000'}x${safe(params?.height) || '2000'}-${safe(params?.colorPolicy) || 'mono'}`;
              } else if (format === 'dwg') {
                return params?.dwgVersion ? `dwg-v${params.dwgVersion}` : 'dwg';
              } else {
                return params?.dwgVersion ? `dxf-v${params.dwgVersion}` : 'dxf';
              }
            }),
          },
        },
        // fileHash-only（内存导出）源文件定位：默认命中 uploads/{fileHash}.mxweb
        {
          provide: PublicFileService,
          useValue: {
            findMxwebFile: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    return module.get<ConversionRunner>(ConversionRunner);
  };

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      server = undefined as any;
    }
  });

  it('should submit a single-task batch and poll until terminal then map success', async () => {
    let state: WorkflowState = { status: 'PENDING', results: [] };
    submittedBatches = [];

    port = await startServer(async (req, res) => {
      const url = new URL(req.url || '/', 'http://localhost');
      if (
        req.method === 'POST' &&
        url.pathname === '/v1/conversions/batchConvert'
      ) {
        const body = await collectBody(req);
        submittedBatches.push({ tasks: JSON.parse(body).tasks });
        state = {
          status: 'COMPLETED',
          results: [
            {
              id: 'node-1:dwg',
              success: true,
              outputPath: '/data/files/projects/p1/drawing.dwg',
            },
          ],
        };
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
            status: state.status,
            result: { results: state.results },
          })
        );
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'not found' }));
    });

    service = await createService(true);

    const result = await service.convertFile(mockNode, 'dwg');

    expect(result.success).toBe(true);
    expect(result.filePath).toBe('/data/files/projects/p1/drawing.dwg');
    expect(result.format).toBe('dwg');
    expect(mockConversionService.convertServerFile).not.toHaveBeenCalled();
    expect(submittedBatches).toHaveLength(1);
    // 步骤 1：srcPath 指内容寻址快照（uploads/{hash}.mxweb），outname 版本绑定
    expect(submittedBatches[0].tasks).toEqual([
      {
        id: 'node-1:dwg',
        srcPath: `/data/uploads/${contentHash}.mxweb`,
        fileHash: 'hash123',
        outname: `${contentHash}-dwg.dwg`,
      },
    ]);
  });

  it('should submit all tasks in one batch and map results by order', async () => {
    submittedBatches = [];
    const state: WorkflowState = {
      status: 'COMPLETED',
      results: [
        {
          id: 'node-1:pdf',
          success: true,
          outputPath: '/data/files/projects/p1/drawing.pdf',
        },
        { id: 'node-2:pdf', success: false, error: 'engine boom' },
      ],
    };

    port = await startServer(async (req, res) => {
      const url = new URL(req.url || '/', 'http://localhost');
      if (
        req.method === 'POST' &&
        url.pathname === '/v1/conversions/batchConvert'
      ) {
        const body = await collectBody(req);
        submittedBatches.push({ tasks: JSON.parse(body).tasks });
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ taskId: 'fw_2', status: 'PENDING' }));
        return;
      }
      if (
        req.method === 'GET' &&
        url.pathname === '/v1/conversions/tasks/fw_2'
      ) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: state.status,
            result: { results: state.results },
          })
        );
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'not found' }));
    });

    service = await createService(true);

    const results = await service.convertMany([
      { node: mockNode, format: 'pdf' },
      {
        node: {
          id: 'node-2',
          fileHash: 'hash2',
          path: 'projects/p1/other.mxweb',
          name: 'other.dwg',
        },
        format: 'pdf',
        pdfParams: { width: '4000', height: '3000', colorPolicy: 'color' },
      },
    ]);

    expect(submittedBatches).toHaveLength(1);
    expect(submittedBatches[0].tasks).toHaveLength(2);
    // 步骤 1：srcPath 指内容寻址快照（uploads/{hash}.mxweb），outname 版本绑定
    // 两节点 readFile 内容相同（mock）→ 同一 contentHash → 同一快照与产物名
    expect(submittedBatches[0].tasks[0]).toEqual({
      id: 'node-1:pdf',
      srcPath: `/data/uploads/${contentHash}.mxweb`,
      fileHash: 'hash123',
      outname: `${contentHash}-pdf-2000x2000-mono.pdf`,
      width: '2000',
      height: '2000',
      colorPolicy: 'mono',
    });
    expect(submittedBatches[0].tasks[1]).toEqual({
      id: 'node-2:pdf',
      srcPath: `/data/uploads/${contentHash}.mxweb`,
      fileHash: 'hash2',
      outname: `${contentHash}-pdf-4000x3000-color.pdf`,
      width: '4000',
      height: '3000',
      colorPolicy: 'color',
    });

    expect(results[0].success).toBe(true);
    expect(results[0].filePath).toBe('/data/files/projects/p1/drawing.pdf');
    expect(results[1].success).toBe(false);
    expect(results[1].error).toBe('engine boom');
    expect(mockConversionService.convertServerFile).not.toHaveBeenCalled();
  });

  it('should poll multiple times until terminal state', async () => {
    let pollCount = 0;
    submittedBatches = [];

    port = await startServer(async (req, res) => {
      const url = new URL(req.url || '/', 'http://localhost');
      if (
        req.method === 'POST' &&
        url.pathname === '/v1/conversions/batchConvert'
      ) {
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ taskId: 'fw_3', status: 'PENDING' }));
        return;
      }
      if (
        req.method === 'GET' &&
        url.pathname === '/v1/conversions/tasks/fw_3'
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
                    results: [
                      {
                        id: 'node-1:dwg',
                        success: true,
                        outputPath: '/out.dwg',
                      },
                    ],
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

    service = await createService(true);

    const result = await service.convertFile(mockNode, 'dwg');

    expect(pollCount).toBeGreaterThanOrEqual(3);
    expect(result.success).toBe(true);
    expect(result.filePath).toBe('/out.dwg');
  });

  it('should fall back to in-process conversion when workflow service is unreachable', async () => {
    port = await startServer(async (_req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'service unavailable' }));
    });

    service = await createService(true);

    const result = await service.convertFile(mockNode, 'dwg');

    expect(mockConversionService.convertServerFile).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('should not delegate after workflow cooldown and fall back to in-process', async () => {
    // 首次失败触发熔断，第二次调用不再尝试 workflow，直接进程内
    port = await startServer(async (_req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'service unavailable' }));
    });

    service = await createService(true);

    await service.convertFile(mockNode, 'dwg');
    const callsAfterFirst =
      mockConversionService.convertServerFile.mock.calls.length;
    const second = await service.convertFile(mockNode, 'dwg');

    expect(second.success).toBe(true);
    expect(mockConversionService.convertServerFile.mock.calls.length).toBe(
      callsAfterFirst + 1
    );
  });

  it('should return error result when task fails in workflow result', async () => {
    submittedBatches = [];

    port = await startServer(async (req, res) => {
      const url = new URL(req.url || '/', 'http://localhost');
      if (
        req.method === 'POST' &&
        url.pathname === '/v1/conversions/batchConvert'
      ) {
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ taskId: 'fw_4', status: 'PENDING' }));
        return;
      }
      if (
        req.method === 'GET' &&
        url.pathname === '/v1/conversions/tasks/fw_4'
      ) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'FAILED',
            result: {
              results: [
                { id: 'node-1:dwg', success: false, error: 'out of memory' },
              ],
            },
          })
        );
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'not found' }));
    });

    service = await createService(true);

    const result = await service.convertFile(mockNode, 'dwg');

    expect(result.success).toBe(false);
    expect(result.error).toBe('out of memory');
    expect(mockConversionService.convertServerFile).not.toHaveBeenCalled();
  });

  it('should return source-not-found error without submitting to workflow', async () => {
    let postCalled = false;
    port = await startServer(async (req, res) => {
      const url = new URL(req.url || '/', 'http://localhost');
      if (req.method === 'POST') postCalled = true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ taskId: 'fw_x', status: 'PENDING' }));
    });

    service = await createService(true);

    const result = await service.convertFile(
      { id: 'node-x', name: 'test.dwg' },
      'dwg'
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Source file not found');
    expect(postCalled).toBe(false);
  });

  it('should not delegate when switch is off (keeps in-process behavior)', async () => {
    port = await startServer(async (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({}));
    });

    service = await createService(false);

    const result = await service.convertFile(mockNode, 'dwg');

    expect(mockConversionService.convertServerFile).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });
});
