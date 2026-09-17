///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { BatchJobStatus } from '@cloudcad/db';
import { DatabaseService } from '../../src/database/database.service';
import { BatchDownloadService } from '../../src/batch-download/batch-download.service';
import { BatchDownloadJob } from '../../src/batch-download/batch-download-job';
import { BatchDownloadOrchestrator } from '../../src/batch-download/batch-download-orchestrator';
import { BatchDownloadCleanupService } from '../../src/batch-download/batch-download-cleanup.service';
import { ArchiveWriter } from '../../src/batch-download/archive-writer';
import { ConversionRunner } from '../../src/batch-download/conversion-runner';
import { SseManager } from '../../src/batch-download/sse-manager';
import { FolderExpanderService } from '../../src/batch-download/folder-expander.service';
import { ProgressTrackerService } from '../../src/batch-download/progress-tracker.service';
import { BatchDownloadController } from '../../src/batch-download/batch-download.controller';
import { TaskRunService } from '../../src/task-run/task-run.service';
import { FileDownloadExportService } from '../../src/file-system/file-download/file-download-export.service';
import { StorageManager } from '../../src/storage-management/services/storage-manager.service';
import { DiskMonitorService } from '../../src/storage-management/services/disk-monitor.service';
import { AuditLogger } from '../../src/audit/audit-logger.service';
import { IPERMISSION_SERVICE } from '../../src/permission/interfaces/permission-service.interface';
import { IStorageService } from '../../src/storage/interfaces/storage-service.interface';
import { RestrictionEngine } from '../../src/vip/restriction-engine.service';
import { FileSystemPermissionService } from '../../src/file-system/file-permission/file-system-permission.service';
import { RuntimeConfigService } from '../../src/runtime-config/runtime-config.service';
import { AlertService } from '../../src/alert/alert.service';
import { MXCAD_CONVERSION_SERVICE } from '../../src/mxcad/interfaces/mxcad-service-tokens';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';

type ConversionMode = 'success' | 'fail' | 'deferred';

interface DeferredConversion {
  resolve: (value: unknown) => void;
}

