import { BatchDownloadJob } from './batch-download-job';
import { BatchJobStatus } from '@cloudcad/db';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function createMocks() {
  const prisma = {
    batchDownloadJob: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    fileSystemNode: {
      findUnique: jest.fn(),
    },
  };
  const configService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'batchDownload') return { exportDir: '/tmp/exports' };
      if (key === 'fileLimits') return { zipCompressionLevel: 1 };
      return {};
    }),
  };
  const archiveWriter = { createArchive: jest.fn() };
  const conversionRunner = {
    isDelegated: jest.fn().mockReturnValue(false),
    convertFile: jest.fn(),
    convertMany: jest.fn(),
    cleanupConvertedFile: jest.fn(),
  };
  const folderExpander = { expandFolderItems: jest.fn().mockResolvedValue([]) };
  const progressTracker = { syncCounts: jest.fn(), emitProgress: jest.fn() };
  const orchestrator = {
    processItem: jest.fn(),
    processDelegated: jest.fn(),
  };

  const job = new BatchDownloadJob(
    prisma as any,
    configService as any,
    archiveWriter as any,
    conversionRunner as any,
    folderExpander as any,
    progressTracker as any,
    orchestrator as any
  );

  return {
    job,
    prisma,
    configService,
    archiveWriter,
    conversionRunner,
    folderExpander,
    progressTracker,
    orchestrator,
  };
}

function injectRuntime(
  job: BatchDownloadJob,
  jobId: string,
  status: BatchJobStatus,
  ctx?: any
): void {
  (job as any).activeJobs.set(jobId, {
    controller: new AbortController(),
    status,
    ctx: ctx || null,
  });
}

