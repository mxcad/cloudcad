import { Injectable, Logger } from '@nestjs/common';
import { BatchJobStatus, Prisma } from '@cloudcad/db';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { ArchiveWriter } from './archive-writer';
import { ConversionRunner } from './conversion-runner';
import { FolderExpanderService } from './folder-expander.service';
import {
  JobContext,
  JobContextDeps,
  JobTransitionPayload,
} from './job-context';
import { ProgressTrackerService } from './progress-tracker.service';
import { BatchDownloadOrchestrator } from './batch-download-orchestrator';

interface JobRuntime {
  controller: AbortController;
  status: BatchJobStatus;
  ctx: JobContext;
}

/**
 * 批量下载任务生命周期深模块（ADR-0038）。
 *
 * 终态仲裁：首达终态者胜。每个 job 持有内存权威状态，transition 先查内存、
 * 已终态则拒绝（不落库、不发事件）。所有状态写入一律经 transition。
 */
@Injectable()
export class BatchDownloadJob {
  private readonly logger = new Logger(BatchDownloadJob.name);
  private readonly activeJobs = new Map<string, JobRuntime>();

  constructor(
    private readonly prisma: DatabaseService,
    private readonly configService: ConfigService,
    private readonly archiveWriter: ArchiveWriter,
    private readonly conversionRunner: ConversionRunner,
    private readonly folderExpander: FolderExpanderService,
    private readonly progressTracker: ProgressTrackerService,
    private readonly orchestrator: BatchDownloadOrchestrator
  ) {}

  static isTerminal(status: BatchJobStatus): boolean {
    return (
      status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED'
    );
  }

  static isActive(status: BatchJobStatus): boolean {
    return status === 'PENDING' || status === 'PROCESSING';
  }

  isTerminated(jobId: string): boolean {
    const runtime = this.activeJobs.get(jobId);
    return runtime ? BatchDownloadJob.isTerminal(runtime.status) : false;
  }

  async start(jobId: string): Promise<void> {
    const controller = new AbortController();
    const ctx = this.createContext(jobId);
    const runtime: JobRuntime = { controller, status: 'PENDING', ctx };
    this.activeJobs.set(jobId, runtime);
    this.processJob(jobId, runtime).finally(() => {
      this.activeJobs.delete(jobId);
    });
  }

  async cancel(jobId: string): Promise<boolean> {
    const runtime = this.activeJobs.get(jobId);
    if (runtime) runtime.controller.abort();
    return this.transition(jobId, 'CANCELLED', {
      completedCount: runtime?.ctx?.completedCount ?? 0,
      errorCount: runtime?.ctx?.errorCount ?? 0,
      totalCount: runtime?.ctx?.realTotalCount ?? 0,
      errors: runtime?.ctx?.errors,
      completedAt: new Date(),
    });
  }

  async transition(
    jobId: string,
    to: BatchJobStatus,
    payload?: JobTransitionPayload
  ): Promise<boolean> {
    const runtime = this.activeJobs.get(jobId);
    let current = runtime?.status;
    if (current === undefined) {
      const job = await this.prisma.batchDownloadJob.findUnique({
        where: { id: jobId },
        select: { status: true },
      });
      if (!job) return false;
      current = job.status;
    }
    if (BatchDownloadJob.isTerminal(current)) return false;

    const data: Prisma.BatchDownloadJobUpdateInput = { status: to };
    if (payload) {
      if (payload.completedCount !== undefined)
        data.completedCount = payload.completedCount;
      if (payload.errorCount !== undefined)
        data.errorCount = payload.errorCount;
      if (payload.totalCount !== undefined)
        data.totalCount = payload.totalCount;
      if (payload.errors !== undefined) {
        data.errors =
          payload.errors.length > 0 ? (payload.errors as never) : null;
      }
      if (payload.zipPath !== undefined) data.zipPath = payload.zipPath;
      if (payload.zipSize !== undefined) data.zipSize = payload.zipSize;
      if (payload.itemsManifest !== undefined) {
        data.itemsManifest =
          payload.itemsManifest.length > 0
            ? (payload.itemsManifest as never)
            : null;
      }
      if (payload.completedAt !== undefined)
        data.completedAt = payload.completedAt;
      if (payload.expiresAt !== undefined) data.expiresAt = payload.expiresAt;
    }
    await this.prisma.batchDownloadJob.update({ where: { id: jobId }, data });
    if (runtime) runtime.status = to;

    this.progressTracker.emitProgress(
      jobId,
      to,
      payload?.completedCount ?? 0,
      payload?.totalCount ?? 0,
      payload?.errorCount ?? 0,
      undefined,
      payload?.errors
    );
    return true;
  }

  private async processJob(jobId: string, runtime: JobRuntime): Promise<void> {
    const ctx = runtime.ctx;

    try {
      if (!(await ctx.load())) return;

      if (this.conversionRunner.isDelegated()) {
        await this.orchestrator.processDelegated(ctx, () =>
          this.isTerminated(jobId)
        );
      } else {
        for (const item of ctx.expandedItems) {
          if (this.isTerminated(jobId)) {
            await ctx.handleAbort();
            return;
          }
          await this.orchestrator.processItem(item, ctx, () =>
            this.isTerminated(jobId)
          );
        }
      }

      if (this.isTerminated(jobId)) {
        await ctx.handleAbort();
        return;
      }

      // individual 模式：不打包 ZIP，产物清单落库由单文件下载端点直出；
      // 转换产物延迟到下载完成后清理（finalizeIndividual 内只清理全失败场景）
      if (ctx.mode === 'individual') {
        await ctx.finalizeIndividual();
        this.logger.log(
          `Individual download job finished: ${jobId} (${ctx.completedCount} items, ${ctx.errorCount} errors)`
        );
        return;
      }

      ctx.addEmptyDirectories();
      await ctx.cleanupConvertedFiles();

      // 全部失败（errorCount > 0 且 completedCount === errorCount）→ FAILED，
      // 不产出 ZIP；error.json 仅随部分失败任务的 ZIP 打包
      if (ctx.errorCount > 0 && ctx.completedCount === ctx.errorCount) {
        await ctx.finalizeFailed();
        return;
      }

      ctx.addErrorLog();

      const archive = await ctx.createArchive();
      if (archive) {
        const accepted = await ctx.finalizeCompleted(
          archive.zipPath,
          archive.zipSize
        );
        if (!accepted) return;
        this.logger.log(
          `Batch download job completed: ${jobId} (${ctx.archiveEntries.length} files, ${archive.zipSize} bytes)`
        );
      } else {
        await ctx.finalizeFailed();
      }
    } catch (err) {
      this.logger.error(
        `Job processing error: ${jobId} - ${(err as Error).message}`
      );
      await ctx.fail();
    }
  }

  private createContext(jobId: string): JobContext {
    const deps: JobContextDeps = {
      prisma: this.prisma,
      configService: this.configService,
      archiveWriter: this.archiveWriter,
      conversionRunner: this.conversionRunner,
      folderExpander: this.folderExpander,
      progressTracker: this.progressTracker,
    };
    return new JobContext(
      jobId,
      (to, payload) => this.transition(jobId, to, payload),
      deps
    );
  }
}
