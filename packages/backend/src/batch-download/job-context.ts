import { Logger } from '@nestjs/common';
import { BatchJobStatus } from '@cloudcad/db';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { ArchiveWriter } from './archive-writer';
import { ConversionRunner } from './conversion-runner';
import { FolderExpanderService } from './folder-expander.service';
import { ProgressTrackerService } from './progress-tracker.service';
import type { BatchFileItem } from './dto/create-batch-download.dto';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

export interface JobTransitionPayload {
  completedCount?: number;
  errorCount?: number;
  totalCount?: number;
  errors?: Array<{ nodeId: string; fileName: string; error: string }>;
  zipPath?: string;
  zipSize?: number;
  completedAt?: Date;
  expiresAt?: Date;
}

export type JobTransitionFn = (
  to: BatchJobStatus,
  payload?: JobTransitionPayload
) => Promise<boolean>;

export interface JobContextDeps {
  prisma: DatabaseService;
  configService: ConfigService;
  archiveWriter: ArchiveWriter;
  conversionRunner: ConversionRunner;
  folderExpander: FolderExpanderService;
  progressTracker: ProgressTrackerService;
}

export class JobContext {
  readonly logger = new Logger(JobContext.name);
  readonly errors: Array<{ nodeId: string; fileName: string; error: string }> =
    [];
  readonly archiveEntries: Array<{
    name: string;
    stream: NodeJS.ReadableStream;
  }> = [];
  readonly convertedFiles: string[] = [];
  readonly dirSet = new Set<string>();

  completedCount = 0;
  errorCount = 0;
  realTotalCount = 0;
  exportDir = '';
  expandedItems: Array<BatchFileItem & { relativePath?: string }> = [];
  /** 任务发起用户（批量下载转换频率限制按 userId 计数，ADR-0043） */
  userId: string | null = null;

  constructor(
    readonly jobId: string,
    private readonly transitionFn: JobTransitionFn,
    private readonly deps: JobContextDeps
  ) {}

  async load(): Promise<boolean> {
    const job = await this.deps.prisma.batchDownloadJob.findUnique({
      where: { id: this.jobId },
    });
    if (!job) {
      this.logger.warn(`Job not found: ${this.jobId}`);
      return false;
    }
    this.userId = job.userId ?? null;

    const fileList = job.fileList as unknown as BatchFileItem[];
    this.expandedItems = await this.deps.folderExpander.expandFolderItems(
      fileList,
      this.dirSet
    );
    this.realTotalCount = this.expandedItems.reduce(
      (sum, item) => sum + item.formats.length,
      0
    );

    this.exportDir = this.deps.configService.get('batchDownload', {
      infer: true,
    }).exportDir;

    const accepted = await this.transitionFn('PROCESSING', {
      totalCount: this.realTotalCount,
    });
    return accepted;
  }

  async handleAbort(): Promise<void> {
    await this.transitionFn('CANCELLED', {
      completedCount: this.completedCount,
      errorCount: this.errorCount,
      totalCount: this.realTotalCount,
      errors: this.errors,
      completedAt: new Date(),
    });
    await this.cleanupConvertedFiles();
  }

  async syncCounts(): Promise<void> {
    await this.deps.progressTracker.syncCounts(
      this.jobId,
      this.completedCount,
      this.errorCount
    );
  }

  emitProgress(currentLabel?: string): void {
    this.deps.progressTracker.emitProgress(
      this.jobId,
      'PROCESSING',
      this.completedCount,
      this.realTotalCount,
      this.errorCount,
      currentLabel,
      this.errors
    );
  }

  async recordError(
    nodeId: string,
    fileName: string,
    error: string
  ): Promise<void> {
    this.errorCount++;
    this.completedCount++;
    this.errors.push({ nodeId, fileName, error });
    await this.syncCounts();
    this.emitProgress(fileName);
  }

  getFormats(
    item: BatchFileItem & { relativePath?: string },
    ext: string
  ): string[] {
    if (item.relativePath) {
      this.dirSet.add(item.relativePath);
    }
    return item.formats;
  }

  sanitizeZipName(baseName: string): string {
    let sanitized = baseName
      .replace(/\\/g, '/')
      .replace(/[\x00-\x1F\x7F]/g, '');
    sanitized = sanitized.replace(/^\/+|\/+$/g, '');
    if (sanitized.length > 200) {
      const ext = path.extname(sanitized);
      sanitized = sanitized.slice(0, 200 - ext.length) + ext;
    }
    if (!this.archiveEntries.some((e) => e.name === sanitized))
      return sanitized;
    let counter = 1;
    const ext = path.extname(sanitized);
    const base = path.basename(sanitized, ext);
    const dir = sanitized.includes('/')
      ? sanitized.substring(0, sanitized.lastIndexOf('/') + 1)
      : '';
    while (
      this.archiveEntries.some(
        (e) => e.name === `${dir}${base} (${counter})${ext}`
      )
    )
      counter++;
    return `${dir}${base} (${counter})${ext}`;
  }

  addEmptyDirectories(): void {
    const emptyStream = () => Readable.from(Buffer.alloc(0));
    for (const dir of [...this.dirSet].sort()) {
      const dirEntry = `${dir}/`;
      if (!this.archiveEntries.some((e) => e.name === dirEntry)) {
        this.archiveEntries.push({ name: dirEntry, stream: emptyStream() });
      }
    }
  }

  addErrorLog(): void {
    if (this.errors.length > 0) {
      this.archiveEntries.push({
        name: 'error.json',
        stream: Readable.from([JSON.stringify(this.errors, null, 2)]),
      });
    }
  }

  async createArchive(): Promise<{ zipPath: string; zipSize: number } | null> {
    if (this.archiveEntries.length === 0) return null;

    const compressionLevel =
      this.deps.configService.get('fileLimits', { infer: true })
        .zipCompressionLevel || 1;
    const zipPath = await this.deps.archiveWriter.createArchive(
      this.archiveEntries,
      this.exportDir,
      this.jobId,
      compressionLevel
    );
    const zipStat = fs.statSync(zipPath);

    return { zipPath: path.basename(zipPath), zipSize: zipStat.size };
  }

  async finalizeCompleted(zipPath: string, zipSize: number): Promise<boolean> {
    const accepted = await this.transitionFn('COMPLETED', {
      completedCount: this.completedCount,
      errorCount: this.errorCount,
      totalCount: this.realTotalCount,
      errors: this.errors,
      zipPath,
      zipSize,
      completedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    if (!accepted) {
      // 已终态（如并发取消），清除刚生成的孤儿 ZIP，避免泄漏
      try {
        const fullPath = path.resolve(this.exportDir, zipPath);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      } catch (err) {
        this.logger.warn(
          `Failed to remove orphan zip for job ${this.jobId}: ${(err as Error).message}`
        );
      }
    }
    return accepted;
  }

  async finalizeFailed(): Promise<void> {
    const finalStatus: BatchJobStatus =
      this.completedCount === this.errorCount ? 'FAILED' : 'COMPLETED';
    await this.transitionFn(finalStatus, {
      completedCount: this.completedCount,
      errorCount: this.errorCount,
      totalCount: this.realTotalCount,
      errors: this.errors,
      completedAt: new Date(),
    });
  }

  async fail(): Promise<void> {
    await this.transitionFn('FAILED', {
      completedCount: 0,
      errorCount: 0,
      totalCount: 0,
      errors: [],
      completedAt: new Date(),
    });
  }

  async cleanupConvertedFiles(): Promise<void> {
    for (const filePath of this.convertedFiles) {
      await this.deps.conversionRunner.cleanupConvertedFile(filePath);
    }
  }
}
