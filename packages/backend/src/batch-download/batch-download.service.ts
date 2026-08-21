import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  ServiceUnavailableException,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { AuditLogger } from '../audit/audit-logger.service';
import { DiskMonitorService } from '../storage-management/services/disk-monitor.service';
import {
  IPERMISSION_SERVICE,
  IPermissionService,
} from '../permission/interfaces/permission-service.interface';
import { SystemPermission } from '../common/enums/permissions.enum';
import { NodeType, BatchJobStatus } from '@cloudcad/db';
import { SseManager } from './sse-manager';
import { BatchDownloadJob } from './batch-download-job';
import { FolderExpanderService } from './folder-expander.service';
import type { BatchProgressEvent } from './batch-download.types';
import type { CreateBatchDownloadDto } from './dto/create-batch-download.dto';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

@Injectable()
export class BatchDownloadService {
  private readonly logger = new Logger(BatchDownloadService.name);
  private readonly exportDir: string;
  private readonly minDiskSpace: number;

  constructor(
    private readonly prisma: DatabaseService,
    private readonly configService: ConfigService,
    private readonly auditLogger: AuditLogger,
    private readonly diskMonitor: DiskMonitorService,
    @Inject(IPERMISSION_SERVICE)
    private readonly systemPermissionService: IPermissionService,
    private readonly sseManager: SseManager,
    private readonly batchDownloadJob: BatchDownloadJob,
    private readonly folderExpander: FolderExpanderService
  ) {
    const batchConfig = this.configService.get('batchDownload', {
      infer: true,
    });
    this.exportDir = batchConfig.exportDir;
    this.minDiskSpace = batchConfig.minDiskSpace;
    fsPromises.mkdir(this.exportDir, { recursive: true }).catch(() => {});
  }

  async createTask(
    userId: string,
    dto: CreateBatchDownloadDto
  ): Promise<{ taskId: string }> {
    const { fileList, projectId, libraryType } = dto;

    if (!fileList || fileList.length === 0) {
      throw new BadRequestException('File list is empty');
    }

    let effectiveProjectId = projectId;

    if (libraryType) {
      const requiredPermission =
        libraryType === 'drawing'
          ? SystemPermission.LIBRARY_DRAWING_MANAGE
          : SystemPermission.LIBRARY_BLOCK_MANAGE;
      const hasPermission =
        await this.systemPermissionService.checkSystemPermission(
          userId,
          requiredPermission
        );
      if (!hasPermission) {
        throw new ForbiddenException(
          `Insufficient permissions for ${libraryType} library download`
        );
      }
      effectiveProjectId =
        projectId || (await this.getLibraryRootId(libraryType));
    } else {
      // 普通项目校验：确保所有文件属于同一个项目
      const projectIds = new Set<string>();
      for (const item of fileList) {
        const node = await this.prisma.fileSystemNode.findUnique({
          where: { id: item.nodeId },
          select: { projectId: true, nodeType: true },
        });
        if (!node) {
          throw new NotFoundException(`Node not found: ${item.nodeId}`);
        }
        if (node.projectId) {
          projectIds.add(node.projectId);
        }
      }

      if (projectIds.size > 1) {
        throw new BadRequestException(
          'All files must belong to the same project'
        );
      }

      effectiveProjectId =
        effectiveProjectId ||
        (projectIds.size === 1 ? [...projectIds][0] : null);
      if (!effectiveProjectId) {
        throw new BadRequestException('Project ID is required');
      }
    }

    const diskStatus = this.diskMonitor.getDiskStats(this.exportDir);
    if (diskStatus.free < this.minDiskSpace) {
      throw new ServiceUnavailableException(
        `Insufficient disk space: ${diskStatus.free} bytes available, ${this.minDiskSpace} bytes required`
      );
    }

    const totalFormatCount = fileList.reduce(
      (sum, item) => sum + item.formats.length,
      0
    );

    const job = await this.prisma.batchDownloadJob.create({
      data: {
        userId,
        projectId: effectiveProjectId,
        status: BatchJobStatus.PENDING,
        fileList: fileList as any,
        totalCount: totalFormatCount,
        completedCount: 0,
        errorCount: 0,
        errors: null,
      },
    });

    this.batchDownloadJob.start(job.id).catch((err) => {
      this.logger.error(
        `Job processing failed: ${job.id} - ${(err as Error).message}`
      );
    });

    this.logger.log(
      `Batch download task created: ${job.id} by user ${userId} (${totalFormatCount} formats across ${fileList.length} files)`
    );

    return { taskId: job.id };
  }