describe('BatchDownload Flow Integration (issue #286)', () => {
  let module: TestingModule;
  let service: BatchDownloadService;
  let jobService: BatchDownloadJob;
  let cleanupService: BatchDownloadCleanupService;
  let taskRunService: TaskRunService;
  let progressTracker: ProgressTrackerService;
  let conversionRunner: ConversionRunner;
  let controller: BatchDownloadController;
  let eventEmitter: EventEmitter2;
  let prismaMock: any;
  let runtimeConfigMock: { getValue: jest.Mock };
  let conversionServiceMock: { convertServerFile: jest.Mock };
  let restrictionEngineMock: any;

  let filesDataDir: string;
  let exportDir: string;

  const conversionBehavior: {
    mode: ConversionMode;
    deferreds: Map<string, DeferredConversion>;
  } = { mode: 'success', deferreds: new Map() };

  const mapFullPath = (relativePath: string): string => {
    const cleaned = relativePath
      .replace(/^\/mxcad\/file\//, '')
      .replace(/\.\./g, '_')
      .replace(/~/g, '_');
    return path.join(filesDataDir, cleaned);
  };

  const sleepMs = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

  function buildPrismaMock() {
    let seq = 0;
    const jobs = new Map<string, any>();
    const nodes = new Map<string, any>();
    const taskRuns: any[] = [];

    const ioYield = () =>
      new Promise<void>((resolve) => setTimeout(resolve, 2));

    const pick = (row: any, select: any) => {
      const out: any = {};
      for (const key of Object.keys(select)) out[key] = row[key];
      return out;
    };

    const matchesWhere = (row: any, where: any = {}) =>
      Object.keys(where).every((key) => {
        const cond = where[key];
        if (cond === null) {
          return row[key] === null || row[key] === undefined;
        }
        if (typeof cond === 'object' && cond !== null) {
          if ('in' in cond) return cond.in.includes(row[key]);
          if ('lte' in cond) return row[key] <= cond.lte;
          if ('lt' in cond) return row[key] < cond.lt;
          if ('not' in cond) {
            return cond.not === null
              ? row[key] !== null && row[key] !== undefined
              : row[key] !== cond.not;
          }
        }
        return row[key] === cond;
      });

    const batchDownloadJob = {
      create: jest.fn(async ({ data }: any) => {
        await ioYield();
        const row = {
          id: `task-${++seq}`,
          ...data,
          errors: data.errors ?? null,
          zipPath: null,
          zipSize: null,
          completedAt: null,
          expiresAt: null,
          createdAt: new Date(1_700_000_000_000 + seq * 1000),
          updatedAt: new Date(),
        };
        jobs.set(row.id, row);
        return row;
      }),
      findUnique: jest.fn(async ({ where, select }: any = {}) => {
        await ioYield();
        const row = jobs.get(where.id) ?? null;
        if (!row) return null;
        return select ? pick(row, select) : row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        await ioYield();
        const row = jobs.get(where.id);
        if (!row) return null;
        Object.assign(row, data);
        row.updatedAt = new Date();
        return row;
      }),
      findMany: jest.fn(async ({ where, orderBy, take }: any = {}) => {
        await ioYield();
        let list = [...jobs.values()].filter((r) => matchesWhere(r, where));
        if (orderBy?.createdAt === 'desc') {
          list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        if (take !== undefined) list = list.slice(0, take);
        return list;
      }),
      deleteMany: jest.fn(async ({ where }: any = {}) => {
        await ioYield();
        const before = jobs.size;
        for (const [id, row] of [...jobs.entries()]) {
          if (matchesWhere(row, where)) jobs.delete(id);
        }
        return { count: before - jobs.size };
      }),
    };

    const fileSystemNode = {
      findUnique: jest.fn(async ({ where, select }: any = {}) => {
        await ioYield();
        const row = nodes.get(where.id) ?? null;
        if (!row) return null;
        return select ? pick(row, select) : row;
      }),
      findMany: jest.fn(async ({ where, select }: any = {}) => {
        await ioYield();
        let list = [...nodes.values()].filter((r) => matchesWhere(r, where));
        if (select) list = list.map((r) => pick(r, select));
        return list;
      }),
    };

    const taskRun = {
      create: jest.fn(async ({ data }: any) => {
        await ioYield();
        const row = { id: `run-${++seq}`, ...data };
        taskRuns.push(row);
        return row;
      }),
      deleteMany: jest.fn(async ({ where }: any = {}) => {
        await ioYield();
        const before = taskRuns.length;
        for (let i = taskRuns.length - 1; i >= 0; i--) {
          if (matchesWhere(taskRuns[i], where)) taskRuns.splice(i, 1);
        }
        return { count: before - taskRuns.length };
      }),
      findMany: jest.fn(async () => [...taskRuns]),
      count: jest.fn(async () => taskRuns.length),
    };

    const prisma: any = { batchDownloadJob, fileSystemNode, taskRun };
    prisma._jobs = jobs;
    prisma._nodes = nodes;
    prisma._taskRuns = taskRuns;

    prisma._seedNode = (overrides: any = {}) => {
      const node = {
        id: `node-${++seq}`,
        name: 'file.dwg',
        originalName: null,
        path: null,
        fileHash: null,
        extension: '.dwg',
        nodeType: 'FILE',
        size: 128,
        projectId: 'proj-1',
        parentId: null,
        deletedAt: null,
        ...overrides,
      };
      nodes.set(node.id, node);
      return node;
    };

    prisma._seedJob = (overrides: any = {}) => {
      const row = {
        id: `seed-${++seq}`,
        userId: 'user-1',
        projectId: 'proj-1',
        status: 'PENDING',
        fileList: [],
        totalCount: 0,
        completedCount: 0,
        errorCount: 0,
        errors: null,
        zipPath: null,
        zipSize: null,
        createdAt: new Date(),
        completedAt: null,
        expiresAt: null,
        ...overrides,
      };
      jobs.set(row.id, row);
      return row;
    };

    prisma._seedTaskRun = (overrides: any = {}) => {
      const row = {
        id: `run-${++seq}`,
        taskName: 'test-task',
        status: 'SUCCESS',
        startedAt: new Date(),
        finishedAt: new Date(),
        durationMs: 10,
        trigger: 'SCHEDULED',
        triggeredBy: null,
        errorSummary: null,
        ...overrides,
      };
      taskRuns.push(row);
      return row;
    };

    return prisma;
  }

  async function waitForJobStatus(
    taskId: string,
    predicate: (job: any) => boolean,
    timeoutMs = 8000
  ): Promise<any> {
    const deadline = Date.now() + timeoutMs;
    let last: any = null;
    while (Date.now() < deadline) {
      last = await prismaMock.batchDownloadJob.findUnique({
        where: { id: taskId },
      });
      if (last && predicate(last)) return last;
      await sleepMs(25);
    }
    const snapshot = last
      ? {
          status: last.status,
          completedCount: last.completedCount,
          errorCount: last.errorCount,
        }
      : null;
    throw new Error(
      `Timeout waiting for task ${taskId} to satisfy predicate; last=${JSON.stringify(snapshot)}`
    );
  }

  const waitForStatus = (taskId: string, status: string) =>
    waitForJobStatus(taskId, (job) => job.status === status);

  async function writeSourceFile(
    node: { path: string },
    content = 'mxweb-source-content'
  ): Promise<void> {
    const full = mapFullPath(node.path);
    await fsPromises.mkdir(path.dirname(full), { recursive: true });
    await fsPromises.writeFile(full, content);
  }

  function createSseMocks() {
    const closeHandlers: Array<() => void> = [];
    const res: any = { _writes: [] as string[] };
    res.setHeader = jest.fn(() => res);
    res.flushHeaders = jest.fn();
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    res.end = jest.fn(() => res);
    res.write = jest.fn((chunk: string) => {
      res._writes.push(String(chunk));
      return true;
    });
    res.on = jest.fn((event: string, cb: () => void) => {
      if (event === 'close') closeHandlers.push(cb);
      return res;
    });
    const req: any = {
      user: { id: 'user-1' },
      query: {},
      headers: { accept: 'text/event-stream' },
      on: jest.fn((event: string, cb: () => void) => {
        if (event === 'close') closeHandlers.push(cb);
        return req;
      }),
    };
    return {
      res,
      req,
      close: () => {
        for (const cb of closeHandlers.splice(0)) cb();
      },
    };
  }

  function parseSseEvents(writes: string[]): any[] {
    return writes
      .filter((w) => w.startsWith('data: '))
      .map((w) => JSON.parse(w.slice('data: '.length)));
  }

  function readZipEntryNames(zipPath: string): string[] {
    const buf = fs.readFileSync(zipPath);
    let eocd = -1;
    const min = Math.max(0, buf.length - 22 - 65536);
    for (let i = buf.length - 22; i >= min; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error(`EOCD not found in ${zipPath}`);
    const count = buf.readUInt16LE(eocd + 10);
    let offset = buf.readUInt32LE(eocd + 16);
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      if (buf.readUInt32LE(offset) !== 0x02014b50) {
        throw new Error(`Bad central directory signature at ${offset}`);
      }
      const nameLen = buf.readUInt16LE(offset + 28);
      const extraLen = buf.readUInt16LE(offset + 30);
      const commentLen = buf.readUInt16LE(offset + 32);
      const name = buf.toString('utf8', offset + 46, offset + 46 + nameLen);
      names.push(name);
      offset += 46 + nameLen + extraLen + commentLen;
    }
    return names;
  }

  function readZipEntryContent(zipPath: string, entryName: string): Buffer {
    const buf = fs.readFileSync(zipPath);
    let eocd = -1;
    const min = Math.max(0, buf.length - 22 - 65536);
    for (let i = buf.length - 22; i >= min; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error(`EOCD not found in ${zipPath}`);
    const count = buf.readUInt16LE(eocd + 10);
    let offset = buf.readUInt32LE(eocd + 16);
    for (let i = 0; i < count; i++) {
      if (buf.readUInt32LE(offset) !== 0x02014b50) {
        throw new Error(`Bad central directory signature at ${offset}`);
      }
      const nameLen = buf.readUInt16LE(offset + 28);
      const extraLen = buf.readUInt16LE(offset + 30);
      const commentLen = buf.readUInt16LE(offset + 32);
      const name = buf.toString('utf8', offset + 46, offset + 46 + nameLen);
      if (name === entryName) {
        const method = buf.readUInt16LE(offset + 10);
        const compSize = buf.readUInt32LE(offset + 20);
        const localOffset = buf.readUInt32LE(offset + 42);
        if (buf.readUInt32LE(localOffset) !== 0x04034b50) {
          throw new Error(`Bad local header at ${localOffset}`);
        }
        const localNameLen = buf.readUInt16LE(localOffset + 26);
        const localExtraLen = buf.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + localNameLen + localExtraLen;
        const data = buf.subarray(dataStart, dataStart + compSize);
        if (method === 0) return Buffer.from(data);
        if (method === 8) return zlib.inflateRawSync(data);
        throw new Error(`Unsupported compression method ${method}`);
      }
      offset += 46 + nameLen + extraLen + commentLen;
    }
    throw new Error(`Entry not found in zip: ${entryName}`);
  }

  beforeEach(async () => {
    filesDataDir = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), 'bdl-files-')
    );
    exportDir = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), 'bdl-exports-')
    );
    conversionBehavior.mode = 'success';
    conversionBehavior.deferreds.clear();

    prismaMock = buildPrismaMock();

    const configMock = {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'batchDownload':
            return {
              exportDir,
              minDiskSpace: 1024,
              zipRetentionHours: 1,
              dbRetentionDays: 7,
              maxConcurrency: 3,
              delegateWorkflow: false,
            };
          case 'fileLimits':
            return { zipCompressionLevel: 1 };
          case 'jwt':
            return { secret: 'test-jwt-secret' };
          default:
            return undefined;
        }
      }),
    };

    runtimeConfigMock = { getValue: jest.fn(async () => true) };

    restrictionEngineMock = {
      reserveConversionCountOrThrow: jest.fn(async () => undefined),
      releaseConversionCount: jest.fn(async () => undefined),
    };

    conversionServiceMock = {
      convertServerFile: jest.fn(async (opts: any) => {
        if (conversionBehavior.mode === 'fail') {
          return { code: -1, message: 'conversion rejected by mock' };
        }
        if (conversionBehavior.mode === 'deferred') {
          return new Promise((resolve) => {
            conversionBehavior.deferreds.set(opts.nodeId, {
              resolve: async (value: unknown) => {
                const target = path.join(
                  path.dirname(opts.srcPath),
                  opts.outname
                );
                await fsPromises.writeFile(
                  target,
                  `mock-converted:${opts.outname}`
                );
                resolve(value);
              },
            });
          });
        }
        const target = path.join(path.dirname(opts.srcPath), opts.outname);
        await fsPromises.writeFile(target, `mock-converted:${opts.outname}`);
        return { code: 0, message: 'ok', tz: true };
      }),
    };

    eventEmitter = new EventEmitter2();

    module = await Test.createTestingModule({
      controllers: [BatchDownloadController],
      providers: [
        BatchDownloadService,
        BatchDownloadJob,
        BatchDownloadOrchestrator,
        BatchDownloadCleanupService,
        ArchiveWriter,
        ConversionRunner,
        SseManager,
        FolderExpanderService,
        ProgressTrackerService,
        TaskRunService,
        { provide: DatabaseService, useValue: prismaMock },
        { provide: ConfigService, useValue: configMock },
        { provide: AuditLogger, useValue: { log: jest.fn() } },
        {
          provide: DiskMonitorService,
          useValue: { getDiskStats: () => ({ free: 1024 ** 4 }) },
        },
        {
          provide: IPERMISSION_SERVICE,
          useValue: { checkSystemPermission: async () => true },
        },
        {
          provide: FileDownloadExportService,
          useValue: { getFullPath: (p: string) => mapFullPath(p) },
        },
        {
          provide: StorageManager,
          useValue: { getFullPath: (p: string) => mapFullPath(p) },
        },
        { provide: IStorageService, useValue: {} },
        { provide: RestrictionEngine, useValue: restrictionEngineMock },
        {
          provide: FileSystemPermissionService,
          useValue: { checkNodePermission: async () => true },
        },
        { provide: RuntimeConfigService, useValue: runtimeConfigMock },
        { provide: AlertService, useValue: { raise: jest.fn() } },
        { provide: MXCAD_CONVERSION_SERVICE, useValue: conversionServiceMock },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get(BatchDownloadService);
    jobService = module.get(BatchDownloadJob);
    cleanupService = module.get(BatchDownloadCleanupService);
    taskRunService = module.get(TaskRunService);
    progressTracker = module.get(ProgressTrackerService);
    conversionRunner = module.get(ConversionRunner);
    controller = module.get(BatchDownloadController);
  });

  afterEach(async () => {
    await fsPromises.rm(filesDataDir, { recursive: true, force: true }).catch(
      () => undefined
    );
    await fsPromises.rm(exportDir, { recursive: true, force: true }).catch(
      () => undefined
    );
  });

  describe('1. task creation, queueing and status transitions', () => {
    it('creates task in PENDING, processes asynchronously to COMPLETED with ZIP', async () => {
      const node = prismaMock._seedNode({
        name: 'drawing.dwg',
        originalName: 'drawing.dwg',
        path: '202608/node-1/drawing.dwg.mxweb',
      });
      await writeSourceFile(node);

      const { taskId } = await service.createTask('user-1', {
        fileList: [
          {
            nodeId: node.id,
            fileName: 'drawing.dwg',
            formats: ['pdf', 'original'],
          },
        ],
        projectId: 'proj-1',
      });

      expect(
        prismaMock.batchDownloadJob.create.mock.calls[0][0].data.status
      ).toBe(BatchJobStatus.PENDING);
      expect(
        prismaMock.batchDownloadJob.create.mock.calls[0][0].data.totalCount
      ).toBe(2);

      const job = await waitForStatus(taskId, 'COMPLETED');
      expect(job.zipPath).toBe(`${taskId}.zip`);
      expect(job.zipSize).toBeGreaterThan(0);
      expect(job.totalCount).toBe(2);
      expect(job.completedCount).toBe(2);
      expect(job.errorCount).toBe(0);
      expect(job.expiresAt).toBeInstanceOf(Date);

      const zipPath = path.join(exportDir, job.zipPath);
      expect(fs.existsSync(zipPath)).toBe(true);
      const entries = readZipEntryNames(zipPath);
      expect(entries).toEqual(
        expect.arrayContaining(['drawing.dwg', 'drawing.pdf'])
      );

      const statusUpdates = prismaMock.batchDownloadJob.update.mock.calls.map(
        (call: any) => call[0].data.status
      );
      expect(statusUpdates[0]).toBe('PROCESSING');
      expect(statusUpdates[statusUpdates.length - 1]).toBe('COMPLETED');
      expect(statusUpdates).not.toContain('FAILED');
    });

    it('returns recent tasks for a user ordered by creation time desc', async () => {
      const node = prismaMock._seedNode({
        name: 'a.dwg',
        path: '202608/node-1/a.dwg.mxweb',
      });
      await writeSourceFile(node);
      const dto = {
        fileList: [
          { nodeId: node.id, fileName: 'a.dwg', formats: ['original'] },
        ],
        projectId: 'proj-1',
      };

      const t1 = await service.createTask('user-1', dto);
      const t2 = await service.createTask('user-1', dto);
      await waitForStatus(t2.taskId, 'COMPLETED');

      const tasks = await service.getUserTasks('user-1');
      expect(tasks.map((t) => t.taskId)).toEqual([t2.taskId, t1.taskId]);
      expect(
        prismaMock.batchDownloadJob.findMany.mock.calls[0][0].take
      ).toBe(20);
    });
  });

  describe('2. SSE progress events scoped per task', () => {
    it('routes progress events to the correct SSE stream with multi-task isolation', async () => {
      const nodeA = prismaMock._seedNode({
        id: 'node-a',
        name: 'a.dwg',
        originalName: 'a.dwg',
        path: '202608/node-a/a.dwg.mxweb',
      });
      const nodeB = prismaMock._seedNode({
        id: 'node-b',
        name: 'b.dwg',
        originalName: 'b.dwg',
        path: '202608/node-b/b.dwg.mxweb',
      });
      await writeSourceFile(nodeA);
      await writeSourceFile(nodeB);
      conversionBehavior.mode = 'deferred';

      const { taskId: taskA } = await service.createTask('user-1', {
        fileList: [
          { nodeId: nodeA.id, fileName: 'a.dwg', formats: ['pdf'] },
        ],
        projectId: 'proj-1',
      });
      const { taskId: taskB } = await service.createTask('user-1', {
        fileList: [
          { nodeId: nodeB.id, fileName: 'b.dwg', formats: ['pdf'] },
        ],
        projectId: 'proj-1',
      });
      await waitForStatus(taskA, 'PROCESSING');
      await waitForStatus(taskB, 'PROCESSING');

      const sseA = createSseMocks();
      const sseB = createSseMocks();
      try {
        await service.getProgressForSse(taskA, sseA.res, sseA.req);
        await service.getProgressForSse(taskB, sseB.res, sseB.req);

        let eventsA = parseSseEvents(sseA.res._writes);
        let eventsB = parseSseEvents(sseB.res._writes);
        expect(eventsA).toHaveLength(1);
        expect(eventsB).toHaveLength(1);
        expect(eventsA[0].status).toBe('PROCESSING');
        expect(eventsB[0].status).toBe('PROCESSING');

        conversionBehavior.deferreds.get('node-a')!.resolve({
          code: 0,
          message: 'ok',
          tz: true,
        });
        await waitForStatus(taskA, 'COMPLETED');
        await sleepMs(100);

        eventsA = parseSseEvents(sseA.res._writes);
        expect(
          eventsA.some(
            (e) => e.status === 'PROCESSING' && e.completedCount === 1
          )
        ).toBe(true);
        expect(eventsA[eventsA.length - 1].status).toBe('COMPLETED');
        for (const ev of eventsA) expect(ev.taskId).toBe(taskA);
        expect(sseA.res.end).toHaveBeenCalled();

        eventsB = parseSseEvents(sseB.res._writes);
        expect(eventsB).toHaveLength(1);
        expect(eventsB[0].taskId).toBe(taskB);

        conversionBehavior.deferreds.get('node-b')!.resolve({
          code: 0,
          message: 'ok',
          tz: true,
        });
        await waitForStatus(taskB, 'COMPLETED');
        await sleepMs(100);

        eventsB = parseSseEvents(sseB.res._writes);
        expect(eventsB[eventsB.length - 1].status).toBe('COMPLETED');
        for (const ev of eventsB) expect(ev.taskId).toBe(taskB);
        expect(sseB.res.end).toHaveBeenCalled();

        expect(parseSseEvents(sseA.res._writes).length).toBe(eventsA.length);
      } finally {
        sseA.close();
        sseB.close();
      }
    });

    it('does not leak events across task channels and ends stream on terminal event', async () => {
      const nodeC = prismaMock._seedNode({
        id: 'node-c',
        name: 'c.dwg',
        originalName: 'c.dwg',
        path: '202608/node-c/c.dwg.mxweb',
      });
      await writeSourceFile(nodeC);
      conversionBehavior.mode = 'deferred';

      const { taskId } = await service.createTask('user-1', {
        fileList: [
          { nodeId: nodeC.id, fileName: 'c.dwg', formats: ['pdf'] },
        ],
        projectId: 'proj-1',
      });
      await waitForStatus(taskId, 'PROCESSING');

      const sse = createSseMocks();
      try {
        await service.getProgressForSse(taskId, sse.res, sse.req);
        expect(parseSseEvents(sse.res._writes)).toHaveLength(1);

        progressTracker.emitProgress(
          taskId,
          'PROCESSING',
          1,
          1,
          0,
          'c.dwg (pdf)'
        );
        let events = parseSseEvents(sse.res._writes);
        expect(events).toHaveLength(2);
        expect(events[1].currentFile).toBe('c.dwg (pdf)');

        progressTracker.emitProgress('task-other', 'PROCESSING', 9, 9, 0);
        expect(parseSseEvents(sse.res._writes)).toHaveLength(2);

        progressTracker.emitProgress(taskId, 'COMPLETED', 1, 1, 0);
        events = parseSseEvents(sse.res._writes);
        expect(events[events.length - 1].status).toBe('COMPLETED');
        expect(sse.res.end).toHaveBeenCalled();

        conversionBehavior.deferreds.get('node-c')!.resolve({
          code: 0,
          message: 'ok',
          tz: true,
        });
        await waitForStatus(taskId, 'COMPLETED');
      } finally {
        sse.close();
      }
    });
  });

  describe('3. converted result packaging (folder expansion + external ref)', () => {
    it('expands folders into zip with directory structure, converted files and empty dirs', async () => {
      const rootFolder = prismaMock._seedNode({
        id: 'folder-root',
        nodeType: 'FOLDER',
        name: 'root',
        path: null,
        parentId: 'proj-1',
      });
      const f1 = prismaMock._seedNode({
        id: 'node-f1',
        name: 'drawing.dwg',
        originalName: 'drawing.dwg',
        path: '202608/f1/drawing.dwg.mxweb',
        parentId: rootFolder.id,
      });
      const subFolder = prismaMock._seedNode({
        id: 'folder-sub',
        nodeType: 'FOLDER',
        name: 'sub',
        path: null,
        parentId: rootFolder.id,
      });
      const f2 = prismaMock._seedNode({
        id: 'node-f2',
        name: 'other.dwg',
        originalName: 'other.dwg',
        extension: '.mxweb',
        path: '202608/f2/other.dwg.mxweb',
        parentId: subFolder.id,
      });
      prismaMock._seedNode({
        id: 'folder-empty',
        nodeType: 'FOLDER',
        name: 'empty',
        path: null,
        parentId: rootFolder.id,
      });
      const xref = prismaMock._seedNode({
        id: 'node-xref',
        name: 'xref.dwg',
        path: '202608/xr1/src_abcdef/xref.dwg.mxweb',
      });
      await writeSourceFile(f1);
      await writeSourceFile(f2);
      await writeSourceFile(xref);

      const cleanupSpy = jest.spyOn(conversionRunner, 'cleanupConvertedFile');

      const { taskId } = await service.createTask('user-1', {
        fileList: [
          {
            nodeId: rootFolder.id,
            fileName: 'root',
            formats: ['pdf'],
            isFolder: true,
          },
          {
            nodeId: f2.id,
            fileName: 'other.dwg',
            formats: ['mxweb'],
            relativePath: 'root/sub',
          },
          {
            nodeId: xref.id,
            fileName: 'xref.dwg',
            formats: ['original'],
          },
        ],
        projectId: 'proj-1',
      });

      expect(
        prismaMock.batchDownloadJob.create.mock.calls[0][0].data.totalCount
      ).toBe(3);

      const job = await waitForStatus(taskId, 'COMPLETED');
      expect(job.totalCount).toBe(4);
      expect(job.completedCount).toBe(4);
      expect(job.errorCount).toBe(0);

      const zipPath = path.join(exportDir, job.zipPath);
      expect(fs.existsSync(zipPath)).toBe(true);
      expect(job.zipSize).toBeGreaterThan(0);

      const entries = readZipEntryNames(zipPath).sort();
      expect(entries).toEqual([
        'root/',
        'root/drawing.pdf',
        'root/empty/',
        'root/sub/',
        'root/sub/other.dwg.mxweb',
        'root/sub/other.pdf',
        'xref.dwg',
      ]);

      expect(cleanupSpy).toHaveBeenCalledWith(
        expect.stringContaining('drawing.pdf')
      );
    });

    it('getDownloadPath only exposes the ZIP for COMPLETED tasks owned by the user', async () => {
      const node = prismaMock._seedNode({
        name: 'a.dwg',
        path: '202608/node-1/a.dwg.mxweb',
      });
      await writeSourceFile(node);
      const { taskId } = await service.createTask('user-1', {
        fileList: [
          { nodeId: node.id, fileName: 'a.dwg', formats: ['original'] },
        ],
        projectId: 'proj-1',
      });
      await waitForStatus(taskId, 'COMPLETED');

      const p = await service.getDownloadPath(taskId, 'user-1');
      expect(fs.existsSync(p)).toBe(true);

      await expect(
        service.getDownloadPath(taskId, 'other-user')
      ).rejects.toThrow(ForbiddenException);

      await fsPromises.rm(p);
      await expect(
        service.getDownloadPath(taskId, 'user-1')
      ).rejects.toThrow(NotFoundException);

      const node2 = prismaMock._seedNode({
        id: 'node-hang',
        name: 'hang.dwg',
        originalName: 'hang.dwg',
        path: '202608/node-hang/hang.dwg.mxweb',
      });
      await writeSourceFile(node2);
      conversionBehavior.mode = 'deferred';
      const { taskId: hangTask } = await service.createTask('user-1', {
        fileList: [
          { nodeId: node2.id, fileName: 'hang.dwg', formats: ['pdf'] },
        ],
        projectId: 'proj-1',
      });
      await waitForStatus(hangTask, 'PROCESSING');
      await expect(
        service.getDownloadPath(hangTask, 'user-1')
      ).rejects.toThrow(ConflictException);
      conversionBehavior.deferreds.get('node-hang')!.resolve({
        code: 0,
        message: 'ok',
        tz: true,
      });
      await waitForStatus(hangTask, 'COMPLETED');
    });
  });

  describe('4. failure, retry and termination paths', () => {
    it('marks task FAILED when all conversions fail (errors recorded, no zip); retry succeeds', async () => {
      const node = prismaMock._seedNode({
        id: 'node-bad',
        name: 'bad.dwg',
        originalName: 'bad.dwg',
        path: '202608/node-bad/bad.dwg.mxweb',
      });
      await writeSourceFile(node);
      conversionBehavior.mode = 'fail';
      const dto = {
        fileList: [
          { nodeId: node.id, fileName: 'bad.dwg', formats: ['pdf'] },
        ],
        projectId: 'proj-1',
      };

      const { taskId } = await service.createTask('user-1', dto);
      const job = await waitForStatus(taskId, 'FAILED');
      expect(job.completedCount).toBe(1);
      expect(job.errorCount).toBe(1);
      expect(job.errors).toHaveLength(1);
      expect(job.errors[0].nodeId).toBe('node-bad');
      expect(job.errors[0].error).toContain('conversion rejected by mock');
      expect(job.zipPath).toBeNull();
      expect(job.zipSize).toBeNull();

      await expect(
        service.getDownloadPath(taskId, 'user-1')
      ).rejects.toThrow(ConflictException);

      conversionBehavior.mode = 'success';
      const { taskId: retryId } = await service.createTask('user-1', dto);
      const retry = await waitForStatus(retryId, 'COMPLETED');
      expect(retry.zipPath).toBeTruthy();
      expect(retry.errorCount).toBe(0);
    });

    it('marks task FAILED when the job itself throws (quota engine error), no zip is produced', async () => {
      const node = prismaMock._seedNode({
        id: 'node-boom',
        name: 'boom.dwg',
        originalName: 'boom.dwg',
        path: '202608/node-boom/boom.dwg.mxweb',
      });
      await writeSourceFile(node);
      restrictionEngineMock.reserveConversionCountOrThrow.mockRejectedValue(
        new Error('conversion quota engine exploded')
      );

      const { taskId } = await service.createTask('user-1', {
        fileList: [
          { nodeId: node.id, fileName: 'boom.dwg', formats: ['pdf'] },
        ],
        projectId: 'proj-1',
      });
      const job = await waitForStatus(taskId, 'FAILED');
      expect(job.zipPath).toBeNull();
      expect(job.completedCount).toBe(0);
      expect(job.errorCount).toBe(0);

      await expect(
        service.getDownloadPath(taskId, 'user-1')
      ).rejects.toThrow(ConflictException);

      restrictionEngineMock.reserveConversionCountOrThrow.mockResolvedValue(
        undefined
      );
      const { taskId: retryId } = await service.createTask('user-1', {
        fileList: [
          { nodeId: node.id, fileName: 'boom.dwg', formats: ['pdf'] },
        ],
        projectId: 'proj-1',
      });
      const retry = await waitForStatus(retryId, 'COMPLETED');
      expect(retry.errorCount).toBe(0);
    });

    it('keeps task COMPLETED on partial failure and bundles error.json into the zip', async () => {
      const good = prismaMock._seedNode({
        id: 'node-good',
        name: 'good.dwg',
        originalName: 'good.dwg',
        path: '202608/node-good/good.dwg.mxweb',
      });
      const bad = prismaMock._seedNode({
        id: 'node-bad',
        name: 'bad.dwg',
        originalName: 'bad.dwg',
        path: '202608/node-bad/bad.dwg.mxweb',
      });
      await writeSourceFile(good);
      await writeSourceFile(bad);
      conversionBehavior.mode = 'fail';

      const { taskId } = await service.createTask('user-1', {
        fileList: [
          { nodeId: good.id, fileName: 'good.dwg', formats: ['original'] },
          { nodeId: bad.id, fileName: 'bad.dwg', formats: ['pdf'] },
        ],
        projectId: 'proj-1',
      });

      const job = await waitForStatus(taskId, 'COMPLETED');
      expect(job.completedCount).toBe(2);
      expect(job.errorCount).toBe(1);
      expect(job.errors).toHaveLength(1);
      expect(job.errors[0].nodeId).toBe('node-bad');

      const zipPath = path.join(exportDir, job.zipPath);
      const entries = readZipEntryNames(zipPath);
      expect(entries).toContain('good.dwg');
      expect(entries).toContain('error.json');
      const errorLog = JSON.parse(
        readZipEntryContent(zipPath, 'error.json').toString('utf8')
      );
      expect(errorLog).toHaveLength(1);
      expect(errorLog[0].nodeId).toBe('node-bad');
    });

    it('cancels a processing task (first terminal wins) and rejects further cancels', async () => {
      const node = prismaMock._seedNode({
        id: 'node-hang',
        name: 'hang.dwg',
        originalName: 'hang.dwg',
        path: '202608/node-hang/hang.dwg.mxweb',
      });
      await writeSourceFile(node);
      conversionBehavior.mode = 'deferred';

      const { taskId } = await service.createTask('user-1', {
        fileList: [
          { nodeId: node.id, fileName: 'hang.dwg', formats: ['pdf'] },
        ],
        projectId: 'proj-1',
      });
      await waitForStatus(taskId, 'PROCESSING');

      const progress = await service.getProgress(taskId, 'user-1');
      expect(progress.status).toBe('PROCESSING');
      expect(progress.totalCount).toBe(1);
      expect(jobService.isTerminated(taskId)).toBe(false);

      await service.cancelTask(taskId, 'user-1');
      await waitForStatus(taskId, 'CANCELLED');
      expect(jobService.isTerminated(taskId)).toBe(true);

      conversionBehavior.deferreds.get('node-hang')!.resolve({
        code: 0,
        message: 'ok',
        tz: true,
      });
      await sleepMs(150);

      const row = await prismaMock.batchDownloadJob.findUnique({
        where: { id: taskId },
      });
      expect(row.status).toBe('CANCELLED');
      const statusUpdates = prismaMock.batchDownloadJob.update.mock.calls.map(
        (call: any) => call[0].data.status
      );
      expect(statusUpdates).not.toContain('COMPLETED');

      await expect(
        service.cancelTask(taskId, 'user-1')
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.getProgress(taskId, 'other-user')
      ).rejects.toThrow(ForbiddenException);

      const node2 = prismaMock._seedNode({
        id: 'node-hang2',
        name: 'hang2.dwg',
        originalName: 'hang2.dwg',
        path: '202608/node-hang2/hang2.dwg.mxweb',
      });
      await writeSourceFile(node2);
      const { taskId: task2 } = await service.createTask('user-1', {
        fileList: [
          { nodeId: node2.id, fileName: 'hang2.dwg', formats: ['pdf'] },
        ],
        projectId: 'proj-1',
      });
      await waitForStatus(task2, 'PROCESSING');
      await expect(
        service.cancelTask(task2, 'other-user')
      ).rejects.toThrow(ForbiddenException);
      conversionBehavior.deferreds.get('node-hang2')!.resolve({
        code: 0,
        message: 'ok',
        tz: true,
      });
      await waitForStatus(task2, 'COMPLETED');
    });
  });

  describe('5. retention cleanup (issue #271 task_runs strategy)', () => {
    it('deletes expired ZIP files while keeping fresh ones and records task runs', async () => {
      const oldZip = path.join(exportDir, 'old-job.zip');
      const newZip = path.join(exportDir, 'new-job.zip');
      await fsPromises.writeFile(oldZip, 'expired zip bytes');
      await fsPromises.writeFile(newZip, 'fresh zip bytes');
      prismaMock._seedJob({
        id: 'old-job',
        status: 'COMPLETED',
        completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        zipPath: 'old-job.zip',
      });
      prismaMock._seedJob({
        id: 'new-job',
        status: 'COMPLETED',
        completedAt: new Date(),
        zipPath: 'new-job.zip',
      });

      await cleanupService.cleanupExpiredZips();

      expect(fs.existsSync(oldZip)).toBe(false);
      expect(fs.existsSync(newZip)).toBe(true);
      const runs = prismaMock._taskRuns.filter(
        (r: any) => r.taskName === 'batch-download:zip-cleanup'
      );
      expect(runs).toHaveLength(1);
      expect(runs[0].status).toBe('SUCCESS');
    });

    it('skips ZIP cleanup when the runtime switch is disabled', async () => {
      prismaMock._seedJob({
        id: 'old-job',
        status: 'COMPLETED',
        completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        zipPath: 'old-job.zip',
      });
      runtimeConfigMock.getValue.mockResolvedValue(false);

      await cleanupService.cleanupExpiredZips();

      expect(
        prismaMock.batchDownloadJob.findMany
      ).not.toHaveBeenCalled();
    });

    it('deletes DB records older than retention and keeps recent ones', async () => {
      prismaMock._seedJob({
        id: 'old-rec',
        status: 'COMPLETED',
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      });
      prismaMock._seedJob({
        id: 'new-rec',
        status: 'PENDING',
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });

      await cleanupService.cleanupExpiredDbRecords();

      expect(prismaMock._jobs.has('old-rec')).toBe(false);
      expect(prismaMock._jobs.has('new-rec')).toBe(true);
    });

    it('TaskRunService.cleanupOldRuns removes runs older than retention and is failure tolerant', async () => {
      prismaMock._seedTaskRun({
        id: 'r-old',
        startedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      });
      prismaMock._seedTaskRun({
        id: 'r-new',
        startedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });

      const count = await taskRunService.cleanupOldRuns(30);
      expect(count).toBe(1);
      expect(
        prismaMock._taskRuns.find((r: any) => r.id === 'r-old')
      ).toBeUndefined();
      expect(
        prismaMock._taskRuns.find((r: any) => r.id === 'r-new')
      ).toBeDefined();

      prismaMock.taskRun.deleteMany.mockRejectedValueOnce(
        new Error('db down')
      );
      await expect(taskRunService.cleanupOldRuns(30)).resolves.toBe(0);
    });
  });

  describe('6. controller endpoints', () => {
    it('rejects task creation when batchDownloadEnabled is off', async () => {
      runtimeConfigMock.getValue.mockResolvedValue(false);
      const req: any = { user: { id: 'user-1' } };

      await expect(
        controller.createTask(
          {
            fileList: [
              { nodeId: 'node-1', fileName: 'a.dwg', formats: ['original'] },
            ],
            projectId: 'proj-1',
            mode: 'zip',
          } as any,
          req
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows single-file task creation via the dedicated route while batchDownloadEnabled is off', async () => {
      runtimeConfigMock.getValue.mockResolvedValue(false);
      const req: any = { user: { id: 'user-1' } };
      const node = prismaMock._seedNode({
        id: 'node-single',
        name: 'a.dwg',
        path: '202608/node-single/a.dwg.mxweb',
      });
      await writeSourceFile(node);

      const created = await controller.createSingleFileTask(
        {
          nodeId: node.id,
          fileName: 'a.dwg',
          format: 'dwg',
          projectId: 'proj-1',
        } as any,
        req
      );
      expect(created.taskId).toBeDefined();
      expect((await waitForStatus(created.taskId, 'COMPLETED')).errorCount).toBe(0);
    });

    it('routes SSE vs JSON by Accept header; unknown task streams a FAILED event', async () => {
      const sse = createSseMocks();
      await controller.getProgress('no-such-task', sse.req, sse.res);
      const events = parseSseEvents(sse.res._writes);
      expect(events).toHaveLength(1);
      expect(events[0].status).toBe('FAILED');
      sse.close();

      const jsonRes: any = {};
      jsonRes.json = jest.fn();
      const jsonReq: any = {
        user: { id: 'user-1' },
        headers: { accept: 'application/json' },
        query: {},
      };
      await expect(
        controller.getProgress('no-such-task', jsonReq, jsonRes)
      ).rejects.toThrow(NotFoundException);

      const anonSse = createSseMocks();
      const anonReq: any = {
        headers: { accept: 'text/event-stream' },
        query: {},
        on: jest.fn(),
      };
      await controller.getProgress('no-such-task', anonReq, anonSse.res);
      expect(anonSse.res.status).toHaveBeenCalledWith(401);
      anonSse.close();
    });
  });
});