describe('BatchDownloadJob', () => {
  describe('isTerminal / isActive', () => {
    it('should classify terminal statuses', () => {
      expect(BatchDownloadJob.isTerminal('COMPLETED')).toBe(true);
      expect(BatchDownloadJob.isTerminal('FAILED')).toBe(true);
      expect(BatchDownloadJob.isTerminal('CANCELLED')).toBe(true);
      expect(BatchDownloadJob.isTerminal('PENDING')).toBe(false);
      expect(BatchDownloadJob.isTerminal('PROCESSING')).toBe(false);
    });

    it('should classify active statuses', () => {
      expect(BatchDownloadJob.isActive('PENDING')).toBe(true);
      expect(BatchDownloadJob.isActive('PROCESSING')).toBe(true);
      expect(BatchDownloadJob.isActive('COMPLETED')).toBe(false);
      expect(BatchDownloadJob.isActive('FAILED')).toBe(false);
      expect(BatchDownloadJob.isActive('CANCELLED')).toBe(false);
    });
  });

  describe('isTerminated', () => {
    it('should return true only when in-memory status is terminal', () => {
      const { job } = createMocks();
      injectRuntime(job, 'job-1', 'PROCESSING');
      expect(job.isTerminated('job-1')).toBe(false);

      (job as any).activeJobs.get('job-1').status = 'CANCELLED';
      expect(job.isTerminated('job-1')).toBe(true);
    });

    it('should return false for unknown job', () => {
      const { job } = createMocks();
      expect(job.isTerminated('unknown')).toBe(false);
    });
  });

  describe('transition', () => {
    it('should write DB, update in-memory status and emit event for non-terminal status', async () => {
      const { job, prisma, progressTracker } = createMocks();
      injectRuntime(job, 'job-1', 'PROCESSING');

      const accepted = await job.transition('job-1', 'COMPLETED', {
        completedCount: 3,
        errorCount: 1,
        totalCount: 4,
        zipPath: 'job-1.zip',
        zipSize: 1024,
        completedAt: new Date(),
        expiresAt: new Date(),
      });

      expect(accepted).toBe(true);
      expect(prisma.batchDownloadJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-1' },
          data: expect.objectContaining({
            status: 'COMPLETED',
            zipPath: 'job-1.zip',
          }),
        })
      );
      expect(progressTracker.emitProgress).toHaveBeenCalledWith(
        'job-1',
        'COMPLETED',
        3,
        4,
        1,
        undefined,
        undefined
      );
      expect(job.isTerminated('job-1')).toBe(true);
    });

    it('should reject transition when in-memory status is already terminal (no DB write, no event)', async () => {
      const { job, prisma, progressTracker } = createMocks();
      injectRuntime(job, 'job-1', 'CANCELLED');

      const accepted = await job.transition('job-1', 'COMPLETED');

      expect(accepted).toBe(false);
      expect(prisma.batchDownloadJob.update).not.toHaveBeenCalled();
      expect(progressTracker.emitProgress).not.toHaveBeenCalled();
    });

    it('should fall back to DB status when job has no in-memory runtime', async () => {
      const { job, prisma, progressTracker } = createMocks();
      prisma.batchDownloadJob.findUnique.mockResolvedValue({
        status: 'PENDING',
      });

      const accepted = await job.transition('job-1', 'PROCESSING');

      expect(accepted).toBe(true);
      expect(prisma.batchDownloadJob.findUnique).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        select: { status: true },
      });
      expect(prisma.batchDownloadJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PROCESSING' }),
        })
      );
      expect(progressTracker.emitProgress).toHaveBeenCalled();
    });

    it('should return false when job does not exist', async () => {
      const { job, prisma } = createMocks();
      prisma.batchDownloadJob.findUnique.mockResolvedValue(null);

      const accepted = await job.transition('job-1', 'PROCESSING');

      expect(accepted).toBe(false);
      expect(prisma.batchDownloadJob.update).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('should abort and transition to CANCELLED in one step', async () => {
      const { job, prisma, progressTracker } = createMocks();
      const controller = new AbortController();
      (job as any).activeJobs.set('job-1', {
        controller,
        status: 'PROCESSING',
        ctx: null,
      });

      const cancelled = await job.cancel('job-1');

      expect(cancelled).toBe(true);
      expect(controller.signal.aborted).toBe(true);
      expect(prisma.batchDownloadJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'CANCELLED',
            completedAt: expect.any(Date),
          }),
        })
      );
      expect(progressTracker.emitProgress).toHaveBeenCalledWith(
        'job-1',
        'CANCELLED',
        0,
        0,
        0,
        undefined,
        undefined
      );
    });

    it('should emit real counts and errors from JobContext when cancelling', async () => {
      const { job, progressTracker } = createMocks();
      const ctx = {
        completedCount: 5,
        errorCount: 2,
        realTotalCount: 9,
        errors: [{ nodeId: 'n1', fileName: 'f.dwg', error: 'conv failed' }],
      };
      injectRuntime(job, 'job-1', 'PROCESSING', ctx);

      const cancelled = await job.cancel('job-1');

      expect(cancelled).toBe(true);
      expect(progressTracker.emitProgress).toHaveBeenCalledWith(
        'job-1',
        'CANCELLED',
        5,
        9,
        2,
        undefined,
        [{ nodeId: 'n1', fileName: 'f.dwg', error: 'conv failed' }]
      );
    });

    it('should reject cancel when already terminal', async () => {
      const { job, prisma } = createMocks();
      injectRuntime(job, 'job-1', 'COMPLETED');

      const cancelled = await job.cancel('job-1');

      expect(cancelled).toBe(false);
      expect(prisma.batchDownloadJob.update).not.toHaveBeenCalled();
    });
  });

  describe('cancellation race arbitration (first terminal wins)', () => {
    it('cancel then finalize → CANCELLED wins, COMPLETED write is rejected', async () => {
      const { job, prisma, progressTracker } = createMocks();
      injectRuntime(job, 'job-1', 'PROCESSING');

      const cancelled = await job.cancel('job-1');
      expect(cancelled).toBe(true);

      const finalized = await job.transition('job-1', 'COMPLETED', {
        completedCount: 1,
        totalCount: 1,
      });
      expect(finalized).toBe(false);

      const calls = prisma.batchDownloadJob.update.mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][0].data.status).toBe('CANCELLED');
      expect(progressTracker.emitProgress).toHaveBeenCalledTimes(1);
    });

    it('finalize then cancel → COMPLETED wins, CANCELLED write is rejected', async () => {
      const { job, prisma } = createMocks();
      injectRuntime(job, 'job-1', 'PROCESSING');

      const finalized = await job.transition('job-1', 'COMPLETED', {
        completedCount: 1,
        totalCount: 1,
      });
      expect(finalized).toBe(true);

      const cancelled = await job.cancel('job-1');
      expect(cancelled).toBe(false);

      const calls = prisma.batchDownloadJob.update.mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][0].data.status).toBe('COMPLETED');
    });
  });

  describe('start', () => {
    it('should load job and process items through orchestrator', async () => {
      const { job, prisma, folderExpander, conversionRunner, orchestrator } =
        createMocks();
      prisma.batchDownloadJob.findUnique.mockResolvedValue({
        id: 'job-1',
        status: 'PENDING',
        fileList: [{ nodeId: 'n1', fileName: 'a.dwg', formats: ['pdf'] }],
      });
      folderExpander.expandFolderItems.mockResolvedValue([
        { nodeId: 'n1', fileName: 'a.dwg', formats: ['pdf'] },
      ]);
      conversionRunner.isDelegated.mockReturnValue(false);
      orchestrator.processItem.mockResolvedValue(undefined);

      await job.start('job-1');
      await new Promise((r) => setTimeout(r, 10));

      expect(prisma.batchDownloadJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PROCESSING',
            totalCount: 1,
          }),
        })
      );
      expect(orchestrator.processItem).toHaveBeenCalled();
    });

    it('should delegate when conversion runner is in delegated mode', async () => {
      const { job, prisma, folderExpander, conversionRunner, orchestrator } =
        createMocks();
      prisma.batchDownloadJob.findUnique.mockResolvedValue({
        id: 'job-1',
        status: 'PENDING',
        fileList: [{ nodeId: 'n1', fileName: 'a.dwg', formats: ['pdf'] }],
      });
      folderExpander.expandFolderItems.mockResolvedValue([
        { nodeId: 'n1', fileName: 'a.dwg', formats: ['pdf'] },
      ]);
      conversionRunner.isDelegated.mockReturnValue(true);
      orchestrator.processDelegated.mockResolvedValue(undefined);

      await job.start('job-1');
      await new Promise((r) => setTimeout(r, 10));

      expect(orchestrator.processDelegated).toHaveBeenCalled();
      expect(orchestrator.processItem).not.toHaveBeenCalled();
    });

    it('should finalize FAILED without producing a zip when all items fail', async () => {
      const {
        job,
        prisma,
        folderExpander,
        conversionRunner,
        orchestrator,
        archiveWriter,
      } = createMocks();
      prisma.batchDownloadJob.findUnique.mockResolvedValue({
        id: 'job-1',
        status: 'PENDING',
        fileList: [{ nodeId: 'n1', fileName: 'a.dwg', formats: ['pdf'] }],
      });
      folderExpander.expandFolderItems.mockResolvedValue([
        { nodeId: 'n1', fileName: 'a.dwg', formats: ['pdf'] },
      ]);
      conversionRunner.isDelegated.mockReturnValue(false);
      orchestrator.processItem.mockImplementation(async (item: any, ctx: any) => {
        await ctx.recordError('n1', 'a.dwg (pdf)', 'conversion failed');
      });

      await job.start('job-1');
      await new Promise((r) => setTimeout(r, 20));

      const calls = prisma.batchDownloadJob.update.mock.calls;
      expect(calls.map((c: any) => c[0].data.status)).toEqual([
        'PROCESSING',
        'FAILED',
      ]);
      expect(calls[calls.length - 1][0].data.completedCount).toBe(1);
      expect(calls[calls.length - 1][0].data.errorCount).toBe(1);
      expect(archiveWriter.createArchive).not.toHaveBeenCalled();
    });

    it('should not log completed when finalize is rejected by a concurrent cancel (orphan zip removed)', async () => {
      const {
        job,
        prisma,
        folderExpander,
        conversionRunner,
        orchestrator,
        configService,
        archiveWriter,
      } = createMocks();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bdj-'));
      const zipPath = path.join(tmpDir, 'job-1.zip');
      fs.writeFileSync(zipPath, 'zip');
      try {
        prisma.batchDownloadJob.findUnique.mockResolvedValue({
          id: 'job-1',
          status: 'PENDING',
          fileList: [{ nodeId: 'n1', fileName: 'a.dwg', formats: ['pdf'] }],
        });
        folderExpander.expandFolderItems.mockResolvedValue([
          { nodeId: 'n1', fileName: 'a.dwg', formats: ['pdf'] },
        ]);
        conversionRunner.isDelegated.mockReturnValue(false);
        orchestrator.processItem.mockImplementation(async (item, ctx: any) => {
          ctx.archiveEntries.push({ name: 'a.pdf', stream: {} });
        });
        configService.get.mockImplementation((key: string) => {
          if (key === 'batchDownload')
            return { exportDir: tmpDir, minDiskSpace: 1024 };
          if (key === 'fileLimits') return { zipCompressionLevel: 1 };
          return {};
        });
        archiveWriter.createArchive.mockImplementation(async () => {
          await job.cancel('job-1');
          return zipPath;
        });

        const warn = jest
          .spyOn((job as any).logger, 'warn')
          .mockImplementation(() => {});
        const log = jest
          .spyOn((job as any).logger, 'log')
          .mockImplementation(() => {});

        await job.start('job-1');
        await new Promise((r) => setTimeout(r, 20));

        const calls = prisma.batchDownloadJob.update.mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        expect(calls.map((c: any) => c[0].data.status)).toEqual([
          'PROCESSING',
          'CANCELLED',
        ]);
        expect(calls[calls.length - 1][0].data.status).toBe('CANCELLED');
        expect(log).not.toHaveBeenCalledWith(
          expect.stringContaining('job completed')
        );
        expect(fs.existsSync(zipPath)).toBe(false);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