  async getProgress(
    taskId: string,
    userId: string
  ): Promise<BatchProgressEvent> {
    const job = await this.prisma.batchDownloadJob.findUnique({
      where: { id: taskId },
    });
    if (!job) throw new NotFoundException('Task not found');
    if (job.userId !== userId) throw new ForbiddenException('Access denied');
    return {
      taskId: job.id,
      status: job.status,
      totalCount: job.totalCount,
      completedCount: job.completedCount,
      errorCount: job.errorCount,
      errors: (job.errors as any) || undefined,
      zipPath: job.zipPath || undefined,
      zipSize: job.zipSize || undefined,
    };
  }

  async cancelTask(taskId: string, userId: string): Promise<void> {
    const job = await this.prisma.batchDownloadJob.findUnique({
      where: { id: taskId },
    });
    if (!job) throw new NotFoundException('Task not found');
    if (job.userId !== userId) throw new ForbiddenException('Access denied');
    if (BatchDownloadJob.isTerminal(job.status)) {
      throw new BadRequestException(`Task already ${job.status.toLowerCase()}`);
    }
    const cancelled = await this.batchDownloadJob.cancel(taskId);
    if (!cancelled) {
      throw new BadRequestException(`Task already ${job.status.toLowerCase()}`);
    }
    this.logger.log(
      `Batch download task cancelled: ${taskId} by user ${userId}`
    );
  }

  async getDownloadPath(taskId: string, userId: string): Promise<string> {
    const job = await this.prisma.batchDownloadJob.findUnique({
      where: { id: taskId },
    });
    if (!job) throw new NotFoundException('Task not found');
    if (job.userId !== userId) throw new ForbiddenException('Access denied');
    if (job.status !== BatchJobStatus.COMPLETED)
      throw new ConflictException('Task not completed yet');
    if (!job.zipPath) throw new NotFoundException('ZIP file not found');
    const fullPath = path.resolve(this.exportDir, job.zipPath);
    if (!fs.existsSync(fullPath))
      throw new NotFoundException('ZIP file has expired or been deleted');
    return fullPath;
  }

  async getFolderFilesRecursive(
    nodeId: string,
    userId: string
  ): Promise<{
    nodeId: string;
    fileName: string;
    isFolder: boolean;
    children?: any[];
  }> {
    return this.folderExpander.getFolderFilesRecursive(nodeId, userId);
  }

  async getUserTasks(userId: string): Promise<BatchProgressEvent[]> {
    const jobs = await this.prisma.batchDownloadJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return jobs.map((job) => {
      return {
        taskId: job.id,
        status: job.status,
        totalCount: job.totalCount,
        completedCount: job.completedCount,
        errorCount: job.errorCount,
        errors: (job.errors as any) || undefined,
        zipPath: job.zipPath || undefined,
        zipSize: job.zipSize || undefined,
      };
    });
  }

  async getProgressForSse(taskId: string, res: any, req: any): Promise<void> {
    await this.sseManager.streamProgress(taskId, res, req, (userId: string) =>
      this.getProgress(taskId, userId)
    );
  }

  private async getLibraryRootId(
    libraryType: 'drawing' | 'block'
  ): Promise<string> {
    const nodeType =
      libraryType === 'drawing'
        ? NodeType.LIBRARY_DRAWING
        : NodeType.LIBRARY_BLOCK;
    const root = await this.prisma.fileSystemNode.findFirst({
      where: { nodeType, deletedAt: null },
      select: { id: true },
    });
    if (!root) {
      throw new NotFoundException(`Public library not found: ${libraryType}`);
    }
    return root.id;
  }
}
